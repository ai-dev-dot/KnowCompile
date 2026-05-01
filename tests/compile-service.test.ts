/**
 * CompileService pure-function tests — unit tests for helper functions
 * extracted from the 5-step incremental compile pipeline.
 *
 * Usage: npx vitest run tests/compile-service.test.ts
 */
import { describe, it, expect } from 'vitest'
import { distanceToSimilarity } from '../electron/vector-utils'
import {
  splitWikiPages,
  parsePlanJson,
} from '../electron/compile-service'

// ==========================================================================
// distanceToSimilarity — L2 distance → cosine similarity for unit-norm vectors
// ==========================================================================

describe('distanceToSimilarity', () => {
  it('1. zero distance → similarity 1 (identical vectors)', () => {
    expect(distanceToSimilarity(0)).toBe(1)
  })

  it('2. distance sqrt(2) ≈ 1.414 → similarity 0 (orthogonal)', () => {
    const d = Math.sqrt(2)
    const sim = distanceToSimilarity(d)
    expect(sim).toBeCloseTo(0, 5)
  })

  it('3. distance 2 → similarity 0 (opposite vectors, clamped at 0)', () => {
    expect(distanceToSimilarity(2)).toBe(0)
  })

  it('4. distance > 2 → similarity 0 (clamped at 0)', () => {
    expect(distanceToSimilarity(3)).toBe(0)
    expect(distanceToSimilarity(10)).toBe(0)
  })

  it('5. typical values yield reasonable similarities', () => {
    const sim = distanceToSimilarity(0.5)
    expect(sim).toBeCloseTo(1 - (0.5 * 0.5) / 2, 5) // 0.875
    expect(sim).toBeGreaterThan(0.8)
  })
})

// ==========================================================================
// splitWikiPages — split multi-page LLM output into individual page objects
// ==========================================================================

describe('splitWikiPages', () => {
  it('1. splits a single page by its # title', () => {
    const output = [
      '---',
      'type: concept',
      'tags: [AI]',
      'sources: [s.md]',
      '---',
      '',
      '# Machine Learning',
      '',
      '> 来源：s.md',
      '',
      '## 定义',
      '',
      'A definition.',
      '',
      '## 相关主题',
      '',
      '- [[Deep Learning]]',
    ].join('\n')

    const pages = splitWikiPages(output)
    expect(pages).toHaveLength(1)
    expect(pages[0].title).toBe('Machine Learning')
    expect(pages[0].content).toContain('# Machine Learning')
    expect(pages[0].content).toContain('## 定义')
  })

  it('2. splits multiple pages correctly', () => {
    const output = [
      '---',
      'type: concept',
      '---',
      '',
      '# Page A',
      '',
      'Content of A.',
      '',
      '---',
      'type: concept',
      '---',
      '',
      '# Page B',
      '',
      'Content of B.',
    ].join('\n')

    const pages = splitWikiPages(output)
    expect(pages).toHaveLength(2)
    expect(pages[0].title).toBe('Page A')
    expect(pages[1].title).toBe('Page B')
  })

  it('3. skips Wiki 索引 / index pages', () => {
    const output = [
      '# Wiki 索引',
      '',
      'Index content.',
      '',
      '# Real Page',
      '',
      'Real content.',
    ].join('\n')

    const pages = splitWikiPages(output)
    expect(pages).toHaveLength(1)
    expect(pages[0].title).toBe('Real Page')
  })

  it('4. skips "Wiki Index" (English) index pages', () => {
    const output = [
      '# wiki index',
      '',
      'Index content.',
      '',
      '# Real Page',
      '',
      'Real content.',
    ].join('\n')

    const pages = splitWikiPages(output)
    expect(pages).toHaveLength(1)
    expect(pages[0].title).toBe('Real Page')
  })

  it('5. skips "index" pages (lowercase)', () => {
    const output = [
      '# index',
      '',
      'Index content.',
      '',
      '# Real Page',
      '',
      'Real content.',
    ].join('\n')

    const pages = splitWikiPages(output)
    expect(pages).toHaveLength(1)
    expect(pages[0].title).toBe('Real Page')
  })

  it('6. returns empty array for content with no h1 headings', () => {
    const output = 'Just some text\n\nWithout any headings.'
    const pages = splitWikiPages(output)
    expect(pages).toHaveLength(0)
  })

  it('7. prepends orphan frontmatter to the following page', () => {
    // Frontmatter before the first # Title is now merged with that page.
    const output = [
      '---',
      'type: concept',
      'tags: [AI]',
      '---',
      '',
      '# Test Page',
      '',
      'Content.',
    ].join('\n')

    const pages = splitWikiPages(output)
    expect(pages).toHaveLength(1)
    expect(pages[0].title).toBe('Test Page')
    // Frontmatter IS included — merged from the orphan section
    expect(pages[0].content).toContain('type: concept')
    expect(pages[0].content).toContain('---')
  })
})

// ==========================================================================
// parsePlanJson — extract CompilePlan JSON from LLM response text
// ==========================================================================

describe('parsePlanJson', () => {
  const validPlan = {
    updates: [{ page: 'Existing Page', sections: '## 核心内容', reason: 'New info' }],
    new_pages: [{ title: 'New Page', reason: 'New concept' }],
    conflicts: [{ target_page: 'Existing Page', description: 'Contradiction', source1: 'A', source2: 'B', suggested_resolution: 'Use A' }],
  }

  it('1. parses JSON from ```json fenced code block', () => {
    const text = '```json\n' + JSON.stringify(validPlan, null, 2) + '\n```'
    const result = parsePlanJson(text)
    expect(result).not.toBeNull()
    expect(result!.updates).toHaveLength(1)
    expect(result!.new_pages).toHaveLength(1)
    expect(result!.conflicts).toHaveLength(1)
  })

  it('2. parses JSON from bare ``` fenced code block (no json tag)', () => {
    const text = '```\n' + JSON.stringify(validPlan) + '\n```'
    const result = parsePlanJson(text)
    expect(result).not.toBeNull()
    expect(result!.new_pages[0].title).toBe('New Page')
  })

  it('3. parses raw JSON object without fences', () => {
    const text = JSON.stringify(validPlan)
    const result = parsePlanJson(text)
    expect(result).not.toBeNull()
    expect(result!.updates[0].page).toBe('Existing Page')
  })

  it('4. strips <think> tags before parsing', () => {
    const text = '<think>Some reasoning</think>\n' + JSON.stringify(validPlan)
    const result = parsePlanJson(text)
    expect(result).not.toBeNull()
    expect(result!.new_pages).toHaveLength(1)
  })

  it('5. strips <think> tags with attributes/whitespace', () => {
    const text = '< think >Some reasoning</ think >\n' + JSON.stringify(validPlan)
    const result = parsePlanJson(text)
    expect(result).not.toBeNull()
  })

  it('6. returns null for text with no JSON', () => {
    const result = parsePlanJson('Just some random text without any JSON braces.')
    expect(result).toBeNull()
  })

  it('7. returns null for malformed JSON', () => {
    const result = parsePlanJson('{ "updates": [ { "page": "Test" ] }')
    expect(result).toBeNull()
  })

  it('8. extracts JSON from text with surrounding prose', () => {
    const text = 'Here is the plan:\n\n' + JSON.stringify(validPlan) + '\n\nHope that works!'
    const result = parsePlanJson(text)
    expect(result).not.toBeNull()
    expect(result!.updates).toHaveLength(1)
  })

  it('9. handles nested braces in JSON values', () => {
    const planWithNested = {
      updates: [{ page: 'Test', sections: 'Intro {see note}', reason: 'N/A' }],
      new_pages: [],
      conflicts: [],
    }
    const text = JSON.stringify(planWithNested)
    const result = parsePlanJson(text)
    expect(result).not.toBeNull()
    expect(result!.updates[0].sections).toBe('Intro {see note}')
  })

  it('10. returns empty arrays for missing plan fields', () => {
    const text = '```json\n{ "updates": [], "new_pages": [] }\n```'
    const result = parsePlanJson(text)
    expect(result).not.toBeNull()
    // conflicts is missing from JSON but the caller ensures defaults
    expect(result!.updates).toEqual([])
    expect(result!.new_pages).toEqual([])
  })
})
