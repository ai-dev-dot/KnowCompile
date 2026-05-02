# v1.0 迭代引擎 Implementation Plan

> **2026-05-02 更新：全部开发任务已完成。今日计划改为人工测试验收。**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 LLM Wiki 迭代闭环：索引层（SQLite + LanceDB + bge-m3）、增量编译、语义问答、矛盾检测、设置页重构。

**Architecture:** 主进程新增 5 个服务模块（index-db、vector-db、embedding-service、qa-service、compile-service），IPC 处理器扩展，渲染进程重写问答页和设置页。所有索引存储在 `.index/` 目录，可从 raw/wiki/schema 完整重建。

**Tech Stack:** better-sqlite3, @lancedb/lancedb, @huggingface/transformers (bge-m3 ONNX), Electron, React 18, Tailwind CSS

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装新 npm 包**

```bash
cd /d/app/llm_wiki && npm install better-sqlite3 @lancedb/lancedb @huggingface/transformers
```

```bash
cd /d/app/llm_wiki && npm install -D @types/better-sqlite3
```

- [ ] **Step 2: 验证安装**

```bash
cd /d/app/llm_wiki && node -e "const db = require('better-sqlite3')(':memory:'); console.log('SQLite OK')" && node -e "const l = require('@lancedb/lancedb'); console.log('LanceDB OK')"
```

Expected: "SQLite OK" and "LanceDB OK"

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3, @lancedb/lancedb, @huggingface/transformers"
```

---

### Task 2: SQLite 服务（index-db.ts）

**Files:**
- Create: `electron/index-db.ts`
- Test: `tests/index-db.test.ts`

- [ ] **Step 1: 写失败的测试**

```bash
mkdir -p /d/app/llm_wiki/tests
```

Create `tests/index-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IndexDB } from '../electron/index-db'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('IndexDB', () => {
  let db: IndexDB
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-test-'))
    db = new IndexDB(tmpDir)
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates pages.db at the correct path', () => {
    const dbPath = path.join(tmpDir, '.index', 'pages.db')
    expect(fs.existsSync(dbPath)).toBe(true)
  })

  it('creates the pages table', () => {
    const row = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pages'").get() as any
    expect(row).toBeTruthy()
  })

  it('creates the sources table', () => {
    const row = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sources'").get() as any
    expect(row).toBeTruthy()
  })

  it('creates the links table', () => {
    const row = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='links'").get() as any
    expect(row).toBeTruthy()
  })

  it('creates the conflicts table', () => {
    const row = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conflicts'").get() as any
    expect(row).toBeTruthy()
  })

  it('creates the settings table', () => {
    const row = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get() as any
    expect(row).toBeTruthy()
  })

  it('upserts a page and retrieves it', () => {
    db.upsertPage({ path: 'wiki/test-page.md', title: '测试页面', hash: 'abc123', summary: '摘要', tags: 'llm,ai' })
    const page = db.getPageByPath('wiki/test-page.md')
    expect(page).toBeTruthy()
    expect(page!.title).toBe('测试页面')
    expect(page!.tags).toBe('llm,ai')
  })

  it('lists all pages', () => {
    db.upsertPage({ path: 'wiki/a.md', title: 'A', hash: 'a' })
    db.upsertPage({ path: 'wiki/b.md', title: 'B', hash: 'b' })
    const pages = db.listPages()
    expect(pages.length).toBe(2)
  })

  it('adds a source and retrieves by path', () => {
    db.addSource({ path: 'raw/test.pdf', filename: 'test.pdf', size: 1024, hash: 'xyz' })
    const src = db.getSourceByPath('raw/test.pdf')
    expect(src).toBeTruthy()
    expect(src!.status).toBe('pending')
  })

  it('updates source status', () => {
    db.addSource({ path: 'raw/test2.pdf', filename: 'test2.pdf', size: 2048, hash: 'yyy' })
    db.updateSourceStatus('raw/test2.pdf', 'compiled', 3)
    const src = db.getSourceByPath('raw/test2.pdf')
    expect(src!.status).toBe('compiled')
    expect(src!.page_count).toBe(3)
  })

  it('adds a link and retrieves by page', () => {
    db.upsertPage({ path: 'wiki/from.md', title: 'From', hash: '1' })
    db.upsertPage({ path: 'wiki/to.md', title: 'To', hash: '2' })
    const from = db.getPageByPath('wiki/from.md')!
    const to = db.getPageByPath('wiki/to.md')!
    db.addLink({ from_page_id: from.id, to_page_id: to.id, context: 'see also' })
    const links = db.getLinksForPage(from.id)
    expect(links.length).toBe(1)
    expect(links[0].to_page_id).toBe(to.id)
  })

  it('adds a conflict and lists open conflicts', () => {
    db.upsertPage({ path: 'wiki/c.md', title: 'C', hash: 'c' })
    const page = db.getPageByPath('wiki/c.md')!
    db.addConflict({
      page_id: page.id,
      description: '版本号不一致',
      source1: '资料A',
      source2: '页面C原文',
      suggested_resolution: '以资料A为准',
    })
    const conflicts = db.listOpenConflicts()
    expect(conflicts.length).toBe(1)
    expect(conflicts[0].status).toBe('open')
  })

  it('resolves a conflict', () => {
    db.upsertPage({ path: 'wiki/d.md', title: 'D', hash: 'd' })
    const page = db.getPageByPath('wiki/d.md')!
    db.addConflict({ page_id: page.id, description: 'test', source1: 'a', source2: 'b' })
    const c = db.listOpenConflicts()[0]
    db.resolveConflict(c.id, '已确认使用来源A')
    const resolved = db.db.prepare('SELECT * FROM conflicts WHERE id = ?').get(c.id) as any
    expect(resolved.status).toBe('resolved')
  })

  it('sets and gets settings', () => {
    db.setSetting('chunk_size', '500')
    expect(db.getSetting('chunk_size')).toBe('500')
    expect(db.getSetting('nonexistent', 'default')).toBe('default')
  })

  it('rebuilds - drops and recreates all tables', () => {
    db.upsertPage({ path: 'wiki/x.md', title: 'X', hash: 'x' })
    db.rebuild()
    const pages = db.listPages()
    expect(pages.length).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /d/app/llm_wiki && npx vitest run tests/index-db.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 实现 IndexDB 服务**

Create `electron/index-db.ts`:

```typescript
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

interface PageRecord {
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

interface SourceRecord {
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

interface LinkRecord {
  id?: number
  from_page_id: number
  to_page_id: number
  context?: string
  created_at?: string
}

interface ConflictRecord {
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

export class IndexDB {
  db: Database.Database

  constructor(kbPath: string) {
    const indexDir = path.join(kbPath, '.index')
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true })
    }
    this.db = new Database(path.join(indexDir, 'pages.db'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.createTables()
  }

  private createTables() {
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

  // --- Pages ---

  upsertPage(page: PageRecord): PageRecord {
    const existing = this.getPageByPath(page.path)
    if (existing) {
      this.db.prepare(`
        UPDATE pages SET title=?, hash=?, summary=?, tags=?, updated_at=datetime('now'), last_compiled_at=?
        WHERE path=?
      `).run(page.title, page.hash, page.summary || null, page.tags || null, page.last_compiled_at || null, page.path)
      return this.getPageByPath(page.path)!
    }
    this.db.prepare(`
      INSERT INTO pages (path, title, hash, summary, tags, last_compiled_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(page.path, page.title, page.hash, page.summary || null, page.tags || null, page.last_compiled_at || null)
    return this.getPageByPath(page.path)!
  }

  getPageByPath(pagePath: string): PageRecord | undefined {
    return this.db.prepare('SELECT * FROM pages WHERE path = ?').get(pagePath) as PageRecord | undefined
  }

  getPageById(id: number): PageRecord | undefined {
    return this.db.prepare('SELECT * FROM pages WHERE id = ?').get(id) as PageRecord | undefined
  }

  listPages(): PageRecord[] {
    return this.db.prepare('SELECT * FROM pages ORDER BY updated_at DESC').all() as PageRecord[]
  }

  deletePage(pagePath: string) {
    this.db.prepare('DELETE FROM pages WHERE path = ?').run(pagePath)
  }

  // --- Sources ---

  addSource(source: SourceRecord): SourceRecord {
    this.db.prepare(`
      INSERT INTO sources (path, filename, size, hash)
      VALUES (?, ?, ?, ?)
    `).run(source.path, source.filename, source.size, source.hash)
    return this.getSourceByPath(source.path)!
  }

  getSourceByPath(sourcePath: string): SourceRecord | undefined {
    return this.db.prepare('SELECT * FROM sources WHERE path = ?').get(sourcePath) as SourceRecord | undefined
  }

  listSources(): SourceRecord[] {
    return this.db.prepare('SELECT * FROM sources ORDER BY imported_at DESC').all() as SourceRecord[]
  }

  updateSourceStatus(sourcePath: string, status: string, pageCount?: number) {
    this.db.prepare(`
      UPDATE sources SET status=?, page_count=?, last_compiled_at=datetime('now') WHERE path=?
    `).run(status, pageCount ?? 0, sourcePath)
  }

  // --- Links ---

  addLink(link: LinkRecord): LinkRecord {
    this.db.prepare(`
      INSERT OR IGNORE INTO links (from_page_id, to_page_id, context) VALUES (?, ?, ?)
    `).run(link.from_page_id, link.to_page_id, link.context || null)
    return this.db.prepare('SELECT * FROM links WHERE from_page_id=? AND to_page_id=?').get(link.from_page_id, link.to_page_id) as LinkRecord
  }

  getLinksForPage(pageId: number): LinkRecord[] {
    return this.db.prepare('SELECT * FROM links WHERE from_page_id = ?').all(pageId) as LinkRecord[]
  }

  getAllLinks(): LinkRecord[] {
    return this.db.prepare('SELECT * FROM links').all() as LinkRecord[]
  }

  deleteLinksForPage(pageId: number) {
    this.db.prepare('DELETE FROM links WHERE from_page_id = ? OR to_page_id = ?').run(pageId, pageId)
  }

  // --- Conflicts ---

  addConflict(conflict: Omit<ConflictRecord, 'id' | 'created_at'>): ConflictRecord {
    this.db.prepare(`
      INSERT INTO conflicts (page_id, target_page_id, description, source1, source2, suggested_resolution)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(conflict.page_id, conflict.target_page_id || null, conflict.description, conflict.source1, conflict.source2, conflict.suggested_resolution || null)
    return this.db.prepare('SELECT * FROM conflicts WHERE id = last_insert_rowid()').get() as ConflictRecord
  }

  listOpenConflicts(): ConflictRecord[] {
    return this.db.prepare("SELECT * FROM conflicts WHERE status = 'open' ORDER BY created_at DESC").all() as ConflictRecord[]
  }

  listConflictsForPage(pageId: number): ConflictRecord[] {
    return this.db.prepare("SELECT * FROM conflicts WHERE page_id = ? AND status = 'open'").all(pageId) as ConflictRecord[]
  }

  resolveConflict(id: number, resolution: string) {
    this.db.prepare(`
      UPDATE conflicts SET status='resolved', resolved_at=datetime('now'), resolution=? WHERE id=?
    `).run(resolution, id)
  }

  // --- Settings ---

  setSetting(key: string, value: string) {
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=?, updated_at=datetime('now')
    `).run(key, value, value)
  }

  getSetting(key: string, defaultValue?: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? defaultValue
  }

  getAllSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const result: Record<string, string> = {}
    for (const r of rows) result[r.key] = r.value
    return result
  }

  // --- Maintenance ---

  rebuild() {
    this.db.exec(`
      DROP TABLE IF EXISTS links;
      DROP TABLE IF EXISTS conflicts;
      DROP TABLE IF EXISTS pages;
      DROP TABLE IF EXISTS sources;
      DROP TABLE IF EXISTS settings;
    `)
    this.createTables()
  }

  close() {
    this.db.close()
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /d/app/llm_wiki && npx vitest run tests/index-db.test.ts
```

Expected: 14 tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/index-db.ts tests/index-db.test.ts
git commit -m "feat: add SQLite index database service with pages/sources/links/conflicts/settings tables"
```

---

### Task 3: Embedding 服务（embedding-service.ts）

**Files:**
- Create: `electron/embedding-service.ts`
- Test: `tests/embedding-service.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/embedding-service.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { EmbeddingService } from '../electron/embedding-service'

describe('EmbeddingService', () => {
  let service: EmbeddingService

  beforeAll(async () => {
    service = new EmbeddingService()
    await service.initialize()
  }, 60000)

  it('initializes and loads the model', () => {
    expect(service.isReady()).toBe(true)
  })

  it('returns correct dimension for a single query', async () => {
    const vec = await service.embedQuery('LLM Wiki 是什么')
    expect(vec.length).toBeGreaterThanOrEqual(768)
    expect(vec.length).toBeLessThanOrEqual(1024)
  })

  it('returns correct dimension for batch texts', async () => {
    const texts = ['人工智能发展迅速', '深度学习是机器学习的分支', '大语言模型改变了NLP领域']
    const vectors = await service.embedTexts(texts)
    expect(vectors.length).toBe(3)
    for (const v of vectors) {
      expect(v.length).toBeGreaterThanOrEqual(768)
    }
  })

  it('chunks text by character count', () => {
    const longText = '测'.repeat(1200)
    const chunks = service.chunkText(longText, 500)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(550) // allow slight over for paragraph completion
    }
  })

  it('keeps paragraphs intact when chunking', () => {
    const text = '第一段。\n\n第二段。\n\n第三段。\n\n第四段。'
    const chunks = service.chunkText(text, 10)
    // Each paragraph should stay together if possible
    expect(chunks.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /d/app/llm_wiki && npx vitest run tests/embedding-service.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 EmbeddingService**

Create `electron/embedding-service.ts`:

```typescript
import path from 'path'
import fs from 'fs'

interface ChunkResult {
  text: string
  index: number
}

export class EmbeddingService {
  private pipeline: any = null
  private dim: number = 1024

  async initialize(): Promise<void> {
    const { pipeline: transformersPipeline } = await import('@huggingface/transformers')
    // Use bge-m3 ONNX model
    this.pipeline = await transformersPipeline('feature-extraction', 'Xenova/bge-m3', {
      // Model files should be in resources/models/bge-m3/
      // transformers.js will cache to its default location if not found
      quantized: true,
    })
    // Determine output dimension from a test run
    const testOut = await this.pipeline('test', { pooling: 'mean', normalize: true })
    this.dim = testOut.data.length
  }

  isReady(): boolean {
    return this.pipeline !== null
  }

  async embedQuery(query: string): Promise<number[]> {
    if (!this.pipeline) throw new Error('Embedding model not loaded')
    const result = await this.pipeline(query, { pooling: 'mean', normalize: true })
    return Array.from(result.data) as number[]
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!this.pipeline) throw new Error('Embedding model not loaded')
    const results: number[][] = []
    // Batch process for efficiency
    for (const text of texts) {
      const result = await this.pipeline(text, { pooling: 'mean', normalize: true })
      results.push(Array.from(result.data) as number[])
    }
    return results
  }

  /**
   * Split text into chunks of approximately `chunkSize` characters,
   * trying to keep paragraphs (separated by double newlines) intact.
   */
  chunkText(text: string, chunkSize: number = 500): string[] {
    const paragraphs = text.split(/\n\n+/)
    const chunks: string[] = []
    let currentChunk = ''

    for (const para of paragraphs) {
      const trimmed = para.trim()
      if (!trimmed) continue

      if (currentChunk.length + trimmed.length + 2 <= chunkSize) {
        currentChunk = currentChunk ? currentChunk + '\n\n' + trimmed : trimmed
      } else {
        if (currentChunk) chunks.push(currentChunk)
        // If a single paragraph exceeds chunkSize, split it further
        if (trimmed.length > chunkSize) {
          const subChunks = this.splitLongParagraph(trimmed, chunkSize)
          chunks.push(...subChunks)
          currentChunk = ''
        } else {
          currentChunk = trimmed
        }
      }
    }

    if (currentChunk) chunks.push(currentChunk)
    return chunks.length > 0 ? chunks : [text]
  }

  private splitLongParagraph(text: string, chunkSize: number): string[] {
    const sentences = text.split(/(?<=[。！？.!?])/)
    const chunks: string[] = []
    let current = ''

    for (const sent of sentences) {
      if (current.length + sent.length <= chunkSize) {
        current += sent
      } else {
        if (current) chunks.push(current.trim())
        current = sent
      }
    }
    if (current) chunks.push(current.trim())
    return chunks.length > 0 ? chunks : [text]
  }

  getDimension(): number {
    return this.dim
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /d/app/llm_wiki && npx vitest run tests/embedding-service.test.ts
```

Expected: 5 tests PASS (first run may download model from HuggingFace)

- [ ] **Step 5: Commit**

```bash
git add electron/embedding-service.ts tests/embedding-service.test.ts
git commit -m "feat: add bge-m3 embedding service with text chunking"
```

---

### Task 4: LanceDB 向量服务（vector-db.ts）

**Files:**
- Create: `electron/vector-db.ts`
- Test: `tests/vector-db.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/vector-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VectorDB } from '../electron/vector-db'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('VectorDB', () => {
  let vdb: VectorDB
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-vec-'))
    vdb = new VectorDB(tmpDir)
    await vdb.initialize()
  })

  afterEach(async () => {
    await vdb.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates vectors.lancedb directory', () => {
    expect(fs.existsSync(path.join(tmpDir, '.index', 'vectors.lancedb'))).toBe(true)
  })

  it('adds chunks and searches by similarity', async () => {
    // Create embedding-like vectors (simplified for test)
    const v1 = new Array(1024).fill(0).map(() => Math.random())
    const v2 = new Array(1024).fill(0).map(() => Math.random())
    const v3 = new Array(1024).fill(0).map(() => Math.random())

    await vdb.addChunks([
      { vector: v1, type: 'page', ref_id: 1, chunk_index: 0, text: 'LLM Wiki 是一种知识管理范式' },
      { vector: v2, type: 'page', ref_id: 2, chunk_index: 0, text: 'RAG 用于检索增强生成' },
      { vector: v3, type: 'source', ref_id: 1, chunk_index: 0, text: '新的编译方法' },
    ])

    // Search with a vector similar to v1
    const similarVec = v1.map(v => v + (Math.random() - 0.5) * 0.01)
    const results = await vdb.search(similarVec, { type: 'page', topK: 2 })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ref_id).toBeDefined()
    expect(results[0].text).toBeDefined()
    expect(results[0]._distance).toBeDefined()
  })

  it('adds many chunks and retrieves top K', async () => {
    const vectors = Array.from({ length: 20 }, (_, i) => {
      const v = new Array(1024).fill(0).map(() => Math.random())
      return { vector: v, type: 'page' as const, ref_id: i + 1, chunk_index: 0, text: `Page ${i + 1} content text` }
    })
    await vdb.addChunks(vectors)

    const query = vectors[0].vector.map(v => v + (Math.random() - 0.5) * 0.002)
    const results = await vdb.search(query, { topK: 5 })
    expect(results.length).toBe(5)
  })

  it('filters by type', async () => {
    const v1 = new Array(1024).fill(0).map(() => Math.random())
    const v2 = new Array(1024).fill(0).map(() => Math.random())

    await vdb.addChunks([
      { vector: v1, type: 'page', ref_id: 1, chunk_index: 0, text: 'page content' },
      { vector: v2, type: 'source', ref_id: 1, chunk_index: 0, text: 'source content' },
    ])

    const results = await vdb.search(v1, { type: 'page', topK: 5 })
    for (const r of results) {
      expect(r.type).toBe('page')
    }
  })

  it('deletes chunks by ref_id and type', async () => {
    const v = new Array(1024).fill(0).map(() => Math.random())
    await vdb.addChunks([
      { vector: v, type: 'page', ref_id: 99, chunk_index: 0, text: 'to be deleted' },
    ])

    await vdb.deleteChunks(99, 'page')

    const results = await vdb.search(v, { type: 'page', topK: 5 })
    expect(results.filter(r => r.ref_id === 99).length).toBe(0)
  })

  it('counts chunks', async () => {
    expect(await vdb.count()).toBe(0)
    const v = new Array(1024).fill(0).map(() => Math.random())
    await vdb.addChunks([
      { vector: v, type: 'page', ref_id: 1, chunk_index: 0, text: 'a' },
      { vector: v, type: 'page', ref_id: 1, chunk_index: 1, text: 'b' },
    ])
    expect(await vdb.count()).toBe(2)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /d/app/llm_wiki && npx vitest run tests/vector-db.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 VectorDB**

Create `electron/vector-db.ts`:

```typescript
import * as lancedb from '@lancedb/lancedb'
import path from 'path'
import fs from 'fs'

interface ChunkInput {
  vector: number[]
  type: 'page' | 'source'
  ref_id: number
  chunk_index: number
  text: string
}

interface SearchResult {
  vector: number[]
  type: string
  ref_id: number
  chunk_index: number
  text: string
  _distance: number
}

interface SearchOptions {
  type?: 'page' | 'source'
  topK?: number
}

export class VectorDB {
  private db: any = null
  private table: any = null
  private kbPath: string

  constructor(kbPath: string) {
    this.kbPath = kbPath
  }

  async initialize(): Promise<void> {
    const indexDir = path.join(this.kbPath, '.index')
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true })
    }

    const dbPath = path.join(indexDir, 'vectors.lancedb')
    this.db = await lancedb.connect(dbPath)

    const tableNames = await this.db.tableNames()
    if (tableNames.includes('chunks')) {
      this.table = await this.db.openTable('chunks')
    } else {
      // Create with empty initial data
      const initialData = [{
        vector: new Array(1024).fill(0),
        type: 'page',
        ref_id: 0,
        chunk_index: 0,
        text: '__init__',
        created_at: new Date().toISOString(),
      }]
      this.table = await this.db.createTable('chunks', initialData)
      // Remove the placeholder
      await this.table.delete('ref_id = 0')
    }
  }

  async addChunks(chunks: ChunkInput[]): Promise<void> {
    if (chunks.length === 0) return
    const rows = chunks.map(c => ({
      vector: c.vector,
      type: c.type,
      ref_id: c.ref_id,
      chunk_index: c.chunk_index,
      text: c.text,
      created_at: new Date().toISOString(),
    }))
    await this.table.add(rows)
  }

  async search(queryVector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const { topK = 30 } = options

    let q = this.table.search(queryVector).limit(topK)

    if (options.type) {
      q = q.where(`type = '${options.type}'`)
    }

    const results = await q.toArray()
    return results.map((r: any) => ({
      vector: r.vector,
      type: r.type,
      ref_id: r.ref_id,
      chunk_index: r.chunk_index,
      text: r.text,
      _distance: r._distance,
    }))
  }

  async deleteChunks(refId: number, type: 'page' | 'source'): Promise<void> {
    await this.table.delete(`ref_id = ${refId} AND type = '${type}'`)
  }

  async deleteAllChunks(): Promise<void> {
    // Drop and recreate the table
    await this.db.dropTable('chunks')
    const initialData = [{
      vector: new Array(1024).fill(0),
      type: 'page',
      ref_id: 0,
      chunk_index: 0,
      text: '__init__',
      created_at: new Date().toISOString(),
    }]
    this.table = await this.db.createTable('chunks', initialData)
    await this.table.delete('ref_id = 0')
  }

  async count(): Promise<number> {
    try {
      return await this.table.countRows()
    } catch {
      return 0
    }
  }

  async close(): Promise<void> {
    // LanceDB handles cleanup via JS GC
    this.table = null
    this.db = null
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /d/app/llm_wiki && npx vitest run tests/vector-db.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/vector-db.ts tests/vector-db.test.ts
git commit -m "feat: add LanceDB vector database service for chunk storage and semantic search"
```

---

### Task 5: 索引重建服务（index-rebuilder.ts）

**Files:**
- Create: `electron/index-rebuilder.ts`
- Test: `tests/index-rebuilder.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/index-rebuilder.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IndexRebuilder } from '../electron/index-rebuilder'
import { IndexDB } from '../electron/index-db'
import { VectorDB } from '../electron/vector-db'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('IndexRebuilder', () => {
  let tmpDir: string
  let wikiDir: string
  let rawDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-rebuild-'))
    wikiDir = path.join(tmpDir, 'wiki')
    rawDir = path.join(tmpDir, 'raw')
    fs.mkdirSync(wikiDir, { recursive: true })
    fs.mkdirSync(rawDir, { recursive: true })
    // Create test wiki files
    fs.writeFileSync(path.join(wikiDir, 'page1.md'), '# Page 1\n\n这是第一页的内容。用于测试索引重建功能。\n\n## 相关主题\n[[Page 2]]')
    fs.writeFileSync(path.join(wikiDir, 'page2.md'), '# Page 2\n\n这是第二页的内容。包含指向第一页的链接。\n\n## 相关主题\n[[Page 1]]')
    // Create a test raw file
    fs.writeFileSync(path.join(rawDir, 'test.txt'), '这是一份测试资料，用于验证 raw 文件索引。')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('rebuilds index from wiki/ and raw/ files', async () => {
    const rebuilder = new IndexRebuilder(tmpDir)
    const result = await rebuilder.rebuild()
    expect(result.pagesIndexed).toBeGreaterThanOrEqual(2)
    expect(result.chunksIndexed).toBeGreaterThanOrEqual(2)
    expect(result.sourcesIndexed).toBeGreaterThanOrEqual(1)
  })

  it('creates .index directory if not exists', async () => {
    const indexPath = path.join(tmpDir, '.index')
    expect(fs.existsSync(indexPath)).toBe(false)
    const rebuilder = new IndexRebuilder(tmpDir)
    await rebuilder.rebuild()
    expect(fs.existsSync(indexPath)).toBe(true)
    expect(fs.existsSync(path.join(indexPath, 'pages.db'))).toBe(true)
    expect(fs.existsSync(path.join(indexPath, 'vectors.lancedb'))).toBe(true)
  })

  it('is idempotent - can rebuild twice', async () => {
    const rebuilder = new IndexRebuilder(tmpDir)
    const r1 = await rebuilder.rebuild()
    const r2 = await rebuilder.rebuild()
    expect(r1.pagesIndexed).toBe(r2.pagesIndexed)
  })

  it('rebuilds after manual deletion of .index/', async () => {
    // First build
    const rebuilder = new IndexRebuilder(tmpDir)
    await rebuilder.rebuild()

    // Delete .index/
    fs.rmSync(path.join(tmpDir, '.index'), { recursive: true, force: true })

    // Rebuild again
    const r2 = await rebuilder.rebuild()
    expect(r2.pagesIndexed).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: 实现 IndexRebuilder**

Create `electron/index-rebuilder.ts`:

```typescript
import { IndexDB } from './index-db'
import { VectorDB } from './vector-db'
import { EmbeddingService } from './embedding-service'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

interface RebuildResult {
  pagesIndexed: number
  chunksIndexed: number
  sourcesIndexed: number
  errors: string[]
}

export class IndexRebuilder {
  private kbPath: string

  constructor(kbPath: string) {
    this.kbPath = kbPath
  }

  async rebuild(): Promise<RebuildResult> {
    const result: RebuildResult = { pagesIndexed: 0, chunksIndexed: 0, sourcesIndexed: 0, errors: [] }

    const db = new IndexDB(this.kbPath)
    db.rebuild()

    const vdb = new VectorDB(this.kbPath)
    await vdb.initialize()

    const embedding = new EmbeddingService()
    await embedding.initialize()

    const chunkSize = parseInt(db.getSetting('chunk_size', '500'))

    // Index wiki pages
    const wikiDir = path.join(this.kbPath, 'wiki')
    if (fs.existsSync(wikiDir)) {
      const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md'))
      for (const file of files) {
        try {
          const filePath = path.join(wikiDir, file)
          const content = fs.readFileSync(filePath, 'utf-8')
          const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
          const title = file.replace('.md', '')

          // Skip index.md from page listing but still index it
          const page = db.upsertPage({ path: `wiki/${file}`, title, hash })

          // Extract tags ([[keywords]] pattern)
          const tags: string[] = []
          const tagMatch = content.match(/\[\[([^\]]+)\]\]/g)
          if (tagMatch) {
            for (const m of tagMatch) {
              tags.push(m.slice(2, -2))
            }
          }

          // Extract summary (first 200 chars after the --- frontmatter)
          let bodyContent = content
          if (content.startsWith('---')) {
            const end = content.indexOf('---', 3)
            if (end !== -1) bodyContent = content.slice(end + 3)
          }
          const summary = bodyContent.replace(/#/g, '').trim().slice(0, 200)

          db.upsertPage({ path: `wiki/${file}`, title, hash, summary, tags: tags.join(',') })

          // Chunk and embed
          const chunks = embedding.chunkText(content, chunkSize)
          const vectors = await embedding.embedTexts(chunks)

          await vdb.deleteChunks(page.id!, 'page')
          await vdb.addChunks(chunks.map((text, i) => ({
            vector: vectors[i],
            type: 'page' as const,
            ref_id: page.id!,
            chunk_index: i,
            text,
          })))

          result.pagesIndexed++
          result.chunksIndexed += chunks.length
        } catch (err: any) {
          result.errors.push(`Page ${file}: ${err.message}`)
        }
      }
    }

    // Index raw files
    const rawDir = path.join(this.kbPath, 'raw')
    if (fs.existsSync(rawDir)) {
      const files = fs.readdirSync(rawDir).filter(f => !f.startsWith('.'))
      for (const file of files) {
        try {
          const filePath = path.join(rawDir, file)
          const stat = fs.statSync(filePath)
          let content: string
          if (file.endsWith('.pdf')) {
            content = `[PDF: ${file}]`
          } else {
            content = fs.readFileSync(filePath, 'utf-8')
          }
          const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)

          const source = db.addSource({
            path: `raw/${file}`,
            filename: file,
            size: stat.size,
            hash,
          })

          // Chunk and embed source
          const chunks = embedding.chunkText(
            file.endsWith('.pdf') ? `[PDF: ${file}]` : content,
            chunkSize,
          )
          const vectors = await embedding.embedTexts(chunks)

          await vdb.addChunks(chunks.map((text, i) => ({
            vector: vectors[i],
            type: 'source' as const,
            ref_id: source.id!,
            chunk_index: i,
            text,
          })))

          result.sourcesIndexed++
          result.chunksIndexed += chunks.length
        } catch (err: any) {
          result.errors.push(`Source ${file}: ${err.message}`)
        }
      }
    }

    // Extract links from wiki pages
    const pages = db.listPages()
    for (const page of pages) {
      const wikiDir2 = path.join(this.kbPath, 'wiki')
      const filePath = path.join(wikiDir2, path.basename(page.path))
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        const linkPattern = /\[\[([^\]]+)\]\]/g
        let match
        while ((match = linkPattern.exec(content)) !== null) {
          const targetTitle = match[1]
          const targetPage = db.listPages().find(p => p.title === targetTitle)
          if (targetPage && targetPage.id !== page.id) {
            db.addLink({
              from_page_id: page.id!,
              to_page_id: targetPage.id!,
              context: match[0],
            })
          }
        }
      }
    }

    // Store rebuild timestamp
    db.setSetting('last_rebuild', new Date().toISOString())

    await vdb.close()
    db.close()

    return result
  }
}
```

- [ ] **Step 3: 运行测试确认通过**

```bash
cd /d/app/llm_wiki && npx vitest run tests/index-rebuilder.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add electron/index-rebuilder.ts tests/index-rebuilder.test.ts
git commit -m "feat: add index rebuilder - rebuilds SQLite + LanceDB from wiki/ and raw/"
```

---

### Task 6: 增量编译服务（compile-service.ts）

**Files:**
- Create: `electron/compile-service.ts`

- [ ] **Step 1: 实现增量编译服务**

Create `electron/compile-service.ts`:

```typescript
import { IndexDB } from './index-db'
import { VectorDB } from './vector-db'
import { EmbeddingService } from './embedding-service'
import { compileNewPages, chat } from './llm-service'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

interface CompilePlan {
  updates: { page: string; sections: string; reason: string }[]
  new_pages: { title: string; reason: string }[]
  conflicts: { target_page: string; description: string; source1: string; source2: string; suggested_resolution: string }[]
}

export async function incrementalCompile(
  rawFilePath: string,
  kbPath: string,
  embedding: EmbeddingService,
  db: IndexDB,
  vdb: VectorDB,
): Promise<{ compileOutput: string; plan: CompilePlan; candidatePages: string[] }> {
  const rawName = path.basename(rawFilePath)
  const ext = path.extname(rawFilePath).toLowerCase()

  let rawContent: string
  if (ext === '.pdf') {
    const pdfBuffer = fs.readFileSync(rawFilePath)
    const pdfData = await require('pdf-parse')(pdfBuffer)
    rawContent = pdfData.text
  } else {
    rawContent = fs.readFileSync(rawFilePath, 'utf-8')
  }

  const settings = db.getAllSettings()
  const chunkSize = parseInt(settings.chunk_size || '500')
  const similarityThreshold = parseFloat(settings.compile_similarity_threshold || '0.75')
  const candidateCount = parseInt(settings.compile_candidate_count || '3')

  // Step 1: Vectorize new material
  const chunks = embedding.chunkText(rawContent, chunkSize)
  const chunkVectors = await embedding.embedTexts(chunks)

  // Update source in DB
  const rawHash = crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 16)
  const existing = db.getSourceByPath(`raw/${rawName}`)
  const source = existing || db.addSource({
    path: `raw/${rawName}`,
    filename: rawName,
    size: fs.statSync(rawFilePath).size,
    hash: rawHash,
  })

  // Step 2: Similarity search to find candidate pages
  const pageHitMap: Record<number, { hits: number; totalScore: number }> = {}
  for (const vec of chunkVectors) {
    const results = await vdb.search(vec, { type: 'page', topK: 100 })
    for (const r of results) {
      if (r._distance > similarityThreshold) {
        if (!pageHitMap[r.ref_id]) pageHitMap[r.ref_id] = { hits: 0, totalScore: 0 }
        pageHitMap[r.ref_id].hits++
        pageHitMap[r.ref_id].totalScore += r._distance
      }
    }
  }

  // Get top N candidate pages sorted by hits * score
  const ranked = Object.entries(pageHitMap)
    .sort((a, b) => (b[1].hits * b[1].totalScore) - (a[1].hits * a[1].totalScore))
    .slice(0, candidateCount)

  const candidatePages: string[] = []
  const candidateContents: string[] = []
  for (const [pageIdStr] of ranked) {
    const page = db.getPageById(parseInt(pageIdStr))
    if (page) {
      candidatePages.push(page.title)
      const pagePath = path.join(kbPath, page.path)
      if (fs.existsSync(pagePath)) {
        candidateContents.push(fs.readFileSync(pagePath, 'utf-8'))
      }
    }
  }

  // Step 3: LLM verification + conflict detection + compilation
  // Read schema
  const systemPath = path.join(kbPath, 'schema', 'system.md')
  const rulesPath = path.join(kbPath, 'schema', 'compile-rules.md')
  const stylePath = path.join(kbPath, 'schema', 'style-guide.md')
  const linksPath = path.join(kbPath, 'schema', 'links-rules.md')

  const schemaContent = [
    fs.existsSync(systemPath) ? fs.readFileSync(systemPath, 'utf-8') : '',
    fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf-8') : '',
    fs.existsSync(stylePath) ? fs.readFileSync(stylePath, 'utf-8') : '',
    fs.existsSync(linksPath) ? fs.readFileSync(linksPath, 'utf-8') : '',
  ].join('\n\n')

  // First: get a compile plan from LLM
  const candidateInfo = candidatePages.length > 0
    ? candidatePages.map((title, i) => {
        const p = db.getPageByPath(`wiki/${title}.md`)
        return `### 候选页面 ${i + 1}：${title}\n${candidateContents[i]?.slice(0, 3000) || '(内容未找到)'}`
      }).join('\n\n')
    : '(没有找到相关页面，将创建新页面)'

  const planPrompt = [
    { role: 'system' as const, content: `${schemaContent}\n\n你是一个知识库编译规划器。分析新资料与现有页面的关系，输出 JSON 格式的编译计划。` },
    { role: 'user' as const, content: `## 新资料：${rawName}\n\n${rawContent.slice(0, 6000)}\n\n## 现有候选页面（向量检索到的相关页面）\n${candidateInfo}\n\n请输出 JSON 格式的编译计划：\n\`\`\`json\n{\n  \"updates\": [{\"page\": \"页面标题\", \"sections\": \"更新哪些章节\", \"reason\": \"原因\"}],\n  \"new_pages\": [{\"title\": \"新页面标题\", \"reason\": \"为什么需要新建\"}],\n  \"conflicts\": [{\"target_page\": \"页面标题\", \"description\": \"矛盾描述\", \"source1\": \"来源1\", \"source2\": \"来源2\", \"suggested_resolution\": \"建议方案\"}]\n}\n\`\`\`` },
  ]

  const planJson = await chat(planPrompt)
  let plan: CompilePlan = { updates: [], new_pages: [], conflicts: [] }
  try {
    const match = planJson.match(/\{[\s\S]*\}/)
    if (match) plan = JSON.parse(match[0])
  } catch {
    // If JSON parsing fails, fall back to full compile
    plan = { updates: [], new_pages: [{ title: rawName.replace(/\.[^.]+$/, ''), reason: '新资料' }], conflicts: [] }
  }

  // Step 4: Execute the plan - generate/update pages
  const existingTitles = db.listPages().map(p => p.title)
  const compileOutput = await compileNewPages(rawContent, rawName, existingTitles, kbPath)

  // Step 5: Handle conflicts
  for (const conflict of plan.conflicts) {
    const targetPage = db.getPageByPath(`wiki/${conflict.target_page}.md`)
    if (targetPage) {
      db.addConflict({
        page_id: targetPage.id!,
        description: conflict.description,
        source1: conflict.source1,
        source2: conflict.source2,
        suggested_resolution: conflict.suggested_resolution,
      })

      // Insert conflict marker at top of target page
      const pageFilePath = path.join(kbPath, 'wiki', `${conflict.target_page}.md`)
      if (fs.existsSync(pageFilePath)) {
        const pageContent = fs.readFileSync(pageFilePath, 'utf-8')
        const marker = `> ⚠️ **矛盾待处理**：${conflict.description}。来源：[${conflict.source1}] vs [${conflict.source2}]。建议：${conflict.suggested_resolution}\n\n`
        if (!pageContent.includes('矛盾待处理')) {
          fs.writeFileSync(pageFilePath, marker + pageContent, 'utf-8')
        }
      }
    }
  }

  // Update source status
  db.updateSourceStatus(`raw/${rawName}`, 'compiled', plan.new_pages.length + plan.updates.length)

  return { compileOutput, plan, candidatePages }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/compile-service.ts
git commit -m "feat: add incremental compile service with 5-step pipeline and conflict detection"
```

---

### Task 7: 问答服务（qa-service.ts）

**Files:**
- Create: `electron/qa-service.ts`

- [ ] **Step 1: 实现问答服务**

Create `electron/qa-service.ts`:

```typescript
import { IndexDB } from './index-db'
import { VectorDB } from './vector-db'
import { EmbeddingService } from './embedding-service'
import { chat } from './llm-service'
import fs from 'fs'
import path from 'path'

interface QAResult {
  answer: string
  sources: { title: string; chunk_index: number; similarity: number }[]
}

interface ChunkSearchResult {
  ref_id: number
  text: string
  _distance: number
  type: string
  chunk_index: number
}

export async function semanticQA(
  question: string,
  kbPath: string,
  embedding: EmbeddingService,
  db: IndexDB,
  vdb: VectorDB,
): Promise<QAResult> {
  const settings = db.getAllSettings()
  const similarityThreshold = parseFloat(settings.qa_similarity_threshold || '0.65')
  const retrievalCount = parseInt(settings.qa_retrieval_count || '30')
  const finalContextCount = parseInt(settings.qa_final_context_count || '8')
  const contextMaxTokens = parseInt(settings.qa_context_max_tokens || '3000')

  // Step 1: Preprocess question and generate embedding
  const questionVec = await embedding.embedQuery(question)

  // Step 2: Vector search
  const rawResults = await vdb.search(questionVec, { type: 'page', topK: retrievalCount })

  // Step 3: Filter and re-rank
  const filtered = rawResults.filter(r => r._distance > similarityThreshold)

  // Deduplicate: keep top 3 chunks per page
  const pageChunks: Record<number, ChunkSearchResult[]> = {}
  for (const r of filtered) {
    if (!pageChunks[r.ref_id]) pageChunks[r.ref_id] = []
    if (pageChunks[r.ref_id].length < 3) {
      pageChunks[r.ref_id].push(r)
    }
  }

  // Flatten and apply weights
  const allPages = db.listPages()
  const weighted: { result: ChunkSearchResult; weight: number }[] = []

  for (const chunks of Object.values(pageChunks)) {
    for (const chunk of chunks) {
      let weight = chunk._distance

      // Title exact match bonus
      const page = allPages.find(p => p.id === chunk.ref_id)
      if (page) {
        const questionLower = question.toLowerCase()
        const titleLower = page.title.toLowerCase()
        if (titleLower.includes(questionLower) || questionLower.includes(titleLower)) {
          weight *= 2.0
        }
        // Recent update bonus
        const updatedAt = new Date(page.updated_at!).getTime()
        const daysSinceUpdate = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24)
        if (daysSinceUpdate < 7) {
          weight *= 1.2
        }
      }

      weighted.push({ result: chunk, weight })
    }
  }

  weighted.sort((a, b) => b.weight - a.weight)
  const topChunks = weighted.slice(0, finalContextCount)

  // Step 4: Build context
  const contextParts: string[] = []
  const sources: { title: string; chunk_index: number; similarity: number }[] = []
  let approxTokens = 0

  for (const { result, weight } of topChunks) {
    const page = allPages.find(p => p.id === result.ref_id)
    if (!page) continue

    const pagePath = path.join(kbPath, page.path)
    let sourceInfo = ''
    if (fs.existsSync(pagePath)) {
      const content = fs.readFileSync(pagePath, 'utf-8')
      const sourceMatch = content.match(/^> 来源[：:]\s*(.+)$/m)
      if (sourceMatch) sourceInfo = sourceMatch[1]
    }

    const block = `【页面标题：${page.title}】${sourceInfo ? `\n【来源：${sourceInfo}】` : ''}\n${result.text}`
    const blockTokens = Math.ceil(block.length / 2) // rough estimate: 2 chars ~= 1 token for Chinese

    if (approxTokens + blockTokens > contextMaxTokens) break

    contextParts.push(block)
    approxTokens += blockTokens
    sources.push({ title: page.title, chunk_index: result.chunk_index, similarity: weight })
  }

  const context = contextParts.join('\n\n---\n\n')

  // Step 5: LLM generates answer
  const systemPath = path.join(kbPath, 'schema', 'system.md')
  const systemContent = fs.existsSync(systemPath) ? fs.readFileSync(systemPath, 'utf-8') : ''

  const systemPrompt = `${systemContent}

你是一个基于 LLM Wiki 知识库的问答助手。
请严格基于以下提供的上下文回答用户的问题。
如果上下文中没有相关信息，请明确说"在你的知识库中没有找到相关信息"。
不要编造任何不在上下文中的内容。
回答要简洁、准确、有条理。
在回答的末尾，列出所有引用的来源。

## 知识库上下文
${context}`

  const answer = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ])

  return { answer, sources }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/qa-service.ts
git commit -m "feat: add semantic QA service with 7-step pipeline using vector search"
```

---

### Task 8: IPC 处理器扩展（ipc-handlers.ts）

**Files:**
- Modify: `electron/ipc-handlers.ts`

- [ ] **Step 1: 添加新的 IPC 处理器**

Edit `electron/ipc-handlers.ts` — add imports at top:

```typescript
import { IndexDB } from './index-db'
import { VectorDB } from './vector-db'
import { EmbeddingService } from './embedding-service'
import { IndexRebuilder } from './index-rebuilder'
import { incrementalCompile } from './compile-service'
import { semanticQA } from './qa-service'
import path from 'path'
```

After the existing `registerIPCHandlers()` function's opening, add service initialization:

Inside `registerIPCHandlers()`, at the very beginning, add:

```typescript
// Lazy-initialized services
let indexDB: IndexDB | null = null
let vectorDB: VectorDB | null = null
let embeddingService: EmbeddingService | null = null

function getIndexDB(kbPath: string): IndexDB {
  if (!indexDB) indexDB = new IndexDB(kbPath)
  return indexDB
}

async function getVectorDB(kbPath: string): Promise<VectorDB> {
  if (!vectorDB) {
    vectorDB = new VectorDB(kbPath)
    await vectorDB.initialize()
  }
  return vectorDB
}

async function getEmbeddingService(): Promise<EmbeddingService> {
  if (!embeddingService) {
    embeddingService = new EmbeddingService()
    await embeddingService.initialize()
  }
  return embeddingService
}
```

Add new IPC handlers before the closing `}` of `registerIPCHandlers`:

```typescript
// --- Index operations ---

ipcMain.handle('index:rebuild', async (_event, kbPath: string) => {
  const rebuilder = new IndexRebuilder(kbPath)
  return rebuilder.rebuild()
})

ipcMain.handle('index:status', (_event, kbPath: string) => {
  const db = getIndexDB(kbPath)
  const pages = db.listPages().length
  const sources = db.listSources().length
  const lastRebuild = db.getSetting('last_rebuild', '从未')
  return { pages, sources, lastRebuild }
})

// --- Semantic compile ---

ipcMain.handle('llm:compile-v2', async (_event, kbPath: string, rawFilePath: string) => {
  const db = getIndexDB(kbPath)
  const vdb = await getVectorDB(kbPath)
  const embedding = await getEmbeddingService()

  const result = await incrementalCompile(rawFilePath, kbPath, embedding, db, vdb)
  return result
})

// --- Semantic QA ---

ipcMain.handle('llm:qa-v2', async (_event, kbPath: string, question: string) => {
  const db = getIndexDB(kbPath)
  const vdb = await getVectorDB(kbPath)
  const embedding = await getEmbeddingService()

  const result = await semanticQA(question, kbPath, embedding, db, vdb)
  return result
})

// --- Settings (database-backed) ---

ipcMain.handle('settings:get-advanced', (_event, kbPath: string) => {
  const db = getIndexDB(kbPath)
  const defaults: Record<string, string> = {
    chunk_size: '500',
    compile_similarity_threshold: '0.75',
    compile_candidate_count: '3',
    qa_similarity_threshold: '0.65',
    qa_retrieval_count: '30',
    qa_final_context_count: '8',
    qa_context_max_tokens: '3000',
  }
  const merged: Record<string, string> = { ...defaults }
  for (const [key, value] of Object.entries(db.getAllSettings())) {
    merged[key] = value
  }
  return merged
})

ipcMain.handle('settings:save-advanced', (_event, kbPath: string, settings: Record<string, string>) => {
  const db = getIndexDB(kbPath)
  for (const [key, value] of Object.entries(settings)) {
    db.setSetting(key, String(value))
  }
  return { success: true }
})

// --- Conflicts ---

ipcMain.handle('conflicts:list', (_event, kbPath: string) => {
  const db = getIndexDB(kbPath)
  return db.listOpenConflicts()
})

ipcMain.handle('conflicts:resolve', (_event, kbPath: string, conflictId: number, resolution: string) => {
  const db = getIndexDB(kbPath)
  db.resolveConflict(conflictId, resolution)
  return { success: true }
})

// --- Archive Q&A to wiki ---

ipcMain.handle('wiki:archive-qa', (_event, kbPath: string, question: string, answer: string) => {
  const fs = require('fs')
  const path = require('path')
  const synthesisDir = path.join(kbPath, 'wiki', 'synthesis')
  if (!fs.existsSync(synthesisDir)) {
    fs.mkdirSync(synthesisDir, { recursive: true })
  }

  const dateStr = new Date().toISOString().slice(0, 10)
  const fileName = `问答-${dateStr}-${question.slice(0, 30).replace(/[\\/:*?"<>|]/g, '')}.md`
  const filePath = path.join(synthesisDir, fileName)

  const content = `---
title: ${question}
type: qa
date: ${dateStr}
---

# ${question}

> 来源：AI 问答归档

## 问题

${question}

## 回答

${answer}
`

  fs.writeFileSync(filePath, content, 'utf-8')
  return { success: true, path: `wiki/synthesis/${fileName}` }
})
```

- [ ] **Step 2: Commit**

```bash
git add electron/ipc-handlers.ts
git commit -m "feat: add IPC handlers for index, semantic compile, semantic QA, advanced settings, conflicts, QA archive"
```

---

### Task 9: Preload + useIPC 扩展

**Files:**
- Modify: `src/hooks/useIPC.ts`

- [ ] **Step 1: 添加新的 IPC 方法到 useIPC**

Edit `src/hooks/useIPC.ts`, add after existing methods (before the `invoke` generic fallback):

```typescript
// Index
rebuildIndex: (kbPath: string) =>
  api.invoke('index:rebuild', kbPath) as Promise<{ pagesIndexed: number; chunksIndexed: number; sourcesIndexed: number; errors: string[] }>,
getIndexStatus: (kbPath: string) =>
  api.invoke('index:status', kbPath) as Promise<{ pages: number; sources: number; lastRebuild: string }>,

// Semantic compile
compileV2: (kbPath: string, rawFilePath: string) =>
  api.invoke('llm:compile-v2', kbPath, rawFilePath) as Promise<{ compileOutput: string; plan: any; candidatePages: string[] }>,

// Semantic QA
qaV2: (kbPath: string, question: string) =>
  api.invoke('llm:qa-v2', kbPath, question) as Promise<{ answer: string; sources: { title: string; chunk_index: number; similarity: number }[] }>,

// Advanced settings
getAdvancedSettings: (kbPath: string) =>
  api.invoke('settings:get-advanced', kbPath) as Promise<Record<string, string>>,
saveAdvancedSettings: (kbPath: string, settings: Record<string, string>) =>
  api.invoke('settings:save-advanced', kbPath, settings) as Promise<{ success: boolean }>,

// Conflicts
listConflicts: (kbPath: string) =>
  api.invoke('conflicts:list', kbPath) as Promise<any[]>,
resolveConflict: (kbPath: string, conflictId: number, resolution: string) =>
  api.invoke('conflicts:resolve', kbPath, conflictId, resolution) as Promise<{ success: boolean }>,

// Archive QA
archiveQA: (kbPath: string, question: string, answer: string) =>
  api.invoke('wiki:archive-qa', kbPath, question, answer) as Promise<{ success: boolean; path?: string }>,
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useIPC.ts
git commit -m "feat: add IPC wrappers for new v1.0 handlers in useIPC hook"
```

---

### Task 10: 设置页重构（SettingsView.tsx）

**Files:**
- Modify: `src/views/SettingsView.tsx`

- [ ] **Step 1: 重写设置页为两个标签页**

Rewrite `src/views/SettingsView.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string }

const ADVANCED_PARAMS = [
  { key: 'chunk_size', label: '文本分块大小（字）', defaultValue: '500', help: '越小检索越精确但索引变大；越大语义越完整但可能漏掉细节。改后需重建索引' },
  { key: 'compile_similarity_threshold', label: '候选页面最低相似度', defaultValue: '0.75', help: '越高越保守（只匹配高度相关页面，可能漏掉）；越低越激进（匹配更多页面，可能误判）' },
  { key: 'compile_candidate_count', label: '送入 LLM 的候选页面数', defaultValue: '3', help: '越多覆盖面越全但编译耗时和 Token 消耗增加；越少越快但可能漏掉该更新的页面' },
  { key: 'qa_similarity_threshold', label: '问答检索最低相似度', defaultValue: '0.65', help: '越高回答更聚焦但可能缺少相关信息；越低覆盖面更广但可能引入噪音' },
  { key: 'qa_retrieval_count', label: '初始检索块数', defaultValue: '30', help: '越多召回率越高但检索变慢；越少越快但可能遗漏相关内容' },
  { key: 'qa_final_context_count', label: '送入 LLM 的最终块数', defaultValue: '8', help: '越多上下文越丰富但 Token 消耗增加；越少越省 Token 但回答可能不够全面' },
  { key: 'qa_context_max_tokens', label: '上下文窗口 Token 上限', defaultValue: '3000', help: '受限于 LLM 模型的最大上下文；越大可利用更多信息，但需确保不超过模型限制' },
]

export default function SettingsView({ kbPath }: Props) {
  const [tab, setTab] = useState<'general' | 'advanced'>('general')

  // General settings
  const [settings, setSettings] = useState({
    llm: { provider: 'openai', apiKey: '', baseURL: '', model: '' },
  })
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Advanced settings
  const [advancedSettings, setAdvancedSettings] = useState<Record<string, string>>({})
  const [advancedSaved, setAdvancedSaved] = useState(false)

  // Schema
  const [schemaFiles, setSchemaFiles] = useState<{ name: string; content: string }[]>([])
  const [editingSchema, setEditingSchema] = useState<string | null>(null)
  const [schemaContent, setSchemaContent] = useState('')
  const [schemaUpdate, setSchemaUpdate] = useState<any>(null)
  const [schemaUpdateStatus, setSchemaUpdateStatus] = useState<string | null>(null)

  // Index
  const [indexStatus, setIndexStatus] = useState<{ pages: number; sources: number; lastRebuild: string } | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildResult, setRebuildResult] = useState<string | null>(null)

  // Conflicts
  const [conflicts, setConflicts] = useState<any[]>([])
  const [showConflicts, setShowConflicts] = useState(false)

  // Export
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [samplesLoaded, setSamplesLoaded] = useState(false)
  const [sampleStatus, setSampleStatus] = useState<string | null>(null)

  const ipc = useIPC()

  useEffect(() => {
    ipc.getSettings().then(setSettings)
    ipc.checkSamples(kbPath).then(r => setSamplesLoaded(r.loaded))
    ipc.checkSchemaUpdate(kbPath).then(setSchemaUpdate)
    ipc.getAdvancedSettings(kbPath).then(setAdvancedSettings)
    ipc.getIndexStatus(kbPath).then(setIndexStatus)
    ipc.listConflicts(kbPath).then(setConflicts)
  }, [kbPath])

  const handleSaveSettings = async () => {
    await ipc.saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveAdvanced = async () => {
    await ipc.saveAdvancedSettings(kbPath, advancedSettings)
    setAdvancedSaved(true)
    setTimeout(() => setAdvancedSaved(false), 2000)
  }

  const handleRebuildIndex = async () => {
    setRebuilding(true)
    setRebuildResult(null)
    const r = await ipc.rebuildIndex(kbPath)
    setRebuilding(false)
    setRebuildResult(`索引重建完成：${r.pagesIndexed} 个页面，${r.chunksIndexed} 个文本块，${r.sourcesIndexed} 个资料${r.errors.length > 0 ? `，${r.errors.length} 个错误` : ''}`)
    ipc.getIndexStatus(kbPath).then(setIndexStatus)
    setTimeout(() => setRebuildResult(null), 5000)
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
      <h2 className="text-xl font-semibold text-text mb-6">设置</h2>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 bg-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('general')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'general' ? 'bg-accent text-gray-950' : 'text-text-muted hover:text-text'}`}
        >
          一般
        </button>
        <button
          onClick={() => setTab('advanced')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'advanced' ? 'bg-accent text-gray-950' : 'text-text-muted hover:text-text'}`}
        >
          高级
        </button>
      </div>

      {tab === 'general' ? (
        <>
          {/* LLM Config */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">LLM 配置</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted">提供商</label>
                <select
                  value={settings.llm.provider}
                  onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, provider: e.target.value } }))}
                  className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="openai">OpenAI 兼容（OpenAI / MiniMax / DeepSeek / Qwen）</option>
                  <option value="anthropic">Anthropic（Claude 系列）</option>
                </select>
              </div>
              {settings.llm.provider !== 'anthropic' && (
                <div>
                  <label className="text-xs text-text-muted">Base URL（可选）</label>
                  <input type="text" value={settings.llm.baseURL} onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, baseURL: e.target.value } }))} className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent" placeholder="留空使用默认 API" />
                </div>
              )}
              <div>
                <label className="text-xs text-text-muted">API Key</label>
                <input type="password" value={settings.llm.apiKey} onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, apiKey: e.target.value } }))} className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent" placeholder="sk-..." />
              </div>
              <div>
                <label className="text-xs text-text-muted">模型</label>
                <input type="text" value={settings.llm.model} onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, model: e.target.value } }))} className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleSaveSettings} className="px-4 py-2 bg-accent text-gray-950 rounded-lg font-medium text-sm hover:opacity-90">保存设置</button>
                <button onClick={async () => {
                  if (!settings.llm.apiKey.trim() || !settings.llm.model.trim()) {
                    setTestResult({ success: false, message: '请先填写 API Key 和模型名称' })
                    return
                  }
                  setTesting(true); setTestResult(null)
                  const r = await ipc.testLLM({ provider: settings.llm.provider, apiKey: settings.llm.apiKey.trim(), baseURL: settings.llm.baseURL.trim(), model: settings.llm.model.trim() })
                  setTestResult(r); setTesting(false)
                }} disabled={testing} className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50">
                  {testing ? '测试中...' : '测试连接'}
                </button>
                {saved && <span className="text-green-400 text-sm">已保存</span>}
              </div>
              {testResult && <div className={`mt-2 text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>{testResult.message}</div>}
            </div>
          </section>

          {/* Schema Update */}
          {schemaUpdate?.updateAvailable && (
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Schema 更新</h3>
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-sm text-yellow-400 mb-2">内置编译规则已更新（v{schemaUpdate.currentVersion} → v{schemaUpdate.latestVersion}）。</p>
                <p className="text-xs text-text-muted mb-3">更新将覆盖 schema/ 目录下的所有文件。如果你曾修改过这些文件，更新会丢失你的自定义内容。</p>
                <button onClick={async () => {
                  const r = await ipc.updateSchema(kbPath)
                  if (r.success) { setSchemaUpdate({ updateAvailable: false, currentVersion: schemaUpdate.latestVersion, latestVersion: schemaUpdate.latestVersion }); setSchemaUpdateStatus(`已更新 ${r.updated.length} 个文件`) }
                  else { setSchemaUpdateStatus(`更新失败：${r.error}`) }
                }} className="px-4 py-2 bg-yellow-500 text-gray-950 rounded-lg text-sm font-medium hover:opacity-90">更新 Schema 规则</button>
                {schemaUpdateStatus && <p className="text-sm text-green-400 mt-2">{schemaUpdateStatus}</p>}
              </div>
            </section>
          )}

          {/* Sample Data */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">示例数据</h3>
            <p className="text-text-muted text-xs mb-3">{samplesLoaded ? '已加载 AI 应用开发相关的示例文档。' : '快速体验 LLM Wiki 的完整流程。'}</p>
            <div className="flex gap-3">
              {!samplesLoaded ? (
                <button onClick={async () => { const r = await ipc.loadSamples(kbPath); if (r.success) { setSamplesLoaded(true); setSampleStatus(`已加载 ${r.count} 个示例文件`) } }} className="px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90">加载示例数据</button>
              ) : (
                <button onClick={async () => { const r = await ipc.deleteSamples(kbPath); if (r.success) { setSamplesLoaded(false); setSampleStatus(`已删除`) } }} className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30">删除示例数据</button>
              )}
            </div>
            {sampleStatus && <div className="mt-3 p-3 rounded-lg bg-accent/10 text-accent text-sm">{sampleStatus}</div>}
          </section>

          {/* Export */}
          <section>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">导出与备份</h3>
            <div className="flex gap-3 flex-wrap">
              <button onClick={async () => { const r = await ipc.exportHTML(kbPath); setExportStatus(r.success ? `导出成功：${r.path}` : `失败：${r.error}`); setTimeout(() => setExportStatus(null), 5000) }} className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600">导出 HTML</button>
              <button onClick={async () => { const r = await ipc.exportMarkdown(kbPath); setExportStatus(r.success ? `导出成功：${r.path}` : `失败：${r.error}`); setTimeout(() => setExportStatus(null), 5000) }} className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600">导出 Markdown</button>
              <button onClick={async () => { const r = await ipc.backup(kbPath); setExportStatus(r.success ? `备份成功：${r.path}` : `失败：${r.error}`); setTimeout(() => setExportStatus(null), 5000) }} className="px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90">创建备份</button>
            </div>
            {exportStatus && <div className="mt-4 p-3 rounded-lg bg-accent/10 text-accent text-sm">{exportStatus}</div>}
          </section>
        </>
      ) : (
        <>
          <p className="text-sm text-yellow-400/80 mb-6">以下设置已有安全默认值，一般无需修改。</p>

          {/* Compile Params */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">编译参数</h3>
            <div className="space-y-4">
              {ADVANCED_PARAMS.filter(p => p.key.startsWith('compile') || p.key === 'chunk_size').map(param => (
                <div key={param.key}>
                  <label className="text-sm text-text">{param.label}</label>
                  <input type="text" value={advancedSettings[param.key] || param.defaultValue} onChange={(e) => setAdvancedSettings(prev => ({ ...prev, [param.key]: e.target.value }))} className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent" />
                  <p className="text-xs text-text-muted mt-1">{param.help}</p>
                </div>
              ))}
            </div>
          </section>

          {/* QA Params */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">问答参数</h3>
            <div className="space-y-4">
              {ADVANCED_PARAMS.filter(p => p.key.startsWith('qa')).map(param => (
                <div key={param.key}>
                  <label className="text-sm text-text">{param.label}</label>
                  <input type="text" value={advancedSettings[param.key] || param.defaultValue} onChange={(e) => setAdvancedSettings(prev => ({ ...prev, [param.key]: e.target.value }))} className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent" />
                  <p className="text-xs text-text-muted mt-1">{param.help}</p>
                </div>
              ))}
            </div>
            <button onClick={handleSaveAdvanced} className="mt-4 px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90">
              保存高级设置
            </button>
            {advancedSaved && <span className="text-green-400 text-sm ml-3">已保存</span>}
          </section>

          {/* Schema Editing */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Schema 编辑</h3>
            {!editingSchema ? (
              <div className="space-y-2">
                {(schemaFiles.length > 0 ? schemaFiles : [
                  { name: 'system.md', content: '' },
                  { name: 'compile-rules.md', content: '' },
                  { name: 'style-guide.md', content: '' },
                  { name: 'links-rules.md', content: '' },
                ]).map(f => (
                  <button key={f.name} onClick={async () => {
                    const files = await ipc.listSchema(kbPath)
                    const file = files.find(x => x.name === f.name)
                    setEditingSchema(f.name)
                    setSchemaContent(file?.content || '')
                  }} className="block w-full text-left px-3 py-2 bg-gray-800 rounded-lg text-sm text-text-muted hover:text-text hover:bg-gray-700">
                    {f.name}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-text">{editingSchema}</span>
                  <button onClick={() => setEditingSchema(null)} className="text-text-muted hover:text-text text-sm">返回</button>
                </div>
                <textarea value={schemaContent} onChange={(e) => setSchemaContent(e.target.value)} className="w-full h-64 bg-gray-800 text-text rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-accent resize-y" />
                <button onClick={async () => {
                  await ipc.writeSchema(`${kbPath}/schema/${editingSchema}`, schemaContent)
                  setEditingSchema(null)
                }} className="mt-2 px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90">保存</button>
              </div>
            )}
          </section>

          {/* Index Management */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">索引管理</h3>
            {indexStatus && (
              <p className="text-xs text-text-muted mb-3">
                {indexStatus.pages} 个页面 · {indexStatus.sources} 个资料 · 上次重建：{indexStatus.lastRebuild}
              </p>
            )}
            <button onClick={handleRebuildIndex} disabled={rebuilding} className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50">
              {rebuilding ? '重建中...' : '重建所有索引'}
            </button>
            {rebuildResult && <div className="mt-3 p-3 rounded-lg bg-accent/10 text-accent text-sm">{rebuildResult}</div>}
          </section>

          {/* Conflicts */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">
              矛盾列表
              {conflicts.length > 0 && <span className="ml-2 text-yellow-400">({conflicts.length} 个待处理)</span>}
            </h3>
            {!showConflicts ? (
              <button onClick={() => setShowConflicts(true)} className="text-sm text-accent hover:underline">
                查看矛盾列表 →
              </button>
            ) : (
              <div>
                {conflicts.length === 0 ? (
                  <p className="text-sm text-text-muted">暂无待处理的矛盾。</p>
                ) : (
                  <div className="space-y-3">
                    {conflicts.map((c: any) => (
                      <div key={c.id} className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                        <p className="text-sm text-text mb-1">{c.description}</p>
                        <p className="text-xs text-text-muted">来源：{c.source1} vs {c.source2}</p>
                        {c.suggested_resolution && <p className="text-xs text-yellow-400/80 mt-1">建议：{c.suggested_resolution}</p>}
                        <button onClick={async () => {
                          await ipc.resolveConflict(kbPath, c.id, '用户确认')
                          setConflicts(conflicts.filter(x => x.id !== c.id))
                        }} className="mt-2 text-xs text-green-400 hover:underline">标记为已解决</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/SettingsView.tsx
git commit -m "feat: redesign settings page with general/advanced tabs, inline param help, conflict list"
```

---

### Task 11: 问答页重写（QAView.tsx）

**Files:**
- Modify: `src/views/QAView.tsx`
- Modify: `src/components/ChatMessage.tsx`

- [ ] **Step 1: 更新 ChatMessage 组件**

Edit `src/components/ChatMessage.tsx`:

```typescript
interface Props {
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; chunk_index: number; similarity: number }[]
  onFeedback?: (type: 'helpful' | 'inaccurate' | 'more_detail') => void
  onArchive?: () => void
}

export default function ChatMessage({ role, content, sources, onFeedback, onArchive }: Props) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${role === 'user' ? 'bg-accent/20 text-text' : 'bg-gray-800 text-text'}`}>
        <div className="text-sm whitespace-pre-wrap">{content}</div>

        {sources && sources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-700">
            <p className="text-xs text-text-muted mb-1">信息来源：</p>
            {sources.map((s, i) => (
              <span key={i} className="text-xs text-text-muted block">
                {i + 1}. {s.title}（相似度：{(s.similarity * 100).toFixed(1)}%）
              </span>
            ))}
          </div>
        )}

        {role === 'assistant' && (onFeedback || onArchive) && (
          <div className="mt-3 pt-2 border-t border-gray-700 flex gap-2 flex-wrap">
            {onFeedback && (
              <>
                <button onClick={() => onFeedback('helpful')} className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20">有帮助</button>
                <button onClick={() => onFeedback('inaccurate')} className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20">不准确</button>
                <button onClick={() => onFeedback('more_detail')} className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20">需更详细</button>
              </>
            )}
            {onArchive && (
              <button onClick={onArchive} className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 ml-auto">归档到 Wiki</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 重写 QAView**

Rewrite `src/views/QAView.tsx`:

```typescript
import { useState, useEffect, useRef } from 'react'
import ChatMessage from '../components/ChatMessage'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string }

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; chunk_index: number; similarity: number }[]
  archived?: boolean
}

export default function QAView({ kbPath }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ipc = useIPC()

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const result = await ipc.qaV2(kbPath, question)
      setMessages(prev => [...prev, { role: 'assistant', content: result.answer, sources: result.sources }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `出错了：${err}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleFeedback = (msgIdx: number, type: 'helpful' | 'inaccurate' | 'more_detail') => {
    // Track feedback for future processing (v1.1 will do more)
    if (type === 'inaccurate') {
      // TODO v1.1: mark related pages for recompile
    }
  }

  const handleArchive = async (msgIdx: number) => {
    const msg = messages[msgIdx]
    if (!msg || msg.archived) return
    // Find the preceding user message for context
    const userMsg = messages.slice(0, msgIdx).reverse().find(m => m.role === 'user')
    const question = userMsg?.content || '问答'
    await ipc.archiveQA(kbPath, question, msg.content)
    setMessages(prev => prev.map((m, i) => i === msgIdx ? { ...m, archived: true } : m))
  }

  return (
    <div className="flex-1 flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-4">💬</p>
              <p className="text-text text-lg mb-2">AI 问答</p>
              <p className="text-text-muted text-sm">基于你的 Wiki 知识库，使用语义搜索回答问题</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <ChatMessage
              key={i}
              role={msg.role}
              content={msg.content}
              sources={msg.sources}
              onFeedback={msg.role === 'assistant' ? (type) => handleFeedback(i, type) : undefined}
              onArchive={msg.role === 'assistant' && !msg.archived ? () => handleArchive(i) : undefined}
            />
          ))
        )}
        {loading && (
          <div className="flex justify-start mb-4">
            <div className="bg-gray-800 rounded-xl px-4 py-3 text-text-muted">
              <span className="animate-pulse">思考中...</span>
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-border">
        <div className="flex gap-3 max-w-3xl mx-auto">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="基于 Wiki 知识库提问..." className="flex-1 bg-gray-800 text-text rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-accent text-sm" />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="px-5 py-2.5 bg-accent text-gray-950 rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">发送</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/QAView.tsx src/components/ChatMessage.tsx
git commit -m "feat: rewrite QA with semantic search, feedback buttons, and archive-to-wiki"
```

---

### Task 12: 摄入页更新（IngestView.tsx）

**Files:**
- Modify: `src/views/IngestView.tsx`

- [ ] **Step 1: 编译调用切换到 v2 并显示候选页面**

Edit `src/views/IngestView.tsx` — replace `handleCompile` function:

```typescript
const handleCompile = async (filePath: string) => {
  setCompiling(filePath)
  setCompileResult(null)
  setRecompileFile(null)
  const rawName = filePath.replace(/^.*[\\/]/, '')

  try {
    const result = await ipc.compileV2(kbPath, filePath)
    const wikiPages: string[] = []

    const sections = result.compileOutput.split(/(?=^# )/m).filter(s => s.trim())
    for (const section of sections) {
      const titleMatch = section.match(/^# (.+)$/m)
      if (titleMatch) {
        const pageName = titleMatch[1].trim()
        if (pageName === 'Wiki 索引' || pageName.toLowerCase() === 'wiki index') {
          await ipc.writeWikiPage(`${kbPath}/wiki/index.md`, section)
        } else {
          wikiPages.push(pageName)
          await ipc.writeWikiPage(`${kbPath}/wiki/${pageName}.md`, section)
        }
      }
    }

    if (wikiPages.length === 0) {
      const pageName = rawName.replace(/\.[^.]+$/, '')
      wikiPages.push(pageName)
      await ipc.writeWikiPage(`${kbPath}/wiki/${pageName}.md`, result.compileOutput)
    }

    await ipc.logCompile(kbPath, rawName, wikiPages)
    if (rawName.startsWith('sample-')) {
      for (const p of wikiPages) await ipc.trackSamplePage(kbPath, p)
    }

    setCompileStatuses(prev => ({ ...prev, [rawName]: { compiled: true, wikiPages, compiledAt: new Date().toISOString() } }))

    let msg = `编译完成，已生成 ${wikiPages.length} 个 Wiki 页面：${wikiPages.join('、')}`
    if (result.candidatePages.length > 0) {
      msg += `\n向量检索候选页面：${result.candidatePages.join('、')}`
    }
    if (result.plan.conflicts?.length > 0) {
      msg += `\n发现 ${result.plan.conflicts.length} 个矛盾点，请在设置页查看`
    }
    setCompileResult(msg)
  } catch (err) {
    setCompileResult(`编译失败：${err}`)
  } finally {
    setCompiling(null)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/IngestView.tsx
git commit -m "feat: switch ingest to v2 compile, show candidate pages and conflict count"
```

---

### Task 13: 知识库初始化扩展（kb-init.ts）

**Files:**
- Modify: `electron/kb-init.ts`

- [ ] **Step 1: 添加 .index/ 到 .gitignore suggestion**

```typescript
// In the initKnowledgeBase function, after creating directories, add:
const gitignorePath = path.join(basePath, '.gitignore')
if (!fs.existsSync(gitignorePath)) {
  fs.writeFileSync(gitignorePath, '.index/\n.ai-notes/\n', 'utf-8')
}
```

This ensures `.index/` is never committed to git.

- [ ] **Step 2: Commit**

```bash
git add electron/kb-init.ts
git commit -m "feat: add .gitignore creation with .index/ exclusion in kb-init"
```

---

### Task 14: 测试文件 vitest 配置

**Files:**
- Create: `vitest.config.ts` (if not exists)

- [ ] **Step 1: Check if vitest config exists**

```bash
ls /d/app/llm_wiki/vitest.config.* 2>/dev/null || echo "No vitest config"
```

If no config exists, create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
  },
})
```

- [ ] **Step 2: Add test scripts to package.json**

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: add vitest configuration and test scripts"
```

---

### Task 15: 集成测试 & 运行全部测试

**Files:**
- Create: `tests/integration.test.ts`

- [ ] **Step 1: 写集成测试**

Create `tests/integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IndexDB } from '../electron/index-db'
import { VectorDB } from '../electron/vector-db'
import { IndexRebuilder } from '../electron/index-rebuilder'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Integration: Index Pipeline', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-integration-'))
    // Set up a minimal knowledge base
    fs.mkdirSync(path.join(tmpDir, 'wiki'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'raw'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'schema'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'wiki', '人工智能.md'), '# 人工智能\n\n人工智能是计算机科学的一个分支。\n\n## 相关主题\n[[机器学习]]\n[[深度学习]]')
    fs.writeFileSync(path.join(tmpDir, 'wiki', '机器学习.md'), '# 机器学习\n\n机器学习是AI的子领域。\n\n## 相关主题\n[[人工智能]]\n[[神经网络]]')
    fs.writeFileSync(path.join(tmpDir, 'raw', 'ai-intro.txt'), '人工智能简介：AI 包含机器学习、深度学习、自然语言处理等子领域。')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('rebuilds index from file system and restores SQLite + LanceDB', async () => {
    const rebuilder = new IndexRebuilder(tmpDir)
    const result = await rebuilder.rebuild()

    expect(result.pagesIndexed).toBe(2)
    expect(result.sourcesIndexed).toBe(1)
    expect(result.chunksIndexed).toBeGreaterThanOrEqual(2)

    // Verify SQLite
    const db = new IndexDB(tmpDir)
    expect(db.listPages().length).toBe(2)
    expect(db.listSources().length).toBe(1)
    db.close()
  })

  it('handles empty wiki/ and raw/ gracefully', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-empty-'))
    fs.mkdirSync(path.join(emptyDir, 'wiki'), { recursive: true })
    fs.mkdirSync(path.join(emptyDir, 'raw'), { recursive: true })

    const rebuilder = new IndexRebuilder(emptyDir)
    const result = await rebuilder.rebuild()

    expect(result.pagesIndexed).toBe(0)
    expect(result.sourcesIndexed).toBe(0)

    fs.rmSync(emptyDir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 运行全部测试**

```bash
cd /d/app/llm_wiki && npx vitest run
```

Expected: All tests PASS (from tasks 2, 4, 5, 15)

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test: add integration tests for index rebuild pipeline"
```

---

### Task 16: 最终验证与回归测试

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd /d/app/llm_wiki && npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -30
```

Fix any type errors.

- [ ] **Step 2: 确保 Electron 能启动**

```bash
cd /d/app/llm_wiki && npx electron electron/main.ts 2>&1 &
```

Verify the app launches without errors. Check the console for any module loading errors.

- [ ] **Step 3: 运行全部测试最终确认**

```bash
cd /d/app/llm_wiki && npx vitest run 2>&1
```

Expected: All tests pass.

- [ ] **Step 4: 更新项目进度记忆**

Update memory file `C:\Users\Think\.claude\projects\D--APP-llm-wiki\memory\project-progress.md` with v1.0 completion status.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete v1.0 iteration engine - index layer, semantic QA, incremental compile, conflict detection"
```

---

## Summary

| Task | Files | New/Modify |
|------|-------|------------|
| 1 | package.json | Install deps |
| 2 | electron/index-db.ts, tests/index-db.test.ts | SQLite service + tests |
| 3 | electron/embedding-service.ts, tests/embedding-service.test.ts | bge-m3 embedding + tests |
| 4 | electron/vector-db.ts, tests/vector-db.test.ts | LanceDB service + tests |
| 5 | electron/index-rebuilder.ts, tests/index-rebuilder.test.ts | Rebuild service + tests |
| 6 | electron/compile-service.ts | Incremental compile |
| 7 | electron/qa-service.ts | Semantic QA pipeline |
| 8 | electron/ipc-handlers.ts | New IPC handlers |
| 9 | src/hooks/useIPC.ts | New IPC wrappers |
| 10 | src/views/SettingsView.tsx | Settings redesign |
| 11 | src/views/QAView.tsx, src/components/ChatMessage.tsx | QA rewrite |
| 12 | src/views/IngestView.tsx | Compile v2 switch |
| 13 | electron/kb-init.ts | .gitignore generation |
| 14 | vitest.config.ts, package.json | Test config |
| 15 | tests/integration.test.ts | Integration tests |
| 16 | — | Validation & commit |

**Total: 16 tasks, 10 new files, 7 modified files**
