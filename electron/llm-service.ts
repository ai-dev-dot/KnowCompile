import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { getSettings } from './settings-store'
import { loadSchemaPrompt } from './schema-loader'
import { logLLMInteraction, type LLMLogEntry } from './llm-logger'
import { stripThinking } from './utils'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface RunLLMParams {
  messages: ChatMessage[]
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string }
  logInfo?: { kbPath: string; role: LLMLogEntry['role'] }
  signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// Internal: shared LLM invocation — handles both providers, logging, errors
// ---------------------------------------------------------------------------

async function runLLM(params: RunLLMParams): Promise<string> {
  const settings = params.overrideSettings || getSettings().llm
  const startTime = Date.now()
  let response = ''
  let success = false
  let errorMsg: string | undefined

  try {
    if (settings.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: settings.apiKey })
      const systemMsg = params.messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n')
      const otherMsgs = params.messages.filter(m => m.role !== 'system')
      const resp = await client.messages.create({
        model: settings.model,
        max_tokens: 4096,
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
    logLLMInteraction(params.logInfo.kbPath, {
      timestamp: new Date().toISOString(),
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
    })
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
  logInfo?: { kbPath: string; role: LLMLogEntry['role'] },
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
}

export async function* chatStream(
  messages: ChatMessage[],
  overrideSettings?: { provider: string; apiKey: string; baseURL: string; model: string },
  logInfo?: { kbPath: string; role: LLMLogEntry['role'] },
  signal?: AbortSignal,
): AsyncGenerator<StreamToken, void, undefined> {
  const settings = overrideSettings || getSettings().llm
  const startTime = Date.now()
  let accumulated = ''
  let success = false
  let errorMsg: string | undefined

  try {
    if (settings.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: settings.apiKey })
      const systemMsg = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n')
      const otherMsgs = messages.filter(m => m.role !== 'system')
      const stream = await client.messages.create({
        model: settings.model,
        max_tokens: 4096,
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
          const chunk = stripThinking(event.delta.text)
          if (chunk) {
            accumulated += chunk
            yield { token: chunk, accumulated }
          }
        }
      }
    } else {
      const client = new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL || undefined,
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
          // Some OpenAI-compatible providers leak think tags in chunks
          const cleaned = stripThinking(delta)
          if (cleaned) {
            accumulated += cleaned
            yield { token: cleaned, accumulated }
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
    logLLMInteraction(logInfo.kbPath, {
      timestamp: new Date().toISOString(),
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
    })
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
      const client = new Anthropic({ apiKey: settings.apiKey })
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
  const fullSchema = loadSchemaPrompt(kbPath)

  const existingList = existingWikiTitles.length > 0
    ? `\n## 已有 Wiki 页面\n${existingWikiTitles.map(t => `- ${t}`).join('\n')}`
    : '\n## 已有 Wiki 页面\n（暂无，这是第一个编译任务）'

  const analysisPrompt: ChatMessage[] = [
    { role: 'system', content: fullSchema },
    { role: 'user', content: `分析以下资料，识别核心概念、与已有页面的关联、页面拆分建议。只输出分析，不生成页面。\n\n## 资料：${rawFileName}\n\n${rawContent.slice(0, 8000)}\n${existingList}` },
  ]

  const analysis = await chat(analysisPrompt, overrideSettings, { kbPath, role: 'compile' })

  const fewShotExample = [
    '',
    '## 正确输出格式示例（Few-shot）',
    '',
    '以下是正确的输出格式，必须严格遵守：',
    '',
    '---',
    'type: concept',
    'tags: [AI, 机器学习]',
    'sources: [example.md]',
    'updated: 2026-05-01',
    '---',
    '',
    '# 示例概念',
    '',
    '> 来源：example.md',
    '',
    '## 定义',
    '',
    '示例概念是指用于演示格式正确性的概念。',
    '',
    '## 核心内容',
    '',
    '这里是核心内容的段落。使用自然语言描述关键信息。',
    '',
    '## 相关主题',
    '',
    '- [[相关概念A]]',
    '- [[相关概念B]]',
    '',
    '**重要：**',
    '- 直接输出 Wiki 页面 Markdown，**禁止**用 JSON、代码块或其他格式封装',
    '- YAML frontmatter **只出现在页面最开头一次**，页面正文末尾不要再重复 frontmatter',
    '- 每个页面以 `---`（YAML frontmatter 开始标记）开头，然后是 frontmatter 字段，再是 `---`（结束标记），然后是正文',
    '- 不要添加任何开场白、解释或结尾语，只输出页面本身',
  ].join('\n')

  const generationPrompt: ChatMessage[] = [
    { role: 'system', content: fullSchema + fewShotExample },
    { role: 'user', content: `根据分析结果生成 Wiki 页面。\n\n## 资料：${rawFileName}\n\n${rawContent.slice(0, 8000)}\n${existingList}\n\n## 分析\n${analysis}\n\n请直接输出 Wiki 页面 Markdown（参考 Few-shot 示例），不要用 JSON 或其他格式封装。` },
  ]

  return chat(generationPrompt, overrideSettings, { kbPath, role: 'compile' })
}
