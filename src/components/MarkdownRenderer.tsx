import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface Props {
  content: string
  onLinkClick?: (pageName: string) => void
}

export default function MarkdownRenderer({ content, onLinkClick }: Props) {
  return (
    <div className="prose prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ href, children }) => {
            if (href && href.startsWith('[[') && href.endsWith(']]')) {
              const pageName = href.slice(2, -2)
              return (
                <button
                  onClick={() => onLinkClick?.(pageName)}
                  className="text-link hover:underline"
                >
                  {children || pageName}
                </button>
              )
            }
            return (
              <a href={href} target="_blank" rel="noopener" className="text-link hover:underline">
                {children}
              </a>
            )
          },
          blockquote: ({ children }) => {
            const text = String(children)
            if (text.includes('⚠')) {
              return (
                <blockquote className="border-l-4 border-yellow-500 bg-yellow-500/10 px-4 py-2 my-3 rounded-r text-yellow-100">
                  {children}
                </blockquote>
              )
            }
            return (
              <blockquote className="border-l-4 border-accent bg-gray-800/50 px-4 py-2 my-3 rounded-r text-text-muted">
                {children}
              </blockquote>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
