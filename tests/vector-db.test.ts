/**
 * VectorDB tests — LanceDB vector database service for chunk storage
 * Usage: npx vitest run tests/vector-db.test.ts --test-timeout=30000
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { VectorDB } from '../electron/vector-db'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-vecdb-test-'))
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

/** Generate a random 1024-dim vector (simulates bge-m3 embeddings). */
function randomVector(): number[] {
  return new Array(1024).fill(0).map(() => Math.random())
}

/**
 * Add small Gaussian noise to a vector.
 * Helps simulate "nearby" embedding for similarity search tests.
 */
function addNoise(vec: number[], magnitude: number = 0.05): number[] {
  return vec.map((v) => v + (Math.random() - 0.5) * 2 * magnitude)
}

describe('VectorDB', () => {
  let tempDir: string
  let db: VectorDB

  beforeEach(async () => {
    tempDir = createTempDir()
    db = new VectorDB(tempDir)
    await db.initialize()
  })

  afterEach(async () => {
    try { await db.close() } catch { /* already closed */ }
    cleanupTempDir(tempDir)
  })

  it('1. creates vectors.lancedb directory', () => {
    const dbPath = path.join(tempDir, '.index', 'vectors.lancedb')
    expect(fs.existsSync(dbPath)).toBe(true)
  })

  it('2. adds chunks and searches by similarity', async () => {
    // Create two distinctly different vectors.
    const anchor = randomVector()
    const far = randomVector()

    await db.addChunks([
      { vector: anchor, type: 'page', ref_id: 1, chunk_index: 0, text: 'Hello world' },
      { vector: far, type: 'page', ref_id: 1, chunk_index: 1, text: 'Far away chunk' },
    ])

    // Search with a slight perturbation of the anchor — it should match anchor first.
    const results = await db.search(addNoise(anchor, 0.01))

    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].text).toBe('Hello world')
    expect(results[0]._distance).toBeDefined()
    expect(results[0].vector).toBeDefined()
    expect(results[0].type).toBe('page')
    expect(results[0].ref_id).toBe(1)
  })

  it('3. adds many chunks and retrieves top K', async () => {
    const vectors: { vector: number[]; type: 'page'; ref_id: number; chunk_index: number; text: string }[] = []

    for (let i = 0; i < 20; i++) {
      vectors.push({
        vector: randomVector(),
        type: 'page',
        ref_id: 1,
        chunk_index: i,
        text: `Chunk ${i}`,
      })
    }

    await db.addChunks(vectors)

    // Search with a random vector, request top 5.
    const results = await db.search(randomVector(), { topK: 5 })

    expect(results.length).toBe(5)
    // Every result should have the expected fields.
    for (const r of results) {
      expect(r._distance).toBeDefined()
      expect(typeof r._distance).toBe('number')
      expect(r.text).toBeDefined()
      expect(r.vector).toBeDefined()
      expect(r.vector.length).toBe(1024)
    }
  })

  it('4. filters by type', async () => {
    const v1 = randomVector()
    const v2 = randomVector()
    const v3 = randomVector()

    await db.addChunks([
      { vector: v1, type: 'page', ref_id: 1, chunk_index: 0, text: 'Page chunk' },
      { vector: v2, type: 'source', ref_id: 1, chunk_index: 0, text: 'Source chunk 1' },
      { vector: v3, type: 'source', ref_id: 1, chunk_index: 1, text: 'Source chunk 2' },
    ])

    // Search only type=page — should get exactly 1 result.
    const pageResults = await db.search(randomVector(), { type: 'page', topK: 10 })
    expect(pageResults.length).toBe(1)
    expect(pageResults[0].text).toBe('Page chunk')
    expect(pageResults[0].type).toBe('page')

    // Search only type=source — should get exactly 2 results.
    const sourceResults = await db.search(randomVector(), { type: 'source', topK: 10 })
    expect(sourceResults.length).toBe(2)
    for (const r of sourceResults) {
      expect(r.type).toBe('source')
    }
  })

  it('5. deletes chunks by ref_id and type', async () => {
    const v1 = randomVector()
    const v2 = randomVector()

    await db.addChunks([
      { vector: v1, type: 'page', ref_id: 10, chunk_index: 0, text: 'To be deleted' },
      { vector: v2, type: 'page', ref_id: 20, chunk_index: 0, text: 'To be kept' },
    ])

    expect(await db.count()).toBe(2)

    await db.deleteChunks(10, 'page')

    // Only ref_id=20 should remain.
    expect(await db.count()).toBe(1)

    const results = await db.search(randomVector(), { topK: 10 })
    expect(results.length).toBe(1)
    expect(results[0].ref_id).toBe(20)
    expect(results[0].text).toBe('To be kept')
  })

  it('7. deletes all chunks', async () => {
    const v = randomVector()
    await db.addChunks([
      { vector: v, type: 'page', ref_id: 1, chunk_index: 0, text: 'Chunk 1' },
      { vector: v, type: 'page', ref_id: 1, chunk_index: 1, text: 'Chunk 2' },
    ])
    expect(await db.count()).toBe(2)

    await db.deleteAllChunks()

    expect(await db.count()).toBe(0)
    const results = await db.search(v, { topK: 10 })
    expect(results.length).toBe(0)
  })

  it('6. counts chunks', async () => {
    expect(await db.count()).toBe(0)

    await db.addChunks([
      { vector: randomVector(), type: 'page', ref_id: 1, chunk_index: 0, text: 'Chunk A' },
      { vector: randomVector(), type: 'page', ref_id: 1, chunk_index: 1, text: 'Chunk B' },
    ])

    expect(await db.count()).toBe(2)
  })
})
