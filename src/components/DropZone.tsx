import { useState, useCallback } from 'react'

interface Props {
  onFilesDrop: (paths: string[]) => void
}

export default function DropZone({ onFilesDrop }: Props) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    const paths = files.map(f => (f as any).path).filter(Boolean)
    if (paths.length > 0) onFilesDrop(paths)
  }, [onFilesDrop])

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
      <p className="text-text-muted text-sm">
        支持 PDF、Markdown、纯文本、网页链接等格式
      </p>
    </div>
  )
}
