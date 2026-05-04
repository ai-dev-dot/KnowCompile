// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../test-utils/render'
import PageList from './PageList'

const pages = [
  { name: '机器学习', path: '/kb/wiki/机器学习.md', modifiedAt: '2026-05-01' },
  { name: '深度学习', path: '/kb/wiki/深度学习.md', modifiedAt: '2026-05-02' },
  { name: 'NLP', path: '/kb/wiki/NLP.md', modifiedAt: '2026-05-03' },
]

describe('PageList', () => {
  it('renders all pages', () => {
    render(<PageList title="Wiki 页面" pages={pages} onSelect={() => {}} />)
    expect(screen.getByText('机器学习')).toBeDefined()
    expect(screen.getByText('深度学习')).toBeDefined()
    expect(screen.getByText('NLP')).toBeDefined()
  })

  it('renders the title', () => {
    render(<PageList title="测试标题" pages={pages} onSelect={() => {}} />)
    expect(screen.getByText('测试标题')).toBeDefined()
  })

  it('shows empty state when no pages', () => {
    render(<PageList title="空列表" pages={[]} onSelect={() => {}} />)
    expect(screen.getByText('暂无页面')).toBeDefined()
  })

  it('highlights active page', () => {
    render(<PageList title="列表" pages={pages} activePage="/kb/wiki/深度学习.md" onSelect={() => {}} />)
    const activeBtn = screen.getByText('深度学习')
    expect(activeBtn.className).toContain('text-white')
  })

  it('calls onSelect when a page is clicked', () => {
    const onSelect = vi.fn()
    render(<PageList title="列表" pages={pages} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('NLP', { exact: true }))
    expect(onSelect).toHaveBeenCalledWith(pages[2])
  })

  it('renders children slot', () => {
    render(
      <PageList title="列表" pages={pages} onSelect={() => {}}>
        <div data-testid="child">子内容</div>
      </PageList>
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })
})
