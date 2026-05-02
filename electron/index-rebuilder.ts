/**
 * IndexRebuilder — full-index rebuild service.
 *
 * Rebuilds the entire `.index/` (SQLite + LanceDB) from scratch by scanning
 * `wiki/` and `raw/` directories.
 *
 * Key design decisions:
 * - Only wiki pages are embedded (raw files don't need it — compile search
 *   only queries page chunks)
 * - Embedding model is skipped entirely when there are no wiki pages
 */

import { IndexDB } from './index-db'
import type { PageRecord, SourceRecord } from './index-db'
import { VectorDB } from './vector-db'
import type { ChunkInput } from './vector-db'
import { EmbeddingService } from './embedding-service'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RebuildResult {
  pagesIndexed: number
  chunksIndexed: number
  sourcesIndexed: number
  errors: string[]
}

export interface RebuildProgress {
  phase: string
  label: string
  current: number
  total: number
  percent: number
}

// ---------------------------------------------------------------------------
// IndexRebuilder
// ---------------------------------------------------------------------------

export class IndexRebuilder {
  private kbPath: string

  constructor(kbPath: string) {
    this.kbPath = path.resolve(kbPath)
  }

  async rebuild(onProgress?: (p: RebuildProgress) => void): Promise<RebuildResult> {
    const emit = (phase: string, label: string, current: number, total: number, percent: number) => {
      onProgress?.({ phase, label, current, total, percent })
    }
    const yield_ = () => new Promise<void>(r => setImmediate(r))
    const errors: string[] = []
    let pagesIndexed = 0
    let chunksIndexed = 0
    let sourcesIndexed = 0

    // 1. Reset SQLite
    const db = new IndexDB(this.kbPath)
    const chunkSizeStr = db.getSetting('chunk_size', '500') ?? '500'
    const chunkSize = parseInt(chunkSizeStr, 10) || 500

    emit('init', '重置 SQLite 数据库', 0, 1, 5)
    db.rebuild()
    await yield_()

    // Scan directories to decide what services are needed
    const wikiDir = path.join(this.kbPath, 'wiki')
    const rawDir = path.join(this.kbPath, 'raw')
    const wikiFiles = fs.existsSync(wikiDir)
      ? fs.readdirSync(wikiDir).filter((f) => f.endsWith('.md')).sort()
      : []
    const rawFiles = fs.existsSync(rawDir)
      ? fs.readdirSync(rawDir).filter((f) => !f.startsWith('.')).sort()
      : []

    // Only wiki pages need embedding — compile search only queries type='page'
    const hasFilesToEmbed = wikiFiles.length > 0

    // 2-3. Init VectorDB & EmbeddingService (only if there are wiki pages)
    let vdb: VectorDB | null = null
    let embedding: EmbeddingService | null = null

    try {
      if (hasFilesToEmbed) {
        emit('init', '初始化向量数据库', 0, 1, 10)
        vdb = new VectorDB(this.kbPath)
        await vdb.initialize()
        await yield_()

        emit('init', '加载嵌入模型', 0, 1, 15)
        embedding = new EmbeddingService()
        await embedding.initialize()
        await yield_()

        // 4. Index wiki pages
        for (let i = 0; i < wikiFiles.length; i++) {
          const file = wikiFiles[i]
          const filePercent = 20 + Math.round((i / wikiFiles.length) * 60)
          emit('wiki', '索引 Wiki 页面', i + 1, wikiFiles.length, filePercent)
          try {
            const filePath = path.join(wikiDir, file)
            const content = fs.readFileSync(filePath, 'utf-8')
            const hash = crypto.createHash('sha256').update(content).digest('hex')
            const { body, tags } = parseFrontmatter(content)
            const title = path.basename(file, '.md')
            const summary = extractSummary(body)

            const page: PageRecord = db.upsertPage({
              path: `wiki/${file}`,
              title,
              hash,
              summary,
              tags: tags.join(','),
            })
            pagesIndexed++

            const chunks = embedding.chunkText(body, chunkSize)
            if (chunks.length > 0) {
              const vectors = await embedding.embedTexts(chunks)
              await vdb.deleteChunks(page.id!, 'page')
              const chunkInputs: ChunkInput[] = chunks.map((text, i) => ({
                vector: vectors[i],
                type: 'page' as const,
                ref_id: page.id!,
                chunk_index: i,
                text,
              }))
              await vdb.addChunks(chunkInputs)
              chunksIndexed += chunkInputs.length
            }
          } catch (err) {
            errors.push(`wiki/${file}: ${err}`)
          }
          if (i % 3 === 0) await yield_()
        }

        // 5. Extract [[links]]
        emit('links', '提取页面链接关系', 0, 1, 85)
        await yield_()

        const allPages = db.listPages()
        const titleToId = new Map<string, number>()
        for (const p of allPages) titleToId.set(p.title, p.id!)

        for (const file of wikiFiles) {
          try {
            const filePath = path.join(wikiDir, file)
            const content = fs.readFileSync(filePath, 'utf-8')
            const fromTitle = path.basename(file, '.md')
            const linkedTitles = extractLinks(content)
            const fromPage = titleToId.get(fromTitle)
            if (!fromPage) continue
            for (const linkTitle of linkedTitles) {
              if (linkTitle === fromTitle) continue
              const toPageId = titleToId.get(linkTitle)
              if (toPageId) {
                db.addLink({ from_page_id: fromPage, to_page_id: toPageId })
              }
            }
          } catch (err) {
            errors.push(`links wiki/${file}: ${err}`)
          }
        }
      }

      // 5. Register raw files (SQLite only — no embedding)
      for (let i = 0; i < rawFiles.length; i++) {
        const file = rawFiles[i]
        try {
          const filePath = path.join(rawDir, file)
          const stat = fs.statSync(filePath)
          if (!stat.isFile()) continue
          const rawSourcePath = `raw/${file}`
          if (!db.getSourceByPath(rawSourcePath)) {
            let content: string
            try { content = fs.readFileSync(filePath, 'utf-8') } catch { content = `[${file}]` }
            const hash = crypto.createHash('sha256').update(content).digest('hex')
            db.addSource({
              path: rawSourcePath,
              filename: file,
              size: stat.size,
              hash,
              status: 'pending',
            })
          }
          sourcesIndexed++
        } catch (err) {
          errors.push(`raw/${file}: ${err}`)
        }
      }

      // 6. Store rebuild timestamp
      emit('done', '重建完成', 1, 1, 100)
      await yield_()
      db.setSetting('last_rebuild', new Date().toISOString())
    } finally {
      if (vdb) await vdb.close()
      if (embedding) await embedding.dispose()
      await db.close()
    }

    return { pagesIndexed, chunksIndexed, sourcesIndexed, errors }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): { body: string; tags: string[] } {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith('---')) return { body: content, tags: [] }
  const afterOpen = trimmed.slice(3)
  const closeIdx = afterOpen.indexOf('\n---\n')
  const closeIdxAlt = afterOpen.indexOf('\n---')
  let endIdx: number
  if (closeIdx >= 0) endIdx = closeIdx + 1
  else if (closeIdxAlt >= 0) endIdx = closeIdxAlt
  else return { body: content, tags: [] }
  const frontmatter = afterOpen.slice(0, endIdx).trim()
  const bodyStart = endIdx + 4
  const body = afterOpen.slice(bodyStart)
  const tags = extractTagsFromFrontmatter(frontmatter)
  return { body, tags }
}

function extractTagsFromFrontmatter(frontmatter: string): string[] {
  const inlineMatch = frontmatter.match(/^tags:\s*\[(.+?)\]\s*$/m)
  if (inlineMatch) {
    return inlineMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  }
  const listMatch = frontmatter.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m)
  if (listMatch) {
    const items: string[] = []
    for (const line of listMatch[1].split('\n')) {
      const m = line.match(/^\s+-\s+(.+)/)
      if (m) items.push(m[1].trim().replace(/^["']|["']$/g, ''))
    }
    return items.filter(Boolean)
  }
  return []
}

function extractSummary(body: string, maxLen: number = 200): string {
  let text = body
    .replace(/^\n+/, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\*{1,3}/g, '')
    .replace(/_{1,3}/g, '')
    .replace(/`{1,3}/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= maxLen) return text
  const truncated = text.slice(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) : truncated
}

function extractLinks(content: string): string[] {
  const cleaned = content.replace(/```[\s\S]*?```/g, '')
  const regex = /\[\[([^\]]+)\]\]/g
  const links: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(cleaned)) !== null) {
    const title = match[1].trim()
    if (title && !links.includes(title)) links.push(title)
  }
  return links
}
