/**
 * EmbeddingService tests — bge-m3 embedding via @huggingface/transformers
 * Usage: npx vitest run tests/embedding-service.test.ts --test-timeout=120000
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { EmbeddingService } from '../electron/embedding-service'

describe('EmbeddingService', () => {
  let service: EmbeddingService

  beforeAll(async () => {
    service = new EmbeddingService()
    await service.initialize()
  }, 7200000)

  it('1. initializes and loads the model', () => {
    expect(service.isReady()).toBe(true)
  })

  it('2. returns correct dimension for embedQuery', async () => {
    const vec = await service.embedQuery('Hello world')
    expect(Array.isArray(vec)).toBe(true)
    expect(vec.length).toBeGreaterThanOrEqual(768)
    expect(vec.length).toBeLessThanOrEqual(1024)
    expect(typeof vec[0]).toBe('number')
  })

  it('3. returns correct dimension for embedTexts', async () => {
    const vecs = await service.embedTexts(['Hello', 'World'])
    expect(Array.isArray(vecs)).toBe(true)
    expect(vecs.length).toBe(2)
    for (const vec of vecs) {
      expect(vec.length).toBeGreaterThanOrEqual(768)
      expect(vec.length).toBeLessThanOrEqual(1024)
    }
    expect(vecs[0].length).toBe(vecs[1].length)
  })

  it('4. chunks text by character count', () => {
    // Create a ~1200-char text made of short paragraphs so chunking
    // produces >=3 chunks, each <=550 chars (default chunkSize=500).
    const sentence =
      'The quick brown fox jumps over the lazy dog in the sunny park.'
    // Build ~300-char paragraphs: repeat the sentence (~53 chars) 6 times.
    const para = Array(6).fill(sentence).join(' ')
    // 4 paragraphs × ~320 chars each ≈ 1280 chars total.
    const text = [para, para, para, para].join('\n\n')

    expect(text.length).toBeGreaterThanOrEqual(1200)

    const chunks = service.chunkText(text, 500)
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(550)
    }
  })

  it('5. keeps paragraphs intact when chunking', () => {
    const p1 = 'Paragraph one with some content here.'
    const p2 = 'Second paragraph that is different from the first one.'
    const p3 = 'Third paragraph for testing paragraph integrity.'
    const text = [p1, p2, p3].join('\n\n')

    // With chunkSize=500 all three short paragraphs should fit in one chunk.
    const chunks = service.chunkText(text, 500)
    expect(chunks.length).toBe(1)

    // The single chunk must contain each paragraph verbatim (not split).
    expect(chunks[0]).toContain('Paragraph one')
    expect(chunks[0]).toContain('Second paragraph')
    expect(chunks[0]).toContain('Third paragraph')
  })
})
