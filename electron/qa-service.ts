/**
 * QAService — Semantic question-answering service with 7-step pipeline.
 *
 * Pipeline:
 *   1. Preprocess        — embed the question via EmbeddingService
 *   2. Vector search     — find top-K semantically similar chunks in VectorDB
 *   3. Filter & rerank   — similarity threshold, per-page dedup, weighting
 *   4. Build context     — format chunks with page titles and source lines
 *   5. LLM generate      — call the LLM with schema-backed system prompt
 *   6. Post-process      — assemble answer + annotated source list
 *   7. Return            — QAResult to the caller
 */
import { IndexDB } from './index-db'
import { VectorDB } from './vector-db'
import type { SearchResult } from './vector-db'
import { EmbeddingService } from './embedding-service'
import { chat, chatStream } from './llm-service'
import type { ChatMessage } from './llm-service'
import { distanceToSimilarity } from './vector-utils'
import { logQAAnalytics, QAStepMetrics } from './qa-analytics'
import { search as keywordSearch } from './search-indexer'
import { rewriteQuery } from './query-rewriter'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface QAResult {
  answer: string
  sources: { title: string; chunk_index: number; similarity: number }[]
}

interface WeightedChunk {
  result: SearchResult
  similarity: number
  weight: number
  title: string
  sourceLine: string
}

export interface ContextResult {
  contextText: string
  sources: { title: string; chunk_index: number; similarity: number }[]
  topChunks: WeightedChunk[]
  metrics: Pick<QAStepMetrics,
    'embeddingMs' | 'embeddingDim' | 'searchMs' | 'retrievalCount' |
    'rawResultCount' | 'distanceStats' | 'filterRerankMs' | 'similarityThreshold' |
    'passedThreshold' | 'filteredOut' | 'afterDedup' | 'finalTopK' | 'finalCount' |
    'weightStats' | 'titleMatchBoosts' | 'freshnessBoosts' |
    'contextBuildMs' | 'contextTokenBudget' | 'contextTokens' | 'contextChars' |
    'chunksUsed' | 'truncated' | 'sourceCount'
  >
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2)
}

// ---------------------------------------------------------------------------
// Page file helpers
// ---------------------------------------------------------------------------

function readSourceLine(pageFilePath: string): string {
  try {
    const content = fs.readFileSync(pageFilePath, 'utf-8')
    for (const line of content.split('\n')) {
      if (line.startsWith('> 来源：')) return line.trim()
    }
  } catch {
    // File missing or unreadable — return empty.
  }
  return ''
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function getSettingNum(
  db: IndexDB,
  key: string,
  defaultValue: number,
): number {
  const raw = db.getSetting(key)
  if (raw === undefined || raw === null || raw === '') return defaultValue
  const n = Number(raw)
  return Number.isFinite(n) ? n : defaultValue
}

// ---------------------------------------------------------------------------
// Step 1-4: Build context from question (shared by streaming + non-streaming)
// ---------------------------------------------------------------------------

export async function buildContext(
  question: string,
  kbPath: string,
  embedding: EmbeddingService,
  db: IndexDB,
  vdb: VectorDB,
): Promise<ContextResult> {
  const m: ContextResult['metrics'] = {
    embeddingMs: 0, embeddingDim: 0,
    searchMs: 0, retrievalCount: 0, rawResultCount: 0,
    distanceStats: { min: 0, max: 0, avg: 0 },
    filterRerankMs: 0, similarityThreshold: 0, passedThreshold: 0,
    filteredOut: 0, afterDedup: 0, finalTopK: 0, finalCount: 0,
    weightStats: { min: 0, max: 0, avg: 0 },
    titleMatchBoosts: 0, freshnessBoosts: 0,
    contextBuildMs: 0, contextTokenBudget: 0, contextTokens: 0, contextChars: 0,
    chunksUsed: 0, truncated: false,
    sourceCount: 0,
  }

  // Step 1 — Preprocess: rewrite query, then embed expanded form
  const t1 = performance.now()
  const rewritten = rewriteQuery(question)
  // Embed the expanded query (original + synonym phrases) for richer semantics
  const questionVec = await embedding.embedQuery(rewritten.expanded)
  m.embeddingMs = Math.round(performance.now() - t1)
  m.embeddingDim = questionVec.length

  // Step 2 — Vector search + keyword search (hybrid, parallel)
  const t2 = performance.now()
  m.retrievalCount = getSettingNum(db, 'qa_retrieval_count', 30)
  const enableHybrid = getSettingNum(db, 'qa_hybrid_search', 1) === 1

  // Keyword search augmented with extracted keywords for better recall
  const kwQuery = rewritten.keywords.length > 0
    ? `${question} ${rewritten.keywords.join(' ')}`
    : question

  const [rawResults, kwResults] = await Promise.all([
    vdb.search(questionVec, { type: 'page', topK: m.retrievalCount }),
    enableHybrid ? Promise.resolve(keywordSearch(kbPath, kwQuery)) : Promise.resolve([] as { name: string }[]),
  ])
  m.searchMs = Math.round(performance.now() - t2)
  m.rawResultCount = rawResults.length

  if (rawResults.length > 0) {
    const dists = rawResults.map(r => r._distance)
    m.distanceStats = {
      min: Math.round(Math.min(...dists) * 1000) / 1000,
      max: Math.round(Math.max(...dists) * 1000) / 1000,
      avg: Math.round(dists.reduce((a, b) => a + b, 0) / dists.length * 1000) / 1000,
    }
  }

  if (rawResults.length === 0) {
    m.contextBuildMs = Math.round(performance.now() - t1)
    return { contextText: '', sources: [], topChunks: [], metrics: m }
  }

  // Step 3 — Filter & rerank
  const t3 = performance.now()
  m.similarityThreshold = getSettingNum(db, 'qa_similarity_threshold', 0.65)
  m.finalTopK = getSettingNum(db, 'qa_final_context_count', 8)
  const now = Date.now()

  const withSim: { result: SearchResult; similarity: number }[] = []
  for (const r of rawResults) {
    const sim = distanceToSimilarity(r._distance)
    if (sim >= m.similarityThreshold) {
      withSim.push({ result: r, similarity: sim })
    }
  }
  m.passedThreshold = withSim.length
  m.filteredOut = rawResults.length - withSim.length

  const perPage: Map<number, { result: SearchResult; similarity: number }[]> = new Map()
  for (const item of withSim) {
    const key = item.result.ref_id
    const bucket = perPage.get(key) || []
    if (bucket.length < 3) {
      bucket.push(item)
      perPage.set(key, bucket)
    }
  }

  // Build keyword rank lookup: page title → RRF score
  const kwRanks = new Map<string, number>()
  if (enableHybrid && kwResults.length > 0) {
    for (let i = 0; i < kwResults.length; i++) {
      kwRanks.set(kwResults[i].name, 1 / (60 + i + 1))
    }
  }

  const weighted: WeightedChunk[] = []
  for (const [, chunks] of perPage) {
    for (const item of chunks) {
      const page = db.getPageById(item.result.ref_id)
      const title = page?.title ?? `页面#${item.result.ref_id}`

      let weight = item.similarity

      const titleWords = title.split(/\s+/).filter((w) => w.length > 0)
      if (titleWords.some((w) => question.includes(w))) {
        weight *= 2.0
        m.titleMatchBoosts++
      }

      if (page?.updated_at) {
        const updatedMs = Date.parse(page.updated_at)
        if (!Number.isNaN(updatedMs)) {
          const daysAgo = (now - updatedMs) / (1000 * 60 * 60 * 24)
          if (daysAgo <= 7) {
            weight *= 1.2
            m.freshnessBoosts++
          }
        }
      }

      // Hybrid: boost chunks whose page matched keyword search
      const kwScore = kwRanks.get(title)
      if (kwScore) {
        weight += kwScore * 2.0 // RRF keyword boost factor
      }

      const pageFilePath = page ? path.join(kbPath, page.path) : ''
      const sourceLine = pageFilePath ? readSourceLine(pageFilePath) : ''

      weighted.push({ result: item.result, similarity: item.similarity, weight, title, sourceLine })
    }
  }

  weighted.sort((a, b) => b.weight - a.weight)
  const topChunks = weighted.slice(0, m.finalTopK)
  m.afterDedup = weighted.length
  m.finalCount = topChunks.length

  if (weighted.length > 0) {
    const weights = weighted.map(w => w.weight)
    m.weightStats = {
      min: Math.round(Math.min(...weights) * 1000) / 1000,
      max: Math.round(Math.max(...weights) * 1000) / 1000,
      avg: Math.round(weights.reduce((a, b) => a + b, 0) / weights.length * 1000) / 1000,
    }
  }
  m.filterRerankMs = Math.round(performance.now() - t3)

  // Step 4 — Build context text
  const t4 = performance.now()
  // Token budget will be read from DB by the caller, use default here
  m.contextTokenBudget = 3000
  const contextParts: string[] = []
  let tokenBudget = m.contextTokenBudget

  for (const chunk of topChunks) {
    let block = `【页面标题：${chunk.title}】\n`
    if (chunk.sourceLine) {
      block += `${chunk.sourceLine}\n`
    }
    block += `${chunk.result.text}\n---`

    const blockTokens = estimateTokens(block)
    if (blockTokens > tokenBudget) {
      if (contextParts.length === 0) {
        const allowed = Math.floor(tokenBudget * 2)
        block = block.slice(0, allowed) + '\n[已截断]'
        contextParts.push(block)
        m.truncated = true
      }
      break
    }

    contextParts.push(block)
    tokenBudget -= blockTokens
  }

  const contextText = contextParts.join('\n\n')
  m.chunksUsed = contextParts.length
  m.contextTokens = estimateTokens(contextText)
  m.contextChars = contextText.length
  m.contextBuildMs = Math.round(performance.now() - t4)

  // Sources
  const seenSources = new Set<string>()
  const sources: { title: string; chunk_index: number; similarity: number }[] = []
  for (const chunk of topChunks) {
    const key = `${chunk.title}|${chunk.result.chunk_index}`
    if (!seenSources.has(key)) {
      seenSources.add(key)
      sources.push({
        title: chunk.title,
        chunk_index: chunk.result.chunk_index,
        similarity: Math.round(chunk.similarity * 1000) / 1000,
      })
    }
  }
  m.sourceCount = sources.length

  return { contextText, sources, topChunks, metrics: m }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(kbPath: string, contextText: string): string {
  const systemPath = path.join(kbPath, 'schema', 'system.md')
  let schemaContent = ''
  try {
    schemaContent = fs.readFileSync(systemPath, 'utf-8')
  } catch {
    // No system.md — use minimal fallback.
  }

  return (
    `${schemaContent}\n\n` +
    `你是一个知识库问答助手。你必须**严格基于**下面"参考资料"中的内容回答问题。\n\n` +
    `规则：\n` +
    `1. **禁止编造**：只能使用参考资料中明确出现的信息。如果资料中没有，直接说"资料未提供相关信息"。\n` +
    `2. **引用来源**：回答时注明信息来自哪个页面。使用【来源：页面标题】的格式。\n` +
    `3. **综合回答**：如果多个资料提供不同角度的信息，请综合并指出差异。\n` +
    `4. **简洁清晰**：回答直接切中要点，不绕弯子。\n\n` +
    `---\n\n` +
    `## 参考资料\n\n${contextText}`
  )
}

// ---------------------------------------------------------------------------
// Non-streaming QA (backward-compatible — refactored to use buildContext)
// ---------------------------------------------------------------------------

export async function semanticQA(
  question: string,
  kbPath: string,
  embedding: EmbeddingService,
  db: IndexDB,
  vdb: VectorDB,
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string },
  conversationHistory?: ChatMessage[],
): Promise<QAResult> {
  const t0 = performance.now()
  const ctx = await buildContext(question, kbPath, embedding, db, vdb)

  const m: QAStepMetrics = {
    ...ctx.metrics,
    llmMs: 0,
    totalMs: 0, question, answerLength: 0, success: false,
  }

  try {
    if (!ctx.contextText) {
      m.totalMs = Math.round(performance.now() - t0)
      m.success = true
      logQAAnalytics(kbPath, { ...m, timestamp: new Date().toISOString() })
      return { answer: '知识库中未找到相关内容，无法回答该问题。', sources: [] }
    }

    const t5 = performance.now()
    const systemPrompt = buildSystemPrompt(kbPath, ctx.contextText)

    const allMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ]
    // Inject conversation history before the current question
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        allMessages.push(msg)
      }
    }
    allMessages.push({ role: 'user', content: `问题：${question}` })

    const response = await chat(allMessages, overrideSettings, { kbPath, role: 'qa' })
    m.llmMs = Math.round(performance.now() - t5)

    m.totalMs = Math.round(performance.now() - t0)
    m.answerLength = response.length
    m.success = true
    logQAAnalytics(kbPath, { ...m, timestamp: new Date().toISOString() })

    return { answer: response, sources: ctx.sources }

  } catch (err: any) {
    m.totalMs = Math.round(performance.now() - t0)
    m.success = false
    m.error = err?.message ?? String(err)
    logQAAnalytics(kbPath, { ...m, timestamp: new Date().toISOString() })
    throw err
  }
}

// ---------------------------------------------------------------------------
// Streaming QA
// ---------------------------------------------------------------------------

export interface QAStreamEvent {
  type: 'token' | 'done' | 'error'
  token?: string
  accumulated?: string
  sources?: { title: string; chunk_index: number; similarity: number }[]
  error?: string
}

export async function* semanticQAStream(
  question: string,
  kbPath: string,
  embedding: EmbeddingService,
  db: IndexDB,
  vdb: VectorDB,
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string },
  conversationHistory?: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<QAStreamEvent, void, undefined> {
  const t0 = performance.now()
  const ctx = await buildContext(question, kbPath, embedding, db, vdb)

  const m: QAStepMetrics = {
    ...ctx.metrics,
    llmMs: 0,
    totalMs: 0, question, answerLength: 0, success: false,
  }

  try {
    if (!ctx.contextText) {
      m.totalMs = Math.round(performance.now() - t0)
      m.success = true
      logQAAnalytics(kbPath, { ...m, timestamp: new Date().toISOString() })
      yield { type: 'done', sources: [], accumulated: '知识库中未找到相关内容，无法回答该问题。' }
      return
    }

    const t5 = performance.now()
    const systemPrompt = buildSystemPrompt(kbPath, ctx.contextText)

    const allMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ]
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        allMessages.push(msg)
      }
    }
    allMessages.push({ role: 'user', content: `问题：${question}` })

    const stream = chatStream(allMessages, overrideSettings, { kbPath, role: 'qa' }, signal)
    for await (const st of stream) {
      if (signal?.aborted) break
      if (st.token) {
        yield { type: 'token', token: st.token, accumulated: st.accumulated }
      }
    }

    m.llmMs = Math.round(performance.now() - t5)
    m.totalMs = Math.round(performance.now() - t0)
    m.answerLength = (stream as any)._accumulated?.length || 0
    m.success = true
    logQAAnalytics(kbPath, { ...m, timestamp: new Date().toISOString() })

    yield { type: 'done', sources: ctx.sources }

  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      yield { type: 'error', error: 'Request cancelled' }
    } else {
      m.totalMs = Math.round(performance.now() - t0)
      m.success = false
      m.error = err?.message ?? String(err)
      logQAAnalytics(kbPath, { ...m, timestamp: new Date().toISOString() })
      yield { type: 'error', error: err?.message ?? String(err) }
    }
  }
}
