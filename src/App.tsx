import { useState, useEffect } from 'react'
import IconSidebar from './components/IconSidebar'
import Onboarding from './components/Onboarding'
import WikiView from './views/WikiView'
import IngestView from './views/IngestView'
import QAView from './views/QAView'
import GraphView from './views/GraphView'
import SettingsView from './views/SettingsView'
import SystemView from './views/SystemView'
import LogViewer from './views/LogViewer'
import { useIPC } from './hooks/useIPC'

type View = 'wiki' | 'ingest' | 'qa' | 'graph' | 'settings' | 'system' | 'logs'

export default function App() {
  const [activeView, setActiveView] = useState<View>('qa')
  const [kbPath, setKbPath] = useState<string | null>(null)
  const [phase, setPhase] = useState<'init' | 'preload' | 'ready' | 'onboarding'>('init')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const ipc = useIPC()

  useEffect(() => {
    (async () => {
      const path = await ipc.getKBPath()
      if (!path) {
        setShowOnboarding(true)
        setPhase('onboarding')
        return
      }
      setKbPath(path)

      // Block on embedding preload — don't enter the app until the AI engine is ready
      setPhase('preload')
      try {
        await ipc.invoke('preload:embedding', path)
      } catch {
        // Model load failed — still allow entering the app
      }
      setPhase('ready')
    })()
  }, [])

  if (phase === 'init') {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (phase === 'preload') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-surface gap-6">
        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-text text-lg font-medium mb-1">正在准备 AI 引擎</p>
          <p className="text-text-muted text-sm">正在加载本地 AI 嵌入模型，请稍候...</p>
        </div>
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
        <div className={activeView === 'wiki' ? 'flex flex-1 overflow-hidden' : 'hidden'}><WikiView kbPath={kbPath} active={activeView === 'wiki'} /></div>
        <div className={activeView === 'ingest' ? 'flex flex-1 overflow-hidden' : 'hidden'}><IngestView kbPath={kbPath} active={activeView === 'ingest'} /></div>
        <div className={activeView === 'qa' ? 'flex flex-1 overflow-hidden' : 'hidden'}><QAView kbPath={kbPath} /></div>
        <div className={activeView === 'graph' ? 'flex flex-1 overflow-hidden' : 'hidden'}><GraphView kbPath={kbPath} /></div>
        <div className={activeView === 'settings' ? 'flex flex-1 overflow-hidden' : 'hidden'}><SettingsView kbPath={kbPath} /></div>
        <div className={activeView === 'system' ? 'flex flex-1 overflow-hidden' : 'hidden'}><SystemView kbPath={kbPath} active={activeView === 'system'} /></div>
        <div className={activeView === 'logs' ? 'flex flex-1 overflow-hidden' : 'hidden'}><LogViewer kbPath={kbPath} active={activeView === 'logs'} /></div>
      </div>
    </div>
  )
}
