import { useMemo, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface Props {
  content: string
  kbPath?: string
  onLinkClick?: (pageName: string) => void
}

/** Strip leading YAML frontmatter (standard --- ... --- at file start) */
export function stripLeadingFrontmatter(md: string): string {
  const trimmed = md.trimStart()
  if (!trimmed.startsWith('---')) return md
  const afterOpen = trimmed.slice(3)
  const closeIdx = afterOpen.indexOf('\n---\n')
  if (closeIdx < 0) return md
  // Only strip if it looks like YAML (has key: value pairs)
  const fm = afterOpen.slice(0, closeIdx)
  if (!/^\w+:[\s\S]/m.test(fm)) return md
  return afterOpen.slice(closeIdx + 5) // skip "\n---\n"
}

/** Convert [[page name]] to [page name](#wiki:encoded) for react-markdown linking */
export function convertWikiLinks(md: string): string {
  // Only convert [[...]] outside code blocks
  // Strategy: split by fenced code blocks, only convert outside blocks
  const codeBlockRegex = /(```[\s\S]*?```)/g
  const parts = md.split(codeBlockRegex)
  // Odd indices are code blocks, even indices are regular text
  return parts.map((part, i) => {
    if (i % 2 !== 0) return part // skip fenced code blocks
    return part.replace(/\[\[([^\]]+)\]\]/g, (_match, pageName: string) => {
      const slug = pageName.trim()
      return `[${slug}](#wiki:${encodeURIComponent(slug)})`
    })
  }).join('')
}

function ResolvedImage({ src, alt, kbPath }: { src?: string; alt?: string; kbPath?: string }) {
  const [resolved, setResolved] = useState<string | undefined>(undefined)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!src) return
    // Keep absolute URLs and data URIs as-is
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      setResolved(src)
      return
    }
    // Relative path — try raw/ then wiki/
    if (kbPath) {
      let cancelled = false
      ;(async () => {
        for (const dir of ['raw', 'wiki']) {
          const result = await window.electronAPI.invoke('assets:read', kbPath, `${dir}/${src}`)
          if (result?.success && result.data) {
            if (!cancelled) setResolved(result.data)
            return
          }
        }
        if (!cancelled) setError(true)
      })()
      return () => { cancelled = true }
    }
    setError(true)
  }, [src, kbPath])

  if (!src) return null
  if (error) return <span className="text-text-muted italic text-sm">{alt || src}</span>
  return (
    <img
      src={resolved ?? undefined}
      alt={alt || ''}
      className="max-w-full h-auto rounded-lg my-2 border border-border"
      loading="lazy"
    />
  )
}

export default function MarkdownRenderer({ content, kbPath, onLinkClick }: Props) {
  const processed = useMemo(() => {
    let md = content
    md = stripLeadingFrontmatter(md)
    md = convertWikiLinks(md)
    return md
  }, [content])

  return (
    <div className="prose prose-invert max-w-none
      prose-headings:text-text prose-headings:font-semibold
      prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-4
      prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border
      prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2
      prose-p:text-text-muted prose-p:leading-relaxed prose-p:my-2
      prose-a:text-link prose-a:no-underline hover:prose-a:underline
      prose-strong:text-text
      prose-code:text-pink-300 prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-gray-900 prose-pre:border prose-pre:border-border prose-pre:rounded-lg
      prose-blockquote:border-l-4 prose-blockquote:border-accent prose-blockquote:bg-gray-800/50 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:my-3 prose-blockquote:rounded-r prose-blockquote:not-italic prose-blockquote:text-text-muted
      prose-table:border-separate prose-table:border-spacing-0 prose-table:w-full
      prose-thead:bg-gray-800
      prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:text-sm prose-th:font-semibold prose-th:text-text
      prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-td:text-text-muted
      prose-li:text-text-muted
      prose-hr:border-border
      prose-ul:my-2 prose-ol:my-2
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          img: ({ src, alt }: any) => (
            <ResolvedImage src={src} alt={alt} kbPath={kbPath} />
          ),
          a: ({ href, children, ...props }) => {
            if (href?.startsWith('#wiki:')) {
              const pageName = decodeURIComponent(href.slice(6))
              return (
                <button
                  onClick={(e) => { e.preventDefault(); onLinkClick?.(pageName) }}
                  className="text-link hover:underline font-medium"
                  {...props as any}
                >
                  {children || pageName}
                </button>
              )
            }
            return (
              <a href={href} target="_blank" rel="noopener" className="text-link hover:underline" {...props as any}>
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
            return <blockquote className="border-l-4 border-accent bg-gray-800/50 px-4 py-2 my-3 rounded-r">{children}</blockquote>
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-border">
              <table className="min-w-full">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-800">{children}</thead>,
          th: ({ children }) => <th className="border border-border px-3 py-2 text-sm font-semibold text-text text-left">{children}</th>,
          td: ({ children }) => <td className="border border-border px-3 py-2 text-sm text-text-muted">{children}</td>,
          code: ({ className, children, ...props }: any) => {
            const isInline = !className
            if (isInline) {
              return <code className="text-pink-300 bg-gray-800 px-1.5 py-0.5 rounded text-sm" {...props}>{children}</code>
            }
            return <code className={className} {...props}>{children}</code>
          },
          pre: ({ children }) => (
            <pre className="bg-gray-900 border border-border rounded-lg p-4 overflow-x-auto text-sm my-4">
              {children}
            </pre>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}
