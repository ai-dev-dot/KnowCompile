import { useState, useMemo } from 'react'
import { useIPC } from '../hooks/useIPC'
import { LLM_PROVIDERS, findProvider } from '../providers'

interface Props {
  onComplete: (kbPath: string) => void
}

const CUSTOM_MODEL = '__custom__'

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0)

  // LLM config — derived from selected provider
  const [providerId, setProviderId] = useState('openai')
  const [modelId, setModelId] = useState('gpt-4o')
  const [customModel, setCustomModel] = useState('')
  const [baseURL, setBaseURL] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const ipc = useIPC()

  const currentProvider = useMemo(() => findProvider(providerId), [providerId])
  const isCustomModel = modelId === CUSTOM_MODEL

  const effectiveModel = isCustomModel ? customModel.trim() : modelId

  const handleProviderChange = (id: string) => {
    setProviderId(id)
    setTestResult(null)
    const p = findProvider(id)
    if (p) {
      setBaseURL(p.baseURL)
      if (p.models.length > 0) {
        setModelId(p.models[0].id)
        setCustomModel('')
      } else {
        // Custom provider — switch to free-text input
        setModelId(CUSTOM_MODEL)
        setCustomModel('')
      }
    }
  }

  const handleSaveLLM = async () => {
    if (!apiKey.trim()) return
    const p = currentProvider
    const effectiveProvider = p?.useAnthropicSDK ? 'anthropic' : 'openai'
    await ipc.saveSettings({
      llm: {
        provider: effectiveProvider,
        apiKey: apiKey.trim(),
        baseURL: p?.useAnthropicSDK ? '' : baseURL.trim(),
        model: effectiveModel || 'gpt-4o',
      },
    })
  }

  const handleNext = async () => {
    if (step === 1 && apiKey.trim()) {
      await handleSaveLLM()
    }
    setStep(step + 1)
  }

  const handleSkip = () => {
    setStep(step + 1)
  }

  const handleSelectDir = async (loadSamples = false) => {
    setLoading(true)
    setError(null)
    try {
      const path = await ipc.selectKBPath()
      if (path) {
        await handleSaveLLM()
        await ipc.initKB(path)
        await ipc.setKBPath(path)
        if (loadSamples) {
          await ipc.loadSamples(path)
        }
        onComplete(path)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[#1e1e2e]">
      <div className="w-[440px]">

        {/* Progress line */}
        <div className="h-0.5 bg-[#313244] rounded-full mb-10 overflow-hidden">
          <div className="h-full bg-[#cba6f7] transition-all duration-500 ease-out" style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#cba6f7]/20 to-[#cba6f7]/5 border border-[#cba6f7]/20 flex items-center justify-center mx-auto mb-6">
              <svg viewBox="0 0 24 24" fill="none" stroke="#cba6f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#cdd6f4] mb-3 tracking-tight">欢迎使用 KnowCompile</h1>
            <p className="text-[#6e6e8a] leading-relaxed mb-8 text-sm">
              知识的<span className="text-[#cba6f7]">编译器</span>，把资料编译成你的第二大脑
            </p>
            <button
              onClick={handleNext}
              className="px-8 py-3 bg-[#cba6f7] text-[#1e1e2e] rounded-xl font-medium hover:opacity-90 transition-all text-sm"
            >
              开始使用
            </button>
          </div>
        )}

        {/* Step 1: LLM Config */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-[#cdd6f4] mb-1">配置 AI 模型</h2>
            <p className="text-[#6e6e8a] text-sm mb-6">只需填写 API Key，其他选填。</p>

            <div className="space-y-4">
              {/* Provider dropdown */}
              <div>
                <label className="text-xs text-[#6e6e8a] mb-1.5 block">模型服务商</label>
                <select
                  value={providerId}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full bg-[#181825] text-[#cdd6f4] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#cba6f7] border border-[#313244]"
                >
                  {LLM_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Base URL (hidden for Anthropic, auto-filled for others) */}
              {!currentProvider?.useAnthropicSDK && (
                <div>
                  <label className="text-xs text-[#6e6e8a] mb-1.5 block">API 地址</label>
                  <input
                    type="text"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full bg-[#181825] text-[#cdd6f4] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#cba6f7] border border-[#313244] placeholder:text-[#3a3a4a]"
                  />
                </div>
              )}

              {/* Model selector */}
              <div>
                <label className="text-xs text-[#6e6e8a] mb-1.5 block">模型</label>
                {currentProvider && currentProvider.models.length > 0 ? (
                  <>
                    <select
                      value={modelId}
                      onChange={(e) => {
                        setModelId(e.target.value)
                        setTestResult(null)
                      }}
                      className="w-full bg-[#181825] text-[#cdd6f4] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#cba6f7] border border-[#313244]"
                    >
                      {currentProvider.models.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                      <option value={CUSTOM_MODEL}>其他模型（手动输入）...</option>
                    </select>
                    {isCustomModel && (
                      <input
                        type="text"
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        placeholder="输入模型名称，如 gpt-5"
                        className="w-full bg-[#181825] text-[#cdd6f4] rounded-xl px-3 py-2.5 text-sm mt-2 outline-none focus:ring-2 focus:ring-[#cba6f7] border border-[#313244] placeholder:text-[#3a3a4a]"
                        autoFocus
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="输入模型名称"
                    className="w-full bg-[#181825] text-[#cdd6f4] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#cba6f7] border border-[#313244] placeholder:text-[#3a3a4a]"
                  />
                )}
              </div>

              {/* API Key */}
              <div>
                <label className="text-xs text-[#6e6e8a] mb-1.5 block">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setTestResult(null) }}
                  placeholder="sk-..."
                  className="w-full bg-[#181825] text-[#cdd6f4] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#cba6f7] border border-[#313244] placeholder:text-[#3a3a4a]"
                />
              </div>
            </div>

            {/* Test connection */}
            <div className="mt-4">
              <button
                onClick={async () => {
                  if (!apiKey.trim() || !effectiveModel) {
                    setTestResult({ success: false, message: '请先填写 API Key 并选择模型' })
                    return
                  }
                  setTesting(true)
                  setTestResult(null)
                  const p = currentProvider
                  const r = await ipc.testLLM({
                    provider: p?.useAnthropicSDK ? 'anthropic' : 'openai',
                    apiKey: apiKey.trim(),
                    baseURL: p?.useAnthropicSDK ? '' : baseURL.trim(),
                    model: effectiveModel,
                  })
                  setTestResult(r)
                  setTesting(false)
                }}
                disabled={testing}
                className="px-4 py-2 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm hover:bg-[#3a3a4a] disabled:opacity-50 transition-colors"
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              {testResult && (
                <span className={`ml-3 text-sm ${testResult.success ? 'text-[#4ade80]' : 'text-red-400'}`}>
                  {testResult.message}
                </span>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(0)}
                className="px-6 py-2.5 bg-[#181825] text-[#6e6e8a] rounded-xl text-sm hover:text-[#cdd6f4] hover:bg-[#252535] transition-all border border-[#313244]"
              >
                上一步
              </button>
              <button
                onClick={handleSkip}
                className="px-6 py-2.5 text-[#6e6e8a] rounded-xl text-sm hover:text-[#cdd6f4] transition-colors"
              >
                跳过，稍后配置
              </button>
              <button
                onClick={handleNext}
                className="px-6 py-2.5 bg-[#cba6f7] text-[#1e1e2e] rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all ml-auto"
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select KB Directory */}
        {step === 2 && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#181825] border border-[#313244] flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="#6e6e8a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[#cdd6f4] mb-2">选择知识库目录</h2>
            <p className="text-[#6e6e8a] text-sm mb-6">
              选择一个空文件夹作为知识库存储位置
            </p>

            <div className="space-y-3">
              <button
                onClick={() => handleSelectDir(false)}
                disabled={loading}
                className="w-full px-6 py-3 bg-[#cba6f7] text-[#1e1e2e] rounded-xl font-medium hover:opacity-90 disabled:opacity-50 transition-all text-sm"
              >
                {loading ? '初始化中...' : '选择目录'}
              </button>
              <button
                onClick={() => handleSelectDir(true)}
                disabled={loading}
                className="w-full px-6 py-3 bg-[#252535] text-[#cdd6f4] rounded-xl hover:bg-[#2a2a3e] disabled:opacity-50 transition-all text-sm border border-[#313244]"
              >
                加载示例数据并开始
              </button>
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-400 bg-red-400/10 rounded-xl px-4 py-2">{error}</p>
            )}

            <button
              onClick={() => setStep(1)}
              className="mt-6 px-6 py-2.5 bg-[#181825] text-[#6e6e8a] rounded-xl text-sm hover:text-[#cdd6f4] hover:bg-[#252535] transition-all border border-[#313244]"
              disabled={loading}
            >
              上一步
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
