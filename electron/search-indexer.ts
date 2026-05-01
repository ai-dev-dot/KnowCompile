import FlexSearch from 'flexsearch'
import type { Document as FlexDocument } from 'flexsearch'

const indexes = new Map<string, FlexDocument>()

export function buildIndex(kbPath: string, pages: { name: string; content: string }[]): void {
  const index = new FlexSearch.Document({
    document: {
      id: 'name',
      index: ['content'],
      store: ['name'],
    },
    tokenize: 'forward',
    encoder: 'LatinExtra',
  })

  for (const page of pages) {
    index.add({ name: page.name, content: page.content })
  }

  indexes.set(kbPath, index)
}

export function search(kbPath: string, query: string): { name: string }[] {
  const index = indexes.get(kbPath)
  if (!index) return []
  const results = index.search(query, { limit: 20 })
  const seen = new Set<string>()
  const out: { name: string }[] = []
  for (const r of results) {
    for (const field of r.result) {
      if (!seen.has(field as string)) {
        seen.add(field as string)
        out.push({ name: field as string })
      }
    }
  }
  return out
}
