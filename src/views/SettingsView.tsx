import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string }

export default function SettingsView({ kbPath }: Props) {
  const [settings, setSettings] = useState({
    llm: { provider: 'openai', apiKey: '', baseURL: '', model: '' },
  })
  const [schemaFiles, setSchemaFiles] = useState<{ name: string; content: string }[]>([])
  const [editingSchema, setEditingSchema] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const ipc = useIPC()

  useEffect(() => {
    ipc.getSettings().then(setSettings)
    ipc.listSchema(kbPath).then(setSchemaFiles)
  }, [kbPath])

  const handleSaveSettings = async () => {
    await ipc.saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveSchema = async (name: string) => {
    await ipc.writeSchema(`${kbPath}/schema/${name}`, editContent)
    setEditingSchema(null)
    setSchemaFiles(prev => prev.map(f => f.name === name ? { ...f, content: editContent } : f))
  }

  const handleExport = async (type: 'html' | 'markdown' | 'backup') => {
    setExportStatus(`导出中...`)
    const result = type === 'html' ? await ipc.exportHTML(kbPath)
      : type === 'markdown' ? await ipc.exportMarkdown(kbPath)
      : await ipc.backup(kbPath)
    if (result.success) {
      setExportStatus(`导出成功：${result.path}`)
    } else {
      setExportStatus(`导出失败：${result.error}`)
    }
    setTimeout(() => setExportStatus(null), 5000)
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
      <h2 className="text-xl font-semibold text-text mb-8">设置</h2>

      {/* LLM Config */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">LLM 配置</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted">提供商</label>
            <select
              value={settings.llm.provider}
              onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, provider: e.target.value } }))}
              className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="openai">OpenAI 兼容（OpenAI / MiniMax / DeepSeek / Qwen）</option>
              <option value="anthropic">Anthropic（Claude 系列）</option>
            </select>
          </div>
          {settings.llm.provider !== 'anthropic' && (
            <div>
              <label className="text-xs text-text-muted">Base URL（可选，用于自定义接口）</label>
              <input
                type="text"
                value={settings.llm.baseURL}
                onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, baseURL: e.target.value } }))}
                className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent"
                placeholder="留空使用默认 API"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-text-muted">API Key</label>
            <input
              type="password"
              value={settings.llm.apiKey}
              onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, apiKey: e.target.value } }))}
              className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent"
              placeholder="sk-..."
            />
          </div>
          <div>
            <label className="text-xs text-text-muted">模型</label>
            <input
              type="text"
              value={settings.llm.model}
              onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, model: e.target.value } }))}
              className="w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <button
            onClick={handleSaveSettings}
            className="px-4 py-2 bg-accent text-gray-950 rounded-lg font-medium text-sm hover:opacity-90"
          >
            保存设置
          </button>
          {saved && <span className="text-green-400 text-sm ml-3">已保存</span>}
        </div>
      </section>

      {/* Schema Editor */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Schema 规则编辑</h3>
        <div className="space-y-2">
          {schemaFiles.map((file) => (
            <div key={file.name}>
              <button
                onClick={() => {
                  setEditingSchema(editingSchema === file.name ? null : file.name)
                  setEditContent(file.content)
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  editingSchema === file.name ? 'bg-gray-700 text-white' : 'text-text-muted hover:bg-gray-800 hover:text-white'
                }`}
              >
                {file.name}
              </button>
              {editingSchema === file.name && (
                <div className="mt-2 p-3 bg-gray-800 rounded-lg">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={10}
                    className="w-full bg-gray-900 text-text rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-accent resize-y"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleSaveSchema(file.name)} className="px-3 py-1.5 bg-accent text-gray-950 rounded text-sm font-medium hover:opacity-90">保存</button>
                    <button onClick={() => setEditingSchema(null)} className="px-3 py-1.5 bg-gray-700 text-text rounded text-sm hover:bg-gray-600">取消</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Export & Backup */}
      <section>
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">导出与备份</h3>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => handleExport('html')} className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600">导出 HTML</button>
          <button onClick={() => handleExport('markdown')} className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600">导出 Markdown</button>
          <button onClick={() => handleExport('backup')} className="px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90">创建备份</button>
        </div>
        {exportStatus && (
          <div className="mt-4 p-3 rounded-lg bg-accent/10 text-accent text-sm">{exportStatus}</div>
        )}
      </section>
    </div>
  )
}
