import { useState, useEffect } from 'react'
import DropZone from '../components/DropZone'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string }

interface RawFile {
  name: string
  path: string
  size: number
  addedAt: string
}

export default function IngestView({ kbPath }: Props) {
  const [rawFiles, setRawFiles] = useState<RawFile[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const ipc = useIPC()

  useEffect(() => {
    loadRawFiles()
  }, [kbPath])

  const loadRawFiles = async () => {
    const files = await ipc.listRawFiles(kbPath)
    setRawFiles(files)
  }

  const handleDrop = async (paths: string[]) => {
    setStatus(`正在导入 ${paths.length} 个文件...`)
    for (const p of paths) {
      await ipc.copyToRaw(kbPath, p)
    }
    await loadRawFiles()
    setStatus(`成功导入 ${paths.length} 个文件`)
    setTimeout(() => setStatus(null), 3000)
  }

  const handleDelete = async (filePath: string) => {
    await ipc.deleteWikiPage(filePath)
    await loadRawFiles()
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Raw file list sidebar */}
      <aside className="w-[220px] bg-panel flex flex-col flex-shrink-0 border-r border-border">
        <div className="px-4 py-3 text-sm font-semibold text-text border-b border-border">
          raw/ 资料
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {rawFiles.length === 0 ? (
            <p className="text-text-muted text-xs p-3">暂无资料</p>
          ) : (
            rawFiles.map((file) => (
              <div key={file.path} className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-gray-800 group">
                <span className="text-sm text-text-muted truncate flex-1">{file.name}</span>
                <button
                  onClick={() => handleDelete(file.path)}
                  className="text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs ml-2"
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <h2 className="text-xl font-semibold text-text mb-6">资料摄入</h2>
        <DropZone onFilesDrop={handleDrop} />
        {status && (
          <div className="mt-4 p-3 rounded-lg bg-accent/10 text-accent text-sm">
            {status}
          </div>
        )}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-text-muted mb-3">已导入的资料</h3>
          <div className="space-y-1">
            {rawFiles.map((file) => (
              <div key={file.path} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-800">
                <div>
                  <span className="text-sm text-text">{file.name}</span>
                  <span className="text-xs text-text-muted ml-3">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <span className="text-xs text-text-muted">
                  {new Date(file.addedAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
