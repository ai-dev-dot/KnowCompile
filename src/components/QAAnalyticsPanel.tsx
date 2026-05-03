import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string; refreshKey?: number }

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-border p-4">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{title}</h3>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  )
}

function StatRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-sm ${highlight ? 'text-accent' : 'text-text'}`}>{value}</span>
    </div>
  )
}

export default function QAAnalyticsPanel({ kbPath, refreshKey }: Props) {
  const [qaStats, setQaStats] = useState<any>(null)
  const [llmStats, setLlmStats] = useState<any>(null)
  const [gapStats, setGapStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const ipc = useIPC()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      ipc.getQAAnalyticsStats(kbPath),
      ipc.getLLMLogStats(kbPath),
      ipc.getGapStats(kbPath),
    ]).then(([qa, llm, gap]) => {
      if (cancelled) return
      setQaStats(qa)
      setLlmStats(llm)
      setGapStats(gap)
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [kbPath, refreshKey])

  if (loading) {
    return <div className="text-text-muted text-sm p-8 text-center">加载 QA 分析数据...</div>
  }

  if (!qaStats || qaStats.totalCalls === 0) {
    return (
      <div className="text-text-muted/60 text-sm p-8 text-center">
        <p>暂无 QA 分析数据。</p>
        <p className="mt-1">开始提问后，这里会展示管道耗时、检索质量、成本等指标。</p>
      </div>
    )
  }

  const qa = qaStats
  const llm = llmStats || {}
  const gaps = gapStats || {}

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg border border-border p-4 text-center">
          <div className="text-2xl font-semibold text-text">{qa.totalCalls}</div>
          <div className="text-xs text-text-muted mt-1">总问答次数</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-border p-4 text-center">
          <div className={`text-2xl font-semibold ${qa.successRate >= 90 ? 'text-green-400' : 'text-yellow-400'}`}>{qa.successRate}%</div>
          <div className="text-xs text-text-muted mt-1">成功率</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-border p-4 text-center">
          <div className="text-2xl font-semibold text-text">{qa.avgTotalMs}ms</div>
          <div className="text-xs text-text-muted mt-1">平均总耗时</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-border p-4 text-center">
          <div className="text-2xl font-semibold text-accent">
            ${typeof llm.totalCostEstimate === 'number' ? llm.totalCostEstimate.toFixed(4) : '0'}
          </div>
          <div className="text-xs text-text-muted mt-1">估算成本 (参考)</div>
        </div>
      </div>

      {/* Pipeline timing breakdown */}
      <StatCard title="管道耗时分解 (ms)">
        <StatRow label="嵌入 (Embedding)" value={qa.avgEmbeddingMs} />
        <StatRow label="向量检索 (Search)" value={qa.avgSearchMs} />
        <StatRow label="过滤重排 (Filter)" value={qa.avgFilterRerankMs} />
        <StatRow label="上下文构建 (Context)" value={qa.avgContextBuildMs} />
        <StatRow label="LLM 生成" value={qa.avgLlmMs} highlight />
      </StatCard>

      {/* Retrieval health */}
      <StatCard title="检索健康度">
        <StatRow label="检索返回数" value={qa.avgRawResultCount} />
        <StatRow label="相似度通过率" value={`${qa.avgPassRate}%`} />
        <StatRow label="通过阈值数" value={qa.avgPassedThreshold} />
        <StatRow label="去重后数" value={qa.avgAfterDedup} />
        <StatRow label="最终使用块数" value={qa.avgFinalCount} />
        <StatRow label="截断率" value={`${qa.truncationRate}%`} />
        <StatRow label="平均来源数" value={qa.avgSourceCount} />
        <StatRow label="答案平均长度" value={`${qa.avgAnswerLength} 字符`} />
      </StatCard>

      {/* LLM stats */}
      <StatCard title="LLM 调用统计">
        <StatRow label="总调用次数" value={llm.totalCalls ?? 0} />
        <StatRow label="错误次数" value={llm.totalErrors ?? 0} />
        <StatRow label="平均耗时" value={`${llm.avgDurationMs ?? 0}ms`} />
        <StatRow label="估算总成本" value={`$${typeof llm.totalCostEstimate === 'number' ? llm.totalCostEstimate.toFixed(4) : '0'}`} highlight />
        {llm.callsByRole && (
          <StatRow label="按角色分布" value={Object.entries(llm.callsByRole).map(([k, v]) => `${k}:${v}`).join(', ')} />
        )}
        {llm.errorsByCategory && Object.keys(llm.errorsByCategory).length > 0 && (
          <StatRow label="错误分类" value={Object.entries(llm.errorsByCategory).map(([k, v]) => `${k}:${v}`).join(', ')} />
        )}
      </StatCard>

      {/* Gaps */}
      <StatCard title="知识缺口">
        <StatRow label="总缺口数" value={gaps.total ?? 0} />
        <StatRow label="未解决" value={gaps.unresolved ?? 0} />
        <StatRow label="已解决" value={gaps.resolved ?? 0} />
        {gaps.byTopic && gaps.byTopic.length > 0 && (
          <StatRow label="主题分布" value={gaps.byTopic.slice(0, 5).map((t: any) => `${t.topic}(${t.count})`).join(', ')} />
        )}
      </StatCard>

      {/* Settings snapshot */}
      <StatCard title="当前参数 (最新一次)">
        <StatRow label="相似度阈值" value={qa.latestThreshold} />
        <StatRow label="检索数量" value={qa.latestRetrievalCount} />
        <StatRow label="最终 Top-K" value={qa.latestFinalTopK} />
        <StatRow label="Token 预算" value={qa.latestTokenBudget} />
      </StatCard>
    </div>
  )
}
