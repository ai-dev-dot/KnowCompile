/**
 * FSManager tests — filesystem operations for wiki/raw/schema management
 * Usage: npx vitest run tests/fs-manager.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  listWikiPages,
  listRawFiles,
  readFile,
  writeFile,
  deleteFile,
  copyToRaw,
  extractBacklinks,
  extractLinks,
  getSchemaFiles,
  validateRawFile,
  readRawContent,
} from '../electron/fs-manager'

describe('FSManager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-fs-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // -- readFile / writeFile / deleteFile --
  it('1. writes and reads a file', () => {
    const filePath = path.join(tmpDir, 'test.md')
    writeFile(filePath, '# Hello\n\nWorld.')
    expect(fs.existsSync(filePath)).toBe(true)
    expect(readFile(filePath)).toBe('# Hello\n\nWorld.')
  })

  it('2. writeFile creates intermediate directories', () => {
    const filePath = path.join(tmpDir, 'nested', 'deep', 'file.md')
    writeFile(filePath, 'content')
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('3. deleteFile removes a file', () => {
    const filePath = path.join(tmpDir, 'to-delete.md')
    writeFile(filePath, 'delete me')
    expect(fs.existsSync(filePath)).toBe(true)
    deleteFile(filePath)
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('4. deleteFile is no-op for non-existent files', () => {
    expect(() => deleteFile(path.join(tmpDir, 'nonexistent.md'))).not.toThrow()
  })

  // -- listWikiPages --
  it('5. lists wiki pages sorted by modified time', () => {
    const wikiDir = path.join(tmpDir, 'wiki')
    fs.mkdirSync(wikiDir)
    fs.writeFileSync(path.join(wikiDir, 'b.md'), '# B', 'utf-8')
    fs.writeFileSync(path.join(wikiDir, 'a.md'), '# A', 'utf-8')
    // Ensure a.md has a later mtime
    const later = new Date(Date.now() + 60000)
    fs.utimesSync(path.join(wikiDir, 'a.md'), later, later)

    const pages = listWikiPages(tmpDir)
    expect(pages).toHaveLength(2)
    // a.md has later mtime, should appear first
    expect(pages[0].name).toBe('a')
    expect(pages[1].name).toBe('b')
  })

  it('6. returns empty array when wiki dir does not exist', () => {
    const pages = listWikiPages(tmpDir)
    expect(pages).toEqual([])
  })

  // -- listRawFiles --
  it('7. lists raw files excluding dot files', () => {
    const rawDir = path.join(tmpDir, 'raw')
    fs.mkdirSync(rawDir)
    fs.writeFileSync(path.join(rawDir, 'source1.md'), 'content')
    fs.writeFileSync(path.join(rawDir, '.hidden'), 'hidden')
    fs.writeFileSync(path.join(rawDir, 'notes.txt'), 'notes')

    const files = listRawFiles(tmpDir)
    expect(files).toHaveLength(2)
    expect(files.map(f => f.name).sort()).toEqual(['notes.txt', 'source1.md'])
  })

  it('8. returns empty array when raw dir does not exist', () => {
    expect(listRawFiles(tmpDir)).toEqual([])
  })

  // -- copyToRaw --
  it('9. copies a file to raw/ directory', () => {
    const sourceFile = path.join(tmpDir, 'external.md')
    fs.writeFileSync(sourceFile, 'External content')

    const result = copyToRaw(tmpDir, sourceFile)
    expect(result.success).toBe(true)
    expect(result.name).toBe('external.md')
    expect(fs.existsSync(path.join(tmpDir, 'raw', 'external.md'))).toBe(true)
  })

  it('10. creates raw/ directory if it does not exist', () => {
    const sourceFile = path.join(tmpDir, 'data.txt')
    fs.writeFileSync(sourceFile, 'Data')

    expect(fs.existsSync(path.join(tmpDir, 'raw'))).toBe(false)
    copyToRaw(tmpDir, sourceFile)
    expect(fs.existsSync(path.join(tmpDir, 'raw'))).toBe(true)
  })

  // -- extractLinks --
  it('11. extracts wiki links from content', () => {
    const content = 'See [[Page A]] and [[Page B]] for details.'
    const links = extractLinks(content)
    expect(links).toEqual(['Page A', 'Page B'])
  })

  it('12. returns empty array when no links present', () => {
    const links = extractLinks('Plain text without any links.')
    expect(links).toEqual([])
  })

  // -- extractBacklinks --
  it('13. finds pages that link to a target page', () => {
    const wikiDir = path.join(tmpDir, 'wiki')
    fs.mkdirSync(wikiDir)

    fs.writeFileSync(path.join(wikiDir, 'Page A.md'), '# A\n\nLinks to [[Target Page]].')
    fs.writeFileSync(path.join(wikiDir, 'Page B.md'), '# B\n\nLinks to [[Target Page]] and [[Other]].')
    fs.writeFileSync(path.join(wikiDir, 'Page C.md'), '# C\n\nNo relevant links here.')

    const backlinks = extractBacklinks(tmpDir, 'Target Page')
    expect(backlinks).toHaveLength(2)
    expect(backlinks).toContain('Page A')
    expect(backlinks).toContain('Page B')
  })

  it('14. returns empty array when no backlinks found', () => {
    const wikiDir = path.join(tmpDir, 'wiki')
    fs.mkdirSync(wikiDir)
    fs.writeFileSync(path.join(wikiDir, 'Page A.md'), '# A\n\nNo links.')

    const backlinks = extractBacklinks(tmpDir, 'Nonexistent')
    expect(backlinks).toEqual([])
  })

  it('15. returns empty array when wiki dir does not exist', () => {
    expect(extractBacklinks(tmpDir, 'Something')).toEqual([])
  })

  // -- getSchemaFiles --
  it('16. lists schema markdown files', () => {
    const schemaDir = path.join(tmpDir, 'schema')
    fs.mkdirSync(schemaDir)
    fs.writeFileSync(path.join(schemaDir, 'system.md'), '# System')
    fs.writeFileSync(path.join(schemaDir, 'compile-rules.md'), '# Rules')
    fs.writeFileSync(path.join(schemaDir, 'notes.txt'), 'Not markdown')

    const files = getSchemaFiles(tmpDir)
    expect(files).toHaveLength(2)
    const names = files.map(f => f.name)
    expect(names).toContain('system.md')
    expect(names).toContain('compile-rules.md')
    expect(files[0].content).toBeDefined()
  })

  it('17. returns empty array when schema dir does not exist', () => {
    expect(getSchemaFiles(tmpDir)).toEqual([])
  })

  // -- validateRawFile --
  it('18. accepts .md files', () => {
    const p = path.join(tmpDir, 'test.md')
    fs.writeFileSync(p, 'hello', 'utf-8')
    expect(validateRawFile(tmpDir, p).valid).toBe(true)
  })

  it('19. accepts .pdf files', () => {
    const p = path.join(tmpDir, 'test.pdf')
    fs.writeFileSync(p, '%PDF-1.4 dummy', 'utf-8')
    expect(validateRawFile(tmpDir, p).valid).toBe(true)
  })

  it('20. rejects unsupported format (.exe)', () => {
    const p = path.join(tmpDir, 'test.exe')
    fs.writeFileSync(p, 'binary', 'utf-8')
    const result = validateRawFile(tmpDir, p)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('unsupported_format')
  })

  it('21. rejects files over 50MB', () => {
    const p = path.join(tmpDir, 'huge.md')
    const fd = fs.openSync(p, 'w')
    fs.ftruncateSync(fd, 51 * 1024 * 1024)
    fs.closeSync(fd)
    const result = validateRawFile(tmpDir, p)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('too_large')
  })

  it('22. detects duplicate files in raw/', () => {
    const p = path.join(tmpDir, 'dup.md')
    fs.writeFileSync(p, 'source', 'utf-8')
    const rawDir = path.join(tmpDir, 'raw')
    fs.mkdirSync(rawDir, { recursive: true })
    fs.writeFileSync(path.join(rawDir, 'dup.md'), 'existing', 'utf-8')
    const result = validateRawFile(tmpDir, p)
    expect(result.valid).toBe(false)
    expect(result.code).toBe('duplicate')
  })

  it('23. returns error for non-existent source file', () => {
    const result = validateRawFile(tmpDir, path.join(tmpDir, 'ghost.md'))
    expect(result.valid).toBe(false)
  })

  // -- copyToRaw error paths --
  it('24. returns error for non-existent source (ENOENT)', () => {
    const result = copyToRaw(tmpDir, path.join(tmpDir, 'nonexistent.md'))
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // -- readRawContent --
  it('25. reads content of a raw file', () => {
    const rawDir = path.join(tmpDir, 'raw')
    fs.mkdirSync(rawDir, { recursive: true })
    fs.writeFileSync(path.join(rawDir, 'hello.md'), '# Hello\n\nWorld', 'utf-8')
    const content = readRawContent(tmpDir, 'hello.md')
    expect(content).toContain('# Hello')
    expect(content).toContain('World')
  })

  it('26. throws for non-existent raw file', () => {
    expect(() => readRawContent(tmpDir, 'nope.md')).toThrow()
  })
})
