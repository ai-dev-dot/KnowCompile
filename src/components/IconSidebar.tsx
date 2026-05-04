type View = 'wiki' | 'ingest' | 'qa' | 'graph' | 'settings' | 'system' | 'logs'

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: 'qa', label: '问答', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { id: 'wiki', label: 'Wiki', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  { id: 'ingest', label: '摄入', icon: 'M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 4v9' },
  { id: 'graph', label: '图谱', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  { id: 'settings', label: '设置', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
  { id: 'logs', label: '日志', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
  { id: 'system', label: '系统', icon: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18' },
]

interface Props {
  active: View
  onChange: (view: View) => void
}

function NavIcon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d={d} />
    </svg>
  )
}

export default function IconSidebar({ active, onChange }: Props) {
  return (
    <nav className="flex flex-col items-center w-[72px] bg-[#111118] py-4 gap-1 flex-shrink-0 border-r border-[#313244]">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#cba6f7]/20 to-[#cba6f7]/5 border border-[#cba6f7]/20 flex items-center justify-center mb-4">
        <span className="text-[#cba6f7] font-light text-xs tracking-widest">KC</span>
      </div>
      <div className="flex flex-col gap-0.5 w-full px-2">
        {NAV_ITEMS.map(({ id, label, icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              title={label}
              className={`w-full relative flex flex-col items-center py-2.5 text-xs transition-all duration-200 rounded-lg mx-0 ${
                isActive
                  ? 'text-white bg-[#cba6f7]/10'
                  : 'text-[#6e6e8a] hover:text-[#cdd6f4] hover:bg-white/5'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#cba6f7] rounded-r-full" />
              )}
              <NavIcon d={icon} active={isActive} />
              <span className="mt-1.5 text-[11px] leading-tight">{label}</span>
            </button>
          )
        })}
      </div>
      <div className="flex-1" />
    </nav>
  )
}
