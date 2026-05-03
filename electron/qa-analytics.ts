/**
 * QA Analytics Logger
 *
 * Records per-step pipeline metrics for every QA call to a structured JSONL log.
 * Enables evaluation of each pipeline component: embedding, retrieval, reranking,
 * context building, and LLM generation.
 *
 * Log files: <kbPath>/.ai-notes/qa-analytics/YYYY-MM-DD.jsonl
 */

import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DistanceStats {
  min: number
  max: number
  avg: number
}

export interface WeightStats {
  min: number
  max: number
  avg: number
}

export interface FeedbackWeightRecord {
  sourcePage: string
  multiplier: number
  reason: string  // e.g. "≥3 helpful → ×1.3" or "≥1 inaccurate → ×0.7"
}

export interface QAStepMetrics {
  /** Session linkage */
  qaSessionId?: string  // v0.2.1: links QA analytics to LLM logs + feedback

  /** Step 1 — Embedding */
  embeddingMs: number
  embeddingDim: number

  /** Step 2 — Vector search */
  searchMs: number
  retrievalCount: number
  rawResultCount: number
  distanceStats: DistanceStats

  /** Step 3 — Filter & rerank */
  filterRerankMs: number
  similarityThreshold: number
  passedThreshold: number
  filteredOut: number
  afterDedup: number
  finalTopK: number
  finalCount: number
  weightStats: WeightStats
  titleMatchBoosts: number
  freshnessBoosts: number

  /** Step 4 — Context building */
  contextBuildMs: number
  contextTokenBudget: number
  contextTokens: number
  contextChars: number
  chunksUsed: number
  truncated: boolean

  /** Step 5 — LLM generation (timing only; detail in llm-logs) */
  llmMs: number

  /** Step 6 — Post-process */
  sourceCount: number

  /** Overall */
  totalMs: number
  question: string
  answerLength: number
  success: boolean
  error?: string

  // v0.2.1: quality + feedback tracking
  /** Whether the user later marked this as helpful/inaccurate (backfilled). */
  retrievalQuality?: 'helpful' | 'inaccurate' | 'more_detail' | 'no_feedback'
  /** Source pages whose weights were adjusted by feedback history. */
  feedbackWeightsApplied?: FeedbackWeightRecord[]
}

export interface QAAnalyticsEntry extends QAStepMetrics {
  timestamp: string
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function logQAAnalytics(kbPath: string, entry: QAAnalyticsEntry): void {
  try {
    const logDir = path.join(kbPath, '.ai-notes', 'qa-analytics')
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const dateStr = entry.timestamp.slice(0, 10)
    const logPath = path.join(logDir, `${dateStr}.jsonl`)

    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8')
  } catch (err) {
    console.error('QA analytics write failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Read & aggregate
// ---------------------------------------------------------------------------

export interface QAAnalyticsQuery {
  since?: string
  until?: string
  limit?: number
}

export function readQAAnalytics(kbPath: string, query: QAAnalyticsQuery = {}): QAAnalyticsEntry[] {
  const logDir = path.join(kbPath, '.ai-notes', 'qa-analytics')
  if (!fs.existsSync(logDir)) return []

  const files = fs.readdirSync(logDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse()

  const results: QAAnalyticsEntry[] = []

  for (const file of files) {
    if (query.since && file < query.since.slice(0, 10)) break
    if (query.until && file > query.until.slice(0, 10)) continue

    try {
      const content = fs.readFileSync(path.join(logDir, file), 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean).reverse()
      for (const line of lines) {
        if (!line) continue
        const entry = JSON.parse(line) as QAAnalyticsEntry
        results.push(entry)
        if (query.limit && results.length >= query.limit) return results
      }
    } catch (err) {
      console.error(`Failed to read QA analytics file ${file}:`, err)
    }
  }

  return results
}

export interface QAAnalyticsStats {
  totalCalls: number
  successRate: number
  avgTotalMs: number

  /** Embedding */
  avgEmbeddingMs: number

  /** Vector search */
  avgSearchMs: number
  avgRawResultCount: number
  avgDistanceMin: number
  avgDistanceMax: number
  avgDistanceAvg: number

  /** Filter & rerank */
  avgFilterRerankMs: number
  avgPassedThreshold: number
  avgFilteredOut: number
  avgPassRate: number
  avgAfterDedup: number
  avgFinalCount: number
  avgWeightAvg: number
  avgTitleMatchBoosts: number
  avgFreshnessBoosts: number

  /** Context */
  avgContextBuildMs: number
  avgContextTokens: number
  avgChunksUsed: number
  truncationRate: number

  /** LLM */
  avgLlmMs: number

  /** Output */
  avgSourceCount: number
  avgAnswerLength: number

  /** Settings snapshot (from most recent call) */
  latestThreshold: number
  latestRetrievalCount: number
  latestFinalTopK: number
  latestTokenBudget: number
}

export function getQAAnalyticsStats(kbPath: string, limit = 100): QAAnalyticsStats {
  const entries = readQAAnalytics(kbPath, { limit })
  if (entries.length === 0) {
    return {
      totalCalls: 0, successRate: 0, avgTotalMs: 0,
      avgEmbeddingMs: 0,
      avgSearchMs: 0, avgRawResultCount: 0,
      avgDistanceMin: 0, avgDistanceMax: 0, avgDistanceAvg: 0,
      avgFilterRerankMs: 0, avgPassedThreshold: 0, avgFilteredOut: 0,
      avgPassRate: 0, avgAfterDedup: 0, avgFinalCount: 0,
      avgWeightAvg: 0, avgTitleMatchBoosts: 0, avgFreshnessBoosts: 0,
      avgContextBuildMs: 0, avgContextTokens: 0, avgChunksUsed: 0,
      truncationRate: 0,
      avgLlmMs: 0,
      avgSourceCount: 0, avgAnswerLength: 0,
      latestThreshold: 0, latestRetrievalCount: 0,
      latestFinalTopK: 0, latestTokenBudget: 0,
    }
  }

  const n = entries.length
  let successCount = 0
  let sumTotal = 0, sumEmbed = 0, sumSearch = 0, sumRaw = 0
  let sumDistMin = 0, sumDistMax = 0, sumDistAvg = 0
  let sumFilter = 0, sumPassed = 0, sumFiltered = 0, sumDedup = 0, sumFinal = 0
  let sumWeight = 0, sumTitleB = 0, sumFreshB = 0
  let sumCtx = 0, sumCtxTokens = 0, sumChunks = 0, sumTrunc = 0
  let sumLlm = 0, sumSrc = 0, sumAnsLen = 0

  for (const e of entries) {
    if (e.success) successCount++
    sumTotal += e.totalMs
    sumEmbed += e.embeddingMs
    sumSearch += e.searchMs
    sumRaw += e.rawResultCount
    sumDistMin += e.distanceStats.min
    sumDistMax += e.distanceStats.max
    sumDistAvg += e.distanceStats.avg
    sumFilter += e.filterRerankMs
    sumPassed += e.passedThreshold
    sumFiltered += e.filteredOut
    sumDedup += e.afterDedup
    sumFinal += e.finalCount
    sumWeight += e.weightStats.avg
    sumTitleB += e.titleMatchBoosts
    sumFreshB += e.freshnessBoosts
    sumCtx += e.contextBuildMs
    sumCtxTokens += e.contextTokens
    sumChunks += e.chunksUsed
    if (e.truncated) sumTrunc++
    sumLlm += e.llmMs
    sumSrc += e.sourceCount
    sumAnsLen += e.answerLength
  }

  const latest = entries[0] // newest first
  return {
    totalCalls: n,
    successRate: Math.round((successCount / n) * 1000) / 10,
    avgTotalMs: Math.round(sumTotal / n),
    avgEmbeddingMs: Math.round(sumEmbed / n),
    avgSearchMs: Math.round(sumSearch / n),
    avgRawResultCount: Math.round((sumRaw / n) * 10) / 10,
    avgDistanceMin: Math.round(sumDistMin / n * 1000) / 1000,
    avgDistanceMax: Math.round(sumDistMax / n * 1000) / 1000,
    avgDistanceAvg: Math.round(sumDistAvg / n * 1000) / 1000,
    avgFilterRerankMs: Math.round(sumFilter / n),
    avgPassedThreshold: Math.round((sumPassed / n) * 10) / 10,
    avgFilteredOut: Math.round((sumFiltered / n) * 10) / 10,
    avgPassRate: Math.round((sumPassed / (sumPassed + sumFiltered || 1)) * 1000) / 10,
    avgAfterDedup: Math.round((sumDedup / n) * 10) / 10,
    avgFinalCount: Math.round((sumFinal / n) * 10) / 10,
    avgWeightAvg: Math.round(sumWeight / n * 1000) / 1000,
    avgTitleMatchBoosts: Math.round((sumTitleB / n) * 10) / 10,
    avgFreshnessBoosts: Math.round((sumFreshB / n) * 10) / 10,
    avgContextBuildMs: Math.round(sumCtx / n),
    avgContextTokens: Math.round(sumCtxTokens / n),
    avgChunksUsed: Math.round((sumChunks / n) * 10) / 10,
    truncationRate: Math.round((sumTrunc / n) * 1000) / 10,
    avgLlmMs: Math.round(sumLlm / n),
    avgSourceCount: Math.round((sumSrc / n) * 10) / 10,
    avgAnswerLength: Math.round(sumAnsLen / n),
    latestThreshold: latest.similarityThreshold,
    latestRetrievalCount: latest.retrievalCount,
    latestFinalTopK: latest.finalTopK,
    latestTokenBudget: latest.contextTokenBudget,
  }
}
