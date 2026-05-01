/**
 * Compile pipeline integration test — incrementalCompile 5-step pipeline
 *
 * Requires: LLM API + bge-m3 embedding model (~568 MB download on first run).
 * Usage: npx vitest run tests/compile-pipeline.test.ts --test-timeout=300000
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IndexDB } from '../electron/index-db'
import { VectorDB } from '../electron/vector-db'
import { EmbeddingService } from '../electron/embedding-service'
import { incrementalCompile } from '../electron/compile-service'
import { requireLLMSettings, type LLMSettings } from './helpers/llm-setup'

describe('Compile Pipeline (incrementalCompile)', () => {
  let tmpDir: string
  let settings: LLMSettings
  let embedding: EmbeddingService
  let db: IndexDB
  let vdb: VectorDB

  beforeAll(async () => {
    settings = requireLLMSettings()

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-compile-test-'))

    // Seed KB structure
    for (const dir of ['wiki', 'raw', 'schema']) {
      fs.mkdirSync(path.join(tmpDir, dir), { recursive: true })
    }

    // Schema files (required by incrementalCompile)
    fs.writeFileSync(path.join(tmpDir, 'schema', 'system.md'), [
      '# 系统指令',
      '你是知识编译 Agent。将资料编译为结构化 Wiki 页面。',
      '严格遵循页面格式模板，只输出 JSON 或 Wiki 页面。',
    ].join('\n'), 'utf-8')
    fs.writeFileSync(path.join(tmpDir, 'schema', 'compile-rules.md'), [
      '# 编译规则',
      '每个页面格式：--- 开头，# 标题，> 来源，## 定义，## 核心内容，## 相关主题。',
    ].join('\n'), 'utf-8')
    fs.writeFileSync(path.join(tmpDir, 'schema', 'style-guide.md'), '# 文风', 'utf-8')
    fs.writeFileSync(path.join(tmpDir, 'schema', 'links-rules.md'), '# 链接', 'utf-8')

    // Initialize services
    embedding = new EmbeddingService()
    await embedding.initialize()

    db = new IndexDB(tmpDir)
    vdb = new VectorDB(tmpDir)
    await vdb.initialize()
  }, 7200000)

  afterAll(async () => {
    try { db.close() } catch { /* ok */ }
    try { await vdb.close() } catch { /* ok */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('1. compiles a raw markdown file end-to-end', async () => {
    const rawPath = path.join(tmpDir, 'raw', 'test-topic.md')
    fs.writeFileSync(rawPath, [
      '# 强化学习',
      '',
      '强化学习是机器学习的一个分支，智能体通过与环境交互来学习最优策略。',
      '',
      '## 核心概念',
      '',
      '- 智能体 Agent：执行动作的实体。',
      '- 环境 Environment：智能体所处的外部世界。',
      '- 奖励 Reward：环境对智能体动作的反馈信号。',
      '- 策略 Policy：智能体选择动作的规则。',
      '',
      '## 算法分类',
      '',
      '基于值的方法：Q-Learning、DQN。',
      '基于策略的方法：Policy Gradient、PPO。',
      'Actor-Critic 方法：A3C、SAC。',
    ].join('\n'), 'utf-8')

    const result = await incrementalCompile(rawPath, tmpDir, embedding, db, vdb, settings)

    // Result structure
    expect(result).toBeDefined()
    expect(result.compileOutput).toBeTruthy()
    expect(result.compileOutput.length).toBeGreaterThan(100)
    expect(result.plan).toBeDefined()
    expect(result.candidatePages).toBeDefined()

    // Plan should have array fields
    expect(Array.isArray(result.plan.updates)).toBe(true)
    expect(Array.isArray(result.plan.new_pages)).toBe(true)
    expect(Array.isArray(result.plan.conflicts)).toBe(true)
  }, 180000)

  it('2. compile output is valid markdown format', async () => {
    const rawPath = path.join(tmpDir, 'raw', 'simple-topic.md')
    fs.writeFileSync(rawPath, [
      '# 监督学习',
      '',
      '监督学习使用带标签的训练数据来学习从输入到输出的映射。',
      '',
      '## 常见算法',
      '- 线性回归',
      '- 逻辑回归',
      '- 支持向量机 SVM',
      '- 决策树和随机森林',
    ].join('\n'), 'utf-8')

    const result = await incrementalCompile(rawPath, tmpDir, embedding, db, vdb, settings)

    const output = result.compileOutput
    expect(output).toBeTruthy()
    expect(output.length).toBeGreaterThan(100)

    // Output must be raw markdown (not JSON-wrapped)
    expect(output.trim()).toMatch(/^---/)
    expect(output).toContain('type:')
    expect(/^# /m.test(output)).toBe(true)
    expect(/<\s*think\s*>/i.test(output)).toBe(false)
  }, 180000)

  it('3. source is registered in index after compile', async () => {
    const rawPath = path.join(tmpDir, 'raw', 'registered-topic.md')
    fs.writeFileSync(rawPath, [
      '# 无监督学习',
      '',
      '无监督学习在没有标签的数据中发现隐藏的模式和结构。',
      '',
      '## 常见方法',
      '- 聚类：K-Means、DBSCAN',
      '- 降维：PCA、t-SNE',
      '- 关联规则：Apriori',
    ].join('\n'), 'utf-8')

    await incrementalCompile(rawPath, tmpDir, embedding, db, vdb, settings)

    // Check source was registered
    const source = db.getSourceByPath('raw/registered-topic.md')
    expect(source).toBeDefined()
    expect(source!.status).toBe('compiled')
  }, 180000)

  it('4. generated wiki pages are persisted to disk', async () => {
    const rawPath = path.join(tmpDir, 'raw', 'disk-persist-topic.md')
    fs.writeFileSync(rawPath, [
      '# 迁移学习',
      '',
      '迁移学习将在一个任务上学到的知识应用到另一个相关任务上。',
      '',
      '## 类型',
      '- 归纳迁移学习',
      '- 转导迁移学习',
      '- 无监督迁移学习',
    ].join('\n'), 'utf-8')

    await incrementalCompile(rawPath, tmpDir, embedding, db, vdb, settings)

    const wikiDir = path.join(tmpDir, 'wiki')
    const wikiFiles = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md'))
    expect(wikiFiles.length).toBeGreaterThanOrEqual(1)

    const firstPage = fs.readFileSync(path.join(wikiDir, wikiFiles[0]), 'utf-8')
    expect(firstPage.length).toBeGreaterThan(50)
    expect(firstPage).toContain('---')
  }, 180000)

  it('5. compiles with no existing wiki pages (cold start)', async () => {
    // Fresh KB with no wiki pages
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-cold-'))
    for (const dir of ['wiki', 'raw', 'schema']) {
      fs.mkdirSync(path.join(freshDir, dir), { recursive: true })
    }
    // Copy schema files
    for (const f of ['system.md', 'compile-rules.md', 'style-guide.md', 'links-rules.md']) {
      fs.copyFileSync(path.join(tmpDir, 'schema', f), path.join(freshDir, 'schema', f))
    }

    const freshDB = new IndexDB(freshDir)
    const freshVDB = new VectorDB(freshDir)
    await freshVDB.initialize()

    try {
      const rawPath = path.join(freshDir, 'raw', 'cold-start.md')
      fs.writeFileSync(rawPath, '# 全新概念\n\n这是一个全新的知识领域。', 'utf-8')

      const result = await incrementalCompile(rawPath, freshDir, embedding, freshDB, freshVDB, settings)

      expect(result.compileOutput).toBeTruthy()
      // With no existing pages, candidatePages should be empty
      expect(result.candidatePages).toEqual([])
    } finally {
      try { freshDB.close() } catch { /* ok */ }
      try { await freshVDB.close() } catch { /* ok */ }
      fs.rmSync(freshDir, { recursive: true, force: true })
    }
  }, 180000)

  it('6. detects conflicts with existing content', async () => {
    // Use a fresh isolated KB to avoid pollution from previous tests
    const isoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-conflict-'))
    for (const dir of ['wiki', 'raw', 'schema']) {
      fs.mkdirSync(path.join(isoDir, dir), { recursive: true })
    }
    for (const f of ['system.md', 'compile-rules.md', 'style-guide.md', 'links-rules.md']) {
      fs.copyFileSync(path.join(tmpDir, 'schema', f), path.join(isoDir, 'schema', f))
    }

    const isoDB = new IndexDB(isoDir)
    const isoVDB = new VectorDB(isoDir)
    await isoVDB.initialize()

    try {
      // Create an existing wiki page with deliberately wrong info
      const existingContent = [
        '---',
        'type: concept',
        'tags: [编程]',
        'sources: [old-source.md]',
        'updated: 2024-01-01',
        '---',
        '',
        '# Python',
        '',
        '> 来源：old-source.md',
        '',
        '## 定义',
        '',
        'Python 是静态类型编程语言，主要用于系统编程。',
        '',
        '## 核心内容',
        '',
        'Python 的静态类型系统使其适合构建大型系统。',
        '',
        '## 相关主题',
        '',
        '- [[C++]]',
      ].join('\n')

      fs.writeFileSync(path.join(isoDir, 'wiki', 'Python.md'), existingContent, 'utf-8')

      const existingHash = require('crypto').createHash('sha256').update(existingContent).digest('hex')
      const page = isoDB.upsertPage({
        path: 'wiki/Python.md',
        title: 'Python',
        hash: existingHash,
      })

      // Chunk + embed the existing page so similarity search can find it
      const chunks = embedding.chunkText(existingContent, 500)
      if (chunks.length > 0) {
        const vecs = await embedding.embedTexts(chunks)
        await isoVDB.addChunks(chunks.map((text, i) => ({
          vector: vecs[i],
          type: 'page' as const,
          ref_id: page.id!,
          chunk_index: i,
          text,
        })))
      }

      // Compile a raw file with the CORRECT info (contradicts existing page)
      const rawPath = path.join(isoDir, 'raw', 'python-correction.md')
      fs.writeFileSync(rawPath, [
        '# Python 语言',
        '',
        'Python 是动态类型解释型语言，广泛用于数据科学、Web 开发和 AI 领域。',
        '',
        '## 特点',
        '- 动态类型：变量无需声明类型。',
        '- 解释执行：代码逐行解释运行。',
        '- 丰富的库生态：NumPy、Pandas、TensorFlow。',
      ].join('\n'), 'utf-8')

      const result = await incrementalCompile(rawPath, isoDir, embedding, isoDB, isoVDB, settings)

      // Verify the plan was parsed successfully
      expect(result.plan).toBeDefined()
      expect(Array.isArray(result.plan.conflicts)).toBe(true)
      expect(Array.isArray(result.plan.updates)).toBe(true)
      expect(Array.isArray(result.plan.new_pages)).toBe(true)

      // The existing Python page should appear as a candidate (similarity search)
      expect(result.candidatePages).toContain('Python')
    } finally {
      try { isoDB.close() } catch { /* ok */ }
      try { await isoVDB.close() } catch { /* ok */ }
      fs.rmSync(isoDir, { recursive: true, force: true })
    }
  }, 180000)
})
