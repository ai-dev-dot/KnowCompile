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

interface CompileStatus {
  compiled: boolean
  wikiPages?: string[]
  compiledAt?: string
}

export default function IngestView({ kbPath }: Props) {
  const [rawFiles, setRawFiles] = useState<RawFile[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [compiling, setCompiling] = useState<string | null>(null)
  const [compileResult, setCompileResult] = useState<string | null>(null)
  const [compileStatuses, setCompileStatuses] = useState<Record<string, CompileStatus>>({})
  const [recompileFile, setRecompileFile] = useState<string | null>(null)
  const ipc = useIPC()

  useEffect(() => {
    loadAll()
  }, [kbPath])

  const loadAll = async () => {
    const files = await ipc.listRawFiles(kbPath)
    setRawFiles(files)
    // Check compile status for all files
    const statuses: Record<string, CompileStatus> = {}
    for (const f of files) {
      statuses[f.name] = await ipc.checkCompileStatus(kbPath, f.name)
    }
    setCompileStatuses(statuses)
  }

  const handleDrop = async (paths: string[]) => {
    setStatus(`正在导入 ${paths.length} 个文件...`)
    for (const p of paths) {
      await ipc.copyToRaw(kbPath, p)
    }
    await loadAll()
    setStatus(`成功导入 ${paths.length} 个文件`)
    setTimeout(() => setStatus(null), 3000)
  }

  const handleDelete = async (filePath: string) => {
    if (!window.confirm('确定要删除此文件吗？此操作不可撤销。')) return
    // Convert absolute path to kbPath + relative subpath
    if (filePath.startsWith(kbPath)) {
      const subpath = filePath.slice(kbPath.length).replace(/^[/\\]/, '')
      await ipc.deleteWikiPage(kbPath, subpath)
    }
    await loadAll()
  }

  const handleCompile = async (filePath: string) => {
    setCompiling(filePath)
    setCompileResult(null)
    setRecompileFile(null)
    const rawName = filePath.replace(/^.*[\\/]/, '')

    try {
      const result = await ipc.compileV2(kbPath, filePath)
      const wikiPages: string[] = []

      // LLM may generate multiple pages (split by "# " headers)
      const sections = result.compileOutput.split(/(?=^# )/m).filter(s => s.trim())
      for (const section of sections) {
        const titleMatch = section.match(/^# (.+)$/m)
        if (titleMatch) {
          const pageName = titleMatch[1].trim()
          // index.md is the wiki directory, save it separately
          if (pageName === 'Wiki 索引' || pageName.toLowerCase() === 'wiki index') {
            await ipc.writeWikiPage(kbPath, 'wiki/index.md', section)
          } else {
            wikiPages.push(pageName)
            await ipc.writeWikiPage(kbPath, `wiki/${pageName}.md`, section)
          }
        }
      }

      // Fallback: if no sections found, save as single page using raw file name
      if (wikiPages.length === 0) {
        const pageName = rawName.replace(/\.[^.]+$/, '')
        wikiPages.push(pageName)
        await ipc.writeWikiPage(kbPath, `wiki/${pageName}.md`, result.compileOutput)
      }

      // Track in compile log
      await ipc.logCompile(kbPath, rawName, wikiPages)

      // Track sample-generated pages
      if (rawName.startsWith('sample-')) {
        for (const p of wikiPages) {
          await ipc.trackSamplePage(kbPath, p)
        }
      }

      // Update local status
      setCompileStatuses(prev => ({
        ...prev,
        [rawName]: { compiled: true, wikiPages, compiledAt: new Date().toISOString() },
      }))

      let resultMsg = `编译完成，已生成 ${wikiPages.length} 个 Wiki 页面：${wikiPages.join('、')}`
      if (result.candidatePages.length > 0) {
        resultMsg += `\n向量检索候选页面：${result.candidatePages.join('、')}`
      }
      if (result.plan.conflicts?.length > 0) {
        resultMsg += `\n发现 ${result.plan.conflicts.length} 个矛盾点，请在设置页查看`
      }
      setCompileResult(resultMsg)
    } catch (err) {
      setCompileResult(`编译失败：${err}`)
    } finally {
      setCompiling(null)
    }
  }

  const getCompileButton = (file: RawFile) => {
    const cs = compileStatuses[file.name]
    const isCompiling = compiling === file.path
    const isConfirmingRecompile = recompileFile === file.path

    if (isCompiling) {
      return (
        <button disabled className="text-xs text-text-muted opacity-50">
          编译中...
        </button>
      )
    }

    if (isConfirmingRecompile) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs text-yellow-400">确认重新编译？</span>
          <button
            onClick={(e) => { e.stopPropagation(); handleCompile(file.path) }}
            className="text-xs text-green-400 hover:underline"
          >
            是
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setRecompileFile(null) }}
            className="text-xs text-text-muted hover:text-white"
          >
            否
          </button>
        </div>
      )
    }

    if (cs?.compiled) {
      return (
        <button
          onClick={() => setRecompileFile(file.path)}
          className="text-xs text-green-400/70 hover:text-yellow-400 group"
          title={`编译于 ${cs.compiledAt ? new Date(cs.compiledAt).toLocaleString('zh-CN') : '未知时间'}，生成页面：${cs.wikiPages?.join('、')}`}
        >
          <span className="group-hover:hidden">已编译 ✓</span>
          <span className="hidden group-hover:inline">重新编译</span>
        </button>
      )
    }

    return (
      <button
        onClick={() => handleCompile(file.path)}
        className="text-xs text-accent hover:underline"
      >
        编译
      </button>
    )
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
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 items-center">
                  {getCompileButton(file)}
                  <button onClick={() => handleDelete(file.path)} className="text-text-muted hover:text-red-400 text-xs ml-1">删除</button>
                </div>
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
          <div className="mt-4 p-3 rounded-lg bg-accent/10 text-accent text-sm">{status}</div>
        )}
        {compileResult && (
          <div className="mt-4 p-3 rounded-lg bg-accent/10 text-accent text-sm">{compileResult}</div>
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
                  {compileStatuses[file.name]?.compiled && (
                    <span className="text-xs text-green-400/60 ml-2">已编译</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {getCompileButton(file)}
                  <span className="text-xs text-text-muted">
                    {new Date(file.addedAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
