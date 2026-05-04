// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { stripThinking, extractThinking } from '../electron/utils'

describe('stripThinking', () => {
  it('removes <think> blocks', () => {
    const result = stripThinking('前面<think>推理过程</think>后面')
    expect(result).toBe('前面后面')
  })

  it('handles multiple think blocks', () => {
    const result = stripThinking('<think>A</think>中间<think>B</think>')
    expect(result).toBe('中间')
  })

  it('removes think tags with spaces', () => {
    const result = stripThinking('< think >内容</ think >')
    expect(result).toBe('')
  })

  it('returns unchanged text without think tags', () => {
    expect(stripThinking('普通文本')).toBe('普通文本')
  })

  it('handles empty input', () => {
    expect(stripThinking('')).toBe('')
  })

  it('strips multiline think blocks', () => {
    const result = stripThinking('<think>\n第一行\n第二行\n</think>')
    expect(result).toBe('')
  })

  it('is case insensitive', () => {
    const result = stripThinking('<THINK>推理</THINK>')
    expect(result).toBe('')
  })
})

describe('extractThinking', () => {
  it('extracts content from think blocks', () => {
    const result = extractThinking('<think>推理内容</think>')
    expect(result).toBe('推理内容')
  })

  it('returns empty string when no think tags', () => {
    expect(extractThinking('普通文本')).toBe('')
  })

  it('concatenates multiple think blocks', () => {
    const result = extractThinking('<think>A</think>\n<think>B</think>')
    expect(result).toBe('A\nB')
  })

  it('handles think tags with whitespace', () => {
    // Regex allows spaces inside brackets: < think > ... </ think >
    // But NOT between < and / in closing tag: </think> not < /think>
    const result = extractThinking('< think > 内容 </ think >')
    expect(result).toBe('内容')
  })
})
