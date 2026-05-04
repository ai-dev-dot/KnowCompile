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

interface PreloadState {
  step: number
  label: string
  detail: string
  total: number
  done: boolean
}

export default function App() {
  const [activeView, setActiveView] = useState<View>('qa')
  const [kbPath, setKbPath] = useState<string | null>(null)
  const [phase, setPhase] = useState<'init' | 'preload' | 'ready' | 'onboarding'>('init')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [preload, setPreload] = useState<PreloadState>({ step: 0, label: '', detail: '', total: 4, done: false })
  const ipc = useIPC()

  // -------------------------------------------------------------------------
  // Renderer FPS / jank monitor — writes samples to window.__fpsSamples
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready') return
    const samples: { time: number; fps: number }[] = [];
    (window as any).__fpsSamples = samples
    let lastTick = performance.now()
    let frameCount = 0
    let rafId: number
    const tick = () => {
      frameCount++
      const now = performance.now()
      if (now - lastTick >= 1000) {
        const fps = Math.round(frameCount / ((now - lastTick) / 1000))
        samples.push({ time: Date.now(), fps })
        if (samples.length > 120) samples.shift()
        if (fps < 30) console.warn(`[render-lag] low FPS: ${fps}`)
        frameCount = 0
        lastTick = now
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [phase])

  useEffect(() => {
    const off = ipc.onPreloadProgress((p) => {
      setPreload({ ...p, done: false })
    })
    return off
  }, [])

  useEffect(() => {
    (async () => {
      const path = await ipc.getKBPath()
      if (!path) {
        setShowOnboarding(true)
        setPhase('onboarding')
        return
      }
      setKbPath(path)

      // Block on all heavy services — don't enter the app until the AI engine, vector DB,
      // and SQLite are fully initialized. Sequential loading with progress updates.
      setPhase('preload')
      setPreload({ step: 0, label: '准备中', detail: '即将启动...', total: 4, done: false })
      try {
        await ipc.invoke('preload:embedding', path)
      } catch {
        // Model load failed — still allow entering the app
      }
      setPreload(prev => ({ ...prev, done: true }))
      // Hold on "done" screen for 1 second so user sees all green checks
      await new Promise(resolve => setTimeout(resolve, 1000))
      setPhase('ready')
    })()
  }, [])

  if (phase === 'init') {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1e1e2e]">
        <div className="w-9 h-9 rounded-xl border border-[#cba6f7]/30 flex items-center justify-center">
          <div className="w-4 h-4 border border-[#cba6f7] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (phase === 'preload') {
    const steps = [
      { n: 1, label: 'SQLite 数据库' },
      { n: 2, label: '向量数据库' },
      { n: 3, label: '嵌入模型' },
      { n: 4, label: '嵌入模型预热' },
    ]
    const allDone = preload.done

    if (allDone) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-[#1e1e2e] gap-8">
          <div className="text-center">
            <p className="text-[#cdd6f4] text-xl font-medium mb-1">正在进入应用</p>
            <p className="text-[#6e6e8a] text-sm">所有资源加载完成，即将进入...</p>
          </div>
          <div className="space-y-3 w-72">
            {steps.map(s => {
              return (
                <div key={s.n} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-[#4ade80] text-white">
                    ✓
                  </div>
                  <span className="text-sm text-[#4ade80]">{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#1e1e2e] gap-8">
        <div className="text-center">
          <p className="text-[#cdd6f4] text-xl font-medium mb-1">正在启动应用</p>
          <p className="text-[#6e6e8a] text-sm">正在加载各类资源，请稍候...</p>
        </div>
        <div className="space-y-3 w-72">
          {steps.map(s => {
            const isDone = preload.step > s.n
            const isActive = preload.step === s.n
            return (
              <div key={s.n} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                  ${isDone ? 'bg-[#4ade80] text-white' : isActive ? 'bg-[#cba6f7] text-[#1e1e2e] animate-pulse' : 'bg-[#3a3a4a] text-[#6e6e8a]'}`}>
                  {isDone ? '✓' : s.n}
                </div>
                <span className={`text-sm ${isDone ? 'text-[#4ade80]' : isActive ? 'text-[#cdd6f4]' : 'text-[#6e6e8a]'}`}>
                  {s.label}
                </span>
                {isActive && preload.detail && <span className="text-xs text-[#6e6e8a] ml-1">— {preload.detail}</span>}
              </div>
            )
          })}
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
    <div className="h-screen flex bg-[#1e1e2e] overflow-hidden">
      <IconSidebar active={activeView} onChange={setActiveView} />
      <div className="flex-1 flex overflow-hidden">
        <div className={activeView === 'wiki' ? 'flex flex-1 overflow-hidden' : 'hidden'}><WikiView kbPath={kbPath} active={activeView === 'wiki'} /></div>
        <div className={activeView === 'ingest' ? 'flex flex-1 overflow-hidden' : 'hidden'}><IngestView kbPath={kbPath} active={activeView === 'ingest'} /></div>
        <div className={activeView === 'qa' ? 'flex flex-1 overflow-hidden' : 'hidden'}><QAView kbPath={kbPath} /></div>
        <div className={activeView === 'graph' ? 'flex flex-1 overflow-hidden' : 'hidden'}><GraphView kbPath={kbPath} active={activeView === 'graph'} /></div>
        <div className={activeView === 'settings' ? 'flex flex-1 overflow-hidden' : 'hidden'}><SettingsView kbPath={kbPath} /></div>
        <div className={activeView === 'system' ? 'flex flex-1 overflow-hidden' : 'hidden'}><SystemView kbPath={kbPath} active={activeView === 'system'} /></div>
        <div className={activeView === 'logs' ? 'flex flex-1 overflow-hidden' : 'hidden'}><LogViewer kbPath={kbPath} active={activeView === 'logs'} /></div>
      </div>
    </div>
  )
}
