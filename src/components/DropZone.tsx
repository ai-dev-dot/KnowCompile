import { useState, useCallback, useRef } from 'react'

export interface FileEntry {
  /** Absolute path on disk (source for copy) */
  absolutePath: string
  /** Filename */
  relativePath: string
}

interface Props {
  onFilesDrop: (entries: FileEntry[]) => void
}

export default function DropZone({ onFilesDrop }: Props) {
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)

      const files = e.dataTransfer.files
      const entries: FileEntry[] = []
      for (const f of Array.from(files)) {
        const absPath = window.electronAPI.getFilePath(f)
        if (!absPath) continue
        const ext = absPath.slice(absPath.lastIndexOf('.')).toLowerCase()
        if (!['.md', '.markdown'].includes(ext)) continue
        const name = absPath.replace(/^.*[\\/]/, '')
        entries.push({ absolutePath: absPath, relativePath: name })
      }

      if (entries.length > 0) onFilesDrop(entries)
    },
    [onFilesDrop],
  )

  const handleBrowse = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const entries: FileEntry[] = []
      for (const f of Array.from(e.target.files)) {
        const absPath = window.electronAPI.getFilePath(f)
        if (!absPath) continue
        const name = absPath.replace(/^.*[\\/]/, '')
        entries.push({ absolutePath: absPath, relativePath: name })
      }
      if (entries.length > 0) onFilesDrop(entries)
      e.target.value = ''
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
        dragging
          ? 'border-accent bg-accent/10'
          : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      <p className="text-4xl mb-4">📥</p>
      <p className="text-text text-lg mb-2">拖放 Markdown 文件到此处</p>
      <p className="text-text-muted text-sm mb-4">
        md 文件中引用的图片等本地文件将自动导入
      </p>
      <div className="text-text-muted text-xs mb-3">— 或者 —</div>
      <button
        type="button"
        onClick={handleBrowse}
        className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600 transition-colors"
      >
        选择 Markdown 文件
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".md,.markdown"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
