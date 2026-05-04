import { useState, useEffect } from 'react'
import IngestInput from '../components/IngestInput'
import RawFileList, { type RawFile } from '../components/RawFileList'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string; active?: boolean }

interface CompileStatus {
  compiled: boolean
  wikiPages?: string[]
  compiledAt?: string
}

export default function IngestView({ kbPath, active }: Props) {
  const [files, setFiles] = useState<RawFile[]>([])
  const [statuses, setStatuses] = useState<Record<string, CompileStatus>>({})
  const [status, setStatus] = useState<string | null>(null)
  const ipc = useIPC()

  const loadAll = async () => {
    const rawFiles = await ipc.listRawFiles(kbPath)
    setFiles(rawFiles)
    const s: Record<string, CompileStatus> = {}
    for (const f of rawFiles) {
      s[f.name] = await ipc.checkCompileStatus(kbPath, f.name)
    }
    setStatuses(s)
  }

  useEffect(() => {
    if (active !== false) loadAll()
  }, [kbPath, active])

  // --- File drop ---
  const handleFilesDrop = async (paths: string[]) => {
    setStatus(`正在导入 ${paths.length} 个文件...`)
    let ok = 0, fail = 0

    for (const p of paths) {
      // Validate before import
      const validation = await ipc.validateRawFile(kbPath, p)
      if (!validation.valid) {
        fail++
        setStatus(validation.error || '导入验证失败')
        continue
      }
      const result = await ipc.copyToRaw(kbPath, p)
      if (result.success) ok++
      else {
        fail++
        setStatus(`导入 "${result.name}" 失败：${result.error}`)
      }
    }

    await loadAll()
    const msgs: string[] = []
    if (ok > 0) msgs.push(`成功导入 ${ok} 个文件`)
    if (fail > 0) msgs.push(`${fail} 个导入失败`)
    setStatus(msgs.length > 0 ? msgs.join('，') : null)
    if (msgs.length > 0) setTimeout(() => setStatus(null), 5000)
  }

  // --- Text paste ---
  const handleTextPaste = async (text: string) => {
    const name = `pasted-${Date.now().toString(36)}.md`
    await ipc.writeWikiPage(kbPath, `raw/${name}`, text)
    setStatus(`"${name}" 已导入`)
    await loadAll()
    setTimeout(() => setStatus(null), 3000)
  }

  // --- URL submit ---
  const handleURLSubmit = async (url: string) => {
    setStatus(`正在抓取网页...`)
    const result = await ipc.fetchURL(url)
    if (result.success && result.content) {
      const safeName = (result.title || 'webpage').replace(/[<>:"/\\|?*]/g, '-').slice(0, 60)
      const fileName = `url-${Date.now().toString(36)}-${safeName}.md`
      await ipc.writeWikiPage(kbPath, `raw/${fileName}`, result.content)
      setStatus(`网页 "${result.title || url}" 已导入`)
      await loadAll()
    } else {
      setStatus(`网页抓取失败：${result.error || '未知错误'}`)
    }
    setTimeout(() => setStatus(null), 5000)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* File list sidebar */}
      <aside className="w-[220px] bg-panel flex flex-col flex-shrink-0 border-r border-border">
        <div className="px-4 py-3 text-sm font-semibold text-text border-b border-border">
          raw/ 资料
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {files.length === 0 ? (
            <p className="text-text-muted text-xs p-3">暂无资料</p>
          ) : (
            files.map((file) => (
              <div key={file.path} className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-gray-800 group">
                <span className="text-sm text-text-muted truncate">{file.name}</span>
                <span className="text-xs text-text-muted opacity-0 group-hover:opacity-100">
                  {statuses[file.name]?.compiled ? '已编译' : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <h2 className="text-xl font-semibold text-text mb-6">资料摄入</h2>

        <IngestInput
          onFilesDrop={handleFilesDrop}
          onTextPaste={handleTextPaste}
          onURLSubmit={handleURLSubmit}
        />

        {status && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            status.includes('失败') ? 'bg-red-900/20 text-red-300' : 'bg-accent/10 text-accent'
          }`}>
            {status}
          </div>
        )}

        <div className="mt-8">
          <h3 className="text-sm font-semibold text-text-muted mb-3">已导入的资料</h3>
          <RawFileList
            kbPath={kbPath}
            files={files}
            statuses={statuses}
            onStatusChange={loadAll}
          />
        </div>
      </main>
    </div>
  )
}
