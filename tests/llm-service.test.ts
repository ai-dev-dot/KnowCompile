/**
 * LLM Service integration tests — chat, testConnection, compileNewPages
 *
 * Requires LLM API credentials (see tests/helpers/llm-setup.ts).
 * Usage: npx vitest run tests/llm-service.test.ts --test-timeout=120000
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chat, testConnection, compileNewPages } from '../electron/llm-service'
import { requireLLMSettings, type LLMSettings } from './helpers/llm-setup'

describe('LLM Service', () => {
  let settings: LLMSettings
  let tmpDir: string

  beforeAll(() => {
    settings = requireLLMSettings()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-llm-test-'))
    // Seed schema files so compileNewPages can read them
    const schemaDir = path.join(tmpDir, 'schema')
    fs.mkdirSync(schemaDir, { recursive: true })
    fs.writeFileSync(path.join(schemaDir, 'system.md'), [
      '# 系统指令',
      '',
      '## 身份',
      '你是知识编译 Agent。将资料编译为结构化 Wiki 页面。',
      '',
      '## 核心原则',
      '1. 溯源优先：每句话都能追溯到原始资料。',
      '2. 中文输出：使用简体中文。',
      '3. 原子页面：每个页面只覆盖一个概念。',
    ].join('\n'), 'utf-8')
    fs.writeFileSync(path.join(schemaDir, 'compile-rules.md'), [
      '# 编译规则',
      '',
      '每个页面必须按此格式输出：',
      '',
      '---',
      'type: concept',
      'tags: [标签]',
      'sources: [源文件名]',
      'updated: 2026-05-01',
      '---',
      '',
      '# 页面标题',
      '',
      '> 来源：源文件名',
      '',
      '## 定义',
      '一句话说明。',
      '',
      '## 核心内容',
      '正文段落。',
      '',
      '## 相关主题',
      '- [[概念A]]',
    ].join('\n'), 'utf-8')
    fs.writeFileSync(path.join(schemaDir, 'style-guide.md'), '# 文风指南\n\n使用自然段落。', 'utf-8')
    fs.writeFileSync(path.join(schemaDir, 'links-rules.md'), '# 链接规则\n\n只在相关主题使用链接。', 'utf-8')
  })

  // -- chat --
  it('1. chat returns non-empty response', async () => {
    const response = await chat(
      [{ role: 'user', content: 'Say "hello world" and nothing else.' }],
      settings,
    )
    expect(response).toBeTruthy()
    expect(response.length).toBeGreaterThan(0)
    expect(response.toLowerCase()).toContain('hello')
  }, 60000)

  it('2. chat with system message respects context', async () => {
    const response = await chat(
      [
        { role: 'system', content: '你是一个助手。用中文回答，不超过10个字。' },
        { role: 'user', content: '1+1等于几？' },
      ],
      settings,
    )
    expect(response).toBeTruthy()
    expect(response.length).toBeGreaterThan(0)
  }, 60000)

  it('3. chat response has thinking tags stripped', async () => {
    // Some models emit <think> tags; the chat wrapper should strip them
    const response = await chat(
      [{ role: 'user', content: 'Reply with exactly: OK' }],
      settings,
    )
    expect(response).toBeTruthy()
    // Should not contain raw think tags
    expect(/<\s*think\s*>/i.test(response)).toBe(false)
  }, 60000)

  it('4. chat handles multi-turn conversation', async () => {
    const response = await chat(
      [
        { role: 'user', content: '我的名字叫小明。' },
        { role: 'assistant', content: '你好小明！' },
        { role: 'user', content: '我叫什么名字？只回答名字，不要多余的话。' },
      ],
      settings,
    )
    expect(response).toBeTruthy()
    expect(response).toContain('小明')
  }, 60000)

  // -- testConnection --
  it('5. testConnection returns success with valid settings', async () => {
    const result = await testConnection(settings)
    expect(result.success).toBe(true)
    expect(result.message).toBeTruthy()
  }, 60000)

  it('6. testConnection returns failure with invalid API key', async () => {
    const result = await testConnection({
      ...settings,
      apiKey: 'sk-invalid-key-12345',
    })
    // Should fail gracefully, not throw
    expect(result.success).toBe(false)
    expect(result.message).toBeTruthy()
  }, 60000)

  // -- compileNewPages --
  it('7. compileNewPages generates wiki pages from raw content', async () => {
    const rawContent = [
      '# 微服务架构',
      '',
      '微服务架构是一种将应用拆分为多个小型、独立可部署服务的设计模式。',
      '',
      '## 核心优势',
      '',
      '- 独立部署：每个服务可以独立构建、测试和部署。',
      '- 技术异构：不同服务可以使用不同的技术栈。',
      '- 弹性伸缩：可以根据负载独立扩展各个服务。',
      '',
      '## 相关概念',
      '',
      '- 容器化',
      '- API 网关',
      '- 服务发现',
    ].join('\n')

    const existingTitles: string[] = []
    const output = await compileNewPages(rawContent, '微服务.md', existingTitles, tmpDir, settings)

    expect(output).toBeTruthy()
    expect(output.length).toBeGreaterThan(100)
    // Should contain frontmatter markers
    expect(output).toContain('---')
    // Should contain at least one # title
    expect(output).toMatch(/^# /m)
  }, 60000)

  it('8. compileNewPages handles existing wiki titles', async () => {
    const rawContent = [
      '# API 网关',
      '',
      'API 网关是微服务架构中的关键组件，作为所有客户端请求的单一入口点。',
      '',
      '## 功能',
      '',
      '- 请求路由',
      '- 认证授权',
      '- 限流和负载均衡',
    ].join('\n')

    const existingTitles = ['微服务架构', '容器化']
    const output = await compileNewPages(rawContent, 'api-gateway.md', existingTitles, tmpDir, settings)

    expect(output).toBeTruthy()
    expect(output.length).toBeGreaterThan(50)
  }, 60000)

  it('9. compileNewPages output passes basic structure checks', async () => {
    const rawContent = [
      '# 服务发现',
      '',
      '服务发现是微服务架构中用于自动检测服务实例网络位置的机制。',
      '',
      '## 模式',
      '',
      '客户端发现：客户端直接查询服务注册表。',
      '服务端发现：通过负载均衡器间接发现服务。',
    ].join('\n')

    const output = await compileNewPages(rawContent, 'service-discovery.md', [], tmpDir, settings)

    // Should contain YAML frontmatter somewhere (some models add preamble text)
    const hasFrontmatter = output.includes('---\ntype:') || output.includes('---\r\ntype:')
    expect(hasFrontmatter).toBe(true)

    // Should have at least one # heading
    const h1Count = (output.match(/^# /gm) || []).length
    expect(h1Count).toBeGreaterThanOrEqual(1)

    // Should not have raw think tags
    expect(/<\s*think\s*>/i.test(output)).toBe(false)
  }, 60000)
})
