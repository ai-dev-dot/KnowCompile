// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../test-utils/render'
import ChatMessage from './ChatMessage'

const sources = [
  { title: '机器学习', chunk_index: 0, similarity: 0.95 },
  { title: '深度学习', chunk_index: 1, similarity: 0.87 },
]

describe('ChatMessage', () => {
  it('renders user message right-aligned', () => {
    const { container } = render(<ChatMessage role="user" content="你好" />)
    const wrapper = container.firstElementChild!
    expect(wrapper.className).toContain('justify-end')
  })

  it('renders assistant message left-aligned', () => {
    const { container } = render(<ChatMessage role="assistant" content="你好！" />)
    const wrapper = container.firstElementChild!
    expect(wrapper.className).toContain('justify-start')
  })

  it('shows thinking section when thinking prop is provided', () => {
    render(<ChatMessage role="assistant" content="回答" thinking="推理中..." />)
    expect(screen.getByText('推理过程')).toBeDefined()
    expect(screen.getByText('推理中...')).toBeDefined()
  })

  it('does not show thinking section for user messages', () => {
    render(<ChatMessage role="user" content="问题" thinking="不应该显示" />)
    expect(screen.queryByText('推理过程')).toBeNull()
  })

  it('shows partial marker when partial=true', () => {
    render(<ChatMessage role="assistant" content="部分回答" partial />)
    expect(screen.getByText('已停止生成')).toBeDefined()
  })

  it('does not show partial marker by default', () => {
    render(<ChatMessage role="assistant" content="完整回答" />)
    expect(screen.queryByText('已停止生成')).toBeNull()
  })

  it('renders sources as numbered list', () => {
    render(<ChatMessage role="assistant" content="回答" sources={sources} msgIndex={0} />)
    expect(screen.getByText('信息来源：')).toBeDefined()
    expect(screen.getByText(/机器学习/)).toBeDefined()
    expect(screen.getByText(/深度学习/)).toBeDefined()
  })

  it('renders follow-up suggestions and handles click', () => {
    const onSuggestionClick = vi.fn()
    render(
      <ChatMessage
        role="assistant"
        content="回答"
        suggestions={['什么是CNN？', '什么是RNN？']}
        onSuggestionClick={onSuggestionClick}
      />
    )
    expect(screen.getByText('什么是CNN？')).toBeDefined()
    fireEvent.click(screen.getByText('什么是RNN？'))
    expect(onSuggestionClick).toHaveBeenCalledWith('什么是RNN？')
  })

  it('renders feedback buttons for assistant', () => {
    const onFeedback = vi.fn()
    render(<ChatMessage role="assistant" content="回答" onFeedback={onFeedback} />)
    expect(screen.getByText('有帮助')).toBeDefined()
    expect(screen.getByText('不准确')).toBeDefined()
    expect(screen.getByText('需更详细')).toBeDefined()
  })

  it('shows feedback state for selected button', () => {
    render(<ChatMessage role="assistant" content="回答" onFeedback={() => {}} feedbackState="helpful" />)
    expect(screen.getByText('✓ 有帮助')).toBeDefined()
  })

  it('calls onFeedback when a button is clicked', () => {
    const onFeedback = vi.fn()
    render(<ChatMessage role="assistant" content="回答" onFeedback={onFeedback} />)
    fireEvent.click(screen.getByText('不准确'))
    expect(onFeedback).toHaveBeenCalledWith('inaccurate')
  })

  it('renders archive button and shows suggestArchive state', () => {
    const onArchive = vi.fn()
    render(<ChatMessage role="assistant" content="回答" onArchive={onArchive} suggestArchive />)
    expect(screen.getByText('建议归档')).toBeDefined()
  })

  it('shows archived state', () => {
    render(<ChatMessage role="assistant" content="回答" onArchive={() => {}} archived />)
    expect(screen.getByText('已归档')).toBeDefined()
  })

  it('does not show feedback buttons for user messages', () => {
    render(<ChatMessage role="user" content="问题" onFeedback={() => {}} />)
    expect(screen.queryByText('有帮助')).toBeNull()
  })
})
