import MarkdownRenderer from './MarkdownRenderer'

interface Source {
  title: string
  chunk_index: number
  similarity: number
}

interface Props {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  suggestions?: string[]
  onSuggestionClick?: (question: string) => void
  sources?: Source[]
  msgIndex?: number
  onFeedback?: (type: 'helpful' | 'inaccurate' | 'more_detail') => void
  feedbackState?: 'helpful' | 'inaccurate' | 'more_detail' | null
  onArchive?: () => void
  archived?: boolean
  /** When true, show a "已停止生成" marker at the end. */
  partial?: boolean
}

export default function ChatMessage({ role, content, thinking, suggestions, onSuggestionClick, sources, msgIndex, onFeedback, feedbackState, onArchive, archived, partial }: Props) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
        role === 'user'
          ? 'bg-accent/30 border border-accent/40 text-text'
          : 'bg-gray-800 text-text'
      }`}>
        {/* Thinking/reasoning display */}
        {role === 'assistant' && thinking && (
          <details className="mb-2 text-xs">
            <summary className="text-text-muted cursor-pointer hover:text-text">推理过程</summary>
            <pre className="mt-1 whitespace-pre-wrap text-text-muted/70 border-l-2 border-gray-600 pl-2 max-h-48 overflow-y-auto">{thinking}</pre>
          </details>
        )}

        {/* Answer content — use MarkdownRenderer for assistant, plain text for user */}
        <div className={`text-sm max-w-none ${role === 'user' ? 'whitespace-pre-wrap' : ''}`}>
          {role === 'assistant' && !partial
            ? <MarkdownRenderer content={content} />
            : <span className="whitespace-pre-wrap">{content}</span>
          }
        </div>

        {/* Partial marker */}
        {partial && (
          <span className="text-xs text-text-muted mt-1 block">已停止生成</span>
        )}

        {/* Sources — numbered list */}
        {sources && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <span className="text-xs text-text-muted">信息来源：</span>
            <ol className="mt-1 list-decimal list-inside">
              {sources.map((s, i) => (
                <li key={i} id={`source-${msgIndex}-${i}`} className="text-xs text-link scroll-mt-16">
                  {s.title}（{Math.round(s.similarity * 100)}%）
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Suggested follow-up questions */}
        {role === 'assistant' && suggestions && suggestions.length > 0 && onSuggestionClick && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <span className="text-xs text-text-muted mb-1 block">继续提问：</span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => onSuggestionClick(q)}
                  className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Feedback buttons */}
        {role === 'assistant' && (onFeedback || onArchive) && (
          <div className="mt-2 pt-2 border-t border-gray-700 flex items-center gap-2 flex-wrap">
            {onFeedback && (
              <>
                <button
                  onClick={() => onFeedback('helpful')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    feedbackState === 'helpful'
                      ? 'bg-green-900/80 text-green-300'
                      : 'bg-green-900/50 text-green-400 hover:bg-green-900'
                  }`}
                >
                  {feedbackState === 'helpful' ? '✓ 有帮助' : '有帮助'}
                </button>
                <button
                  onClick={() => onFeedback('inaccurate')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    feedbackState === 'inaccurate'
                      ? 'bg-red-900/80 text-red-300'
                      : 'bg-red-900/50 text-red-400 hover:bg-red-900'
                  }`}
                >
                  {feedbackState === 'inaccurate' ? '✓ 不准确' : '不准确'}
                </button>
                <button
                  onClick={() => onFeedback('more_detail')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    feedbackState === 'more_detail'
                      ? 'bg-yellow-900/80 text-yellow-300'
                      : 'bg-yellow-900/50 text-yellow-400 hover:bg-yellow-900'
                  }`}
                >
                  {feedbackState === 'more_detail' ? '✓ 需更详细' : '需更详细'}
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
