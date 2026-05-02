type View = 'wiki' | 'ingest' | 'qa' | 'graph' | 'settings' | 'system' | 'logs'

const icons: { id: View; label: string; icon: string }[] = [
  { id: 'qa', label: '问答', icon: '💬' },
  { id: 'wiki', label: 'Wiki', icon: '📖' },
  { id: 'ingest', label: '摄入', icon: '📥' },
  { id: 'graph', label: '图谱', icon: '🔗' },
  { id: 'settings', label: '设置', icon: '⚙' },
  { id: 'logs', label: '日志', icon: '📋' },
  { id: 'system', label: '系统', icon: '🖥' },
]

interface Props {
  active: View
  onChange: (view: View) => void
}

export default function IconSidebar({ active, onChange }: Props) {
  return (
    <nav className="flex flex-col items-start w-[76px] bg-sidebar py-4 gap-1 flex-shrink-0 border-r border-border">
      <div className="w-10 h-10 rounded-lg bg-accent text-gray-950 flex items-center justify-center font-bold text-sm mb-4 mx-auto">
        KC
      </div>
      {icons.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          title={label}
          className={`w-full flex flex-col items-center py-1.5 text-xs transition-colors ${
            active === id
              ? 'text-white border-r-2 border-accent bg-gray-800/50'
              : 'text-text-muted hover:text-white hover:bg-gray-800/30'
          }`}
        >
          <span className="text-lg leading-none mb-0.5">{icon}</span>
          <span className="text-[10px] leading-tight">{label}</span>
        </button>
      ))}
      <div className="flex-1" />
    </nav>
  )
}
