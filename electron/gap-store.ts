/**
 * Knowledge Gap Store — tracks questions the KB couldn't answer.
 *
 * Gaps are stored as JSONL in <kbPath>/.ai-notes/knowledge-gaps.jsonl.
 * Each entry records the question that couldn't be answered, so the user
 * can later import relevant materials and trigger compilation.
 */
import fs from 'fs'
import path from 'path'

export interface KnowledgeGap {
  id: string
  question: string
  topic?: string
  createdAt: string
  resolved: boolean
}

const GAPS_FILE = 'knowledge-gaps.jsonl'

function gapsPath(kbPath: string): string {
  return path.join(kbPath, '.ai-notes', GAPS_FILE)
}

function ensureDir(kbPath: string): void {
  const dir = path.join(kbPath, '.ai-notes')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function logGap(kbPath: string, question: string): KnowledgeGap {
  ensureDir(kbPath)
  const gap: KnowledgeGap = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    question,
    createdAt: new Date().toISOString(),
    resolved: false,
  }
  fs.appendFileSync(gapsPath(kbPath), JSON.stringify(gap) + '\n', 'utf-8')
  return gap
}

export function listGaps(kbPath: string): KnowledgeGap[] {
  try {
    if (!fs.existsSync(gapsPath(kbPath))) return []
    const content = fs.readFileSync(gapsPath(kbPath), 'utf-8')
    return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as KnowledgeGap)
  } catch {
    return []
  }
}

export function resolveGap(kbPath: string, gapId: string): boolean {
  const gaps = listGaps(kbPath)
  const idx = gaps.findIndex(g => g.id === gapId)
  if (idx === -1) return false
  gaps[idx].resolved = true
  fs.writeFileSync(gapsPath(kbPath), gaps.map(g => JSON.stringify(g)).join('\n') + '\n', 'utf-8')
  return true
}

export function deleteGap(kbPath: string, gapId: string): boolean {
  const gaps = listGaps(kbPath)
  const filtered = gaps.filter(g => g.id !== gapId)
  if (filtered.length === gaps.length) return false
  fs.writeFileSync(gapsPath(kbPath), filtered.map(g => JSON.stringify(g)).join('\n') + '\n', 'utf-8')
  return true
}

/** Compute a simple topic from the question for grouping. */
export function extractGapTopic(question: string): string {
  // Use first meaningful phrase as topic
  const cleaned = question.replace(/[？?！!。.]/g, ' ').trim()
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2)
  return words.slice(0, 3).join(' ') || '其他'
}
