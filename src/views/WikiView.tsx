import { useState, useEffect } from 'react'
import PageList from '../components/PageList'
import MarkdownRenderer from '../components/MarkdownRenderer'
import RightPanel from '../components/RightPanel'
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
  const [showPanel, setShowPanel] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ name: string }[] | null>(null)
  const ipc = useIPC()

  useEffect(() => {
    if (active !== false) {
      ipc.listWikiPages(kbPath).then(setPages)
    }
  }, [kbPath, active])

  useEffect(() => {
    ipc.buildSearchIndex(kbPath)
  }, [kbPath])

  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    if (q.trim().length > 0) {
      const results = await ipc.search(q.trim())
      setSearchResults(results)
    } else {
      setSearchResults(null)
    }
  }

  const loadPage = async (page: { name: string; path: string }) => {
    const text = await ipc.readWikiPage(page.path)
    setActivePage(page.path)
    setContent(text)
    const bl = await ipc.getBacklinks(kbPath, page.name)
    setBacklinks(bl)
    const ln = await ipc.extractLinks(text)
    setLinks(ln)
  }

  const navigateTo = async (pageName: string) => {
    const found = pages.find(p => p.name === pageName)
    if (found) {
      await loadPage(found)
    }
  }

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
      <main className="flex-1 overflow-y-auto p-8">
        {activePage ? (
          <MarkdownRenderer content={content} onLinkClick={navigateTo} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-text-muted text-lg">选择一个页面开始阅读</p>
          </div>
        )}
      </main>
      <RightPanel
        visible={showPanel}
        backlinks={backlinks}
        links={links}
        onNavigate={navigateTo}
        onClose={() => setShowPanel(false)}
      />
    </div>
  )
}
