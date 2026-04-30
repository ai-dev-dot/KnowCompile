interface Props {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

export default function ChatMessage({ role, content, sources }: Props) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 ${
        role === 'user'
          ? 'bg-accent text-gray-950'
          : 'bg-gray-800 text-text'
      }`}>
        <div className="prose prose-invert text-sm max-w-none whitespace-pre-wrap">
          {content}
        </div>
        {sources && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <span className="text-xs text-text-muted">来源：</span>
            {sources.map((s, i) => (
              <span key={i} className="text-xs text-link ml-2">{s}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
