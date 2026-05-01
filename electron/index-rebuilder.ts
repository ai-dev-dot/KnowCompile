/**
 * IndexRebuilder — full-index rebuild service.
 *
 * Rebuilds the entire `.index/` (SQLite + LanceDB) from scratch by scanning
 * `wiki/` and `raw/` directories. This is the "single source of truth"
 * principle: anything outside `.index/` is canonical, and a rebuild
 * reconstructs the index deterministically.
 *
 * Per-file try/catch ensures one corrupt file does not block the whole
 * rebuild — errors are collected and returned in the result.
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

// ---------------------------------------------------------------------------
// IndexRebuilder
// ---------------------------------------------------------------------------

export class IndexRebuilder {
  private kbPath: string

  /**
   * @param kbPath  Absolute path to the knowledge-base root (contains wiki/, raw/).
   */
  constructor(kbPath: string) {
    this.kbPath = path.resolve(kbPath)
  }

  /**
   * Rebuild the entire index from wiki/ and raw/ directories.
   *
   * Flow:
   * 1. Reset SQLite via IndexDB.rebuild()
   * 2. Initialize VectorDB (LanceDB)
   * 3. Initialize EmbeddingService (bge-m3)
   * 4. Index every wiki/*.md → page record + chunks
   * 5. Index every raw/ file → source record + chunks
   * 6. Extract [[links]] across all wiki pages
   * 7. Store rebuild timestamp
   */
  async rebuild(): Promise<RebuildResult> {
    const errors: string[] = []
    let pagesIndexed = 0
    let chunksIndexed = 0
    let sourcesIndexed = 0

    // ------------------------------------------------------------------
    // 1. Create IndexDB and read settings BEFORE rebuild (rebuild wipes them)
    // ------------------------------------------------------------------
    const db = new IndexDB(this.kbPath)
    const chunkSizeStr = db.getSetting('chunk_size', '500') ?? '500'
    const chunkSize = parseInt(chunkSizeStr, 10) || 500

    // Reset SQLite — drops all tables and recreates them fresh.
    db.rebuild()

    // ------------------------------------------------------------------
    // 2-3. Initialize VectorDB & EmbeddingService (wrapped in try/finally
    //      so any init failure still cleans up db)
    // ------------------------------------------------------------------
    let vdb: VectorDB | null = null
    let embedding: EmbeddingService | null = null

    try {
      vdb = new VectorDB(this.kbPath)
      await vdb.initialize()

      embedding = new EmbeddingService()
      await embedding.initialize()

      // ------------------------------------------------------------------
      // 4. Index wiki/ pages
      // ------------------------------------------------------------------
      const wikiDir = path.join(this.kbPath, 'wiki')
      if (fs.existsSync(wikiDir)) {
        const wikiFiles = fs
          .readdirSync(wikiDir)
          .filter((f) => f.endsWith('.md'))
          .sort()

        for (const file of wikiFiles) {
          try {
            const filePath = path.join(wikiDir, file)
            const content = fs.readFileSync(filePath, 'utf-8')
            const hash = crypto.createHash('sha256').update(content).digest('hex')

            // Parse frontmatter — separates YAML header from markdown body.
            const { body, tags } = parseFrontmatter(content)

            // Title is the filename without extension.
            const title = path.basename(file, '.md')

            // Summary: first ~200 chars of body, markdown stripped.
            const summary = extractSummary(body)

            // Upsert page record in SQLite.
            const relativePath = `wiki/${file}`
            const page: PageRecord = db.upsertPage({
              path: relativePath,
              title,
              hash,
              summary,
              tags: tags.join(','),
            })
            pagesIndexed++

            // Chunk + embed + store in LanceDB.
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
        }
      }

      // ------------------------------------------------------------------
      // 5. Index raw/ files
      // ------------------------------------------------------------------
      const rawDir = path.join(this.kbPath, 'raw')
      if (fs.existsSync(rawDir)) {
        const rawFiles = fs
          .readdirSync(rawDir)
          .filter((f) => !f.startsWith('.'))
          .sort()

        for (const file of rawFiles) {
          try {
            const filePath = path.join(rawDir, file)
            const stat = fs.statSync(filePath)
            if (!stat.isFile()) continue

            // Read file content — PDFs get a placeholder since native
            // extraction requires pdf-parse which may not be available.
            let content: string
            const ext = path.extname(file).toLowerCase()
            if (ext === '.pdf') {
              content = `[PDF document: ${file}] — Content extraction not available during indexing.`
            } else if (ext === '.md' || ext === '.txt' || ext === '.csv') {
              content = fs.readFileSync(filePath, 'utf-8')
            } else {
              // Try reading as UTF-8 text; fall back to placeholder for binary files.
              try {
                content = fs.readFileSync(filePath, 'utf-8')
              } catch {
                content = `[Binary file: ${file}] — Content extraction not available.`
              }
            }

            const hash = crypto.createHash('sha256').update(content).digest('hex')
            const sourcePath = `raw/${file}`

            const source: SourceRecord = db.addSource({
              path: sourcePath,
              filename: file,
              size: stat.size,
              hash,
              status: 'pending',
            })
            sourcesIndexed++

            // Chunk + embed for semantic search.
            const chunks = embedding.chunkText(content, chunkSize)
            if (chunks.length > 0) {
              const vectors = await embedding.embedTexts(chunks)
              await vdb.deleteChunks(source.id!, 'source')

              const chunkInputs: ChunkInput[] = chunks.map((text, i) => ({
                vector: vectors[i],
                type: 'source' as const,
                ref_id: source.id!,
                chunk_index: i,
                text,
              }))
              await vdb.addChunks(chunkInputs)
              chunksIndexed += chunkInputs.length
            }
          } catch (err) {
            errors.push(`raw/${file}: ${err}`)
          }
        }
      }

      // ------------------------------------------------------------------
      // 6. Extract [[links]] across all wiki pages
      // ------------------------------------------------------------------
      if (fs.existsSync(wikiDir)) {
        const wikiFiles = fs
          .readdirSync(wikiDir)
          .filter((f) => f.endsWith('.md'))
          .sort()

        // Build a title → id lookup for fast link resolution.
        const allPages = db.listPages()
        const titleToId = new Map<string, number>()
        for (const p of allPages) {
          titleToId.set(p.title, p.id!)
        }

        for (const file of wikiFiles) {
          try {
            const filePath = path.join(wikiDir, file)
            const content = fs.readFileSync(filePath, 'utf-8')
            const fromTitle = path.basename(file, '.md')
            const linkedTitles = extractLinks(content)

            const fromPage = titleToId.get(fromTitle)
            if (!fromPage) continue

            for (const linkTitle of linkedTitles) {
              // Skip self-links.
              if (linkTitle === fromTitle) continue

              const toPageId = titleToId.get(linkTitle)
              if (toPageId) {
                db.addLink({
                  from_page_id: fromPage,
                  to_page_id: toPageId,
                })
              }
            }
          } catch (err) {
            errors.push(`links wiki/${file}: ${err}`)
          }
        }
      }

      // ------------------------------------------------------------------
      // 7. Store rebuild timestamp
      // ------------------------------------------------------------------
      db.setSetting('last_rebuild', new Date().toISOString())
    } finally {
      // ------------------------------------------------------------------
      // 8. Close services (always, even if init or processing throws)
      // ------------------------------------------------------------------
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

/**
 * Parse YAML frontmatter from a markdown document.
 *
 * Expects the document to optionally start with `---` … `---` containing
 * YAML key-value pairs. Returns the body (everything after the closing
 * `---`) and any tags found in the frontmatter.
 */
function parseFrontmatter(content: string): { body: string; tags: string[] } {
  const trimmed = content.trimStart()

  if (!trimmed.startsWith('---')) {
    // No frontmatter — entire content is the body.
    return { body: content, tags: [] }
  }

  // Find closing `---` — must appear on its own line (or at very start).
  const afterOpen = trimmed.slice(3) // skip opening "---"
  const closeIdx = afterOpen.indexOf('\n---\n')
  const closeIdxAlt = afterOpen.indexOf('\n---')

  let endIdx: number
  if (closeIdx >= 0) {
    endIdx = closeIdx + 1 // include the leading \n
  } else if (closeIdxAlt >= 0) {
    endIdx = closeIdxAlt
  } else {
    // No closing delimiter — treat entire content as body.
    return { body: content, tags: [] }
  }

  const frontmatter = afterOpen.slice(0, endIdx).trim()
  // The body starts after the closing `---` delimiter.
  // endIdx points at the closing delimiter (either `\n` or `-` depending on
  // which branch we took above), but in both branches the delimiter is exactly
  // 4 characters wide (either `\n---\n` with the leading \n already accounted
  // for by endIdx, or `\n---`), so bodyStart = endIdx + 4 in both cases.
  const bodyStart = endIdx + 4
  const body = afterOpen.slice(bodyStart)

  // Extract tags from frontmatter.
  const tags = extractTagsFromFrontmatter(frontmatter)

  return { body, tags }
}

/** Extract tags from a YAML frontmatter block (line-based parsing). */
function extractTagsFromFrontmatter(frontmatter: string): string[] {
  // Match `tags: [tag1, tag2]` or `tags:\n  - tag1\n  - tag2`
  const inlineMatch = frontmatter.match(/^tags:\s*\[(.+?)\]\s*$/m)
  if (inlineMatch) {
    return inlineMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
  }

  // Multi-line YAML list: `tags:\n  - tag1\n  - tag2`
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

/**
 * Extract a plain-text summary from the beginning of the markdown body.
 *
 * Strips common markdown syntax (`#`, `*`, `_`, `` ` ``, `[`, `]`, `>`, `-`
 * at line starts) and returns the first ~200 characters.
 */
function extractSummary(body: string, maxLen: number = 200): string {
  let text = body
    // Remove the leading blank line after frontmatter (if any).
    .replace(/^\n+/, '')
    // Remove heading markers (#) but keep the text.
    .replace(/^#{1,6}\s+/gm, '')
    // Remove wiki links: [[Page Name]] → Page Name
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // Remove inline markdown links: [text](url) → text
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove bold/italic markers.
    .replace(/\*{1,3}/g, '')
    .replace(/_{1,3}/g, '')
    // Remove inline code.
    .replace(/`{1,3}/g, '')
    // Remove blockquote markers.
    .replace(/^>\s?/gm, '')
    // Remove list item markers (unordered and ordered).
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Remove horizontal rules.
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Collapse multiple whitespace (including newlines) into single spaces.
    .replace(/\s+/g, ' ')
    .trim()

  if (text.length <= maxLen) return text

  // Truncate at a word boundary if possible.
  const truncated = text.slice(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) : truncated
}

/**
 * Extract [[wiki-link]] targets from markdown content.
 *
 * Matches patterns like `[[Page Name]]` or `[[page-name]]` and returns
 * the link text (the page title being referenced).
 */
function extractLinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g
  const links: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const title = match[1].trim()
    if (title && !links.includes(title)) {
      links.push(title)
    }
  }
  return links
}
