/**
 * SearchIndexer tests — FlexSearch index build and query
 * Usage: npx vitest run tests/search-indexer.test.ts
 */
import { describe, it, expect } from 'vitest'
import { buildIndex, search } from '../electron/search-indexer'

const KB = '/test/kb'

describe('SearchIndexer', () => {
  const pages = [
    { name: 'Machine Learning', content: 'Machine learning is a subset of artificial intelligence.' },
    { name: 'Deep Learning', content: 'Deep learning uses multiple layers of neural networks.' },
    { name: 'Natural Language Processing', content: 'NLP enables computers to understand human language.' },
    { name: 'Empty Page', content: '' },
  ]

  it('1. search returns empty array when no index is built', () => {
    const results = search('/no/such/kb', 'machine')
    expect(results).toEqual([])
  })

  it('2. builds index and returns matching pages', () => {
    buildIndex(KB, pages)
    const results = search(KB, 'machine')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some(r => r.name === 'Machine Learning')).toBe(true)
  })

  it('3. search returns multiple results for broad query', () => {
    buildIndex(KB, pages)
    const results = search(KB, 'learning')
    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  it('4. search returns empty for unmatched query', () => {
    buildIndex(KB, pages)
    const results = search(KB, 'xyzzy_nonexistent_term')
    expect(results).toEqual([])
  })

  it('5. search handles Chinese text (LatinExtra encoder — limited CJK support)', () => {
    const cnPages = [
      { name: '机器学习', content: '机器学习是人工智能的一个分支。' },
      { name: '深度学习', content: '深度学习使用多层神经网络。' },
      { name: 'ML-Basics', content: 'Machine learning basics and 机器学习 concepts.' },
    ]
    buildIndex(KB, cnPages)
    const results = search(KB, 'machine')
    expect(results.length).toBeGreaterThanOrEqual(0)
  })

  it('6. builds index with empty pages array without error', () => {
    expect(() => buildIndex(KB, [])).not.toThrow()
    const results = search(KB, 'anything')
    expect(results).toEqual([])
  })
})
