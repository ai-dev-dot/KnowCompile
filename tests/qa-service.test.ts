/**
 * QAService pure-function tests — ranking logic and helpers
 * from the 7-step semantic QA pipeline.
 *
 * Usage: npx vitest run tests/qa-service.test.ts
 */
import { describe, it, expect } from 'vitest'
import { distanceToSimilarity } from '../electron/vector-utils'
import { estimateTokens, isArchiveCandidate, parseArchiveVerdict, parseReviewVerdict } from '../electron/qa-service'

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

// ==========================================================================
// isArchiveCandidate — pre-filter for LLM archive check
// ==========================================================================

describe('isArchiveCandidate', () => {
  const sources = [{ title: '机器学习', chunk_index: 0, similarity: 0.9 }]

  it('1. good candidate: long answer with sources', () => {
    expect(isArchiveCandidate('A'.repeat(200), sources)).toBe(true)
  })

  it('2. rejects short answer (<100 chars)', () => {
    expect(isArchiveCandidate('短答案', sources)).toBe(false)
  })

  it('3. rejects answer with no sources', () => {
    expect(isArchiveCandidate('A'.repeat(200), [])).toBe(false)
  })

  it('4. rejects KB-decline: contains 未找到', () => {
    expect(isArchiveCandidate('资料中未找到相关内容', sources)).toBe(false)
  })

  it('5. rejects KB-decline: contains 无法回答', () => {
    expect(isArchiveCandidate('当前知识库无法回答该问题', sources)).toBe(false)
  })

  it('6. rejects KB-decline: contains 未提供', () => {
    expect(isArchiveCandidate('参考资料未提供相关信息', sources)).toBe(false)
  })

  it('7. accepts answer at exactly 100 chars', () => {
    expect(isArchiveCandidate('A'.repeat(100), sources)).toBe(true)
  })

  it('8. rejects answer at 99 chars', () => {
    expect(isArchiveCandidate('A'.repeat(99), sources)).toBe(false)
  })
})

// ==========================================================================
// parseArchiveVerdict — extract ARCHIVE verdict from LLM response
// ==========================================================================

describe('parseArchiveVerdict', () => {
  it('1. ARCHIVE: YES → true', () => {
    expect(parseArchiveVerdict('ARCHIVE: YES — 包含有价值的综合对比')).toBe(true)
  })

  it('2. ARCHIVE: NO → false', () => {
    expect(parseArchiveVerdict('ARCHIVE: NO — 仅复述已有信息')).toBe(false)
  })

  it('3. case insensitive', () => {
    expect(parseArchiveVerdict('archive: yes')).toBe(true)
    expect(parseArchiveVerdict('Archive: No')).toBe(false)
  })

  it('4. ARCHIVE:YES without space', () => {
    expect(parseArchiveVerdict('ARCHIVE:YES')).toBe(true)
  })

  it('5. empty response → false', () => {
    expect(parseArchiveVerdict('')).toBe(false)
  })

  it('6. missing ARCHIVE line → false', () => {
    expect(parseArchiveVerdict('PASS\nSome other text')).toBe(false)
  })
})

// ==========================================================================
// parseReviewVerdict — extract PASS/FAIL + ARCHIVE from review response
// ==========================================================================

describe('parseReviewVerdict', () => {
  it('1. PASS + ARCHIVE YES', () => {
    const result = parseReviewVerdict('PASS\nARCHIVE: YES — good synthesis')
    expect(result.passed).toBe(true)
    expect(result.archiveWorthy).toBe(true)
  })

  it('2. FAIL + ARCHIVE NO', () => {
    const result = parseReviewVerdict('FAIL: 编造了来源中不存在的数据\nARCHIVE: NO')
    expect(result.passed).toBe(false)
    expect(result.archiveWorthy).toBe(false)
  })

  it('3. PASS but ARCHIVE NO', () => {
    const result = parseReviewVerdict('PASS\nARCHIVE: NO — 仅重复已知信息')
    expect(result.passed).toBe(true)
    expect(result.archiveWorthy).toBe(false)
  })

  it('4. handles extra whitespace around PASS', () => {
    expect(parseReviewVerdict('  PASS  \nARCHIVE: YES').passed).toBe(true)
  })

  it('5. handles multi-line review feedback', () => {
    const response = [
      'PASS',
      'ARCHIVE: YES — 回答综合了三个来源的信息',
      '提供了卷积神经网络在图像和文本领域的对比',
    ].join('\n')
    const result = parseReviewVerdict(response)
    expect(result.passed).toBe(true)
    expect(result.archiveWorthy).toBe(true)
  })

  it('6. FAIL with description → passed=false', () => {
    const result = parseReviewVerdict('FAIL: 回答中引用了来源外的事实')
    expect(result.passed).toBe(false)
    expect(result.archiveWorthy).toBe(false)
  })
})
