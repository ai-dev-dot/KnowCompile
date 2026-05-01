/**
 * QAService pure-function tests — ranking logic and helpers
 * from the 7-step semantic QA pipeline.
 *
 * Usage: npx vitest run tests/qa-service.test.ts
 */
import { describe, it, expect } from 'vitest'
import { distanceToSimilarity } from '../electron/vector-utils'
import { estimateTokens } from '../electron/qa-service'

// ==========================================================================
// distanceToSimilarity — L2 distance → cosine similarity
// ==========================================================================

describe('distanceToSimilarity', () => {
  it('1. zero distance → similarity 1', () => {
    expect(distanceToSimilarity(0)).toBe(1)
  })

  it('2. sqrt(2) distance → similarity 0', () => {
    expect(distanceToSimilarity(Math.sqrt(2))).toBeCloseTo(0, 5)
  })

  it('3. distance >= 2 clamps to 0', () => {
    expect(distanceToSimilarity(2)).toBe(0)
    expect(distanceToSimilarity(5)).toBe(0)
  })

  it('4. monotonic — larger distance gives lower similarity', () => {
    expect(distanceToSimilarity(0.3)).toBeGreaterThan(distanceToSimilarity(0.8))
  })
})

// ==========================================================================
// estimateTokens — rough token count for Chinese + English text
// ==========================================================================

describe('estimateTokens', () => {
  it('1. English characters estimate to chars/2 tokens', () => {
    // 10 chars → ceil(10/2) = 5 tokens
    expect(estimateTokens('0123456789')).toBe(5)
  })

  it('2. Chinese text estimates to chars/2 tokens', () => {
    const text = '人工智能是计算机科学的一个分支'
    expect(estimateTokens(text)).toBe(Math.ceil(text.length / 2))
  })

  it('3. mixed Chinese and English', () => {
    const text = 'AI 人工智能 Machine Learning 机器学习'
    expect(estimateTokens(text)).toBe(Math.ceil(text.length / 2))
  })

  it('4. empty string → 0 tokens', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('5. single character → 1 token', () => {
    expect(estimateTokens('A')).toBe(1)
    expect(estimateTokens('中')).toBe(1)
  })

  it('6. odd-length string rounds up', () => {
    expect(estimateTokens('ABC')).toBe(2) // ceil(3/2) = 2
  })
})
