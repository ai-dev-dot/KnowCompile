interface Props {
  visible: boolean
  backlinks: string[]
  links: string[]
  onNavigate: (pageName: string) => void
  onClose: () => void
}

export default function RightPanel({ visible, backlinks, links, onNavigate, onClose }: Props) {
  if (!visible) return null

  return (
    <aside className="w-[200px] bg-panel flex-shrink-0 border-l border-border p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">页面信息</span>
        <button onClick={onClose} className="text-text-muted hover:text-white text-sm">✕</button>
      </div>

      <div className="mb-6">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">反向链接</h4>
        {backlinks.length === 0 ? (
          <p className="text-xs text-text-muted">暂无</p>
        ) : (
          backlinks.map((name) => (
            <button
              key={name}
              onClick={() => onNavigate(name)}
              className="block w-full text-left text-sm text-link hover:underline py-0.5"
            >
              ← {name}
            </button>
          ))
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">页面链接</h4>
        {links.length === 0 ? (
          <p className="text-xs text-text-muted">暂无</p>
        ) : (
          links.map((name) => (
            <button
              key={name}
              onClick={() => onNavigate(name)}
              className="block w-full text-left text-sm text-link hover:underline py-0.5"
            >
              → {name}
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
