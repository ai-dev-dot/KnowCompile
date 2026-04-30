type View = 'wiki' | 'ingest' | 'qa' | 'graph' | 'settings'

const icons: { id: View; label: string; icon: string }[] = [
  { id: 'wiki', label: 'Wiki', icon: '📖' },
  { id: 'ingest', label: '摄入', icon: '📥' },
  { id: 'qa', label: '问答', icon: '💬' },
  { id: 'graph', label: '图谱', icon: '🔗' },
  { id: 'settings', label: '设置', icon: '⚙' },
]

interface Props {
  active: View
  onChange: (view: View) => void
}

export default function IconSidebar({ active, onChange }: Props) {
  return (
    <nav className="flex flex-col items-center w-[56px] bg-sidebar py-4 gap-2 flex-shrink-0 border-r border-border">
      <div className="w-9 h-9 rounded-lg bg-accent text-gray-950 flex items-center justify-center font-bold text-sm mb-4">
        KC
      </div>
      {icons.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          title={label}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-colors ${
            active === id
              ? 'bg-gray-700 text-white'
              : 'text-text-muted hover:bg-gray-800 hover:text-white'
          }`}
        >
          {icon}
        </button>
      ))}
      <div className="flex-1" />
    </nav>
  )
}
