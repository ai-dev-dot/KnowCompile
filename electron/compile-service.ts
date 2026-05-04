/**
 * CompileService — Incremental compile service with 5-step pipeline.
 *
 * Pipeline:
 *   1. Vectorize raw file → chunk + embed + store in VDB + add source in DB
 *   2. Similarity search → find related existing wiki pages via LanceDB
 *   3. LLM verification + conflict detection → produce CompilePlan JSON
 *   4. Generate wiki pages → call existing compileNewPages()
 *   5. Write pages + handle conflicts + update index → disk, DB, VDB
 *
 * This is the core of the v1.0 iteration engine — it turns a raw document
 * into new or updated wiki pages while detecting contradictions with
 * existing knowledge.
 */
import { IndexDB } from './index-db'
import type { SourceRecord, ConflictRecord } from './index-db'
import { VectorDB } from './vector-db'
import type { ChunkInput, SearchResult } from './vector-db'
import { EmbeddingService } from './embedding-service'
import { compileNewPages, chat } from './llm-service'
import { stripThinking } from './utils'
import { distanceToSimilarity } from './vector-utils'
import { loadSchemaPrompt } from './schema-loader'
import { normalizeWikiPage } from './wiki-normalizer'
import { getSettings } from './settings-store'
import type { LLMConfig } from './settings-store'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { PDFParse } from 'pdf-parse'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface CompilePlan {
  updates: { page: string; sections: string; reason: string }[]
  new_pages: { title: string; reason: string }[]
  conflicts: { target_page: string; description: string; source1: string; source2: string; suggested_resolution: string }[]
}

export interface CompileResult {
  compileOutput: string
  plan: CompilePlan
  candidatePages: string[]
  reviewFeedback?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF file.
 * Returns { text, pages } on success, or { error } with a user-friendly message.
 */
export async function extractPDFText(filePath: string): Promise<{ text: string; pages: number } | { error: string }> {
  try {
    const pdfBuffer = fs.readFileSync(filePath)
    const parser = new PDFParse({ data: pdfBuffer })
    const pdfData = await parser.getText()
    const text = pdfData.text?.trim() || ''
    if (!text) {
      return { error: '此 PDF 可能为扫描件或图片，无法提取文本内容' }
    }
    return { text, pages: pdfData.total }
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.includes('Invalid') || msg.includes('PDF') || msg.includes('parse')) {
      return { error: 'PDF 文件已损坏或格式不受支持' }
    }
    return { error: `PDF 解析失败：${msg}` }
  }
}

/**
 * Read a raw file, handling PDF extraction via pdf-parse.
 * Returns the text content and file size in bytes.
 */
async function readRawFile(filePath: string): Promise<{ content: string; size: number }> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.pdf') {
    const result = await extractPDFText(filePath)
    if ('error' in result) throw new Error(result.error)
    const size = fs.statSync(filePath).size
    return { content: result.text, size }
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const size = fs.statSync(filePath).size
  return { content, size }
}

/**
 * Split the multi-page markdown output from compileNewPages() into individual
 * page objects with title and full markdown content.
 *
 * Pages start with "# Title" (level-1 heading). The index page is skipped.
 */
export function splitWikiPages(output: string): { title: string; content: string }[] {
  // Split on "# " at start of line (level-1 heading).
  const sections = output.split(/(?=^# )/m).filter(s => s.trim())
  const pages: { title: string; content: string }[] = []

  let pendingFrontmatter = ''

  for (const section of sections) {
    const titleMatch = section.match(/^# (.+)$/m)
    if (!titleMatch) {
      // Orphan frontmatter — save it to prepend to the next valid page.
      if (/^---/.test(section.trim())) {
        pendingFrontmatter = section.trim()
      }
      continue
    }

    const title = titleMatch[1].trim()

    // Skip the index/index.md page — it is metadata, not a real wiki page.
    if (title === 'Wiki 索引' || title.toLowerCase() === 'wiki index' || title === 'index') {
      pendingFrontmatter = ''
      continue
    }

    const content = pendingFrontmatter
      ? pendingFrontmatter + '\n\n' + section.trim()
      : section.trim()
    pendingFrontmatter = ''

    // Skip empty pages — the LLM may emit orphan headings with no body
    const bodyText = content.replace(/^# .+\n?/m, '').trim()
    if (bodyText.length < 20) continue

    pages.push({ title, content })
  }

  return pages
}

/**
 * Extract a JSON object from an LLM response string.
 *
 * Tries, in order:
 *   1. ```json ... ``` fenced code block
 *   2. Raw { ... } JSON object
 *
 * Returns the parsed object or null on failure.
 */
export function parsePlanJson(text: string): CompilePlan | null {
  // Strip thinking tags that may have leaked through.
  const cleanText = stripThinking(text)

  // Strategy 1: look for a fenced JSON block.
  const fenceMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as CompilePlan
    } catch {
      // Continue to next strategy.
    }
  }

  // Strategy 2: find the first balanced { ... } object.
  const braceStart = cleanText.indexOf('{')
  if (braceStart === -1) return null

  // Walk the string to find the matching closing brace.
  let depth = 0
  let jsonEnd = -1
  for (let i = braceStart; i < cleanText.length; i++) {
    if (cleanText[i] === '{') depth++
    else if (cleanText[i] === '}') {
      depth--
      if (depth === 0) {
        jsonEnd = i
        break
      }
    }
  }

  if (jsonEnd === -1) return null

  const jsonStr = cleanText.slice(braceStart, jsonEnd + 1)
  try {
    return JSON.parse(jsonStr) as CompilePlan
  } catch {
    return null
  }
}

/** Trim text to approximately `maxLen` characters for LLM context windows. */
function trimContent(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '\n\n… (内容已截断)'
}

// ---------------------------------------------------------------------------
// Main export: incrementalCompile
// ---------------------------------------------------------------------------

/**
 * Run the full 5-step incremental compile pipeline.
 *
 * @param rawFilePath  Absolute path to the raw source file (in raw/).
 * @param kbPath       Absolute path to the knowledge base root.
 * @param embedding    Initialized EmbeddingService.
 * @param db           Open IndexDB instance.
 * @param vdb          Initialized VectorDB instance.
 *
 * @returns The LLM compile output, the parsed plan, and the list of candidate
 *          page titles found during similarity search.
 */
export interface CompileProgress {
  step: number        // 1-5
  label: string       // Human-readable step description
  detail?: string     // Optional extra detail
  percent: number     // 0-100
}

// ---------------------------------------------------------------------------
// Review helpers
// ---------------------------------------------------------------------------

function getLLMSettings() {
  return getSettings()
}

function getReviewSettings(): LLMConfig | null {
  const s = getSettings()
  // If review_llm is explicitly configured, use it. Otherwise use main llm.
  if (s.review_llm?.model) {
    return { ...s.llm, ...s.review_llm }
  }
  // No review model configured — default to main llm
  if (s.llm.model) return s.llm
  return null
}

interface ReviewResult {
  passed: boolean
  feedback?: string
}

async function reviewContent(
  compileOutput: string,
  rawSummary: string,
  rawFileName: string,
  kbPath: string,
  reviewSettings: LLMConfig,
): Promise<ReviewResult> {
  const reviewPrompt = [
    { role: 'system' as const, content: `你是一个 Wiki 页面内容审查员。你的任务是检查 AI 生成的 Wiki 页面质量，重点关注：

1. **事实准确性**：页面内容是否忠实于原始资料？有没有编造原始资料中不存在的信息？
2. **完整性**：是否遗漏了原始资料中的重要信息？
3. **逻辑连贯性**：章节结构是否合理？表述是否清晰无矛盾？
4. **[[链接]]质量**：内部链接是否指向有实际关联的主题？是否存在乱挂链接的情况？
5. **格式合规**：YAML frontmatter 是否正确？Markdown 语法是否正确？
6. **Wiki 质量**：是否存在过度拆分的问题？每个页面是否是一个可独立阅读的、有足够深度的知识主题？如果一个页面只包含一两个段落或一个定义而没有实质展开，应指出应该合并到哪个上级页面。每个页面应至少有 2 个 ## 小节和 300 字以上正文。优先合并，不要碎片化。

输出格式：如果质量合格，回复 "PASS"。如果存在问题，逐条列出具体问题和修复建议。` },
    { role: 'user' as const, content: [
      `请审查以下编译任务生成的 Wiki 页面。特别关注：生成的页面数量是否合理？是否过度拆分了原始资料？每个页面是否能作为独立的知识单元存在？`,
      '',
      `## 原始资料（摘要）`,
      rawSummary,
      '',
      `## 生成的 Wiki 页面`,
      compileOutput.slice(0, 8000),
      '',
      `原始资料文件：${rawFileName}`,
    ].join('\n') },
  ]

  try {
    const result = await chat(reviewPrompt, reviewSettings, { kbPath, role: 'review' })
    const trimmed = result.trim().toUpperCase()
    if (trimmed.startsWith('PASS') || trimmed === '通过' || trimmed === '合格') {
      return { passed: true }
    }
    return { passed: false, feedback: result }
  } catch (err) {
    // Review failed — don't block the compile
    return { passed: true }
  }
}

// ---------------------------------------------------------------------------
// Main compile function
// ---------------------------------------------------------------------------

export async function incrementalCompile(
  rawFilePath: string,
  kbPath: string,
  embedding: EmbeddingService,
  db: IndexDB,
  vdb: VectorDB,
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string },
  onProgress?: (p: CompileProgress) => void,
): Promise<CompileResult> {
  const compileStartTime = Date.now()
  console.log(`[Compile] 开始编译 | ${path.basename(rawFilePath)} | ${new Date().toLocaleTimeString('zh-CN')}`)
  const emit = (step: number, label: string, detail?: string, percent?: number) => {
    onProgress?.({ step, label, detail, percent: percent ?? Math.round((step / 5) * 100) })
  }
  const yield_ = () => new Promise<void>(r => setImmediate(r))

  // ------------------------------------------------------------------
  // Read settings from DB (with defaults)
  // ------------------------------------------------------------------
  const chunkSize = parseInt(db.getSetting('chunk_size', '500') ?? '500', 10) || 500
  const similarityThreshold = parseFloat(db.getSetting('compile_similarity_threshold', '0.75') ?? '0.75') || 0.75
  const candidateCount = parseInt(db.getSetting('compile_candidate_count', '3') ?? '3', 10) || 3
  const maxDistance = Math.sqrt(2 * (1 - similarityThreshold))

  const rawFileName = path.basename(rawFilePath)
  const sourcePath = `raw/${rawFileName}`
  const wikiDir = path.join(kbPath, 'wiki')

  // ------------------------------------------------------------------
  // Ensure the wiki directory exists.
  // ------------------------------------------------------------------
  if (!fs.existsSync(wikiDir)) {
    fs.mkdirSync(wikiDir, { recursive: true })
  }

  // ------------------------------------------------------------------
  // Collect existing wiki page titles (for compileNewPages)
  // ------------------------------------------------------------------
  const existingTitles: string[] = fs.existsSync(wikiDir)
    ? fs.readdirSync(wikiDir)
        .filter((f: string) => f.endsWith('.md'))
        .map((f: string) => f.replace('.md', ''))
    : []

  // ==================================================================
  // STEP 1 — Vectorize
  // ==================================================================
  emit(1, '读取原始文件...', undefined, 5)

  const { content: rawContent, size: rawSize } = await readRawFile(rawFilePath)
  const contentHash = crypto.createHash('sha256').update(rawContent).digest('hex')

  // Register / update the source in SQLite.
  let source: SourceRecord | undefined = db.getSourceByPath(sourcePath)
  if (source) {
    // Delete old vector chunks so we can re-index fresh.
    await vdb.deleteChunks(source.id!, 'source')
    db.updateSourceStatus(sourcePath, 'compiling')
  } else {
    source = db.addSource({
      path: sourcePath,
      filename: rawFileName,
      size: rawSize,
      hash: contentHash,
      status: 'compiling',
    })
  }
  const sourceId = source.id!

  try {
    // Chunk + embed the raw content.
  const chunks = embedding.chunkText(rawContent, chunkSize)
  emit(1, '文本分块与向量化', `${chunks.length} 个块，正在嵌入...`, 10)
  await yield_()

  let chunkVectors: number[][] = []
  if (chunks.length > 0) {
    chunkVectors = await embedding.embedTexts(chunks)

    // Store chunks in LanceDB as type='source' for future reference.
    const chunkInputs: ChunkInput[] = chunks.map((text, i) => ({
      vector: chunkVectors[i],
      type: 'source',
      ref_id: sourceId,
      chunk_index: i,
      text,
    }))
    await vdb.addChunks(chunkInputs)
  }

  emit(1, '向量化完成', `${chunks.length} 个文本块已嵌入`, 20)
  await yield_()

  // ==================================================================
  // STEP 2 — Similarity search
  // ==================================================================
  emit(2, '语义搜索已有页面', '正在检索相关 Wiki 页面...', 25)
  await yield_()

  // For performance on very large documents, limit the number of chunk
  // query vectors used as queries to 30 (sampled evenly).
  const maxQueryChunks = 30
  let queryVectors = chunkVectors
  if (chunkVectors.length > maxQueryChunks) {
    const step = chunkVectors.length / maxQueryChunks
    queryVectors = []
    for (let i = 0; i < maxQueryChunks; i++) {
      queryVectors.push(chunkVectors[Math.floor(i * step)])
    }
  }

  // Aggregate search results by page ref_id: { hits, totalScore }
  const pageScores = new Map<number, { hits: number; totalScore: number }>()

  for (const qv of queryVectors) {
    const results: SearchResult[] = await vdb.search(qv, {
      type: 'page',
      topK: 100,
    })

    for (const r of results) {
      // Skip results below the similarity threshold.
      if (r._distance > maxDistance) continue

      const sim = distanceToSimilarity(r._distance)
      const agg = pageScores.get(r.ref_id)
      if (agg) {
        agg.hits++
        agg.totalScore += sim
      } else {
        pageScores.set(r.ref_id, { hits: 1, totalScore: sim })
      }
    }
  }

  // Sort candidate pages by totalScore descending, take top N.
  const rankedPages = Array.from(pageScores.entries())
    .sort((a, b) => b[1].totalScore - a[1].totalScore)
    .slice(0, candidateCount)

  // Read full content of each candidate page from disk.
  const candidatePageContents: { title: string; content: string }[] = []
  for (const [pageId] of rankedPages) {
    const page = db.getPageById(pageId)
    if (!page) continue

    // Resolve the absolute file path from the relative DB path.
    const filePath = path.join(kbPath, page.path)
    if (!fs.existsSync(filePath)) continue

    const pageContent = fs.readFileSync(filePath, 'utf-8')
    candidatePageContents.push({ title: page.title, content: pageContent })
  }

  const candidatePageTitles = candidatePageContents.map(p => p.title)
  emit(2, '语义搜索完成', `匹配到 ${rankedPages.length} 个候选页面`, 40)
  await yield_()

  // ==================================================================
  // STEP 3 — LLM verification + conflict detection
  // ==================================================================
  emit(3, 'LLM 生成编译计划', '正在分析新资料与现有知识的关系...', 45)
  await yield_()

  // Build the schema prompt from schema files.
  const schemaContent = loadSchemaPrompt(kbPath)

  // Build the user prompt: raw summary + candidate page contents + JSON instruction.
  const rawSummary = trimContent(rawContent, 2000)

  let candidateSections = ''
  if (candidatePageContents.length > 0) {
    candidateSections = candidatePageContents
      .map(p => `### ${p.title}\n${trimContent(p.content, 1500)}`)
      .join('\n\n---\n\n')
  } else {
    candidateSections = '（未找到语义相似的已有页面——所有知识都是新的）'
  }

  const verificationUserPrompt = [
    '请分析以下新资料与知识库已有页面的关联关系，输出 JSON 格式的编译计划（compile plan）。',
    '',
    '## 新资料',
    `文件名：${rawFileName}`,
    '',
    '内容摘要：',
    rawSummary,
    '',
    '## 候选相关页面',
    candidateSections,
    '',
    '## 任务',
    '1. 判断哪些已有页面需要更新——优先将新内容合并更新到已有页面，列出页面名称、需更新的章节、更新原因',
    '2. 判断是否需要创建新页面——只在主题差异大且新内容足够独立成文（> 2 个小节）时才新建。如果一个已有页面可以通过增加一个章节来容纳新内容，就不要新建。',
    '3. 检测新旧内容之间的矛盾——信息冲突、数值矛盾、观点矛盾等',
    '',
    '## 输出格式要求',
    '请**只输出**以下 JSON 格式，不要附加任何其他文字或 markdown 标记：',
    '',
    '```json',
    '{',
    '  "updates": [',
    '    {"page": "已有页面名", "sections": "需更新的章节描述", "reason": "更新原因说明"}',
    '  ],',
    '  "new_pages": [',
    '    {"title": "新页面标题", "reason": "创建原因说明"}',
    '  ],',
    '  "conflicts": [',
    '    {"target_page": "冲突页面名", "description": "矛盾描述", "source1": "来源A描述", "source2": "来源B描述", "suggested_resolution": "建议解决方案"}',
    '  ]',
    '}',
    '```',
    '',
    '如果没有某种类型的操作，请使用空数组。',
  ].join('\n')

  const planMessages = [
    { role: 'system' as const, content: schemaContent },
    { role: 'user' as const, content: verificationUserPrompt },
  ]

  const planT0 = Date.now()
  let plan: CompilePlan
  try {
    console.log(`[Compile] Step 3 — LLM 编译计划生成中...`)
    const planResponse = await chat(planMessages, overrideSettings, { kbPath, role: 'compile' })
    console.log(`[Compile] Step 3 完成 (${((Date.now() - planT0) / 1000).toFixed(1)}s)`)
    const parsed = parsePlanJson(planResponse)
    if (parsed) {
      plan = parsed
      // Ensure all arrays exist.
      plan.updates = plan.updates ?? []
      plan.new_pages = plan.new_pages ?? []
      plan.conflicts = plan.conflicts ?? []
    } else {
      throw new Error('Failed to parse plan JSON from LLM response')
    }
  } catch (err) {
    console.warn('Failed to parse plan JSON from LLM response:', err)
    // Fallback: create a simple plan with one new page based on the filename.
    const fallbackTitle = rawFileName.replace(/\.[^.]+$/, '')
    plan = {
      updates: [],
      new_pages: [{ title: fallbackTitle, reason: '新资料编译（计划解析降级）' }],
      conflicts: [],
    }
  }

  emit(3, '编译计划生成完成', `新建 ${plan.new_pages.length} 页，更新 ${plan.updates.length} 页，发现 ${plan.conflicts.length} 个矛盾`, 60)
  await yield_()

  // ==================================================================
  // STEP 4 — Generate wiki pages via compileNewPages
  // ==================================================================
  emit(4, 'LLM 生成 Wiki 页面', '正在撰写知识页面内容...', 65)
  await yield_()

  const genT0 = Date.now()
  console.log(`[Compile] Step 4 — LLM Wiki 页面生成中...`)
  let compileOutput = await compileNewPages(rawContent, rawFileName, existingTitles, kbPath, overrideSettings)
  console.log(`[Compile] Step 4 完成 (${((Date.now() - genT0) / 1000).toFixed(1)}s)`)

  emit(4, 'Wiki 页面生成完成', undefined, 75)
  await yield_()

  // ==================================================================
  // STEP 4.5 — Content Review (with retry)
  // ==================================================================
  let reviewFeedback = ''
  const settings = getLLMSettings()
  const reviewEnabled = settings.enable_content_review !== false
  const reviewSettings = getReviewSettings()

  if (reviewEnabled && reviewSettings) {
    emit(4, '内容审查', '正在由审查模型评估页面质量...', 78)
    await yield_()

    const reviewT0 = Date.now()
    console.log(`[Compile] Step 4.5 — 内容审查中...`)
    const reviewResult = await reviewContent(
      compileOutput,
      rawContent.slice(0, 4000),
      rawFileName,
      kbPath,
      reviewSettings,
    )

    console.log(`[Compile] Step 4.5 审查完成 (${((Date.now() - reviewT0) / 1000).toFixed(1)}s) — ${reviewResult.passed ? 'PASS' : '发现问题'}`)
    if (reviewResult.passed) {
      reviewFeedback = '审查通过'
      emit(4, '审查通过', undefined, 80)
    } else if (reviewResult.feedback) {
      // Retry: send review feedback back to the main compile model
      emit(4, '审查发现问题，重新生成', '正在根据审查意见修改...', 78)
      await yield_()

      try {
        const retryT0 = Date.now()
        console.log(`[Compile] Step 4.5 — 根据审查意见重新生成...`)
        const schemaContent = loadSchemaPrompt(kbPath)
        const retryPrompt = [
          { role: 'system' as const, content: schemaContent },
          { role: 'user' as const, content: [
            '你之前生成的 Wiki 页面经内容审查后发现了以下问题，请逐一修复后重新输出完整的 Wiki 页面：',
            '',
            '## 审查意见',
            reviewResult.feedback,
            '',
            '## 上一轮输出',
            compileOutput,
            '',
            '请直接输出修复后的完整 Wiki 页面 Markdown（包含 YAML frontmatter）。',
          ].join('\n') },
        ]
        const retryOutput = await chat(retryPrompt, overrideSettings || settings.llm, { kbPath, role: 'retry' })
        console.log(`[Compile] Step 4.5 重新生成完成 (${((Date.now() - retryT0) / 1000).toFixed(1)}s)`)
        compileOutput = retryOutput
        reviewFeedback = reviewResult.feedback
        emit(4, '重新生成完成', undefined, 80)
      } catch (err) {
        // Retry failed — keep original output
        reviewFeedback = `审查未通过（重试失败）：${reviewResult.feedback}`
        emit(4, '重试失败，使用原始版本', undefined, 80)
      }
    } else {
      // Review failed but no actionable feedback — keep going
      reviewFeedback = '审查无法完成，使用原始版本'
      emit(4, '审查跳过', undefined, 80)
    }
  }

  await yield_()

  // ==================================================================
  // STEP 5 — Write pages, handle conflicts, update index
  // ==================================================================
  emit(5, '写入页面与更新索引', '正在保存 Wiki 页面并重建向量索引...', 85)
  await yield_()

  // 5a. Split and write individual pages to disk.
  const generatedPages = splitWikiPages(compileOutput)

  for (const { title, content } of generatedPages) {
    const pagePath = `wiki/${title}.md`
    const fullPath = path.join(kbPath, pagePath)

    // Normalize before persisting — LLM output is non-deterministic
    const normalized = normalizeWikiPage(content)

    // Write page to disk.
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, normalized, 'utf-8')

    // Hash computed from normalized content
    const pageHash = crypto.createHash('sha256').update(normalized).digest('hex')

    // Upsert page in SQLite.
    const page = db.upsertPage({
      path: pagePath,
      title,
      hash: pageHash,
      last_compiled_at: new Date().toISOString(),
    })

    // Delete old vector chunks for this page, then re-chunk + re-embed + re-add.
    await vdb.deleteChunks(page.id!, 'page')

    const pageChunks = embedding.chunkText(normalized, chunkSize)
    if (pageChunks.length > 0) {
      const pageVectors = await embedding.embedTexts(pageChunks)
      const pageChunkInputs: ChunkInput[] = pageChunks.map((text, i) => ({
        vector: pageVectors[i],
        type: 'page',
        ref_id: page.id!,
        chunk_index: i,
        text,
      }))
      await vdb.addChunks(pageChunkInputs)
    }
  }

  // Build a title → page-id lookup for the pages we just generated.
  const allPages = db.listPages()
  const titleToPageId = new Map<string, number>()
  for (const p of allPages) {
    titleToPageId.set(p.title, p.id!)
  }

  // 5b. Record conflicts in DB and insert markers in affected page files.
  for (const conflict of plan.conflicts) {
    const targetPageId = titleToPageId.get(conflict.target_page)
    if (!targetPageId) continue // Page doesn't exist — skip.

    // Add conflict record to SQLite.
    const conflictRecord: ConflictRecord = {
      page_id: targetPageId,
      description: conflict.description,
      source1: conflict.source1,
      source2: conflict.source2,
      suggested_resolution: conflict.suggested_resolution || undefined,
      status: 'open',
    }
    db.addConflict(conflictRecord)

    // Insert the conflict marker at the top of the affected page file.
    const targetPage = db.getPageById(targetPageId)
    if (targetPage) {
      const targetFilePath = path.join(kbPath, targetPage.path)
      if (fs.existsSync(targetFilePath)) {
        const existingContent = fs.readFileSync(targetFilePath, 'utf-8')

        const marker = [
          '> ⚠️ **矛盾待处理**：' + conflict.description,
          '> 来源：' + conflict.source1 + ' vs ' + conflict.source2,
          conflict.suggested_resolution
            ? '> 建议：' + conflict.suggested_resolution
            : '',
          '',
        ]
          .filter(line => line !== '')
          .join('\n')

        // Insert marker after the frontmatter (after first `---` block) or at
        // the very top if there is no frontmatter.
        let updatedContent: string
        if (existingContent.trimStart().startsWith('---')) {
          // Find the closing frontmatter delimiter.
          const afterOpen = existingContent.slice(existingContent.indexOf('---') + 3)
          const closeIdx = afterOpen.indexOf('\n---')
          if (closeIdx >= 0) {
            const fmEnd = existingContent.indexOf('---') + 3 + closeIdx + 4 // +4 for "\n---\n"
            updatedContent =
              existingContent.slice(0, fmEnd) +
              '\n' +
              marker +
              '\n' +
              existingContent.slice(fmEnd)
          } else {
            // Malformed frontmatter — prepend at very top.
            updatedContent = marker + '\n' + existingContent
          }
        } else {
          // No frontmatter — prepend at very top.
          updatedContent = marker + '\n' + existingContent
        }

        fs.writeFileSync(targetFilePath, updatedContent, 'utf-8')
      }
    }
  }

  // 5c. Update source status to 'compiled'.
  db.updateSourceStatus(sourcePath, 'compiled', generatedPages.length)

  emit(5, '编译完成', `${generatedPages.length} 个 Wiki 页面已生成`, 100)

  const totalSec = ((Date.now() - compileStartTime) / 1000).toFixed(1)
  console.log(`[Compile] 全部完成 | ${path.basename(rawFilePath)} | ${generatedPages.length} 页 | 总耗时 ${totalSec}s`)

  return {
    compileOutput,
    plan,
    candidatePages: candidatePageTitles,
    reviewFeedback: reviewFeedback || undefined,
  }
  } catch (err) {
    console.error('incrementalCompile failed:', err)
    db.updateSourceStatus(sourcePath, 'failed')
    throw err
  }
}
