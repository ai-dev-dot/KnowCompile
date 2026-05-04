// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../test-utils/render'
import IconSidebar from './IconSidebar'

describe('IconSidebar', () => {
  it('renders all 7 navigation items', () => {
    render(<IconSidebar active="qa" onChange={() => {}} />)
    expect(screen.getByText('问答')).toBeDefined()
    expect(screen.getByText('Wiki')).toBeDefined()
    expect(screen.getByText('摄入')).toBeDefined()
    expect(screen.getByText('图谱')).toBeDefined()
    expect(screen.getByText('设置')).toBeDefined()
    expect(screen.getByText('日志')).toBeDefined()
    expect(screen.getByText('系统')).toBeDefined()
  })

  it('highlights the active view', () => {
    render(<IconSidebar active="wiki" onChange={() => {}} />)
    const wikiBtn = screen.getByTitle('Wiki')
    expect(wikiBtn.className).toContain('text-white')
  })

  it('calls onChange when a nav item is clicked', () => {
    const onChange = vi.fn()
    render(<IconSidebar active="qa" onChange={onChange} />)
    fireEvent.click(screen.getByTitle('Wiki'))
    expect(onChange).toHaveBeenCalledWith('wiki')
  })

  it('renders app logo KC', () => {
    render(<IconSidebar active="qa" onChange={() => {}} />)
    expect(screen.getByText('KC')).toBeDefined()
  })
})
