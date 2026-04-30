import { useState } from 'react'
import { useIPC } from '../hooks/useIPC'

interface Props {
  onComplete: (kbPath: string) => void
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const ipc = useIPC()

  const handleSaveLLM = async () => {
    if (apiKey.trim()) {
      await ipc.saveSettings({
        llm: { provider, apiKey: apiKey.trim(), baseURL: baseURL.trim(), model: model.trim() || 'gpt-4o' },
      })
    }
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
            <div className="w-16 h-16 rounded-2xl bg-accent text-gray-950 flex items-center justify-center text-2xl font-bold mx-auto mb-6">
              AI
            </div>
            <h1 className="text-2xl font-bold text-text mb-3">欢迎使用 AI 笔记</h1>
            <p className="text-text-muted leading-relaxed mb-8">
              基于 LLM Wiki 范式的个人知识管理工具。
              <br />
              将你的资料<span className="text-accent">编译</span>成结构化知识库，
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
            <h2 className="text-xl font-semibold text-text mb-2">配置大模型</h2>
            <p className="text-text-muted text-sm mb-6">
              AI 笔记的核心功能依赖大语言模型。你可以现在配置，也可以稍后在设置中配置。
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-text-muted mb-1 block">提供商</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="openai">OpenAI 兼容（OpenAI / MiniMax / DeepSeek / Qwen）</option>
                  <option value="anthropic">Anthropic（Claude 系列）</option>
                </select>
              </div>

              {provider !== 'anthropic' && (
                <div>
                  <label className="text-xs text-text-muted mb-1 block">Base URL（可选）</label>
                  <input
                    type="text"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    placeholder="留空使用默认"
                    className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-text-muted mb-1 block">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="text-xs text-text-muted mb-1 block">模型名称</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o"
                  className="w-full bg-gray-800 text-text rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={async () => {
                  if (!apiKey.trim() || !model.trim()) {
                    setTestResult({ success: false, message: '请先填写 API Key 和模型名称' })
                    return
                  }
                  setTesting(true)
                  setTestResult(null)
                  const r = await ipc.testLLM({
                    provider,
                    apiKey: apiKey.trim(),
                    baseURL: baseURL.trim(),
                    model: model.trim(),
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
                className="ml-auto px-6 py-2.5 bg-accent text-gray-950 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select KB Directory */}
        {step === 2 && (
          <div className="text-center">
            <div className="text-5xl mb-6">📂</div>
            <h2 className="text-xl font-semibold text-text mb-3">选择知识库目录</h2>
            <p className="text-text-muted text-sm mb-8">
              选择一个空文件夹来存放你的知识库。
              <br />
              你的所有数据都将保存在这个目录中。
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSelectDir}
              disabled={loading}
              className="px-8 py-3 bg-accent text-gray-950 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? '初始化中...' : '选择目录'}
            </button>

            <div className="mt-6 pt-6 border-t border-gray-800">
              <p className="text-text-muted text-xs mb-3">
                首次使用？加载示例数据快速体验
              </p>
              <button
                onClick={() => handleSelectDir(true)}
                disabled={loading}
                className="px-6 py-2 bg-gray-800 text-text rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                加载示例数据并开始
              </button>
            </div>

            <div className="mt-4">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-2.5 bg-gray-800 text-text rounded-lg text-sm hover:bg-gray-700 transition-colors"
              >
                上一步
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
