/**
 * IndexDB — SQLite database service for the wiki index.
 *
 * Stores pages, sources, links, conflicts, and settings in a single
 * better-sqlite3 database at <kbPath>/.index/pages.db.
 *
 * Uses WAL journal mode for concurrent read performance and enables
 * foreign key enforcement.
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// TypeScript interfaces (also exported for consumers)
// ---------------------------------------------------------------------------

export interface PageRecord {
  id?: number
  path: string
  title: string
  hash: string
  summary?: string
  tags?: string
  created_at?: string
  updated_at?: string
  last_compiled_at?: string
}

export interface SourceRecord {
  id?: number
  path: string
  filename: string
  size: number
  hash: string
  imported_at?: string
  status?: string
  page_count?: number
  last_compiled_at?: string
}

export interface LinkRecord {
  id?: number
  from_page_id: number
  to_page_id: number
  context?: string
  created_at?: string
}

export interface ConflictRecord {
  id?: number
  page_id: number
  target_page_id?: number
  description: string
  source1: string
  source2: string
  suggested_resolution?: string
  status?: string
  created_at?: string
  resolved_at?: string
  resolution?: string
}

// ---------------------------------------------------------------------------
// IndexDB
// ---------------------------------------------------------------------------

export class IndexDB {
  private db: Database.Database

  /**
   * Open (or create) the index database at `<kbPath>/.index/pages.db`.
   * Enables WAL mode and foreign-key enforcement.
   */
  constructor(kbPath: string) {
    const indexDir = path.join(kbPath, '.index')
    fs.mkdirSync(indexDir, { recursive: true })

    const dbPath = path.join(indexDir, 'pages.db')
    this.db = new Database(dbPath)

    // Performance: WAL allows concurrent reads without blocking writers.
    this.db.pragma('journal_mode = WAL')

    // Data integrity: enforce foreign-key relationships.
    this.db.pragma('foreign_keys = ON')

    this.createTables()
  }

  // -----------------------------------------------------------------------
  // Schema
  // -----------------------------------------------------------------------

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        hash TEXT NOT NULL,
        summary TEXT,
        tags TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_compiled_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        size INTEGER NOT NULL,
        hash TEXT NOT NULL,
        imported_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'pending',
        page_count INTEGER DEFAULT 0,
        last_compiled_at TEXT
      );

      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        to_page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        context TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(from_page_id, to_page_id)
      );

      CREATE TABLE IF NOT EXISTS conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        target_page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        source1 TEXT NOT NULL,
        source2 TEXT NOT NULL,
        suggested_resolution TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT,
        resolution TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  }

  // -----------------------------------------------------------------------
  // Pages
  // -----------------------------------------------------------------------

  /** Insert a new page or update an existing one (keyed by path). */
  upsertPage(page: PageRecord): PageRecord {
    const existing = this.db
      .prepare('SELECT id FROM pages WHERE path = ?')
      .get(page.path) as { id: number } | undefined

    if (existing) {
      this.db
        .prepare(
          `UPDATE pages
           SET title = ?,
               hash = ?,
               summary = ?,
               tags = ?,
               updated_at = datetime('now'),
               last_compiled_at = ?
           WHERE path = ?`
        )
        .run(
          page.title,
          page.hash,
          page.summary ?? null,
          page.tags ?? null,
          page.last_compiled_at ?? null,
          page.path
        )
      return this.getPageByPath(page.path)!
    }

    const info = this.db
      .prepare(
        `INSERT INTO pages (path, title, hash, summary, tags, last_compiled_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        page.path,
        page.title,
        page.hash,
        page.summary ?? null,
        page.tags ?? null,
        page.last_compiled_at ?? null
      )

    return this.getPageByPath(page.path)!
  }

  getPageByPath(pagePath: string): PageRecord | undefined {
    return this.db
      .prepare('SELECT * FROM pages WHERE path = ?')
      .get(pagePath) as PageRecord | undefined
  }

  getPageById(id: number): PageRecord | undefined {
    return this.db
      .prepare('SELECT * FROM pages WHERE id = ?')
      .get(id) as PageRecord | undefined
  }

  listPages(): PageRecord[] {
    return this.db
      .prepare('SELECT * FROM pages ORDER BY title')
      .all() as PageRecord[]
  }

  deletePage(pagePath: string): void {
    this.db.prepare('DELETE FROM pages WHERE path = ?').run(pagePath)
  }

  // -----------------------------------------------------------------------
  // Sources
  // -----------------------------------------------------------------------

  addSource(source: SourceRecord): SourceRecord {
    const info = this.db
      .prepare(
        `INSERT INTO sources (path, filename, size, hash, status, page_count, last_compiled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        source.path,
        source.filename,
        source.size,
        source.hash,
        source.status ?? 'pending',
        source.page_count ?? 0,
        source.last_compiled_at ?? null
      )

    return { ...source, id: Number(info.lastInsertRowid) }
  }

  getSourceByPath(sourcePath: string): SourceRecord | undefined {
    return this.db
      .prepare('SELECT * FROM sources WHERE path = ?')
      .get(sourcePath) as SourceRecord | undefined
  }

  listSources(): SourceRecord[] {
    return this.db
      .prepare('SELECT * FROM sources ORDER BY filename')
      .all() as SourceRecord[]
  }

  updateSourceStatus(
    sourcePath: string,
    status: string,
    pageCount?: number
  ): void {
    const stmt =
      pageCount !== undefined
        ? this.db.prepare(
            `UPDATE sources
             SET status = ?,
                 page_count = ?,
                 last_compiled_at = datetime('now')
             WHERE path = ?`
          )
        : this.db.prepare(
            `UPDATE sources
             SET status = ?,
                 last_compiled_at = datetime('now')
             WHERE path = ?`
          )

    if (pageCount !== undefined) {
      stmt.run(status, pageCount, sourcePath)
    } else {
      stmt.run(status, sourcePath)
    }
  }

  deleteSource(sourcePath: string): void {
    this.db.prepare('DELETE FROM sources WHERE path = ?').run(sourcePath)
  }

  // -----------------------------------------------------------------------
  // Links
  // -----------------------------------------------------------------------

  addLink(link: LinkRecord): LinkRecord {
    const info = this.db
      .prepare(
        `INSERT OR IGNORE INTO links (from_page_id, to_page_id, context)
         VALUES (?, ?, ?)`
      )
      .run(link.from_page_id, link.to_page_id, link.context ?? null)

    if (info.changes === 0) {
      // Duplicate — read back the existing row to get the real id.
      const existing = this.db
        .prepare(
          'SELECT * FROM links WHERE from_page_id = ? AND to_page_id = ?'
        )
        .get(link.from_page_id, link.to_page_id) as LinkRecord
      return existing
    }

    return { ...link, id: Number(info.lastInsertRowid) }
  }

  getLinksForPage(pageId: number): LinkRecord[] {
    return this.db
      .prepare('SELECT * FROM links WHERE from_page_id = ? OR to_page_id = ?')
      .all(pageId, pageId) as LinkRecord[]
  }

  getAllLinks(): LinkRecord[] {
    return this.db.prepare('SELECT * FROM links').all() as LinkRecord[]
  }

  deleteLinksForPage(pageId: number): void {
    this.db
      .prepare('DELETE FROM links WHERE from_page_id = ? OR to_page_id = ?')
      .run(pageId, pageId)
  }

  // -----------------------------------------------------------------------
  // Conflicts
  // -----------------------------------------------------------------------

  addConflict(conflict: ConflictRecord): ConflictRecord {
    const info = this.db
      .prepare(
        `INSERT INTO conflicts
           (page_id, target_page_id, description, source1, source2,
            suggested_resolution, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        conflict.page_id,
        conflict.target_page_id ?? null,
        conflict.description,
        conflict.source1,
        conflict.source2,
        conflict.suggested_resolution ?? null,
        conflict.status ?? 'open'
      )

    return { ...conflict, id: Number(info.lastInsertRowid) }
  }

  listOpenConflicts(): ConflictRecord[] {
    return this.db
      .prepare(
        "SELECT * FROM conflicts WHERE status = 'open' ORDER BY created_at DESC"
      )
      .all() as ConflictRecord[]
  }

  listConflictsForPage(pageId: number): ConflictRecord[] {
    return this.db
      .prepare(
        'SELECT * FROM conflicts WHERE page_id = ? OR target_page_id = ? ORDER BY created_at DESC'
      )
      .all(pageId, pageId) as ConflictRecord[]
  }

  resolveConflict(id: number, resolution: string): void {
    this.db
      .prepare(
        `UPDATE conflicts
         SET status = 'resolved',
             resolved_at = datetime('now'),
             resolution = ?
         WHERE id = ?`
      )
      .run(resolution, id)
  }

  // -----------------------------------------------------------------------
  // Settings
  // -----------------------------------------------------------------------

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO settings (key, value, updated_at)
         VALUES (?, ?, datetime('now'))`
      )
      .run(key, value)
  }

  getSetting(key: string, defaultValue?: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined

    return row?.value ?? defaultValue
  }

  getAllSettings(): Record<string, string> {
    const rows = this.db
      .prepare('SELECT key, value FROM settings')
      .all() as { key: string; value: string }[]

    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  // -----------------------------------------------------------------------
  // Maintenance
  // -----------------------------------------------------------------------

  /** Drop all tables and recreate them — wipes all data. */
  rebuild(): void {
    // Order matters: drop tables with FK references first, then referenced tables.
    this.db.exec(`
      DROP TABLE IF EXISTS links;
      DROP TABLE IF EXISTS conflicts;
      DROP TABLE IF EXISTS pages;
      DROP TABLE IF EXISTS sources;
      DROP TABLE IF EXISTS settings;
    `)
    this.createTables()
  }

  /** Close the underlying database connection. */
  close(): void {
    this.db.close()
  }
}
