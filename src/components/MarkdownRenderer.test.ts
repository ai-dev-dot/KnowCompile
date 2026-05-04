// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { stripLeadingFrontmatter, convertWikiLinks } from './MarkdownRenderer'

describe('stripLeadingFrontmatter', () => {
  it('removes standard YAML frontmatter', () => {
    const input = [
      '---',
      'type: concept',
      'tags: [AI]',
      '---',
      '',
      '# 标题',
      '内容。',
    ].join('\n')
    const result = stripLeadingFrontmatter(input)
    expect(result).not.toContain('type:')
    expect(result).toContain('# 标题')
    expect(result).toContain('内容。')
  })

  it('returns unchanged text without frontmatter', () => {
    const text = '# 直接标题\n\n内容。'
    expect(stripLeadingFrontmatter(text)).toBe(text)
  })

  it('does not strip --- dividers in body', () => {
    const input = [
      '# 标题',
      '',
      '内容',
      '---',
      '更多内容',
    ].join('\n')
    const result = stripLeadingFrontmatter(input)
    expect(result).toBe(input)
  })

  it('does not strip --- without YAML key:value', () => {
    const input = [
      '---',
      '这不是 YAML',
      '---',
      '',
      '# 标题',
    ].join('\n')
    const result = stripLeadingFrontmatter(input)
    expect(result).toBe(input)
  })

  it('handles empty input', () => {
    expect(stripLeadingFrontmatter('')).toBe('')
  })
})

describe('convertWikiLinks', () => {
  it('converts [[page]] to markdown link', () => {
    const result = convertWikiLinks('看 [[机器学习]] 页面')
    expect(result).toContain('[机器学习]')
    expect(result).toContain('#wiki:')
    expect(result).toContain(encodeURIComponent('机器学习'))
  })

  it('converts multiple wiki links', () => {
    const result = convertWikiLinks('[[A]] 和 [[B]]')
    expect(result).toContain('[A]')
    expect(result).toContain('[B]')
  })

  it('skips wiki links inside fenced code blocks', () => {
    const input = '```\n[[代码块中的链接]]\n```\n\n正文 [[真正的链接]]'
    const result = convertWikiLinks(input)
    expect(result).toContain('[[代码块中的链接]]')
    expect(result).toContain('[真正的链接]')
  })

  it('returns text unchanged when no wiki links', () => {
    const text = '普通 [markdown](url) 链接'
    expect(convertWikiLinks(text)).toBe(text)
  })

  it('handles empty input', () => {
    expect(convertWikiLinks('')).toBe('')
  })
})
