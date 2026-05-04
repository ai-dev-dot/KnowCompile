import { useState, useEffect } from 'react'
import PageList from '../components/PageList'
import MarkdownRenderer from '../components/MarkdownRenderer'
import { useIPC } from '../hooks/useIPC'

interface Props {
  kbPath: string
  active?: boolean
}

export default function WikiView({ kbPath, active }: Props) {
  const [pages, setPages] = useState<{ name: string; path: string; modifiedAt: string }[]>([])
  const [activePage, setActivePage] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [backlinks, setBacklinks] = useState<string[]>([])
  const [links, setLinks] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ name: string }[] | null>(null)
  const ipc = useIPC()

  const [searchIndexBuilt, setSearchIndexBuilt] = useState(false)

  useEffect(() => {
    ipc.listWikiPages(kbPath).then(setPages)
  }, [kbPath, active])

  useEffect(() => {
    if (!active || searchIndexBuilt) return
    const t0 = performance.now()
    ipc.buildSearchIndex(kbPath).finally(() => {
      setSearchIndexBuilt(true)
      console.log(`[search-index] built in ${(performance.now() - t0).toFixed(0)} ms`)
    })
  }, [kbPath, active])

  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    if (q.trim().length > 0) {
      const results = await ipc.search(kbPath, q.trim())
      setSearchResults(results)
    } else {
      setSearchResults(null)
    }
  }

  const loadPage = async (page: { name: string; path: string }) => {
    const text = await ipc.readWikiPage(kbPath, `wiki/${page.name}.md`)
    setActivePage(page.path)
    setContent(text)
    const bl = await ipc.getBacklinks(kbPath, page.name)
    setBacklinks(bl)
    const ln = await ipc.extractLinks(text)
    setLinks(ln)
  }

  const navigateTo = async (pageName: string) => {
    // Strip trailing annotations like "（待创建）" to get the real page name
    const cleanName = pageName.replace(/[（(][^)）]*[)）]$/, '').trim()
    const found = pages.find(p => p.name === cleanName)
    if (found) {
      await loadPage(found)
    }
    // Silently skip non-existent pages — they haven't been created yet
  }

  // Existing page names for dead-link filtering
  const existingNames = new Set(pages.map(p => p.name))

  return (
    <div className="flex flex-1 overflow-hidden">
      <PageList
        title={searchResults ? `搜索结果 (${searchResults.length})` : 'Wiki 页面'}
        pages={searchResults
          ? searchResults.map(r => pages.find(p => p.name === r.name) || { name: r.name, path: `${kbPath}/wiki/${r.name}.md`, modifiedAt: '' })
          : pages
        }
        activePage={activePage ?? undefined}
        onSelect={loadPage}
      >
        <div className="px-3 py-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索页面..."
            className="w-full bg-gray-800 text-text rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </PageList>
      <main className="flex-1 overflow-y-auto">
        {activePage ? (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <MarkdownRenderer content={content} kbPath={kbPath} onLinkClick={navigateTo} />

            {/* Related pages — wiki-style footer */}
            <div className="mt-12 pt-6 border-t border-border space-y-4">
              {backlinks.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-text-muted mb-2">链接到此的页面</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {backlinks.map((name) => (
                      <button
                        key={name}
                        onClick={() => navigateTo(name)}
                        className="px-3 py-1 rounded-full bg-gray-800 text-sm text-link hover:bg-gray-700 hover:underline transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {links.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-text-muted mb-2">本页引用的页面</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {links
                      .filter(name => existingNames.has(name))
                      .map((name) => (
                        <button
                          key={name}
                          onClick={() => navigateTo(name)}
                          className="px-3 py-1 rounded-full bg-gray-800 text-sm text-link hover:bg-gray-700 hover:underline transition-colors"
                        >
                          {name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-text-muted text-lg">选择一个页面开始阅读</p>
          </div>
        )}
      </main>
    </div>
  )
}
