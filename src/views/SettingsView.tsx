import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string }

export default function SettingsView({ kbPath }: Props) {
  const [activeTab, setActiveTab] = useState<'general' | 'advanced'>('general')

  // General tab state
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

  // Advanced tab state
  const [advancedSettings, setAdvancedSettings] = useState<Record<string, string>>({})
  const [advancedSaved, setAdvancedSaved] = useState(false)
  const [schemaFiles, setSchemaFiles] = useState<{ name: string; content: string }[]>([])
  const [selectedSchemaFile, setSelectedSchemaFile] = useState<string | null>(null)
  const [schemaEditContent, setSchemaEditContent] = useState('')
  const [schemaSaveStatus, setSchemaSaveStatus] = useState<string | null>(null)
  const [indexStatus, setIndexStatus] = useState<{ pages: number; sources: number; lastRebuild: string } | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildResult, setRebuildResult] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<any[]>([])
  const [conflictResolving, setConflictResolving] = useState<Record<number, boolean>>({})

  const ipc = useIPC()

  useEffect(() => {
    if (activeTab === 'general') {
      ipc.getSettings().then(setSettings)
      ipc.checkSamples(kbPath).then(r => setSamplesLoaded(r.loaded))
      ipc.checkSchemaUpdate(kbPath).then(setSchemaUpdate)
    } else {
      loadAdvancedData()
    }
  }, [kbPath, activeTab])

  const loadAdvancedData = async () => {
    const [advSettings, schema, idxStatus, conflictList] = await Promise.all([
      ipc.getAdvancedSettings(kbPath),
      ipc.listSchema(kbPath),
      ipc.getIndexStatus(kbPath),
      ipc.listConflicts(kbPath),
    ])
    setAdvancedSettings(advSettings)
    setSchemaFiles(schema)
    setIndexStatus(idxStatus)
    setConflicts(conflictList)
  }

  // -- General tab handlers --

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

  // -- Advanced tab handlers --

  const updateAdvSetting = (key: string, value: string) => {
    setAdvancedSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSaveAdvanced = async () => {
    await ipc.saveAdvancedSettings(kbPath, advancedSettings)
    setAdvancedSaved(true)
    setTimeout(() => setAdvancedSaved(false), 2000)
  }

  const handleRebuild = async () => {
    setRebuilding(true)
    setRebuildResult(null)
    const r = await ipc.rebuildIndex(kbPath)
    setRebuilding(false)
    if (r.errors.length > 0) {
      setRebuildResult(`完成：${r.pagesIndexed} 页, ${r.chunksIndexed} 块, ${r.sourcesIndexed} 源。错误：${r.errors.join('; ')}`)
    } else {
      setRebuildResult(`完成：${r.pagesIndexed} 页, ${r.chunksIndexed} 块, ${r.sourcesIndexed} 源。`)
    }
    // Refresh index status
    const status = await ipc.getIndexStatus(kbPath)
    setIndexStatus(status)
  }

  const handleResolveConflict = async (conflictId: number) => {
    setConflictResolving(prev => ({ ...prev, [conflictId]: true }))
    await ipc.resolveConflict(kbPath, conflictId, 'resolved')
    setConflicts(prev => prev.filter(c => c.id !== conflictId))
    setConflictResolving(prev => ({ ...prev, [conflictId]: false }))
  }

  // -- Helpers --

  const inputClass = "w-full bg-gray-800 text-text rounded-lg px-3 py-2 text-sm mt-1 outline-none focus:ring-2 focus:ring-accent"
  const labelClass = "text-xs text-text-muted"
  const btnPrimaryClass = "px-4 py-2 bg-accent text-gray-950 rounded-lg font-medium text-sm hover:opacity-90"
  const btnSecondaryClass = "px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50"

  // -- Render --

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
      <h2 className="text-xl font-semibold text-text mb-8">设置</h2>

      {/* Tab bar */}
      <div className="flex gap-0 mb-8 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'general' ? 'bg-gray-800 text-text border-b-2 border-accent' : 'text-text-muted hover:text-text hover:bg-gray-800/50'}`}
        >
          一般
        </button>
        <button
          onClick={() => setActiveTab('advanced')}
          className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'advanced' ? 'bg-gray-800 text-text border-b-2 border-accent' : 'text-text-muted hover:text-text hover:bg-gray-800/50'}`}
        >
          高级
        </button>
      </div>

      {/* ==================== TAB: 一般 ==================== */}
      {activeTab === 'general' && (
        <>
          {/* LLM Config */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">LLM 配置</h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>提供商</label>
                <select
                  value={settings.llm.provider}
                  onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, provider: e.target.value } }))}
                  className={inputClass}
                >
                  <option value="openai">OpenAI 兼容（OpenAI / MiniMax / DeepSeek / Qwen）</option>
                  <option value="anthropic">Anthropic（Claude 系列）</option>
                </select>
              </div>
              {settings.llm.provider !== 'anthropic' && (
                <div>
                  <label className={labelClass}>Base URL（可选，用于自定义接口）</label>
                  <input
                    type="text"
                    value={settings.llm.baseURL}
                    onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, baseURL: e.target.value } }))}
                    className={inputClass}
                    placeholder="留空使用默认 API"
                  />
                </div>
              )}
              <div>
                <label className={labelClass}>API Key</label>
                <input
                  type="password"
                  value={settings.llm.apiKey}
                  onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, apiKey: e.target.value } }))}
                  className={inputClass}
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className={labelClass}>模型</label>
                <input
                  type="text"
                  value={settings.llm.model}
                  onChange={(e) => setSettings((s: any) => ({ ...s, llm: { ...s.llm, model: e.target.value } }))}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleSaveSettings} className={btnPrimaryClass}>保存设置</button>
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
                  className={btnSecondaryClass}
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
                  className={btnPrimaryClass}
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
              <button onClick={() => handleExport('html')} className={btnSecondaryClass}>导出 HTML</button>
              <button onClick={() => handleExport('markdown')} className={btnSecondaryClass}>导出 Markdown</button>
              <button onClick={() => handleExport('backup')} className={btnPrimaryClass}>创建备份</button>
            </div>
            {exportStatus && (
              <div className="mt-4 p-3 rounded-lg bg-accent/10 text-accent text-sm">{exportStatus}</div>
            )}
          </section>
        </>
      )}

      {/* ==================== TAB: 高级 ==================== */}
      {activeTab === 'advanced' && (
        <>
          {/* Warning */}
          <div className="mb-8 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
            以下设置已有安全默认值，一般无需修改。
          </div>

          {/* Compile Parameters */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">🔧 编译参数</h3>
            <div className="space-y-4">
              <ParamRow
                label="chunk_size"
                help="越小检索越精确但索引变大；越大语义越完整但可能漏掉细节。改后需重建索引"
                value={advancedSettings.chunk_size ?? ''}
                placeholder="500"
                onChange={v => updateAdvSetting('chunk_size', v)}
                labelClass={labelClass} inputClass={inputClass}
              />
              <ParamRow
                label="compile_similarity_threshold"
                help="越高越保守（只匹配高度相关页面，可能漏掉）；越低越激进（匹配更多页面，可能误判）"
                value={advancedSettings.compile_similarity_threshold ?? ''}
                placeholder="0.75"
                onChange={v => updateAdvSetting('compile_similarity_threshold', v)}
                labelClass={labelClass} inputClass={inputClass}
              />
              <ParamRow
                label="compile_candidate_count"
                help="越多覆盖面越全但编译耗时和 Token 消耗增加；越少越快但可能漏掉该更新的页面"
                value={advancedSettings.compile_candidate_count ?? ''}
                placeholder="3"
                onChange={v => updateAdvSetting('compile_candidate_count', v)}
                labelClass={labelClass} inputClass={inputClass}
              />
            </div>
          </section>

          {/* QA Parameters */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">💬 问答参数</h3>
            <div className="space-y-4">
              <ParamRow
                label="qa_similarity_threshold"
                help="越高回答更聚焦但可能缺少相关信息；越低覆盖面更广但可能引入噪音"
                value={advancedSettings.qa_similarity_threshold ?? ''}
                placeholder="0.65"
                onChange={v => updateAdvSetting('qa_similarity_threshold', v)}
                labelClass={labelClass} inputClass={inputClass}
              />
              <ParamRow
                label="qa_retrieval_count"
                help="越多召回率越高但检索变慢；越少越快但可能遗漏相关内容"
                value={advancedSettings.qa_retrieval_count ?? ''}
                placeholder="30"
                onChange={v => updateAdvSetting('qa_retrieval_count', v)}
                labelClass={labelClass} inputClass={inputClass}
              />
              <ParamRow
                label="qa_final_context_count"
                help="越多上下文越丰富但 Token 消耗增加；越少越省 Token 但回答可能不够全面"
                value={advancedSettings.qa_final_context_count ?? ''}
                placeholder="8"
                onChange={v => updateAdvSetting('qa_final_context_count', v)}
                labelClass={labelClass} inputClass={inputClass}
              />
              <ParamRow
                label="qa_context_max_tokens"
                help="受限于 LLM 模型的最大上下文；越大可利用更多信息，但需确保不超过模型限制"
                value={advancedSettings.qa_context_max_tokens ?? ''}
                placeholder="3000"
                onChange={v => updateAdvSetting('qa_context_max_tokens', v)}
                labelClass={labelClass} inputClass={inputClass}
              />
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button onClick={handleSaveAdvanced} className={btnPrimaryClass}>保存参数</button>
              {advancedSaved && <span className="text-green-400 text-sm">已保存</span>}
            </div>
          </section>

          {/* Schema Editor */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">📐 Schema 编辑</h3>
            {schemaFiles.length === 0 ? (
              <p className="text-text-muted text-sm">加载中...</p>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {schemaFiles.map(f => (
                    <button
                      key={f.name}
                      onClick={() => {
                        setSelectedSchemaFile(f.name)
                        setSchemaEditContent(f.content)
                        setSchemaSaveStatus(null)
                      }}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${selectedSchemaFile === f.name ? 'bg-accent text-gray-950' : 'bg-gray-700 text-text hover:bg-gray-600'}`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
                {selectedSchemaFile && (
                  <>
                    <textarea
                      value={schemaEditContent}
                      onChange={(e) => setSchemaEditContent(e.target.value)}
                      className="w-full h-48 bg-gray-800 text-text rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-accent resize-y"
                      spellCheck={false}
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={async () => {
                          const schemaFilePath = selectedSchemaFile.includes('/') || selectedSchemaFile.includes('\\')
                            ? selectedSchemaFile
                            : kbPath + '/schema/' + selectedSchemaFile
                          const r = await ipc.writeSchema(schemaFilePath, schemaEditContent)
                          if (r.success) {
                            setSchemaSaveStatus(`已保存 ${selectedSchemaFile}`)
                            // Refresh file list
                            const files = await ipc.listSchema(kbPath)
                            setSchemaFiles(files)
                          } else {
                            setSchemaSaveStatus('保存失败')
                          }
                        }}
                        className={btnPrimaryClass}
                      >
                        保存 Schema
                      </button>
                      {schemaSaveStatus && (
                        <span className={`text-sm ${schemaSaveStatus.startsWith('已保存') ? 'text-green-400' : 'text-red-400'}`}>
                          {schemaSaveStatus}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Index Management */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">🗂 索引管理</h3>
            {indexStatus ? (
              <div className="text-sm text-text-muted space-y-1 mb-4">
                <p>页面数：<span className="text-text">{indexStatus.pages}</span></p>
                <p>源文件数：<span className="text-text">{indexStatus.sources}</span></p>
                <p>上次重建：<span className="text-text">{indexStatus.lastRebuild || '尚未重建'}</span></p>
              </div>
            ) : (
              <p className="text-text-muted text-sm mb-4">加载中...</p>
            )}
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className={btnSecondaryClass}
            >
              {rebuilding ? '重建中...' : '重建所有索引'}
            </button>
            {rebuildResult && (
              <div className="mt-3 p-3 rounded-lg bg-accent/10 text-accent text-sm">{rebuildResult}</div>
            )}
          </section>

          {/* Conflict List */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">⚠️ 矛盾列表</h3>
            {conflicts.length === 0 ? (
              <p className="text-text-muted text-sm">无未解决的矛盾。</p>
            ) : (
              <div className="space-y-3">
                {conflicts.map(c => (
                  <div key={c.id} className="p-4 rounded-lg bg-gray-800 border border-gray-700">
                    <p className="text-sm text-text mb-1.5">{c.description}</p>
                    {c.sources && (
                      <p className="text-xs text-text-muted mb-1">涉及源：{Array.isArray(c.sources) ? c.sources.join(', ') : String(c.sources)}</p>
                    )}
                    {c.suggestedResolution && (
                      <p className="text-xs text-text-muted mb-3">建议：{c.suggestedResolution}</p>
                    )}
                    <button
                      onClick={() => handleResolveConflict(c.id)}
                      disabled={conflictResolving[c.id]}
                      className="px-3 py-1.5 bg-gray-700 text-text rounded text-xs hover:bg-gray-600 disabled:opacity-50"
                    >
                      {conflictResolving[c.id] ? '处理中...' : '标记为已解决'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** Reusable labeled input row with help text */
function ParamRow({
  label,
  help,
  value,
  placeholder,
  onChange,
  labelClass,
  inputClass,
}: {
  label: string
  help: string
  value: string
  placeholder: string
  onChange: (v: string) => void
  labelClass: string
  inputClass: string
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={inputClass}
      />
      <p className="text-xs text-text-muted mt-1 leading-relaxed">{help}</p>
    </div>
  )
}
