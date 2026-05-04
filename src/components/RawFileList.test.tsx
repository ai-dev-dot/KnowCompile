// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test-utils/render'
import { createMockIPC } from '../test-utils/mock-ipc'
import RawFileList, { type RawFile } from './RawFileList'

const fakeFiles: RawFile[] = [
  { name: 'doc.md', path: '/fake/kb/raw/doc.md', size: 1024, addedAt: '2026-01-01' },
  { name: 'photo.png', path: '/fake/kb/raw/photo.png', size: 2048, addedAt: '2026-01-01' },
  { name: 'icon.jpg', path: '/fake/kb/raw/icon.jpg', size: 512, addedAt: '2026-01-01' },
]

function renderList(overrides: Partial<{
  files: RawFile[]
  statuses: Record<string, any>
}> = {}) {
  const mockIPC = createMockIPC()
  // Stub raw:read for preview
  mockIPC.readRawFile = vi.fn().mockResolvedValue('file content')
  // Stub the generic invoke for assets:read calls
  mockIPC.invoke = vi.fn().mockResolvedValue({ success: false })
  ;(window as any).electronAPI.invoke = mockIPC.invoke

  return render(
    <RawFileList
      kbPath="/fake/kb"
      files={overrides.files ?? fakeFiles}
      statuses={overrides.statuses ?? {}}
      onStatusChange={() => {}}
    />,
  )
}

describe('RawFileList — image files', () => {
  it('shows "图片" label for image files', () => {
    renderList()
    const imageLabels = screen.getAllByText('图片')
    expect(imageLabels.length).toBe(2) // photo.png and icon.jpg
  })

  it('shows "待编译" status for uncompiled non-image files', () => {
    renderList()
    // doc.md should show "待编译" status since it's not compiled
    expect(screen.getByText('待编译')).toBeDefined()
  })

  it('shows "图片" label and no compile status for image files', () => {
    renderList({ files: [{ name: 'photo.png', path: '/fake/kb/raw/photo.png', size: 500, addedAt: '2026-01-01' }] })
    expect(screen.queryByText('待编译')).toBeNull()
    expect(screen.getByText('图片')).toBeDefined()
  })

  it('excludes image files from unprocessed count', () => {
    const statuses = {
      'doc.md': { compiled: false },
      'photo.png': { compiled: false },
      'icon.jpg': { compiled: false },
    }
    renderList({ statuses })
    // Only doc.md should count — 1 unprocessed, not 3
    expect(screen.getByText(/全部编译/).textContent).toContain('1')
  })

  it('batch compile button count excludes images', () => {
    const files = [
      ...fakeFiles,
      { name: 'notes.txt', path: '/fake/kb/raw/notes.txt', size: 800, addedAt: '2026-01-01' },
    ]
    renderList({ files, statuses: {} })
    // Should show "全部编译（2 个待编译）" — doc.md and notes.txt
    const batchBtn = screen.getByText(/全部编译/)
    expect(batchBtn).toBeDefined()
    expect(batchBtn.textContent).toContain('2')
  })

  it('opens preview panel when clicking an image file', async () => {
    renderList({
      files: [{ name: 'photo.png', path: '/fake/kb/raw/photo.png', size: 500, addedAt: '2026-01-01' }],
    })

    const fileBtn = screen.getByText('photo.png')
    // Click to open preview — should not crash
    expect(() => fileBtn.click()).not.toThrow()
  })
})
