import FlexSearch from 'flexsearch'
import type { Document as FlexDocument } from 'flexsearch'

let index: FlexDocument | null = null

export function buildIndex(kbPath: string, pages: { name: string; content: string }[]): void {
  index = new FlexSearch.Document({
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
}

export function search(query: string): { name: string }[] {
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
