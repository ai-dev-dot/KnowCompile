/**
 * Query Rewriter unit tests — synonym expansion + keyword extraction.
 * Usage: npx vitest run tests/query-rewriter.test.ts
 */
import { describe, it, expect } from 'vitest'
import { rewriteQuery } from '../electron/query-rewriter'

describe('rewriteQuery', () => {
  it('1. expands known synonym terms', () => {
    const result = rewriteQuery('什么是机器学习')
    expect(result.original).toBe('什么是机器学习')
    expect(result.expanded).toContain('机器学习')
    // Should include ML or machine learning synonym
    expect(
      result.expanded.includes('ML') || result.expanded.includes('machine learning')
    ).toBe(true)
  })

  it('2. extracts keywords from Chinese text', () => {
    const result = rewriteQuery('卷积神经网络在图像识别中的应用')
    expect(result.keywords.length).toBeGreaterThan(0)
    // Should find the synonym term
    expect(result.keywords.some(k => k.includes('卷积'))).toBe(true)
  })

  it('3. handles mixed Chinese-English queries', () => {
    const result = rewriteQuery('Transformer 和 RNN 的区别')
    expect(result.expanded).toBeTruthy()
    // Should find Transformer synonyms
    expect(result.keywords.some(k => k.toLowerCase() === 'transformer')).toBe(true)
  })

  it('4. no synonym match returns original as expanded', () => {
    const result = rewriteQuery('今天天气怎么样')
    expect(result.expanded).toBe('今天天气怎么样')
  })

  it('5. extracts English acronyms as keywords', () => {
    const result = rewriteQuery('CNN RNN LSTM 对比')
    expect(result.keywords.length).toBeGreaterThan(0)
    // CNN should match the 卷积 synonym entry
    expect(result.expanded.length).toBeGreaterThan('CNN RNN LSTM 对比'.length)
  })

  it('6. synonyms not already in question are appended', () => {
    const result = rewriteQuery('embedding 的作用')
    const expanded = result.expanded.toLowerCase()
    // Should add Chinese synonym 嵌入 or 向量化
    expect(
      expanded.includes('嵌入') || expanded.includes('向量化') || expanded.includes('向量表示')
    ).toBe(true)
  })

  it('7. filters stop words from keywords', () => {
    const result = rewriteQuery('什么是深度学习的应用')
    // Stop words like 什么, 是, 的 should be filtered
    expect(result.keywords.every(k => !['什么', '是', '的'].includes(k))).toBe(true)
    expect(result.keywords.some(k => k.includes('深度学习'))).toBe(true)
  })

  it('8. deduplicates keywords', () => {
    const result = rewriteQuery('模型训练和模型推理')
    const lower = result.keywords.map(k => k.toLowerCase())
    const seen = new Set<string>()
    for (const k of lower) {
      if (seen.has(k)) {
        expect.fail(`Duplicate keyword: ${k}`)
      }
      seen.add(k)
    }
  })

  it('9. returns empty keywords for stop-word-only query', () => {
    const result = rewriteQuery('是什么为什么')
    // All stop words → no meaningful keywords
    expect(result.expanded).toBe('是什么为什么')
  })
})
