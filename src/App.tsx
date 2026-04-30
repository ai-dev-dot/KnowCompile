import { useState, useEffect } from 'react'
import IconSidebar from './components/IconSidebar'
import Onboarding from './components/Onboarding'
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
  const [showOnboarding, setShowOnboarding] = useState(false)
  const ipc = useIPC()

  useEffect(() => {
    (async () => {
      const path = await ipc.getKBPath()
      if (!path) {
        setShowOnboarding(true)
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

  if (showOnboarding) {
    return (
      <Onboarding onComplete={(path) => {
        setKbPath(path)
        setShowOnboarding(false)
      }} />
    )
  }

  return (
    <div className="h-screen flex bg-surface overflow-hidden">
      <IconSidebar active={activeView} onChange={setActiveView} />
      <div className="flex-1 flex overflow-hidden">
        <div className={activeView === 'wiki' ? 'flex flex-1 overflow-hidden' : 'hidden'}><WikiView kbPath={kbPath} /></div>
        <div className={activeView === 'ingest' ? 'flex flex-1 overflow-hidden' : 'hidden'}><IngestView kbPath={kbPath} /></div>
        <div className={activeView === 'qa' ? 'flex flex-1 overflow-hidden' : 'hidden'}><QAView kbPath={kbPath} /></div>
        <div className={activeView === 'graph' ? 'flex flex-1 overflow-hidden' : 'hidden'}><GraphView kbPath={kbPath} /></div>
        <div className={activeView === 'settings' ? 'flex flex-1 overflow-hidden' : 'hidden'}><SettingsView kbPath={kbPath} /></div>
      </div>
    </div>
  )
}
