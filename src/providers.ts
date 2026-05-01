/**
 * Curated LLM provider list with default base URLs and popular models.
 *
 * Sources: models.dev, official API docs, community knowledge (2026-05).
 * When a provider releases new models, users can switch to "自定义" and
 * enter free-form values — no code change needed.
 */

export interface ProviderEntry {
  /** Unique provider ID — used as settings.llm.provider value */
  id: string
  /** Display name in the dropdown */
  name: string
  /** Default API base URL (OpenAI-compatible endpoint) */
  baseURL: string
  /** Popular models for this provider */
  models: { id: string; name: string }[]
  /** Whether this provider uses the Anthropic SDK (non-OpenAI-compatible) */
  useAnthropicSDK?: boolean
}

export const LLM_PROVIDERS: ProviderEntry[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'o3', name: 'o3' },
      { id: 'o4-mini', name: 'o4-mini' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseURL: '',
    useAnthropicSDK: true,
    models: [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (chat)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (reasoner)' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseURL: 'https://api.minimax.chat/v1',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
      { id: 'MiniMax-M1', name: 'MiniMax M1' },
      { id: 'abab7', name: 'ABAB7' },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问 (Alibaba)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
      { id: 'qwen3-235b-a22b', name: 'Qwen3 235B' },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM)',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus' },
      { id: 'glm-4-flash', name: 'GLM-4 Flash' },
      { id: 'glm-5', name: 'GLM-5' },
    ],
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Kimi)',
    baseURL: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 (8K)' },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 (32K)' },
      { id: 'kimi-k2.5', name: 'Kimi K2.5' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseURL: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large' },
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'mistral-large-3', name: 'Mistral Large 3' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 (Distill)' },
    ],
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    baseURL: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-3', name: 'Grok 3' },
      { id: 'grok-3-mini', name: 'Grok 3 Mini' },
    ],
  },
  {
    id: 'stepfun',
    name: '阶跃星辰 (StepFun)',
    baseURL: 'https://api.stepfun.com/v1',
    models: [
      { id: 'step-2-16k', name: 'Step-2 (16K)' },
      { id: 'step-1.5v', name: 'Step-1.5V' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)' },
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (via OpenRouter)' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (via OpenRouter)' },
    ],
  },
  {
    id: 'custom',
    name: '自定义 (Custom)',
    baseURL: '',
    models: [],
  },
]

/** Look up a provider by its settings.llm.provider value. */
export function findProvider(providerId: string): ProviderEntry | undefined {
  return LLM_PROVIDERS.find(p => p.id === providerId)
}
