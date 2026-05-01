/**
 * IndexRebuilder tests — full index rebuild from wiki/ and raw/
 * Usage: npx vitest run tests/index-rebuilder.test.ts
 *
 * NOTE: These tests require the bge-m3 embedding model (~568 MB download on
 * first run). Set timeout to 120 seconds to accommodate model download.
 * If the model download fails in CI, tests may time out — manual verification
 * via `npx vitest run tests/index-rebuilder.test.ts` is fine.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IndexRebuilder } from '../electron/index-rebuilder'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-test-'))
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

/** Create a minimal knowledge-base directory structure with sample content. */
function seedKB(basePath: string): void {
  fs.mkdirSync(path.join(basePath, 'wiki'), { recursive: true })
  fs.mkdirSync(path.join(basePath, 'raw'), { recursive: true })

  // Wiki page 1: with frontmatter and links
  fs.writeFileSync(
    path.join(basePath, 'wiki', 'machine-learning.md'),
    [
      '---',
      'type: concept',
      'tags: [AI, ML]',
      '---',
      '',
      '# Machine Learning',
      '',
      'Machine learning is a subset of artificial intelligence that enables',
      'systems to learn and improve from experience without being explicitly',
      'programmed.',
      '',
      '## Key Concepts',
      '',
      'Supervised learning uses labeled training data. Unsupervised learning',
      'finds patterns in unlabeled data.',
      '',
      '## Related Topics',
      '',
      '- [[Deep Learning]]',
      '- [[Neural Networks]]',
    ].join('\n'),
    'utf-8',
  )

  // Wiki page 2: minimal content, no links
  fs.writeFileSync(
    path.join(basePath, 'wiki', 'deep-learning.md'),
    [
      '---',
      'type: concept',
      'tags: [AI, DL]',
      '---',
      '',
      '# Deep Learning',
      '',
      'Deep learning is a class of machine learning algorithms that uses',
      'multiple layers to progressively extract higher-level features from',
      'raw input.',
    ].join('\n'),
    'utf-8',
  )

  // Raw source file
  fs.writeFileSync(
    path.join(basePath, 'raw', 'research-notes.md'),
    [
      '# Research Notes',
      '',
      'These are raw research notes about AI and ML topics.',
      'They contain unstructured information that will be compiled',
      'into structured wiki pages.',
    ].join('\n'),
    'utf-8',
  )
}

describe('IndexRebuilder', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  it(
    '1. rebuilds from wiki/ and raw/ directories',
    async () => {
      seedKB(tempDir)
      const rebuilder = new IndexRebuilder(tempDir)
      const result = await rebuilder.rebuild()

      expect(result.pagesIndexed).toBeGreaterThanOrEqual(2)
      expect(result.chunksIndexed).toBeGreaterThanOrEqual(2)
      expect(result.sourcesIndexed).toBeGreaterThanOrEqual(1)
      expect(result.errors).toEqual([])

      // Verify .index was created
      const indexDir = path.join(tempDir, '.index')
      expect(fs.existsSync(indexDir)).toBe(true)
      expect(fs.existsSync(path.join(indexDir, 'pages.db'))).toBe(true)
      expect(fs.existsSync(path.join(indexDir, 'vectors.lancedb'))).toBe(true)
    },
    120_000,
  )

  it(
    '2. creates .index directory with pages.db and vectors.lancedb',
    async () => {
      // No .index dir initially — just empty wiki/ and raw/
      fs.mkdirSync(path.join(tempDir, 'wiki'), { recursive: true })
      fs.mkdirSync(path.join(tempDir, 'raw'), { recursive: true })

      // Single minimal page so the test is fast
      fs.writeFileSync(
        path.join(tempDir, 'wiki', 'test.md'),
        '# Test\n\nMinimal content for testing.',
        'utf-8',
      )
      fs.writeFileSync(
        path.join(tempDir, 'raw', 'note.txt'),
        'Raw note content.',
        'utf-8',
      )

      const indexDir = path.join(tempDir, '.index')
      expect(fs.existsSync(indexDir)).toBe(false)

      const rebuilder = new IndexRebuilder(tempDir)
      await rebuilder.rebuild()

      expect(fs.existsSync(indexDir)).toBe(true)
      expect(fs.existsSync(path.join(indexDir, 'pages.db'))).toBe(true)
      expect(fs.existsSync(path.join(indexDir, 'vectors.lancedb'))).toBe(true)
    },
    120_000,
  )

  it(
    '3. is idempotent — rebuilding twice yields the same page count',
    async () => {
      seedKB(tempDir)

      const rebuilder1 = new IndexRebuilder(tempDir)
      const result1 = await rebuilder1.rebuild()

      const rebuilder2 = new IndexRebuilder(tempDir)
      const result2 = await rebuilder2.rebuild()

      expect(result2.pagesIndexed).toBe(result1.pagesIndexed)
      expect(result2.sourcesIndexed).toBe(result1.sourcesIndexed)
    },
    120_000,
  )

  it(
    '4. recovers after .index/ deletion — rebuild again produces pages',
    async () => {
      seedKB(tempDir)

      // First build
      const rebuilder1 = new IndexRebuilder(tempDir)
      const result1 = await rebuilder1.rebuild()
      expect(result1.pagesIndexed).toBeGreaterThan(0)

      // Delete .index/ entirely
      const indexDir = path.join(tempDir, '.index')
      fs.rmSync(indexDir, { recursive: true, force: true })
      expect(fs.existsSync(indexDir)).toBe(false)

      // Rebuild again
      const rebuilder2 = new IndexRebuilder(tempDir)
      const result2 = await rebuilder2.rebuild()

      expect(result2.pagesIndexed).toBeGreaterThan(0)
      expect(result2.pagesIndexed).toBe(result1.pagesIndexed)
    },
    120_000,
  )
})
