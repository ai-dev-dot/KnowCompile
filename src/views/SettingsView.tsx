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
  const [samplesLoaded, setSamplesLoaded] = useState(false)
  const [sampleStatus, setSampleStatus] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [qualityTestResult, setQualityTestResult] = useState<{ finalScore: number; iterations: number; history: { iteration: number; score: number }[] } | null>(null)
  const [qualityTesting, setQualityTesting] = useState(false)
  const ipc = useIPC()

  useEffect(() => {
    ipc.getSettings().then(setSettings)
    ipc.listSchema(kbPath).then(setSchemaFiles)
    ipc.checkSamples(kbPath).then(r => setSamplesLoaded(r.loaded))
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

      {/* Compile Quality Test */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">编译质量测试</h3>
        <p className="text-text-muted text-xs mb-3">
          编译 raw/ 中的第一个文件，自动验证输出格式（YAML frontmatter、链接规范、来源引用等）并输出质量评分。低于 80 分会自动迭代优化，最多 3 轮。
        </p>
        <button
          onClick={async () => {
            setQualityTesting(true)
            setQualityTestResult(null)
            try {
              const files = await ipc.listRawFiles(kbPath)
              if (files.length === 0) {
                setQualityTestResult({ finalScore: 0, iterations: 0, history: [] })
                return
              }
              const r = await ipc.iterateCompile(kbPath, files[0].path)
              setQualityTestResult({ finalScore: r.finalScore, iterations: r.iterations, history: r.history })
              // Save the best output to wiki
              const sections = r.compileOutput.split(/(?=^# )/m).filter((s: string) => s.trim())
              for (const section of sections) {
                const titleMatch = section.match(/^# (.+)$/m)
                if (titleMatch) {
                  const pageName = titleMatch[1].trim()
                  if (pageName === 'Wiki 索引' || pageName.toLowerCase() === 'wiki index') {
                    await ipc.writeWikiPage(`${kbPath}/wiki/index.md`, section)
                  } else {
                    await ipc.writeWikiPage(`${kbPath}/wiki/${pageName}.md`, section)
                  }
                }
              }
            } catch (err) {
              setQualityTestResult({ finalScore: -1, iterations: 0, history: [] })
            } finally {
              setQualityTesting(false)
            }
          }}
          disabled={qualityTesting}
          className="px-4 py-2 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {qualityTesting ? '测试中...' : '运行编译质量测试'}
        </button>
        {qualityTestResult && (
          <div className={`mt-3 p-4 rounded-lg ${qualityTestResult.finalScore <= 0 ? 'bg-red-500/10 text-red-400' : qualityTestResult.finalScore >= 80 ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
            {qualityTestResult.finalScore <= 0 ? (
              <div>
                <p className="font-semibold text-sm">测试失败</p>
                <p className="text-xs mt-1">请确保 raw/ 中有文件且 LLM 配置正确</p>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-sm">
                  最终评分：{qualityTestResult.finalScore}/100
                  {qualityTestResult.finalScore >= 80 ? ' ✅ 通过' : ' ⚠ 需优化'}
                </p>
                <p className="text-xs mt-1">迭代 {qualityTestResult.iterations} 轮</p>
                {qualityTestResult.history.length > 1 && (
                  <div className="flex gap-2 mt-2">
                    {qualityTestResult.history.map((h, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded bg-gray-700">
                        第{h.iteration}轮: {h.score}分
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
