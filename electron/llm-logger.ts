/**
 * LLM Interaction Logger
 *
 * Records every LLM call to a structured JSONL log for debugging, cost analysis,
 * and quality improvement. One file per day to keep files manageable.
 *
 * Log files: <kbPath>/.ai-notes/llm-logs/YYYY-MM-DD.jsonl
 */

import * as fs from 'fs'
import * as path from 'path'

export interface LLMLogEntry {
  timestamp: string
  qaSessionId?: string     // v0.2.1: links LLM call to QA session
  model: string
  provider: string
  role: 'compile' | 'qa' | 'review' | 'retry'
  promptSummary: string   // first 500 chars of the last user message
  responseSummary: string // first 500 chars of the response
  promptLen: number
  responseLen: number
  durationMs: number
  success: boolean
  error?: string
  errorCategory?: 'timeout' | 'rate_limit' | 'auth' | 'network' | 'other'  // v0.2.1
  // v0.2.1: token + cost estimates (估算值，仅供参考)
  promptTokens?: number
  responseTokens?: number
  costEstimate?: number
  reviewPassed?: boolean  // for review role
  reviewFeedback?: string // for review role
  feedback?: 'helpful' | 'inaccurate' | 'more_detail'
  feedbackAt?: string
}

export function logLLMInteraction(kbPath: string, entry: LLMLogEntry): void {
  try {
    const logDir = path.join(kbPath, '.ai-notes', 'llm-logs')
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const dateStr = entry.timestamp.slice(0, 10) // YYYY-MM-DD
    const logPath = path.join(logDir, `${dateStr}.jsonl`)

    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8')
  } catch (err) {
    // Logging should never break the main flow
    console.error('LLM log write failed:', err)
  }
}

export interface LogQuery {
  since?: string     // ISO date
  until?: string     // ISO date
  role?: 'compile' | 'qa' | 'review' | 'retry'
  limit?: number
}

export function readLLMLogs(kbPath: string, query: LogQuery = {}): LLMLogEntry[] {
  const logDir = path.join(kbPath, '.ai-notes', 'llm-logs')
  if (!fs.existsSync(logDir)) return []

  const files = fs.readdirSync(logDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse() // newest first

  const results: LLMLogEntry[] = []

  for (const file of files) {
    if (query.since && file < query.since.slice(0, 10)) break
    if (query.until && file > query.until.slice(0, 10)) continue

    try {
      const content = fs.readFileSync(path.join(logDir, file), 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean).reverse() // newest first within file
      for (const line of lines) {
        if (!line) continue
        const entry = JSON.parse(line) as LLMLogEntry
        if (query.role && entry.role !== query.role) continue
        results.push(entry)
        if (query.limit && results.length >= query.limit) return results
      }
    } catch (err) {
      console.error(`Failed to read log file ${file}:`, err)
    }
  }

  return results
}

export function getLLMLogStats(kbPath: string): {
  totalCalls: number
  totalErrors: number
  avgDurationMs: number
  totalCostEstimate: number
  errorsByCategory: Record<string, number>
  callsByRole: Record<string, number>
} {
  const recent = readLLMLogs(kbPath, { limit: 500 })
  const callsByRole: Record<string, number> = {}
  const errorsByCategory: Record<string, number> = {}
  let totalCalls = 0
  let totalErrors = 0
  let totalDuration = 0
  let totalCost = 0

  for (const entry of recent) {
    totalCalls++
    if (!entry.success) {
      totalErrors++
      const cat = entry.errorCategory || 'other'
      errorsByCategory[cat] = (errorsByCategory[cat] || 0) + 1
    }
    totalDuration += entry.durationMs
    totalCost += entry.costEstimate || 0
    callsByRole[entry.role] = (callsByRole[entry.role] || 0) + 1
  }

  return {
    totalCalls,
    totalErrors,
    avgDurationMs: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
    totalCostEstimate: Math.round(totalCost * 10000) / 10000, // 4 decimal places
    errorsByCategory,
    callsByRole,
  }
}
