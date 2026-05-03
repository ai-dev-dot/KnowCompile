/**
 * Conversation Store — JSON file-based persistence for QA conversations.
 *
 * Conversations live in <kbPath>/.ai-notes/conversations/ as individual
 * .json files. This keeps them separate from index metadata, easy to
 * inspect/debug, and zero-schema-migration.
 */
import fs from 'fs'
import path from 'path'

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; chunk_index: number; similarity: number }[]
  feedback?: 'helpful' | 'inaccurate' | 'more_detail'
  createdAt: string
}

export interface Conversation {
  id: string
  kbPath: string
  title: string
  messages: ConversationMessage[]
  createdAt: string
  updatedAt: string
}

function convDir(kbPath: string): string {
  return path.join(kbPath, '.ai-notes', 'conversations')
}

function convPath(kbPath: string, id: string): string {
  return path.join(convDir(kbPath), `${id}.json`)
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function createConversation(kbPath: string, title?: string): Conversation {
  const conv: Conversation = {
    id: generateId(),
    kbPath,
    title: title || '新对话',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  ensureDir(convDir(kbPath))
  fs.writeFileSync(convPath(kbPath, conv.id), JSON.stringify(conv, null, 2), 'utf-8')
  return conv
}

export function addMessage(
  kbPath: string,
  convId: string,
  msg: Omit<ConversationMessage, 'createdAt'>,
): Conversation {
  const conv = getConversation(kbPath, convId)
  if (!conv) throw new Error(`Conversation not found: ${convId}`)

  conv.messages.push({ ...msg, createdAt: new Date().toISOString() })
  // Auto-title from first user message
  if (!conv.title || conv.title === '新对话') {
    const firstUserMsg = conv.messages.find(m => m.role === 'user')
    if (firstUserMsg) {
      conv.title = firstUserMsg.content.slice(0, 50)
    }
  }
  conv.updatedAt = new Date().toISOString()
  fs.writeFileSync(convPath(kbPath, conv.id), JSON.stringify(conv, null, 2), 'utf-8')
  return conv
}

export function getConversation(kbPath: string, convId: string): Conversation | null {
  try {
    const raw = fs.readFileSync(convPath(kbPath, convId), 'utf-8')
    return JSON.parse(raw) as Conversation
  } catch {
    return null
  }
}

export function listConversations(kbPath: string): Conversation[] {
  const dir = convDir(kbPath)
  if (!fs.existsSync(dir)) return []

  const results: Conversation[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
      results.push(JSON.parse(raw) as Conversation)
    } catch {
      // Skip corrupt files
    }
  }
  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return results
}

export function getConversationHistory(
  kbPath: string,
  convId: string,
  limit: number,
): ConversationMessage[] {
  const conv = getConversation(kbPath, convId)
  if (!conv) return []
  return conv.messages.slice(-limit)
}

export function deleteConversation(kbPath: string, convId: string): boolean {
  try {
    const p = convPath(kbPath, convId)
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
      return true
    }
    return false
  } catch {
    return false
  }
}

export function updateFeedback(
  kbPath: string,
  convId: string,
  msgIndex: number,
  feedback: 'helpful' | 'inaccurate' | 'more_detail',
): Conversation | null {
  const conv = getConversation(kbPath, convId)
  if (!conv || msgIndex < 0 || msgIndex >= conv.messages.length) return null

  conv.messages[msgIndex].feedback = feedback
  conv.updatedAt = new Date().toISOString()
  fs.writeFileSync(convPath(kbPath, conv.id), JSON.stringify(conv, null, 2), 'utf-8')
  return conv
}
