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

export default function RawFileList({ kbPath, files, statuses, onStatusChange }: Props) {
  const [compiling, setCompiling] = useState<string | null>(null)
  const [compileResult, setCompileResult] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [compileProgress, setCompileProgress] = useState<CompileProgress | null>(null)
  const [batchCompiling, setBatchCompiling] = useState(false)
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const cleanupRef = useRef<(() => void) | null>(null)
  const ipc = useIPC()

  useEffect(() => {
    return () => { cleanupRef.current?.() }
  }, [])

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
      const wikiPages: string[] = []
      const sections = result.compileOutput.split(/(?=^# )/m).filter(s => s.trim())

      for (const section of sections) {
        const titleMatch = section.match(/^# (.+)$/m)
        if (titleMatch) {
          const pageName = titleMatch[1].trim()
          if (pageName === 'Wiki 索引' || pageName.toLowerCase() === 'wiki index') {
            await ipc.writeWikiPage(kbPath, 'wiki/index.md', section)
          } else {
            wikiPages.push(pageName)
            await ipc.writeWikiPage(kbPath, `wiki/${pageName}.md`, section)
          }
        }
      }

      if (wikiPages.length === 0) {
        const pageName = rawName.replace(/\.[^.]+$/, '')
        wikiPages.push(pageName)
        await ipc.writeWikiPage(kbPath, `wiki/${pageName}.md`, result.compileOutput)
      }

      await ipc.logCompile(kbPath, rawName, wikiPages)
      if (rawName.startsWith('sample-')) {
        for (const p of wikiPages) await ipc.trackSamplePage(kbPath, p)
      }

      setCompileResult({ type: 'ok', msg: `已生成 ${wikiPages.join('、')}` })
      onStatusChange()
    } catch (err) {
      let msg = mapError(err)
      // Check for PDF-specific errors
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
    let ok = 0, fail = 0
    const unprocessed = files.filter(f => !statuses[f.name]?.compiled)

    for (let i = 0; i < unprocessed.length; i++) {
      const f = unprocessed[i]
      setCompiling(f.path)
      setCompileResult({ type: 'ok', msg: `(${i + 1}/${unprocessed.length}) 正在编译 ${f.name}...` })
      try {
        await handleCompileSingle(f.path)
        ok++
      } catch {
        fail++
      }
    }
    setCompiling(null)
    setBatchCompiling(false)
    onStatusChange()
    if (fail === 0 && ok > 0) {
      setCompileResult({ type: 'ok', msg: `全部编译成功 — ${ok} 个文件` })
    } else if (fail === 0 && ok === 0) {
      setCompileResult({ type: 'ok', msg: '所有文件已编译' })
    } else {
      setCompileResult({ type: 'err', msg: `${ok} 个成功，${fail} 个失败` })
    }
  }

  const handleCompileSingle = async (filePath: string) => {
    const rawName = filePath.replace(/^.*[\\/]/, '')
    const result = await ipc.compileV2(kbPath, filePath)
    const sections = result.compileOutput.split(/(?=^# )/m).filter(s => s.trim())
    const wikiPages: string[] = []

    for (const section of sections) {
      const titleMatch = section.match(/^# (.+)$/m)
      if (titleMatch) {
        const pageName = titleMatch[1].trim()
        if (pageName === 'Wiki 索引' || pageName.toLowerCase() === 'wiki index') {
          await ipc.writeWikiPage(kbPath, 'wiki/index.md', section)
        } else {
          wikiPages.push(pageName)
          await ipc.writeWikiPage(kbPath, `wiki/${pageName}.md`, section)
        }
      }
    }
    if (wikiPages.length === 0) {
      const pageName = rawName.replace(/\.[^.]+$/, '')
      wikiPages.push(pageName)
      await ipc.writeWikiPage(kbPath, `wiki/${pageName}.md`, result.compileOutput)
    }
    await ipc.logCompile(kbPath, rawName, wikiPages)
  }

  const handlePreview = async (fileName: string) => {
    if (previewFile === fileName) {
      setPreviewFile(null)
      setPreviewContent('')
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

  const unprocessedCount = files.filter(f => !statuses[f.name]?.compiled).length

  return (
    <div>
      {/* Batch compile button */}
      {unprocessedCount > 1 && (
        <div className="mb-3">
          <button
            onClick={handleBatchCompile}
            disabled={batchCompiling || compiling !== null}
            className="w-full px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {batchCompiling ? '批量编译中...' : `全部编译（${unprocessedCount} 个未编译）`}
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

      {/* Compile result */}
      {compileResult && (
        <div className={`mb-3 p-3 rounded-lg text-sm ${
          compileResult.type === 'ok' ? 'bg-accent/10 text-accent' : 'bg-red-900/20 text-red-300'
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
            const cs = statuses[file.name]
            const isCompiling = compiling === file.path
            return (
              <div key={file.path} className="border border-border rounded-lg overflow-hidden">
                {/* File row */}
                <div className="flex items-center justify-between py-2 px-3 bg-gray-800/50">
                  <button
                    onClick={() => handlePreview(file.name)}
                    className="text-sm text-text hover:text-accent text-left truncate flex-1 mr-2"
                  >
                    {file.name}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {cs?.compiled && (
                      <button
                        onClick={() => handleCompile(file.path)}
                        disabled={isCompiling}
                        className="text-xs text-green-400/60 hover:text-yellow-400 transition-colors"
                        title={`编译于 ${cs.compiledAt ? new Date(cs.compiledAt).toLocaleString('zh-CN') : '未知'}`}
                      >
                        {isCompiling ? '编译中...' : '重新编译'}
                      </button>
                    )}
                    {!cs?.compiled && (
                      <button
                        onClick={() => handleCompile(file.path)}
                        disabled={isCompiling}
                        className="text-xs text-accent hover:underline"
                      >
                        {isCompiling ? '编译中...' : '编译'}
                      </button>
                    )}
                    <span className="text-xs text-text-muted">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>

                {/* Preview panel */}
                {previewFile === file.name && (
                  <div className="border-t border-border px-4 py-3 bg-gray-900/50">
                    <pre className="text-xs text-text-muted whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                      {previewContent.slice(0, 2000)}
                      {previewContent.length > 2000 && '\n\n... (内容过长，已截断)'}
                    </pre>
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
