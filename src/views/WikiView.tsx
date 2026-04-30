import { useState, useEffect } from 'react'
import PageList from '../components/PageList'
import MarkdownRenderer from '../components/MarkdownRenderer'
import RightPanel from '../components/RightPanel'
import { useIPC } from '../hooks/useIPC'

interface Props {
  kbPath: string
}

export default function WikiView({ kbPath }: Props) {
  const [pages, setPages] = useState<{ name: string; path: string; modifiedAt: string }[]>([])
  const [activePage, setActivePage] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [backlinks, setBacklinks] = useState<string[]>([])
  const [links, setLinks] = useState<string[]>([])
  const [showPanel, setShowPanel] = useState(true)
  const ipc = useIPC()

  useEffect(() => {
    ipc.listWikiPages(kbPath).then(setPages)
  }, [kbPath])

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
        title="Wiki 页面"
        pages={pages}
        activePage={activePage ?? undefined}
        onSelect={loadPage}
      />
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
