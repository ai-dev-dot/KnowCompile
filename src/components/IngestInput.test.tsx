// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../test-utils/render'
import IngestInput from './IngestInput'

describe('IngestInput', () => {
  it('renders drop zone by default', () => {
    render(<IngestInput onFilesDrop={() => {}} onTextPaste={() => {}} onURLSubmit={() => {}} />)
    expect(screen.getByText('拖放 Markdown 文件到此处')).toBeDefined()
  })

  it('switches to text paste mode and submits', () => {
    const onTextPaste = vi.fn()
    render(<IngestInput onFilesDrop={() => {}} onTextPaste={onTextPaste} onURLSubmit={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /粘贴文本/ }))
    const textarea = document.querySelector('textarea')!
    fireEvent.change(textarea, { target: { value: '# 测试文本' } })
    fireEvent.click(screen.getByText('导入文本'))

    expect(onTextPaste).toHaveBeenCalledWith('# 测试文本')
  })

  it('shows URL input form and disables submit when empty', () => {
    render(<IngestInput onFilesDrop={() => {}} onTextPaste={() => {}} onURLSubmit={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /网页链接/ }))
    const submitBtn = screen.getByText('抓取网页')
    expect(submitBtn.closest('button')!.disabled).toBe(true)
  })

  it('calls onURLSubmit with URL', () => {
    const onURLSubmit = vi.fn()
    render(<IngestInput onFilesDrop={() => {}} onTextPaste={() => {}} onURLSubmit={onURLSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: /网页链接/ }))
    const input = document.querySelector('input[type="url"]')!
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByText('抓取网页'))

    expect(onURLSubmit).toHaveBeenCalledWith('https://example.com')
  })

  it('tab buttons are rendered', () => {
    render(<IngestInput onFilesDrop={() => {}} onTextPaste={() => {}} onURLSubmit={() => {}} />)
    expect(screen.getByRole('button', { name: /拖放文件/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /粘贴文本/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /网页链接/ })).toBeDefined()
  })

  it('renders browse button', () => {
    render(<IngestInput onFilesDrop={() => {}} onTextPaste={() => {}} onURLSubmit={() => {}} />)
    expect(screen.getByText('选择 Markdown 文件')).toBeDefined()
  })

  it('passes FileEntry[] to onFilesDrop when files are selected', () => {
    const onFilesDrop = vi.fn()
    render(<IngestInput onFilesDrop={onFilesDrop} onTextPaste={() => {}} onURLSubmit={() => {}} />)

    // Simulate file selection via the hidden file input
    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).toBeTruthy()

    // Create a mock file
    const mockFile = new File(['test content'], 'test.md', { type: 'text/markdown' })
    Object.defineProperty(mockFile, 'path', { value: '/fake/path/test.md' })

    fireEvent.change(fileInput!, { target: { files: [mockFile] } })

    // onFilesDrop should have been called with FileEntry[]
    expect(onFilesDrop).toHaveBeenCalled()
    const entries = onFilesDrop.mock.calls[0][0]
    expect(Array.isArray(entries)).toBe(true)
    expect(entries[0]).toHaveProperty('absolutePath')
    expect(entries[0].relativePath).toBe('test.md')
  })
})
