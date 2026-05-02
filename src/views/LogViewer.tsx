import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string; active?: boolean }

interface LogEntry {
  timestamp: string
  model: string
  provider: string
  role: string
  promptSummary: string
  responseSummary: string
  promptLen: number
  responseLen: number
  durationMs: number
  success: boolean
  error?: string
  reviewPassed?: boolean
  reviewFeedback?: string
}

interface LogStats {
  totalCalls: number
  totalErrors: number
  avgDurationMs: number
  callsByRole: Record<string, number>
}

const ROLE_LABELS: Record<string, string> = {
  compile: '编译',
  qa: '问答',
  review: '审查',
  retry: '重试',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  const h = `${d.getHours()}`.padStart(2, '0')
  const min = `${d.getMinutes()}`.padStart(2, '0')
  const s = `${d.getSeconds()}`.padStart(2, '0')
  return `${m}-${day} ${h}:${min}:${s}`
}

function formatDuration(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

export default function LogViewer({ kbPath, active }: Props) {
  const [logStats, setLogStats] = useState<LogStats>({ totalCalls: 0, totalErrors: 0, avgDurationMs: 0, callsByRole: {} })
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logFilter, setLogFilter] = useState<string>('all')
  const [expandedLog, setExpandedLog] = useState<number | null>(null)
  const ipc = useIPC()

  const load = async () => {
    const [stats, recentLogs] = await Promise.all([
      ipc.getLLMLogStats(kbPath) as Promise<LogStats>,
      ipc.getLLMLogs(kbPath, { limit: 100 }) as Promise<LogEntry[]>,
    ])
    setLogStats(stats)
    setLogs(recentLogs)
  }

  useEffect(() => {
    if (active !== false) load()
  }, [kbPath, active])

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.role === logFilter)

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xl font-semibold text-text mb-6">LLM 调用日志</h2>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-800 rounded-lg border border-border p-4 text-center">
            <p className="text-2xl font-semibold text-text">{logStats.totalCalls}</p>
            <p className="text-xs text-text-muted mt-1">总调用</p>
          </div>
          <div className="bg-gray-800 rounded-lg border border-border p-4 text-center">
            <p className="text-2xl font-semibold text-green-400">{logStats.totalCalls - logStats.totalErrors}</p>
            <p className="text-xs text-text-muted mt-1">成功</p>
          </div>
          <div className="bg-gray-800 rounded-lg border border-border p-4 text-center">
            <p className="text-2xl font-semibold text-red-400">{logStats.totalErrors}</p>
            <p className="text-xs text-text-muted mt-1">失败</p>
          </div>
          <div className="bg-gray-800 rounded-lg border border-border p-4 text-center">
            <p className="text-2xl font-semibold text-text">{formatDuration(logStats.avgDurationMs)}</p>
            <p className="text-xs text-text-muted mt-1">平均耗时</p>
          </div>
        </div>

        {/* By role + filter */}
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {Object.entries(logStats.callsByRole).map(([role, count]) => (
              <div key={role} className="bg-gray-800 rounded-full px-3 py-1 text-xs text-text-muted border border-border">
                {ROLE_LABELS[role] || role}：<span className="text-text font-medium">{count}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 ml-auto">
            {['all', 'compile', 'qa', 'review', 'retry'].map(r => (
              <button
                key={r}
                onClick={() => setLogFilter(r)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  logFilter === r
                    ? 'bg-accent text-gray-950 font-medium'
                    : 'bg-gray-700 text-text-muted hover:bg-gray-600'
                }`}
              >
                {r === 'all' ? '全部' : ROLE_LABELS[r] || r}
              </button>
            ))}
          </div>
        </div>

        {/* Log list */}
        <div className="space-y-1">
          {filteredLogs.length === 0 ? (
            <p className="text-text-muted text-sm py-8 text-center">暂无调用记录。编译或问答后会自动记录。</p>
          ) : (
            filteredLogs.map((entry, idx) => (
              <div key={idx} className="bg-gray-800 border border-border/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedLog(expandedLog === idx ? null : idx)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-700/50 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.success ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className={`text-xs font-medium w-10 flex-shrink-0 ${entry.success ? 'text-green-400' : 'text-red-400'}`}>
                    {ROLE_LABELS[entry.role] || entry.role}
                  </span>
                  <span className="text-xs text-text-muted/60 flex-shrink-0 w-12">{formatDuration(entry.durationMs)}</span>
                  <span className="text-xs text-text-muted flex-1 truncate">
                    <span className="text-text-muted/60 mr-2">{formatTime(entry.timestamp)}</span>
                    {entry.responseSummary.slice(0, 80)}
                  </span>
                  {entry.reviewPassed !== undefined && (
                    <span className={`text-xs flex-shrink-0 ${entry.reviewPassed ? 'text-green-400' : 'text-yellow-400'}`}>
                      {entry.reviewPassed ? '✓ 通过' : '⚠ 未通过'}
                    </span>
                  )}
                </button>

                {expandedLog === idx && (
                  <div className="px-3 py-3 border-t border-border/50 bg-gray-900/50 space-y-3">
                    <div className="flex gap-4 text-xs text-text-muted">
                      <span>模型：{entry.model}</span>
                      <span>输入 {entry.promptLen} 字符</span>
                      <span>输出 {entry.responseLen} 字符</span>
                      <span>耗时 {formatDuration(entry.durationMs)}</span>
                    </div>
                    {entry.promptSummary && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Prompt</p>
                        <pre className="text-xs text-text-muted/70 bg-gray-900 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">{entry.promptSummary}</pre>
                      </div>
                    )}
                    {entry.responseSummary && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Response</p>
                        <pre className="text-xs text-text-muted/70 bg-gray-900 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">{entry.responseSummary}</pre>
                      </div>
                    )}
                    {entry.error && (
                      <div>
                        <p className="text-xs text-red-400 mb-1">错误</p>
                        <pre className="text-xs text-red-400/70 bg-red-900/20 rounded p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">{entry.error}</pre>
                      </div>
                    )}
                    {entry.reviewFeedback && entry.reviewFeedback !== '审查通过' && (
                      <div>
                        <p className="text-xs text-yellow-400 mb-1">审查意见</p>
                        <pre className="text-xs text-yellow-400/70 bg-yellow-900/20 rounded p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">{entry.reviewFeedback}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
