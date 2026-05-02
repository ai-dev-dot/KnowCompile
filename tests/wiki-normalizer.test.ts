/**
 * WikiNormalizer tests — content normalization before persistence
 * Usage: npx vitest run tests/wiki-normalizer.test.ts
 */
import { describe, it, expect } from 'vitest'
import { normalizeWikiPage } from '../electron/wiki-normalizer'

describe('normalizeWikiPage', () => {
  it('passes through clean content unchanged', () => {
    const input = [
      '---',
      'type: concept',
      'tags: [AI]',
      'sources: [test.md]',
      'updated: 2026-05-01',
      '---',
      '',
      '# Test Page',
      '',
      'Content here.',
    ].join('\n')
    const result = normalizeWikiPage(input)
    expect(result).toContain('# Test Page')
    expect(result).toContain('type: concept')
    expect(result).toContain('Content here.')
  })

  it('strips <think> tags', () => {
    const input = [
      '---',
      'type: concept',
      'tags: [AI]',
      'sources: [test.md]',
      'updated: 2026-05-01',
      '---',
      '',
      '<think>This is internal reasoning that leaked</think>',
      '',
      '# Test',
      '',
      'Real content.',
    ].join('\n')
    const result = normalizeWikiPage(input)
    expect(result).not.toContain('<think>')
    expect(result).not.toContain('internal reasoning')
    expect(result).toContain('# Test')
    expect(result).toContain('Real content.')
  })

  it('strips code fence wrapping around entire page', () => {
    const input = [
      '```markdown',
      '---',
      'type: concept',
      'tags: [AI]',
      'sources: [test.md]',
      'updated: 2026-05-01',
      '---',
      '',
      '# Test',
      '',
      'Content.',
      '```',
    ].join('\n')
    const result = normalizeWikiPage(input)
    expect(result).not.toContain('```markdown')
    expect(result).not.toMatch(/\n```\s*$/)
    expect(result).toContain('# Test')
    expect(result).toContain('type: concept')
  })

  it('removes trailing YAML frontmatter block', () => {
    const input = [
      '---',
      'type: concept',
      'tags: [AI]',
      'sources: [test.md]',
      'updated: 2026-05-01',
      '---',
      '',
      '# Test',
      '',
      'Good content.',
      '',
      '---',
      'type: concept',
      'tags: [leaked, duplicate]',
      'sources: [test.md]',
      'updated: 2026-05-01',
      '---',
    ].join('\n')
    const result = normalizeWikiPage(input)
    expect(result).toContain('Good content.')
    expect(result).not.toContain('leaked, duplicate')
    // Should have exactly one frontmatter block
    const fmCount = (result.match(/^---$/gm) || []).length
    expect(fmCount).toBe(2) // opening and closing of the single frontmatter
  })

  it('removes trailing standalone --- dividers', () => {
    const input = [
      '---',
      'type: concept',
      'tags: [AI]',
      'sources: [test.md]',
      'updated: 2026-05-01',
      '---',
      '',
      '# Test',
      '',
      'Content.',
      '',
      '---',
    ].join('\n')
    const result = normalizeWikiPage(input)
    expect(result).not.toMatch(/---\s*$/)
  })

  it('handles content without frontmatter gracefully', () => {
    const input = '# Just a title\n\nSome content.'
    const result = normalizeWikiPage(input)
    expect(result).toContain('# Just a title')
    expect(result).toContain('Some content.')
  })

  it('collapses excessive blank lines', () => {
    const input = [
      '---',
      'type: concept',
      'tags: [AI]',
      'sources: [test.md]',
      'updated: 2026-05-01',
      '---',
      '',
      '# Test',
      '',
      '',
      '',
      '',
      'Para 1.',
      '',
      '',
      '',
      'Para 2.',
    ].join('\n')
    const result = normalizeWikiPage(input)
    // Should not have 3+ consecutive newlines in body
    expect(result).not.toMatch(/\n{3,}/)
    expect(result).toContain('Para 1.')
    expect(result).toContain('Para 2.')
  })

  it('is idempotent (running twice preserves all key content)', () => {
    const input = [
      '---',
      'type: concept',
      'tags: [AI]',
      'sources: [test.md]',
      'updated: 2026-05-01',
      '---',
      '',
      '# Test',
      '',
      'Content.',
    ].join('\n')
    const first = normalizeWikiPage(input)
    const second = normalizeWikiPage(first)
    // Key invariants preserved across both calls
    expect(first).toContain('type: concept')
    expect(first).toContain('# Test')
    expect(first).toContain('Content.')
    expect(second).toContain('type: concept')
    expect(second).toContain('# Test')
    expect(second).toContain('Content.')
    // Frontmatter present exactly once in both
    expect(first.match(/^type:/m)).toBeTruthy()
    expect(second.match(/^type:/m)).toBeTruthy()
  })
})
