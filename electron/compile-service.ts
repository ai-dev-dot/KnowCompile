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
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

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
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read a raw file, handling PDF extraction via pdf-parse.
 * Returns the text content and file size in bytes.
 */
async function readRawFile(filePath: string): Promise<{ content: string; size: number }> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.pdf') {
    const pdfBuffer = fs.readFileSync(filePath)
    const pdfData = await require('pdf-parse')(pdfBuffer)
    return { content: pdfData.text, size: pdfBuffer.length }
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const size = fs.statSync(filePath).size
  return { content, size }
}

/**
 * Convert LanceDB L2 distance to cosine similarity for normalized vectors.
 *
 * For unit-norm vectors:  cos(θ) = 1 - d²/2
 * where d = ||u-v|| is the Euclidean distance between two normalized vectors.
 */
function distanceToSimilarity(distance: number): number {
  return Math.max(0, 1 - (distance * distance) / 2)
}

/**
 * Split the multi-page markdown output from compileNewPages() into individual
 * page objects with title and full markdown content.
 *
 * Pages start with "# Title" (level-1 heading). The index page is skipped.
 */
function splitWikiPages(output: string): { title: string; content: string }[] {
  // Split on "# " at start of line (level-1 heading).
  const sections = output.split(/(?=^# )/m).filter(s => s.trim())
  const pages: { title: string; content: string }[] = []

  for (const section of sections) {
    const titleMatch = section.match(/^# (.+)$/m)
    if (!titleMatch) continue

    const title = titleMatch[1].trim()

    // Skip the index/index.md page — it is metadata, not a real wiki page.
    if (title === 'Wiki 索引' || title.toLowerCase() === 'wiki index' || title === 'index') {
      continue
    }

    pages.push({ title, content: section.trim() })
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
function parsePlanJson(text: string): CompilePlan | null {
  // Strip thinking tags that may have leaked through.
  const cleanText = text.replace(/<\s*think\s*>[\s\S]*?<\/\s*think\s*>/gi, '').trim()

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

/**
 * Build the system prompt for the verification step by reading schema files
 * from `<kbPath>/schema/`.
 */
function loadSchemaPrompt(kbPath: string): string {
  const schemaDir = path.join(kbPath, 'schema')
  const files = ['system.md', 'compile-rules.md', 'style-guide.md', 'links-rules.md']

  const parts: string[] = []
  for (const file of files) {
    const filePath = path.join(schemaDir, file)
    if (fs.existsSync(filePath)) {
      parts.push(fs.readFileSync(filePath, 'utf-8'))
    }
  }

  return parts.join('\n\n')
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
export async function incrementalCompile(
  rawFilePath: string,
  kbPath: string,
  embedding: EmbeddingService,
  db: IndexDB,
  vdb: VectorDB,
): Promise<CompileResult> {
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

  // ==================================================================
  // STEP 2 — Similarity search
  // ==================================================================

  // For performance on very large documents, limit the number of chunk
  // vectors used as queries to 30 (sampled evenly).
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

  // ==================================================================
  // STEP 3 — LLM verification + conflict detection
  // ==================================================================

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
    '1. 判断哪些已有页面需要更新——列出页面名称、需要更新的章节、更新原因',
    '2. 判断是否需要创建新页面——列出每个新页面的标题和创建原因',
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

  let plan: CompilePlan
  try {
    const planResponse = await chat(planMessages)
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

  // ==================================================================
  // STEP 4 — Generate wiki pages via compileNewPages
  // ==================================================================

  const compileOutput = await compileNewPages(rawContent, rawFileName, existingTitles, kbPath)

  // ==================================================================
  // STEP 5 — Write pages, handle conflicts, update index
  // ==================================================================

  // 5a. Split and write individual pages to disk.
  const generatedPages = splitWikiPages(compileOutput)

  for (const { title, content } of generatedPages) {
    const pagePath = `wiki/${title}.md`
    const fullPath = path.join(kbPath, pagePath)

    // Write page to disk.
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')

    // Compute hash.
    const pageHash = crypto.createHash('sha256').update(content).digest('hex')

    // Upsert page in SQLite.
    const page = db.upsertPage({
      path: pagePath,
      title,
      hash: pageHash,
      last_compiled_at: new Date().toISOString(),
    })

    // Delete old vector chunks for this page, then re-chunk + re-embed + re-add.
    await vdb.deleteChunks(page.id!, 'page')

    const pageChunks = embedding.chunkText(content, chunkSize)
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

  return {
    compileOutput,
    plan,
    candidatePages: candidatePageTitles,
  }
  } catch (err) {
    console.error('incrementalCompile failed:', err)
    db.updateSourceStatus(sourcePath, 'failed')
    throw err
  }
}
