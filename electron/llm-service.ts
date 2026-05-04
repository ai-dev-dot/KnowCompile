import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { getSettings } from './settings-store'
import { loadSchemaPrompt } from './schema-loader'
import { logLLMInteraction, type LLMLogEntry } from './llm-logger'
import { stripThinking, extractThinking } from './utils'

// ---------------------------------------------------------------------------
// Token + cost estimation (估算值，仅供参考)
// ---------------------------------------------------------------------------

/** Rough token estimate: Chinese chars / 2 ≈ tokens. 估算值，仅供参考。 */
export function estimateLLMTokens(text: string | number): number {
  const len = typeof text === 'string' ? text.length : text
  return Math.ceil(len / 2)
}

/** Price per 1M tokens (input / output). Updated May 2026. */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514':   { input: 15, output: 75 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4 },
  'gpt-4o':                   { input: 2.5, output: 10 },
  'gpt-4o-mini':              { input: 0.15, output: 0.60 },
  // default for unknown models
  'default':                  { input: 1, output: 5 },
}

export function estimateLLMCost(model: string, promptTokens: number, responseTokens: number): number {
  const price = MODEL_PRICES[model] || MODEL_PRICES['default']
  return (promptTokens / 1_000_000) * price.input + (responseTokens / 1_000_000) * price.output
}

export function categorizeLLMError(err: Error | undefined, signal?: AbortSignal): LLMLogEntry['errorCategory'] {
  if (!err) return undefined
  const msg = err.message || ''
  if (signal?.aborted || err.name === 'AbortError') return undefined // not an error
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return 'timeout'
  if (/rate.?limit|429|too many requests/i.test(msg)) return 'rate_limit'
  if (/unauthorized|invalid.*key|auth|401|403/i.test(msg)) return 'auth'
  if (/network|fetch|ECONN|ENOTFOUND|DNS/i.test(msg)) return 'network'
  return 'other'
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface RunLLMParams {
  messages: ChatMessage[]
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string }
  logInfo?: { kbPath: string; role: LLMLogEntry['role']; qaSessionId?: string }
  signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// Internal: shared LLM invocation — handles both providers, logging, errors
// ---------------------------------------------------------------------------

async function runLLM(params: RunLLMParams): Promise<string> {
  const settings = params.overrideSettings || getSettings().llm
  const startTime = Date.now()
  const promptLen = params.messages.reduce((sum, m) => sum + m.content.length, 0)
  const role = params.logInfo?.role || 'chat'
  console.log(`[LLM] 发起请求 | ${settings.provider}/${settings.model} | ${role} | prompt ${(promptLen / 1024).toFixed(0)}KB | ${new Date().toLocaleTimeString('zh-CN')}`)
  let response = ''
  let success = false
  let errorMsg: string | undefined

  try {
    if (settings.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: settings.apiKey, timeout: 300_000 })
      const systemMsg = params.messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n')
      const otherMsgs = params.messages.filter(m => m.role !== 'system')
      const resp = await client.messages.create({
        model: settings.model,
        max_tokens: 8192,
        system: systemMsg || undefined,
        messages: otherMsgs.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      })
      response = stripThinking(
        resp.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n')
      )
    } else {
      const client = new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL || undefined,
        timeout: 300_000,
        maxRetries: 2,
      })
      const resp = await client.chat.completions.create({
        model: settings.model,
        messages: params.messages,
        temperature: 0.3,
      })
      response = stripThinking(resp.choices[0]?.message?.content || '')
    }
    success = true
  } catch (err: any) {
    if (err?.name === 'AbortError' || params.signal?.aborted) {
      errorMsg = 'Request cancelled'
    } else {
      errorMsg = err?.message || String(err)
    }
    response = ''
  }

  if (params.logInfo?.kbPath) {
    const lastUserMsg = [...params.messages].reverse().find(m => m.role === 'user')
    const promptTokens = estimateLLMTokens(params.messages.reduce((sum, m) => sum + m.content.length, 0))
    const responseTokens = estimateLLMTokens(response.length)
    logLLMInteraction(params.logInfo.kbPath, {
      timestamp: new Date().toISOString(),
      qaSessionId: params.logInfo.qaSessionId,
      model: settings.model,
      provider: settings.provider,
      role: params.logInfo.role,
      promptSummary: (lastUserMsg?.content || '').slice(0, 500),
      responseSummary: response.slice(0, 500),
      promptLen: params.messages.reduce((sum, m) => sum + m.content.length, 0),
      responseLen: response.length,
      durationMs: Date.now() - startTime,
      success,
      error: errorMsg,
      errorCategory: success ? undefined : categorizeLLMError(new Error(errorMsg || ''), params.signal),
      promptTokens,
      responseTokens,
      costEstimate: estimateLLMCost(settings.model, promptTokens, responseTokens),
    })
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  if (success) {
    console.log(`[LLM] 请求完成 | ${settings.model} | ${elapsed}s | response ${(response.length / 1024).toFixed(0)}KB`)
  } else {
    console.log(`[LLM] 请求失败 | ${settings.model} | ${elapsed}s | ${errorMsg}`)
  }

  if (!success) throw new Error(errorMsg || 'LLM call failed')
  return response
}

// ---------------------------------------------------------------------------
// Public: non-streaming chat (backward-compatible wrapper)
// ---------------------------------------------------------------------------

export async function chat(
  messages: ChatMessage[],
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string },
  logInfo?: { kbPath: string; role: LLMLogEntry['role']; qaSessionId?: string },
): Promise<string> {
  return runLLM({ messages, overrideSettings, logInfo })
}

// ---------------------------------------------------------------------------
// Public: streaming chat — yields tokens as they arrive from the LLM
// ---------------------------------------------------------------------------

export interface StreamToken {
  /** Incremental text token, null signals stream completion. */
  token: string | null
  /** Accumulated full response so far (for partial display fallback). */
  accumulated: string
  /** Accumulated reasoning/thinking content from <think> tags. */
  thinking?: string
}

export async function* chatStream(
  messages: ChatMessage[],
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string },
  logInfo?: { kbPath: string; role: LLMLogEntry['role']; qaSessionId?: string },
  signal?: AbortSignal,
): AsyncGenerator<StreamToken, void, undefined> {
  const settings = overrideSettings || getSettings().llm
  const startTime = Date.now()
  const promptLen = messages.reduce((sum, m) => sum + m.content.length, 0)
  const role = logInfo?.role || 'chat'
  console.log(`[LLM] 发起流式请求 | ${settings.provider}/${settings.model} | ${role} | prompt ${(promptLen / 1024).toFixed(0)}KB | ${new Date().toLocaleTimeString('zh-CN')}`)
  let accumulated = ''
  let accumulatedRaw = '' // includes think tags for extraction
  let thinking = ''
  let success = false
  let errorMsg: string | undefined

  try {
    if (settings.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: settings.apiKey, timeout: 300_000 })
      const systemMsg = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n')
      const otherMsgs = messages.filter(m => m.role !== 'system')
      const stream = await client.messages.create({
        model: settings.model,
        max_tokens: 8192,
        system: systemMsg || undefined,
        messages: otherMsgs.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        stream: true,
      })

      for await (const event of stream) {
        if (signal?.aborted) break
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          accumulatedRaw += event.delta.text
          const chunk = stripThinking(event.delta.text)
          thinking = extractThinking(accumulatedRaw)
          if (chunk) {
            accumulated += chunk
            yield { token: chunk, accumulated, thinking }
          }
        }
      }
    } else {
      const client = new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL || undefined,
        timeout: 300_000,
        maxRetries: 2,
      })
      const stream = await client.chat.completions.create({
        model: settings.model,
        messages,
        temperature: 0.3,
        stream: true,
      })

      for await (const chunk of stream) {
        if (signal?.aborted) break
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          accumulatedRaw += delta
          const cleaned = stripThinking(delta)
          thinking = extractThinking(accumulatedRaw)
          if (cleaned) {
            accumulated += cleaned
            yield { token: cleaned, accumulated, thinking }
          }
        }
      }
    }
    success = true
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      errorMsg = 'Request cancelled'
    } else {
      errorMsg = err?.message || String(err)
    }
  }

  // Log the full interaction
  if (logInfo?.kbPath) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    const promptTokens = estimateLLMTokens(messages.reduce((sum, m) => sum + m.content.length, 0))
    const responseTokens = estimateLLMTokens(accumulated.length)
    logLLMInteraction(logInfo.kbPath, {
      timestamp: new Date().toISOString(),
      qaSessionId: logInfo.qaSessionId,
      model: settings.model,
      provider: settings.provider,
      role: logInfo.role,
      promptSummary: (lastUserMsg?.content || '').slice(0, 500),
      responseSummary: accumulated.slice(0, 500),
      promptLen: messages.reduce((sum, m) => sum + m.content.length, 0),
      responseLen: accumulated.length,
      durationMs: Date.now() - startTime,
      success,
      error: errorMsg,
      errorCategory: success ? undefined : categorizeLLMError(new Error(errorMsg || ''), signal),
      promptTokens,
      responseTokens,
      costEstimate: estimateLLMCost(settings.model, promptTokens, responseTokens),
    })
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  if (success) {
    console.log(`[LLM] 流式请求完成 | ${settings.model} | ${elapsed}s | response ${(accumulated.length / 1024).toFixed(0)}KB`)
  } else {
    console.log(`[LLM] 流式请求失败 | ${settings.model} | ${elapsed}s | ${errorMsg}`)
  }

  if (!success) throw new Error(errorMsg || 'LLM stream failed')
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export async function testConnection(settings: {
  provider: string
  apiKey: string
  baseURL: string
  model: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (settings.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: settings.apiKey, timeout: 300_000 })
      const resp = await client.messages.create({
        model: settings.model,
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Hello' }],
      })
      const text = stripThinking(resp.content.filter(c => c.type === 'text').map(c => c.text).join(''))
      return { success: true, message: `连接成功！模型回复: "${text.slice(0, 50)}"` }
    }

    const client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseURL || undefined,
    })
    const resp = await client.chat.completions.create({
      model: settings.model,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 50,
    })
    const text = stripThinking(resp.choices[0]?.message?.content || '')
    return { success: true, message: `连接成功！模型回复: "${text.slice(0, 50)}"` }
  } catch (err: any) {
    const msg = err?.message || String(err)
    return { success: false, message: `连接失败：${msg}` }
  }
}

// ---------------------------------------------------------------------------
// Compile pipeline (unchanged — delegates to chat())
// ---------------------------------------------------------------------------

export async function compileNewPages(
  rawContent: string,
  rawFileName: string,
  existingWikiTitles: string[],
  kbPath: string,
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string },
): Promise<string> {
  // Schema includes format rules + few-shot example (see compile-rules.md)
  const fullSchema = loadSchemaPrompt(kbPath)

  const existingList = existingWikiTitles.length > 0
    ? `\n## 已有 Wiki 页面\n${existingWikiTitles.map(t => `- ${t}`).join('\n')}`
    : '\n## 已有 Wiki 页面\n（暂无，这是第一个编译任务）'

  // Step 1 — Analysis (sees full schema including format example)
  const analysisPrompt: ChatMessage[] = [
    { role: 'system', content: fullSchema },
    { role: 'user', content: `分析以下资料。识别：1) 资料整体主题和结构 2) 哪些已有页面可以合并更新 3) 如果确实需要新建页面，主题差异是否足够大且各有独立成文的内容？优先合并，只在必要时新建。\n\n## 资料：${rawFileName}\n\n${rawContent.slice(0, 8000)}\n${existingList}` },
  ]

  const analysis = await chat(analysisPrompt, overrideSettings, { kbPath, role: 'compile' })

  // Step 2 — Generation (same schema, with concrete task instruction)
  const generationPrompt: ChatMessage[] = [
    { role: 'system', content: fullSchema },
    { role: 'user', content: [
      '根据分析结果生成 Wiki 页面，严格遵守系统指令中的输出格式（Few-shot 示例）。',
      '',
      '要求：',
      '- 优先合并相关内容，每个页面至少 2 个 ## 小节和 300 字正文',
      '- 每个页面必须以 `---`（YAML frontmatter）开头',
      '- 禁止输出开场白、解释或结尾语',
      '',
      `## 资料：${rawFileName}`,
      '',
      rawContent.slice(0, 8000),
      '',
      existingList,
      '',
      `## 分析结果`,
      analysis,
      '',
      '请直接输出 Wiki 页面 Markdown。',
    ].join('\n') },
  ]

  return chat(generationPrompt, overrideSettings, { kbPath, role: 'compile' })
}
