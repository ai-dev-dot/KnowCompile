export interface WikiPage {
  name: string
  path: string
  content: string
  modifiedAt: string
  backlinks: string[]
}

export interface RawFile {
  name: string
  path: string
  size: number
  addedAt: string
}

export interface SchemaFile {
  name: string
  path: string
  content: string
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom'
  apiKey: string
  baseURL?: string
  model: string
}

export interface GraphNode {
  id: string
  label: string
  linkCount: number
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface SearchResult {
  page: string
  snippet: string
  score: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void
    }
  }
}
