import { useState, useEffect } from 'react'
import IngestInput from '../components/IngestInput'
import RawFileList, { type RawFile } from '../components/RawFileList'
import { useIPC } from '../hooks/useIPC'
import type { FileEntry } from '../components/DropZone'

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
  const handleFilesDrop = async (entries: FileEntry[]) => {
    const mdPaths = entries.map(e => e.absolutePath)
    setStatus(`正在导入 ${mdPaths.length} 个文件，自动解析引用...`)

    const result = await ipc.importWithAssets(kbPath, mdPaths)
    await loadAll()

    const ok = result.results.filter(r => !r.error).length
    const fail = result.results.filter(r => r.error).length
    const msgs: string[] = []
    if (ok > 0) {
      const assetNote = result.totalAssets > 0 ? `（含 ${result.totalAssets} 个引用文件）` : ''
      msgs.push(`成功导入 ${ok} 个文件${assetNote}`)
    }
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
      {/* Main area */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* Hero header */}
        <div className="mb-8 pb-6 border-b border-[#313244]">
          <h2 className="text-2xl font-bold text-[#cdd6f4] mb-1 tracking-tight">资料摄入</h2>
          <p className="text-[#6e6e8a] text-sm">{files.length} 个文档已导入</p>
        </div>

        <IngestInput
          onFilesDrop={handleFilesDrop}
          onTextPaste={handleTextPaste}
          onURLSubmit={handleURLSubmit}
        />

        {status && (
          <div className={`mt-4 p-3 rounded-xl text-sm ${
            status.includes('失败') ? 'bg-red-900/20 text-red-400 border border-red-900/30' : 'bg-[#cba6f7]/10 text-[#cba6f7] border border-[#cba6f7]/20'
          }`}>
            {status}
          </div>
        )}

        <div className="mt-8">
          <h3 className="text-sm font-semibold text-[#6e6e8a] mb-3 uppercase tracking-wide">已导入的资料</h3>
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
