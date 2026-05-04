// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '../test-utils/render'
import {
  stripLeadingFrontmatter,
  convertWikiLinks,
  default as MarkdownRenderer,
} from './MarkdownRenderer'

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

describe('MarkdownRenderer — images', () => {
  it('renders image with absolute http URL as-is', async () => {
    const content = '![test](https://example.com/photo.png)'
    render(<MarkdownRenderer content={content} />)
    await waitFor(() => {
      const img = document.querySelector('img')
      expect(img).toBeTruthy()
      expect(img!.src).toBe('https://example.com/photo.png')
    })
  })

  it('shows alt text when kbPath is not provided for relative path', async () => {
    render(<MarkdownRenderer content="![local image](images/photo.png)" />)
    await waitFor(() => {
      expect(screen.getByText('local image')).toBeDefined()
    })
  })

  it('resolves relative image path via IPC with kbPath', async () => {
    const fakeDataURL = 'data:image/png;base64,fake'
    const invokeSpy = vi.fn().mockResolvedValue({ success: true, data: fakeDataURL })
    const origInvoke = (window as any).electronAPI.invoke
    ;(window as any).electronAPI.invoke = invokeSpy

    render(
      <MarkdownRenderer content="![screenshot](images/screenshot.png)" kbPath="/fake/kb" />,
    )

    await waitFor(() => {
      const img = document.querySelector('img')
      expect(img).toBeTruthy()
      expect(img!.src).toBe(fakeDataURL)
    })

    expect(invokeSpy).toHaveBeenCalledWith('assets:read', '/fake/kb', 'raw/images/screenshot.png')
    ;(window as any).electronAPI.invoke = origInvoke
  })

  it('renders images with custom styling classes', async () => {
    render(<MarkdownRenderer content="![test](https://example.com/img.png)" />)
    await waitFor(() => {
      const img = document.querySelector('img')
      expect(img).toBeTruthy()
      expect(img!.className).toContain('max-w-full')
      expect(img!.className).toContain('rounded-lg')
    })
  })
})
