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
    <div className="h-screen flex items-center justify-center bg-surface">
      <div className="w-[420px]">

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i <= step ? 'bg-accent' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent text-gray-950 flex items-center justify-center text-xl font-bold mx-auto mb-6">
              知译
            </div>
            <h1 className="text-2xl font-bold text-text mb-3">欢迎使用 KnowCompile</h1>
            <p className="text-text-muted leading-relaxed mb-8">
              知识的<span className="text-accent">编译器</span>，把资料编译成你的第二大脑。
              <br />
              基于 LLM Wiki 范式，将原始资料转化为结构化知识，
              <br />
              <span className="text-accent">一次编译，永久复用</span>，让知识持续积累。
              <br />
              让 AI 帮你<span className="text-accent">持续积累</span>而非反复检索。
            </p>
            <button
              onClick={handleNext}
              className="px-8 py-3 bg-accent text-gray-950 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              开始使用
            </button>
          </div>
        )}

        {/* Step 1: LLM Config */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-text mb-2">配置 AI 模型</h2>
            <p className="text-text-muted text-sm mb-6">
              KnowCompile 的核心功能依赖大语言模型。只需填写 API Key，其他选填。
            </p>

            <div className="space-y-4">
              {/* Provider dropdown */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">模型服务商</label>
                <select
                  value={providerId}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
                >
                  {LLM_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Base URL (hidden for Anthropic, auto-filled for others) */}
              {!currentProvider?.useAnthropicSDK && (
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    API 地址
                    <span className="text-gray-600 ml-1">（自动填充，可修改）</span>
                  </label>
                  <input
                    type="text"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              )}

              {/* Model selector */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">模型</label>
                {currentProvider && currentProvider.models.length > 0 ? (
                  <>
                    <select
                      value={modelId}
                      onChange={(e) => {
                        setModelId(e.target.value)
                        setTestResult(null)
                      }}
                      className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
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
                        className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm mt-2 outline-none focus:ring-2 focus:ring-accent"
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
                    className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
                  />
                )}
              </div>

              {/* API Key */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setTestResult(null) }}
                  placeholder="sk-..."
                  className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
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
                className="px-4 py-2 bg-gray-700 text-text rounded-lg text-sm hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              {testResult && (
                <span className={`ml-3 text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                  {testResult.message}
                </span>
              )}
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep(0)}
                className="px-6 py-2.5 bg-gray-800 text-text rounded-lg text-sm hover:bg-gray-700 transition-colors"
              >
                上一步
              </button>
              <button
                onClick={handleSkip}
                className="px-6 py-2.5 text-text-muted rounded-lg text-sm hover:text-white transition-colors"
              >
                跳过，稍后配置
              </button>
              <button
                onClick={handleNext}
                className="px-6 py-2.5 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors ml-auto"
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select KB Directory */}
        {step === 2 && (
          <div className="text-center">
            <div className="text-4xl mb-4">📂</div>
            <h2 className="text-xl font-semibold text-text mb-2">选择知识库目录</h2>
            <p className="text-text-muted text-sm mb-6">
              选择一个空文件夹作为你的知识库存储位置。
              <br />
              后续你也可以加载示例数据来快速体验。
            </p>

            <div className="space-y-3">
              <button
                onClick={() => handleSelectDir(false)}
                disabled={loading}
                className="w-full px-6 py-3 bg-accent text-gray-950 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? '初始化中...' : '选择目录'}
              </button>
              <button
                onClick={() => handleSelectDir(true)}
                disabled={loading}
                className="w-full px-6 py-3 bg-gray-700 text-text rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                加载示例数据并开始
              </button>
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>
            )}

            <button
              onClick={() => setStep(1)}
              className="mt-6 px-6 py-2.5 bg-gray-800 text-text rounded-lg text-sm hover:bg-gray-700 transition-colors"
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
