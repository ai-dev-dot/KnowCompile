interface Props {
  gapCount: number
  archiveCount: number
  feedbackCount: number
}

export default function GrowthSummary({ gapCount, archiveCount, feedbackCount }: Props) {
  if (gapCount === 0 && archiveCount === 0 && feedbackCount === 0) return null

  return (
    <div className="flex gap-3 text-xs text-text-muted">
      {archiveCount > 0 && (
        <span className="text-accent">{archiveCount} 个归档</span>
      )}
      {gapCount > 0 && (
        <span className="text-yellow-400">{gapCount} 个缺口</span>
      )}
      {feedbackCount > 0 && (
        <span>{feedbackCount} 条反馈</span>
      )}
      <span className="text-text-muted/50">· 知识库持续生长中</span>
    </div>
  )
}
