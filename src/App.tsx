import { useState, useEffect } from 'react'
import IconSidebar from './components/IconSidebar'
import WikiView from './views/WikiView'
import IngestView from './views/IngestView'
import QAView from './views/QAView'
import GraphView from './views/GraphView'
import SettingsView from './views/SettingsView'
import { useIPC } from './hooks/useIPC'

type View = 'wiki' | 'ingest' | 'qa' | 'graph' | 'settings'

export default function App() {
  const [activeView, setActiveView] = useState<View>('wiki')
  const [kbPath, setKbPath] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)
  const ipc = useIPC()

  useEffect(() => {
    (async () => {
      let path = await ipc.getKBPath()
      if (!path) {
        path = await ipc.selectKBPath()
        if (path) {
          await ipc.initKB(path)
          await ipc.setKBPath(path)
        }
      }
      setKbPath(path)
      setInitializing(false)
    })()
  }, [])

  if (initializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <p className="text-text-muted">加载中...</p>
      </div>
    )
  }

  if (!kbPath) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">AI 笔记</h1>
          <p className="text-text-muted mb-6">请选择一个目录作为知识库</p>
          <button
            onClick={async () => {
              const path = await ipc.selectKBPath()
              if (path) {
                await ipc.initKB(path)
                await ipc.setKBPath(path)
                setKbPath(path)
              }
            }}
            className="px-6 py-2 bg-accent text-gray-950 rounded-lg font-medium hover:opacity-90"
          >
            选择目录
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-surface overflow-hidden">
      <IconSidebar active={activeView} onChange={setActiveView} />
      <div className="flex-1 flex overflow-hidden">
        {activeView === 'wiki' && <WikiView kbPath={kbPath} />}
        {activeView === 'ingest' && <IngestView kbPath={kbPath} />}
        {activeView === 'qa' && <QAView kbPath={kbPath} />}
        {activeView === 'graph' && <GraphView kbPath={kbPath} />}
        {activeView === 'settings' && <SettingsView kbPath={kbPath} />}
      </div>
    </div>
  )
}
