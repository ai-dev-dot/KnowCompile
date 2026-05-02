import { useState, useEffect } from 'react'
import { useIPC, type SystemInfo } from '../hooks/useIPC'

interface Props { kbPath: string; active?: boolean }

function formatKB(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${kb} KB`
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-sm text-text">{value}</span>
    </div>
  )
}

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-border p-5">
      <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">{title}</h3>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  )
}

export default function SystemView({ kbPath, active }: Props) {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mainLagSamples, setMainLagSamples] = useState<{ time: number; delay: number }[]>([])
  const [renderFps, setRenderFps] = useState<{ time: number; fps: number }[]>([])
  const ipc = useIPC()

  const load = async () => {
    try {
      setError(null)
      const data = await ipc.getSystemInfo(kbPath)
      setInfo(data)
      const lag = await ipc.getMainLagSamples()
      setMainLagSamples(lag)
    } catch (err) {
      setError(String(err))
    }
  }

  // Poll renderer FPS samples
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      const samples = (window as any).__fpsSamples as { time: number; fps: number }[] | undefined
      if (samples && samples.length > 0) setRenderFps([...samples])
    }, 1000)
    return () => clearInterval(timer)
  }, [active])

  useEffect(() => {
    if (active !== false) load()
  }, [kbPath, active])

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-muted">加载中...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold text-text mb-6">系统信息</h2>

        <div className="space-y-5">
          <StatCard title="SQLite 索引库">
            <StatRow label="数据库文件" value={`pages.db · ${formatKB(info.sqlite.fileSizeKB)} · WAL 模式`} />
            <StatRow label="页面（数据库）" value={`${info.sqlite.pageCount} 条记录`} />
            <StatRow label="页面（磁盘）" value={`wiki/ 目录 ${info.sqlite.wikiDiskCount} 个 .md 文件`} />
            <StatRow label="源文件（磁盘）" value={`raw/ 目录 ${info.sqlite.rawDiskCount} 个文件`} />
            <StatRow label="源文件（数据库）" value={`${info.sqlite.sourceCount} 条记录（待编译 ${info.sqlite.sourceByStatus.pending} · 已编译 ${info.sqlite.sourceByStatus.compiled} · 失败 ${info.sqlite.sourceByStatus.failed}）`} />
            <StatRow label="链接" value={info.sqlite.linkCount} />
            <StatRow label="未解决冲突" value={info.sqlite.conflictCount} />
          </StatCard>

          <StatCard title="LanceDB 向量库">
            <StatRow label="数据库目录" value={`vectors.lancedb · ${formatKB(info.lancedb.dirSizeKB)}`} />
            <StatRow label="总块数" value={info.lancedb.totalChunks} />
            <StatRow label="页面块" value={info.lancedb.pageChunks} />
            <StatRow label="源块" value={info.lancedb.sourceChunks} />
          </StatCard>

          <StatCard title="嵌入模型">
            <StatRow label="模型" value={info.embedding.model} />
            <StatRow label="向量维度" value={info.embedding.dimension} />
            <StatRow label="状态" value={info.embedding.ready ? '已就绪' : '未加载'} />
          </StatCard>

          <StatCard title="存储概况">
            <StatRow label=".index/ 总大小" value={formatKB(info.storage.indexDirSizeKB)} />
            <StatRow label="编译历史" value={`${info.storage.compileLogEntries} 条`} />
            <StatRow label="上次索引重建" value={info.storage.lastRebuild} />
          </StatCard>

          <StatCard title="事件循环诊断（实时）">
            <StatRow
              label="主进程卡顿事件"
              value={mainLagSamples.length === 0 ? '无' : `${mainLagSamples.length} 次`}
            />
            {mainLagSamples.length > 0 && (
              <StatRow
                label="最近主进程阻塞"
                value={mainLagSamples.slice(-5).map(s => `${s.delay}ms`).join(' · ') || '-'}
              />
            )}
            <StatRow
              label="渲染进程低帧率事件"
              value={renderFps.filter(s => s.fps < 30).length === 0 ? '无' : `${renderFps.filter(s => s.fps < 30).length} 次`}
            />
            {renderFps.length > 0 && (
              <StatRow
                label="当前渲染帧率"
                value={`${renderFps[renderFps.length - 1].fps} FPS`}
              />
            )}
          </StatCard>
        </div>
      </div>
    </div>
  )
}
