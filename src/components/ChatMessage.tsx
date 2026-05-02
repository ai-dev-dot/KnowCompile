interface Source {
  title: string
  chunk_index: number
  similarity: number
}

interface Props {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  onFeedback?: (type: 'helpful' | 'inaccurate' | 'more_detail') => void
  onArchive?: () => void
  archived?: boolean
}

export default function ChatMessage({ role, content, sources, onFeedback, onArchive, archived }: Props) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
        role === 'user'
          ? 'bg-accent/30 border border-accent/40 text-text'
          : 'bg-gray-800 text-text'
      }`}>
        <div className={`text-sm max-w-none whitespace-pre-wrap ${role === 'user' ? '' : 'prose prose-invert'}`}>
          {content}
        </div>
        {sources && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <span className="text-xs text-text-muted">信息来源：</span>
            <ol className="mt-1 list-decimal list-inside">
              {sources.map((s, i) => (
                <li key={i} className="text-xs text-link">
                  {s.title}（{Math.round(s.similarity * 100)}%）
                </li>
              ))}
            </ol>
          </div>
        )}
        {role === 'assistant' && (onFeedback || onArchive) && (
          <div className="mt-2 pt-2 border-t border-gray-700 flex items-center gap-2 flex-wrap">
            {onFeedback && (
              <>
                <button
                  onClick={() => onFeedback('helpful')}
                  className="text-xs px-2 py-1 rounded bg-green-900/50 text-green-400 hover:bg-green-900 transition-colors"
                >
                  有帮助
                </button>
                <button
                  onClick={() => onFeedback('inaccurate')}
                  className="text-xs px-2 py-1 rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors"
                >
                  不准确
                </button>
                <button
                  onClick={() => onFeedback('more_detail')}
                  className="text-xs px-2 py-1 rounded bg-yellow-900/50 text-yellow-400 hover:bg-yellow-900 transition-colors"
                >
                  需更详细
                </button>
              </>
            )}
            {onArchive && (
              <button
                onClick={onArchive}
                disabled={archived}
                className={`text-xs px-2 py-1 rounded ml-auto transition-colors ${
                  archived
                    ? 'bg-gray-700 text-text-muted cursor-not-allowed'
                    : 'bg-accent/20 text-accent hover:bg-accent/30'
                }`}
              >
                {archived ? '已归档' : '归档到 Wiki'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
