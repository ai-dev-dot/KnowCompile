import { useState, useEffect, useRef } from 'react'
import { useIPC, type CompileProgress } from '../hooks/useIPC'

export interface RawFile {
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

interface Props {
  kbPath: string
  files: RawFile[]
  statuses: Record<string, CompileStatus>
  onStatusChange: () => void
}

const ERROR_MAP: Record<string, string> = {
  'Cannot read properties': '处理文件时出错，请检查文件是否完整',
  'API key': 'LLM API Key 未配置或无效',
  'Rate limit': 'API 调用频率过高，请稍后再试',
  'timeout': '编译超时，请重试',
  'ETIMEDOUT': '编译超时，请检查网络连接',
  '429': 'API 请求过于频繁，请稍后再试',
  '401': 'API Key 无效，请在设置中重新配置',
  '403': 'API Key 没有权限，请检查设置',
  'fetch failed': '网络连接失败，请检查网络设置',
  'ECONNREFUSED': '网络连接被拒绝',
}

function mapError(err: unknown): string {
  if (!err) return '未知错误'
  const msg = typeof err === 'string' ? err : (err as any)?.message || String(err)
  for (const [key, display] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return display
  }
  return msg.length > 120 ? msg.slice(0, 120) + '...' : msg
}

const PDF_ERRORS: Record<string, string> = {
  '可能为扫描件': '此 PDF 可能为扫描件，无法提取文本',
  '已损坏': '此 PDF 文件已损坏',
}

function mapPDFError(err: string): string {
  for (const [key, display] of Object.entries(PDF_ERRORS)) {
    if (err.includes(key)) return display
  }
  return err
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])
const isImageFile = (name: string) => IMAGE_EXTS.has(name.slice(name.lastIndexOf('.')).toLowerCase())

/** Per-file result during current batch compile session */
interface BatchResult {
  ok: boolean
  wikiPages?: string[]
  error?: string
}

export default function RawFileList({ kbPath, files, statuses, onStatusChange }: Props) {
  const [compiling, setCompiling] = useState<string | null>(null)
  const [compileResult, setCompileResult] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [compileProgress, setCompileProgress] = useState<CompileProgress | null>(null)
  const [batchCompiling, setBatchCompiling] = useState(false)
  const [batchResults, setBatchResults] = useState<Record<string, BatchResult>>({})
  const [batchIndex, setBatchIndex] = useState(0)
  const [batchTotal, setBatchTotal] = useState(0)
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const cleanupRef = useRef<(() => void) | null>(null)
  const ipc = useIPC()

  useEffect(() => {
    return () => { cleanupRef.current?.() }
  }, [])

  // Reset batch state when files change (new import)
  useEffect(() => {
    setBatchResults({})
    setCompileResult(null)
  }, [files])

  const handleCompile = async (filePath: string) => {
    setCompiling(filePath)
    setCompileResult(null)
    setCompileProgress(null)
    const rawName = filePath.replace(/^.*[\\/]/, '')

    cleanupRef.current?.()
    cleanupRef.current = ipc.on('compile:progress', (progress: CompileProgress) => {
      setCompileProgress(progress)
    })

    try {
      const result = await ipc.compileV2(kbPath, filePath)
      const wikiPages = await writeWikiPages(result.compileOutput, rawName, kbPath, ipc)

      await ipc.logCompile(kbPath, rawName, wikiPages)
      if (rawName.startsWith('sample-')) {
        for (const p of wikiPages) await ipc.trackSamplePage(kbPath, p)
      }

      setCompileResult({ type: 'ok', msg: `已生成 ${wikiPages.length} 个页面：${wikiPages.join('、')}` })
      onStatusChange()
    } catch (err) {
      let msg = mapError(err)
      const errStr = String(err)
      if (errStr.includes('PDF')) {
        msg = mapPDFError(errStr)
      }
      setCompileResult({ type: 'err', msg })
    } finally {
      setCompiling(null)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }

  const handleBatchCompile = async () => {
    setBatchCompiling(true)
    setCompileResult(null)
    setBatchResults({})
    const unprocessed = files.filter(f => !isImageFile(f.name) && !statuses[f.name]?.compiled)

    setBatchTotal(unprocessed.length)
    let ok = 0, fail = 0

    // Register progress listener for batch compile
    cleanupRef.current?.()
    cleanupRef.current = ipc.on('compile:progress', (progress: CompileProgress) => {
      setCompileProgress(progress)
    })

    for (let i = 0; i < unprocessed.length; i++) {
      const f = unprocessed[i]
      setBatchIndex(i + 1)
      setCompiling(f.path)
      setCompileProgress(null)

      try {
        const result = await ipc.compileV2(kbPath, f.path)
        const rawName = f.name
        const wikiPages = await writeWikiPages(result.compileOutput, rawName, kbPath, ipc)

        await ipc.logCompile(kbPath, rawName, wikiPages)
        ok++
        setBatchResults(prev => ({ ...prev, [f.name]: { ok: true, wikiPages } }))
      } catch (err) {
        fail++
        const msg = mapError(err)
        setBatchResults(prev => ({ ...prev, [f.name]: { ok: false, error: msg } }))
      }

      setCompileProgress(null)
      // Refresh statuses immediately after each file
      onStatusChange()
    }

    cleanupRef.current?.()
    cleanupRef.current = null
    setCompiling(null)
    setCompileProgress(null)
    setBatchCompiling(false)
    setCompileResult({
      type: fail === 0 ? 'ok' : 'err',
      msg: fail === 0
        ? `全部编译完成 — ${ok} 个文件成功`
        : `${ok} 个成功，${fail} 个失败`,
    })
    onStatusChange()
  }

  const handlePreview = async (fileName: string) => {
    if (previewFile === fileName) {
      setPreviewFile(null)
      setPreviewContent('')
    } else {
      if (isImageFile(fileName)) {
        const result = await ipc.invoke('assets:read', kbPath, `raw/${fileName}`) as any
        if (result?.success && result.data) {
          setPreviewFile(fileName)
          setPreviewContent(result.data)
        } else {
          setPreviewFile(fileName)
          setPreviewContent('(无法加载图片)')
        }
      } else {
        try {
          const content = await ipc.previewRawContent(kbPath, fileName)
          setPreviewFile(fileName)
          setPreviewContent(content)
        } catch {
          setPreviewFile(fileName)
          setPreviewContent('(无法读取文件内容)')
        }
      }
    }
  }

  const unprocessedCount = files.filter(f => !isImageFile(f.name) && !statuses[f.name]?.compiled).length

  /** Derive display state for a single file row */
  function getFileState(name: string, filePath: string):
    { label: string; color: string; dot: string; extra?: string }
  {
    const cs = statuses[name]
    const br = batchResults[name]
    const isCompiling = compiling === filePath

    // Currently compiling this file
    if (isCompiling) {
      const stepLabel = compileProgress?.label || '编译中'
      return { label: stepLabel, color: 'text-accent', dot: 'bg-accent animate-pulse' }
    }

    // Just completed in this batch
    if (br?.ok) {
      const count = br.wikiPages?.length || 0
      return { label: `已生成 ${count} 页`, color: 'text-green-400', dot: 'bg-green-400', extra: br.wikiPages?.join('、') }
    }

    // Failed in this batch
    if (br && !br.ok) {
      return { label: br.error || '编译失败', color: 'text-red-400', dot: 'bg-red-400' }
    }

    // Previously compiled (from statuses)
    if (cs?.compiled) {
      const time = cs.compiledAt ? new Date(cs.compiledAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
      return { label: time ? `${time}` : '已编译', color: 'text-green-400/60', dot: 'bg-green-400/60' }
    }

    // Waiting in queue during batch
    if (batchCompiling) {
      return { label: '等待中', color: 'text-text-muted', dot: 'bg-gray-500' }
    }

    // Not compiled yet, not in batch
    return { label: '待编译', color: 'text-text-muted', dot: 'bg-gray-600' }
  }

  return (
    <div>
      {/* Batch compile button */}
      {unprocessedCount > 0 && (
        <div className="mb-3">
          <button
            onClick={handleBatchCompile}
            disabled={batchCompiling || compiling !== null}
            className="w-full px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {batchCompiling
              ? `批量编译中（${batchIndex}/${batchTotal}）`
              : `全部编译（${unprocessedCount} 个待编译）`}
          </button>
        </div>
      )}

      {/* Compile progress bar */}
      {compiling && compileProgress && (
        <div className="mb-3 p-3 rounded-lg bg-gray-800 border border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-text">{compiling.replace(/^.*[\\/]/, '')}</span>
            <span className="text-xs text-text-muted">{compileProgress.percent}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5 mb-1.5">
            <div className="bg-accent h-1.5 rounded-full transition-all duration-300" style={{ width: `${compileProgress.percent}%` }} />
          </div>
          <p className="text-xs text-text-muted">
            {compileProgress.label}{compileProgress.detail ? ` · ${compileProgress.detail}` : ''}
          </p>
        </div>
      )}

      {/* Batch overall progress */}
      {batchCompiling && (
        <div className="mb-3 p-3 rounded-lg bg-accent/10 border border-accent/20">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-accent font-medium">批量编译进度</span>
            <span className="text-xs text-text-muted">{batchIndex}/{batchTotal}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-accent h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(batchIndex / batchTotal) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Compile result summary */}
      {compileResult && !batchCompiling && (
        <div className={`mb-3 p-3 rounded-lg text-sm ${
          compileResult.type === 'ok' ? 'bg-green-900/20 text-green-300 border border-green-800/30' : 'bg-red-900/20 text-red-300 border border-red-800/30'
        }`}>
          {compileResult.msg}
        </div>
      )}

      {/* File list */}
      <div className="space-y-1">
        {files.length === 0 ? (
          <p className="text-text-muted text-xs p-3">暂无资料</p>
        ) : (
          files.map((file) => {
            const state = getFileState(file.name, file.path)
            const isCompiling = compiling === file.path
            const cs = statuses[file.name]
            const br = batchResults[file.name]

            return (
              <div key={file.path} className={`border rounded-lg overflow-hidden transition-colors ${
                isCompiling ? 'border-accent/50 bg-accent/5' :
                br?.ok ? 'border-green-800/30 bg-green-900/5' :
                br && !br.ok ? 'border-red-800/30 bg-red-900/5' :
                'border-border'
              }`}>
                {/* File row */}
                <div className="flex items-center justify-between py-2 px-3">
                  <button
                    onClick={() => handlePreview(file.name)}
                    className="text-sm text-text hover:text-accent text-left truncate flex-1 mr-2"
                    title={file.name}
                  >
                    {file.name}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isImageFile(file.name) ? (
                      <span className="text-xs text-text-muted">图片</span>
                    ) : (
                      <>
                        {/* Status indicator */}
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${state.dot}`} />
                        <span className={`text-xs ${state.color}`}>{state.label}</span>

                        {/* Single-compile button for non-batch mode */}
                        {!batchCompiling && !isCompiling && (
                          <button
                            onClick={() => handleCompile(file.path)}
                            className="text-xs text-text-muted hover:text-accent transition-colors ml-1"
                          >
                            {cs?.compiled ? '重新编译' : '编译'}
                          </button>
                        )}
                      </>
                    )}
                    <span className="text-xs text-text-muted ml-1">
                      {(file.size / 1024).toFixed(0)}KB
                    </span>
                  </div>
                </div>

                {/* Extra info row — generated wiki pages */}
                {state.extra && br?.ok && (
                  <div className="border-t border-border/50 px-3 py-1.5 bg-gray-900/30">
                    <span className="text-xs text-text-muted">{state.extra}</span>
                  </div>
                )}

                {/* Preview panel */}
                {previewFile === file.name && (
                  <div className="border-t border-border px-4 py-3 bg-gray-900/50">
                    {previewContent.startsWith('data:image/') ? (
                      <img src={previewContent} alt={file.name} className="max-w-full max-h-64 object-contain rounded" />
                    ) : (
                      <pre className="text-xs text-text-muted whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                        {previewContent.slice(0, 2000)}
                        {previewContent.length > 2000 && '\n\n... (内容过长，已截断)'}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/** Write wiki pages from compile output, returns list of page names */
async function writeWikiPages(
  compileOutput: string,
  rawName: string,
  kbPath: string,
  ipc: ReturnType<typeof useIPC>,
): Promise<string[]> {
  const sections = compileOutput.split(/(?=^# )/m).filter(s => s.trim())
  const wikiPages: string[] = []

  for (const section of sections) {
    const titleMatch = section.match(/^# (.+)$/m)
    if (titleMatch) {
      const pageName = titleMatch[1].trim()
      const bodyText = section.replace(/^# .+\n?/m, '').trim()
      if (bodyText.length < 20) continue
      await ipc.writeWikiPage(kbPath, `wiki/${pageName}.md`, section)
      wikiPages.push(pageName)
    }
  }

  if (wikiPages.length === 0) {
    const pageName = rawName.replace(/\.[^.]+$/, '')
    wikiPages.push(pageName)
    await ipc.writeWikiPage(kbPath, `wiki/${pageName}.md`, compileOutput)
  }

  return wikiPages
}
