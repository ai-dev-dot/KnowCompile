import { useState, useCallback, useRef } from 'react'

interface Props {
  onFilesDrop: (paths: string[]) => void
}

export default function DropZone({ onFilesDrop }: Props) {
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const extractPaths = useCallback((files: FileList) => {
    const paths = Array.from(files)
      .map(f => window.electronAPI.getFilePath(f))
      .filter(Boolean)
    if (paths.length > 0) onFilesDrop(paths)
  }, [onFilesDrop])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    extractPaths(e.dataTransfer.files)
  }, [extractPaths])

  const handleBrowse = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      extractPaths(e.target.files)
      e.target.value = '' // Reset so same file can be re-selected
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
      <p className="text-text text-lg mb-2">拖放文件到此处</p>
      <p className="text-text-muted text-sm mb-4">
        支持 PDF、Markdown、纯文本等格式
      </p>
      <div className="text-text-muted text-xs mb-3">— 或者 —</div>
      <button
        type="button"
        onClick={handleBrowse}
        className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600 transition-colors"
      >
        浏览文件
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.md,.txt,.markdown,.html,.htm"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
