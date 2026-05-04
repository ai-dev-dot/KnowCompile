import { useState } from 'react'
import DropZone, { type FileEntry } from './DropZone'

interface Props {
  onFilesDrop: (entries: FileEntry[]) => void
  onTextPaste: (text: string) => void
  onURLSubmit: (url: string) => void
}

export default function IngestInput({ onFilesDrop, onTextPaste, onURLSubmit }: Props) {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [mode, setMode] = useState<'drop' | 'text' | 'url'>('drop')

  const handlePasteText = () => {
    if (text.trim()) {
      onTextPaste(text.trim())
      setText('')
    }
  }

  const handleURLWithReset = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) {
      setUrlLoading(true)
      onURLSubmit(url.trim())
      setTimeout(() => { setUrl(''); setUrlLoading(false) }, 100)
    }
  }

  return (
    <div>
      {/* Mode tabs */}
      <div className="flex gap-2 mb-4">
        {([['drop', '📥 拖放文件'], ['text', '📋 粘贴文本'], ['url', '🌐 网页链接']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
              mode === key ? 'bg-accent text-gray-950' : 'text-text-muted hover:text-white bg-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      {mode === 'drop' && (
        <>
          <DropZone onFilesDrop={onFilesDrop} />
          <p className="text-xs text-text-muted mt-3 text-center">md 文件中的本地图片、附件引用将自动解析并一同导入</p>
        </>
      )}

      {/* Text paste */}
      {mode === 'text' && (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴 Markdown 或纯文本内容..."
            className="w-full h-48 bg-gray-800 border border-border rounded-xl px-4 py-3 text-text text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={handlePasteText}
            disabled={!text.trim()}
            className="px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            导入文本
          </button>
          <p className="text-xs text-text-muted">支持 Markdown 格式，将自动存为 .md 文件</p>
        </div>
      )}

      {/* URL input */}
      {mode === 'url' && (
        <form onSubmit={handleURLWithReset} className="space-y-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="w-full bg-gray-800 border border-border rounded-xl px-4 py-3 text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={!url.trim() || urlLoading}
            className="px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {urlLoading ? '抓取中...' : '抓取网页'}
          </button>
          <p className="text-xs text-text-muted">LLM 将自动提取网页正文并转为 Markdown</p>
        </form>
      )}
    </div>
  )
}
