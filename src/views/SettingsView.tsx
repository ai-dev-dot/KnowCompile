import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string }

export default function SettingsView({ kbPath }: Props) {
  const [settings, setSettings] = useState({
    llm: { provider: 'openai', apiKey: '', baseURL: '', model: '' },
  })
  const [saved, setSaved] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [samplesLoaded, setSamplesLoaded] = useState(false)
  const [sampleStatus, setSampleStatus] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [schemaUpdate, setSchemaUpdate] = useState<{ updateAvailable: boolean; currentVersion: number; latestVersion: number } | null>(null)
  const [schemaUpdateStatus, setSchemaUpdateStatus] = useState<string | null>(null)
  const ipc = useIPC()

  useEffect(() => {
    ipc.getSettings().then(setSettings)
    ipc.checkSamples(kbPath).then(r => setSamplesLoaded(r.loaded))
    ipc.checkSchemaUpdate(kbPath).then(setSchemaUpdate)
  }, [kbPath])

  const handleSaveSettings = async () => {
    await ipc.saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSettings}
              className="px-4 py-2 bg-accent text-gray-950 rounded-lg font-medium text-sm hover:opacity-90"
            >
              保存设置
            </button>
            <button
              onClick={async () => {
                if (!settings.llm.apiKey.trim() || !settings.llm.model.trim()) {
                  setTestResult({ success: false, message: '请先填写 API Key 和模型名称' })
                  return
                }
                setTesting(true)
                setTestResult(null)
                const r = await ipc.testLLM({
                  provider: settings.llm.provider,
                  apiKey: settings.llm.apiKey.trim(),
                  baseURL: settings.llm.baseURL.trim(),
                  model: settings.llm.model.trim(),
                })
                setTestResult(r)
                setTesting(false)
              }}
              disabled={testing}
              className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50"
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            {saved && <span className="text-green-400 text-sm">已保存</span>}
          </div>
          {testResult && (
            <div className={`mt-2 text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.message}
            </div>
          )}
        </div>
      </section>

      {/* Schema Update */}
      {schemaUpdate?.updateAvailable && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Schema 更新</h3>
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <p className="text-sm text-yellow-400 mb-2">
              内置编译规则已更新（v{schemaUpdate.currentVersion} → v{schemaUpdate.latestVersion}）。
            </p>
            <p className="text-xs text-text-muted mb-3">
              更新将覆盖 schema/ 目录下的 system.md、compile-rules.md、style-guide.md、links-rules.md。
              如果你曾修改过这些文件，更新会丢失你的自定义内容。
            </p>
            <button
              onClick={async () => {
                const r = await ipc.updateSchema(kbPath)
                if (r.success) {
                  setSchemaUpdate({ updateAvailable: false, currentVersion: schemaUpdate.latestVersion, latestVersion: schemaUpdate.latestVersion })
                  setSchemaUpdateStatus(`已更新 ${r.updated.length} 个文件`)
                } else {
                  setSchemaUpdateStatus(`更新失败：${r.error}`)
                }
              }}
              className="px-4 py-2 bg-yellow-500 text-gray-950 rounded-lg text-sm font-medium hover:opacity-90"
            >
              更新 Schema 规则
            </button>
            {schemaUpdateStatus && (
              <p className="text-sm text-green-400 mt-2">{schemaUpdateStatus}</p>
            )}
          </div>
        </section>
      )}

      {/* Sample Data */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">示例数据</h3>
        <p className="text-text-muted text-xs mb-3">
          {samplesLoaded
            ? '已加载 AI 应用开发相关的示例文档。删除示例会同时清理 raw 文件和编译生成的 Wiki 页面。'
            : '加载 AI 应用开发相关的示例文档到 raw/ 目录，快速体验 LLM Wiki 的完整流程。'}
        </p>
        <div className="flex gap-3">
          {!samplesLoaded ? (
            <button
              onClick={async () => {
                const r = await ipc.loadSamples(kbPath)
                if (r.success) {
                  setSamplesLoaded(true)
                  setSampleStatus(`已加载 ${r.count} 个示例文件，请到摄入页编译它们`)
                }
              }}
              className="px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90"
            >
              加载示例数据
            </button>
          ) : (
            <button
              onClick={async () => {
                const r = await ipc.deleteSamples(kbPath)
                if (r.success) {
                  setSamplesLoaded(false)
                  setSampleStatus(`已删除示例文件${r.deletedPages && r.deletedPages.length > 0 ? `和 ${r.deletedPages.length} 个 Wiki 页面` : ''}`)
                }
              }}
              className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30"
            >
              删除示例数据
            </button>
          )}
        </div>
        {sampleStatus && (
          <div className="mt-3 p-3 rounded-lg bg-accent/10 text-accent text-sm">{sampleStatus}</div>
        )}
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
