interface KnowledgeGap {
  id: string
  question: string
  createdAt: string
  resolved: boolean
}

interface Props {
  gaps: KnowledgeGap[]
  onDelete: (id: string) => void
  onJumpToIngest: () => void
}

export default function GapPanel({ gaps, onDelete, onJumpToIngest }: Props) {
  const unresolved = gaps.filter(g => !g.resolved)

  return (
    <div className="bg-gray-900 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-text">知识缺口</span>
        <span className="text-xs text-text-muted">{unresolved.length} 个待处理</span>
      </div>

      {unresolved.length === 0 ? (
        <p className="text-xs text-text-muted/60 text-center py-4">
          暂无知识缺口。当 AI 无法回答时会自动记录。
        </p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {unresolved.map(gap => (
            <div key={gap.id} className="flex items-start gap-2 text-xs text-text-muted group">
              <span className="mt-0.5 text-accent cursor-pointer hover:underline flex-1" onClick={onJumpToIngest}>
                {gap.question}
              </span>
              <button
                onClick={() => onDelete(gap.id)}
                className="text-text-muted/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {unresolved.length > 0 && (
        <button
          onClick={onJumpToIngest}
          className="mt-2 w-full text-xs px-2 py-1 bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors"
        >
          导入资料填补缺口
        </button>
      )}
    </div>
  )
}
