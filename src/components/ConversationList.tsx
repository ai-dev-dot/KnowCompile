interface ConvSummary {
  id: string
  title: string
  updatedAt: string
}

interface Props {
  conversations: ConvSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onCreate: () => void
}

export default function ConversationList({ conversations, activeId, onSelect, onCreate, onDelete }: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3">
        <button
          onClick={onCreate}
          className="w-full px-3 py-2 bg-accent text-gray-950 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
        >
          新对话
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-text-muted text-xs mb-1">暂无对话</p>
            <p className="text-text-muted/60 text-xs">点击上方按钮开始提问</p>
          </div>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`group px-3 py-2.5 cursor-pointer transition-colors border-l-2 ${
                activeId === conv.id
                  ? 'border-l-accent bg-gray-800/50'
                  : 'border-l-transparent hover:bg-gray-800/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-text truncate flex-1">
                  {conv.title}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                  className="ml-2 text-text-muted/40 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除对话"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                {formatTime(conv.updatedAt)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}小时前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
