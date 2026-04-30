interface PageItem {
  name: string
  path: string
  modifiedAt: string
}

interface Props {
  title: string
  pages: PageItem[]
  activePage?: string
  onSelect: (page: PageItem) => void
}

export default function PageList({ title, pages, activePage, onSelect }: Props) {
  return (
    <aside className="w-[220px] bg-panel flex flex-col flex-shrink-0 border-r border-border">
      <div className="px-4 py-3 text-sm font-semibold text-text border-b border-border">
        {title}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {pages.length === 0 ? (
          <p className="text-text-muted text-xs p-3">暂无页面</p>
        ) : (
          pages.map((page) => (
            <button
              key={page.path}
              onClick={() => onSelect(page)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm mb-0.5 transition-colors truncate ${
                activePage === page.path
                  ? 'bg-gray-700 text-white'
                  : 'text-text-muted hover:bg-gray-800 hover:text-white'
              }`}
            >
              {page.name}
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
