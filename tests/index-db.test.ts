/**
 * IndexDB tests — SQLite database service for wiki index metadata
 * Usage: npx vitest run tests/index-db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IndexDB } from '../electron/index-db'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-test-'))
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('IndexDB', () => {
  let tempDir: string
  let db: IndexDB

  beforeEach(() => {
    tempDir = createTempDir()
    db = new IndexDB(tempDir)
  })

  afterEach(() => {
    try { db.close() } catch { /* already closed */ }
    cleanupTempDir(tempDir)
  })

  it('1. creates pages.db at the correct path', () => {
    const dbPath = path.join(tempDir, '.index', 'pages.db')
    expect(fs.existsSync(dbPath)).toBe(true)
    const walPath = dbPath + '-wal'
    expect(fs.existsSync(walPath)).toBe(true)
  })

  it('2. creates the pages table', () => {
    db.upsertPage({ path: 'test/page.md', title: 'Test Page', hash: 'abc123' })
    const page = db.getPageByPath('test/page.md')
    expect(page).toBeDefined()
    expect(page!.title).toBe('Test Page')
    expect(page!.hash).toBe('abc123')
    expect(page!.created_at).toBeDefined()
    expect(page!.updated_at).toBeDefined()
  })

  it('3. creates the sources table', () => {
    db.addSource({ path: 'raw/test.md', filename: 'test.md', size: 100, hash: 'def456' })
    const source = db.getSourceByPath('raw/test.md')
    expect(source).toBeDefined()
    expect(source!.filename).toBe('test.md')
    expect(source!.size).toBe(100)
    expect(source!.status).toBe('pending')
  })

  it('4. creates the links table', () => {
    const p1 = db.upsertPage({ path: 'a.md', title: 'A', hash: 'h1' })
    const p2 = db.upsertPage({ path: 'b.md', title: 'B', hash: 'h2' })
    db.addLink({ from_page_id: p1.id!, to_page_id: p2.id! })
    const links = db.getLinksForPage(p1.id!)
    expect(links.length).toBe(1)
    expect(links[0].from_page_id).toBe(p1.id!)
    expect(links[0].to_page_id).toBe(p2.id!)
  })

  it('5. creates the conflicts table', () => {
    const page = db.upsertPage({ path: 'x.md', title: 'X', hash: 'h' })
    db.addConflict({ page_id: page.id!, description: 'Test conflict', source1: 's1', source2: 's2' })
    const conflicts = db.listOpenConflicts()
    expect(conflicts.length).toBe(1)
    expect(conflicts[0].status).toBe('open')
  })

  it('6. creates the settings table', () => {
    db.setSetting('theme', 'dark')
    const value = db.getSetting('theme')
    expect(value).toBe('dark')
  })

  it('7. upserts a page and retrieves it', () => {
    // Insert
    const page = db.upsertPage({
      path: 'wiki/test.md',
      title: 'Test Page',
      hash: 'hash1',
      summary: 'A summary',
      tags: 'tag1,tag2',
    })
    expect(page.id).toBeDefined()
    expect(page.path).toBe('wiki/test.md')

    // Retrieve by path
    const byPath = db.getPageByPath('wiki/test.md')
    expect(byPath).toBeDefined()
    expect(byPath!.title).toBe('Test Page')
    expect(byPath!.hash).toBe('hash1')
    expect(byPath!.summary).toBe('A summary')
    expect(byPath!.tags).toBe('tag1,tag2')

    // Retrieve by id
    const byId = db.getPageById(page.id!)
    expect(byId).toBeDefined()
    expect(byId!.path).toBe('wiki/test.md')

    // getPageByPath returns undefined for non-existent
    const missing = db.getPageByPath('nonexistent.md')
    expect(missing).toBeUndefined()

    // getPageById returns undefined for non-existent
    const missingById = db.getPageById(99999)
    expect(missingById).toBeUndefined()

    // Upsert (update existing by path)
    const updated = db.upsertPage({
      path: 'wiki/test.md',
      title: 'Test Updated',
      hash: 'hash2',
      summary: 'New summary',
      last_compiled_at: '2026-05-01',
    })
    expect(updated.id).toBe(page.id) // same row
    expect(updated.title).toBe('Test Updated')

    const reRetrieved = db.getPageByPath('wiki/test.md')
    expect(reRetrieved!.title).toBe('Test Updated')
    expect(reRetrieved!.hash).toBe('hash2')
    expect(reRetrieved!.last_compiled_at).toBe('2026-05-01')
  })

  it('8. lists all pages', () => {
    db.upsertPage({ path: 'wiki/b.md', title: 'B', hash: 'hb' })
    db.upsertPage({ path: 'wiki/a.md', title: 'A', hash: 'ha' })
    db.upsertPage({ path: 'wiki/c.md', title: 'C', hash: 'hc' })

    const pages = db.listPages()
    expect(pages.length).toBe(3)
    // Ordered by title
    expect(pages[0].title).toBe('A')
    expect(pages[1].title).toBe('B')
    expect(pages[2].title).toBe('C')
  })

  it('9. adds a source and retrieves by path', () => {
    const source = db.addSource({
      path: 'raw/doc.pdf',
      filename: 'doc.pdf',
      size: 1024,
      hash: 'sha256abc',
      status: 'imported',
      page_count: 0,
    })
    expect(source.id).toBeDefined()

    const retrieved = db.getSourceByPath('raw/doc.pdf')
    expect(retrieved).toBeDefined()
    expect(retrieved!.filename).toBe('doc.pdf')
    expect(retrieved!.size).toBe(1024)
    expect(retrieved!.hash).toBe('sha256abc')
    expect(retrieved!.imported_at).toBeDefined()
    expect(retrieved!.status).toBe('imported')

    // Non-existent returns undefined
    const missing = db.getSourceByPath('nonexistent.pdf')
    expect(missing).toBeUndefined()
  })

  it('10. updates source status', () => {
    db.addSource({ path: 'raw/test.md', filename: 'test.md', size: 50, hash: 'h' })

    // Update with pageCount
    db.updateSourceStatus('raw/test.md', 'compiled', 3)
    const source = db.getSourceByPath('raw/test.md')
    expect(source!.status).toBe('compiled')
    expect(source!.page_count).toBe(3)
    expect(source!.last_compiled_at).toBeDefined()

    // Update without pageCount
    db.updateSourceStatus('raw/test.md', 'error')
    const source2 = db.getSourceByPath('raw/test.md')
    expect(source2!.status).toBe('error')
    // page_count should remain unchanged when not provided
    expect(source2!.page_count).toBe(3)
  })

  it('11. adds a link and retrieves by page', () => {
    const p1 = db.upsertPage({ path: 'wiki/from.md', title: 'From', hash: 'hf' })
    const p2 = db.upsertPage({ path: 'wiki/to.md', title: 'To', hash: 'ht' })

    const link = db.addLink({
      from_page_id: p1.id!,
      to_page_id: p2.id!,
      context: 'Related concept',
    })
    expect(link.id).toBeDefined()

    // Retrieve by from_page_id
    const linksForFrom = db.getLinksForPage(p1.id!)
    expect(linksForFrom.length).toBe(1)
    expect(linksForFrom[0].from_page_id).toBe(p1.id!)
    expect(linksForFrom[0].to_page_id).toBe(p2.id!)
    expect(linksForFrom[0].context).toBe('Related concept')
    expect(linksForFrom[0].created_at).toBeDefined()

    // Retrieve by to_page_id
    const linksForTo = db.getLinksForPage(p2.id!)
    expect(linksForTo.length).toBe(1)

    // getAllLinks
    const allLinks = db.getAllLinks()
    expect(allLinks.length).toBe(1)

    // Duplicate insert is ignored (UNIQUE constraint)
    const dupLink = db.addLink({ from_page_id: p1.id!, to_page_id: p2.id! })
    expect(dupLink.id).toBe(link.id)
    expect(db.getAllLinks().length).toBe(1)

    // deleteLinksForPage
    db.deleteLinksForPage(p1.id!)
    expect(db.getLinksForPage(p1.id!).length).toBe(0)
  })

  it('12. adds a conflict and lists open conflicts', () => {
    const page = db.upsertPage({ path: 'wiki/conflict-page.md', title: 'Conflict Page', hash: 'hc' })

    db.addConflict({
      page_id: page.id!,
      description: 'Conflicting information about AI safety',
      source1: 'raw/source1.md',
      source2: 'raw/source2.md',
      suggested_resolution: 'Use more recent source',
    })

    const openConflicts = db.listOpenConflicts()
    expect(openConflicts.length).toBe(1)
    expect(openConflicts[0].page_id).toBe(page.id!)
    expect(openConflicts[0].description).toBe('Conflicting information about AI safety')
    expect(openConflicts[0].source1).toBe('raw/source1.md')
    expect(openConflicts[0].source2).toBe('raw/source2.md')
    expect(openConflicts[0].suggested_resolution).toBe('Use more recent source')
    expect(openConflicts[0].status).toBe('open')
    expect(openConflicts[0].created_at).toBeDefined()

    // listConflictsForPage
    const pageConflicts = db.listConflictsForPage(page.id!)
    expect(pageConflicts.length).toBe(1)
    expect(pageConflicts[0].id).toBe(openConflicts[0].id)
  })

  it('13. resolves a conflict', () => {
    const page = db.upsertPage({ path: 'wiki/resolve-test.md', title: 'Resolve Test', hash: 'hr' })
    const conflict = db.addConflict({
      page_id: page.id!,
      description: 'Test conflict',
      source1: 's1',
      source2: 's2',
    })

    db.resolveConflict(conflict.id!, 'Resolved by choosing source1')

    // Should no longer appear in open conflicts
    const openConflicts = db.listOpenConflicts()
    expect(openConflicts.length).toBe(0)

    // Should still appear in page conflicts with resolved status
    const pageConflicts = db.listConflictsForPage(page.id!)
    expect(pageConflicts.length).toBe(1)
    expect(pageConflicts[0].status).toBe('resolved')
    expect(pageConflicts[0].resolution).toBe('Resolved by choosing source1')
    expect(pageConflicts[0].resolved_at).toBeDefined()
  })

  it('14. sets and gets settings', () => {
    db.setSetting('api_key', 'sk-test123')
    db.setSetting('model', 'gpt-4o')

    expect(db.getSetting('api_key')).toBe('sk-test123')
    expect(db.getSetting('model')).toBe('gpt-4o')

    // Default value for missing key
    expect(db.getSetting('nonexistent', 'default')).toBe('default')
    // No default returns undefined
    expect(db.getSetting('nonexistent')).toBeUndefined()

    // Overwrite existing
    db.setSetting('api_key', 'sk-new456')
    expect(db.getSetting('api_key')).toBe('sk-new456')

    // getAllSettings
    const all = db.getAllSettings()
    expect(all).toEqual({ api_key: 'sk-new456', model: 'gpt-4o' })
  })

  it('15. rebuild drops and recreates all tables', () => {
    // Add data to all tables
    db.setSetting('key1', 'val1')
    const page = db.upsertPage({ path: 'wiki/test.md', title: 'Test', hash: 'h' })
    db.addSource({ path: 'raw/test.md', filename: 'test.md', size: 100, hash: 'h' })
    db.addConflict({ page_id: page.id!, description: 'Test', source1: 's1', source2: 's2' })

    expect(db.getSetting('key1')).toBe('val1')
    expect(db.listPages().length).toBe(1)
    expect(db.listSources().length).toBe(1)
    expect(db.listOpenConflicts().length).toBe(1)

    // Rebuild
    db.rebuild()

    // All data is gone
    expect(db.getSetting('key1')).toBeUndefined()
    expect(db.listPages().length).toBe(0)
    expect(db.listSources().length).toBe(0)
    expect(db.listOpenConflicts().length).toBe(0)

    // Tables are recreated and functional
    db.setSetting('key2', 'val2')
    expect(db.getSetting('key2')).toBe('val2')

    db.upsertPage({ path: 'wiki/new.md', title: 'New', hash: 'h2' })
    expect(db.listPages().length).toBe(1)
  })

  it('deletePage removes a page', () => {
    db.upsertPage({ path: 'wiki/to-delete.md', title: 'Delete Me', hash: 'h' })
    expect(db.getPageByPath('wiki/to-delete.md')).toBeDefined()

    db.deletePage('wiki/to-delete.md')
    expect(db.getPageByPath('wiki/to-delete.md')).toBeUndefined()
  })

  it('cascading delete removes associated links', () => {
    const p1 = db.upsertPage({ path: 'wiki/from.md', title: 'From', hash: 'hf' })
    const p2 = db.upsertPage({ path: 'wiki/to.md', title: 'To', hash: 'ht' })
    db.addLink({ from_page_id: p1.id!, to_page_id: p2.id! })

    // Delete the "from" page — links should be cascade-deleted
    db.deletePage('wiki/from.md')
    const links = db.getLinksForPage(p2.id!)
    expect(links.length).toBe(0)
  })
})
