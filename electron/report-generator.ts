/**
 * Daily QA Report Generator
 *
 * Produces a Markdown report summarizing QA activity, pipeline health,
 * costs, feedback, and knowledge gaps. Designed to be saved to
 * wiki/reports/ and committed as part of the knowledge base.
 *
 * Usage: generateDailyReport(kbPath) → markdown string
 */
import { getQAAnalyticsStats } from './qa-analytics'
import { getLLMLogStats } from './llm-logger'
import { getGapStats } from './gap-store'

export function generateDailyReport(kbPath: string): string {
  const qa = getQAAnalyticsStats(kbPath, 200)
  const llm = getLLMLogStats(kbPath)
  const gaps = getGapStats(kbPath)
  const today = new Date().toISOString().slice(0, 10)

  const lines: string[] = [
    `# QA 日报 — ${today}`,
    '',
    '> 自动生成 · 估算值仅供参考',
    '',
    '## 概览',
    '',
    `| 指标 | 数值 |`,
    `|------|------|`,
  ]

  if (qa.totalCalls > 0) {
    lines.push(
      `| 问答次数 | ${qa.totalCalls} |`,
      `| 成功率 | ${qa.successRate}% |`,
      `| 平均总耗时 | ${qa.avgTotalMs}ms |`,
      `| LLM 调用次数 | ${llm.totalCalls} |`,
      `| LLM 错误次数 | ${llm.totalErrors} |`,
      `| 估算成本 | $${llm.totalCostEstimate?.toFixed(4) ?? '0'} |`,
    )
  } else {
    lines.push(`| 问答次数 | 0 |`)
  }

  if (qa.totalCalls > 0) {
    lines.push(
      '',
      '## 管道耗时',
      '',
      `| 阶段 | 平均耗时 |`,
      `|------|---------|`,
      `| 嵌入 | ${qa.avgEmbeddingMs}ms |`,
      `| 向量检索 | ${qa.avgSearchMs}ms |`,
      `| 过滤重排 | ${qa.avgFilterRerankMs}ms |`,
      `| 上下文构建 | ${qa.avgContextBuildMs}ms |`,
      `| LLM 生成 | ${qa.avgLlmMs}ms |`,
      '',
      '## 检索健康',
      '',
      `| 指标 | 数值 |`,
      `|------|------|`,
      `| 平均检索返回 | ${qa.avgRawResultCount} |`,
      `| 相似度通过率 | ${qa.avgPassRate}% |`,
      `| 最终使用块数 | ${qa.avgFinalCount} |`,
      `| 截断率 | ${qa.truncationRate}% |`,
      `| 平均来源数 | ${qa.avgSourceCount} |`,
      `| 答案平均长度 | ${qa.avgAnswerLength} 字符 |`,
    )
  }

  if (llm.errorsByCategory && Object.keys(llm.errorsByCategory).length > 0) {
    lines.push(
      '',
      '## LLM 错误分类',
      '',
      ...Object.entries(llm.errorsByCategory).map(([cat, count]) => `- ${cat}: ${count} 次`),
    )
  }

  lines.push(
    '',
    '## 知识缺口',
    '',
    `- 总计: ${gaps.total}（未解决: ${gaps.unresolved} · 已解决: ${gaps.resolved}）`,
  )

  if (gaps.byTopic && gaps.byTopic.length > 0) {
    lines.push('', '### 缺口主题分布', '')
    for (const t of gaps.byTopic.slice(0, 5)) {
      lines.push(`- ${t.topic}: ${t.count}`)
    }
  }

  lines.push(
    '',
    '---',
    '',
    `*报告由 KnowCompile 自动生成 · ${new Date().toLocaleString('zh-CN')}*`,
  )

  return lines.join('\n')
}
