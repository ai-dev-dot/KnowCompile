/**
 * QA pipeline integration test — semanticQA 7-step pipeline
 *
 * Requires: LLM API + bge-m3 embedding model + a seeded knowledge base.
 * Usage: npx vitest run tests/qa-pipeline.test.ts --test-timeout=300000
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IndexDB } from '../electron/index-db'
import { VectorDB } from '../electron/vector-db'
import { EmbeddingService } from '../electron/embedding-service'
import { semanticQA } from '../electron/qa-service'
import { requireLLMSettings, type LLMSettings } from './helpers/llm-setup'

describe('QA Pipeline (semanticQA)', () => {
  let tmpDir: string
  let settings: LLMSettings
  let embedding: EmbeddingService
  let db: IndexDB
  let vdb: VectorDB

  beforeAll(async () => {
    settings = requireLLMSettings()

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-qa-test-'))

    for (const dir of ['wiki', 'raw', 'schema']) {
      fs.mkdirSync(path.join(tmpDir, dir), { recursive: true })
    }

    // Schema
    fs.writeFileSync(path.join(tmpDir, 'schema', 'system.md'), [
      '# 系统指令',
      '你是知识库问答助手。严格基于参考资料回答问题。',
      '规则：禁止编造、引用来源、综合回答、简洁清晰。',
    ].join('\n'), 'utf-8')

    // Initialize services
    embedding = new EmbeddingService()
    await embedding.initialize()

    db = new IndexDB(tmpDir)
    vdb = new VectorDB(tmpDir)
    await vdb.initialize()

    // Seed knowledge base with wiki pages
    const pages = [
      {
        title: '机器学习',
        content: [
          '---',
          'type: concept',
          'tags: [AI, ML]',
          'sources: [ml-intro.md]',
          'updated: 2026-05-01',
          '---',
          '',
          '# 机器学习',
          '',
          '> 来源：ml-intro.md',
          '',
          '## 定义',
          '',
          '机器学习是人工智能的一个分支，使计算机系统能够从数据中学习并改进，而无需显式编程。',
          '',
          '## 核心内容',
          '',
          '机器学习的三种主要类型：',
          '',
          '- 监督学习：使用带标签的训练数据。典型算法包括线性回归、决策树、支持向量机。',
          '- 无监督学习：从无标签数据中发现模式。典型方法包括 K-Means 聚类、PCA 降维。',
          '- 强化学习：智能体通过与环境交互获得奖励信号来学习最优策略。典型算法包括 Q-Learning、PPO。',
          '',
          '深度学习是机器学习的一个子领域，使用多层神经网络进行特征提取。',
          '',
          '## 相关主题',
          '',
          '- [[深度学习]]',
          '- [[神经网络]]',
          '- [[监督学习]]',
        ].join('\n'),
      },
      {
        title: '深度学习',
        content: [
          '---',
          'type: concept',
          'tags: [AI, DL]',
          'sources: [dl-intro.md]',
          'updated: 2026-05-01',
          '---',
          '',
          '# 深度学习',
          '',
          '> 来源：dl-intro.md',
          '',
          '## 定义',
          '',
          '深度学习是机器学习的一个子集，使用具有多个隐藏层的人工神经网络来学习数据的层次化表示。',
          '',
          '## 核心内容',
          '',
          '深度学习的关键架构：',
          '',
          '- 卷积神经网络 CNN：擅长图像处理和计算机视觉任务。',
          '- 循环神经网络 RNN：处理序列数据，如文本和时间序列。',
          '- Transformer：基于自注意力机制，是当前大语言模型的基础架构。',
          '',
          '深度学习需要大量数据和计算资源。GPU 加速是其成功的关键因素之一。',
          '',
          '## 相关主题',
          '',
          '- [[机器学习]]',
          '- [[神经网络]]',
          '- [[Transformer]]',
        ].join('\n'),
      },
    ]

    for (const { title, content } of pages) {
      const pagePath = path.join(tmpDir, 'wiki', `${title}.md`)
      fs.writeFileSync(pagePath, content, 'utf-8')

      const hash = require('crypto').createHash('sha256').update(content).digest('hex')
      const page = db.upsertPage({ path: `wiki/${title}.md`, title, hash })

      const chunks = embedding.chunkText(content, 500)
      if (chunks.length > 0) {
        const vecs = await embedding.embedTexts(chunks)
        await vdb.addChunks(chunks.map((text, i) => ({
          vector: vecs[i],
          type: 'page' as const,
          ref_id: page.id!,
          chunk_index: i,
          text,
        })))
      }
    }
  }, 7200000)

  afterAll(async () => {
    try { db.close() } catch { /* ok */ }
    try { await vdb.close() } catch { /* ok */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('1. answers a question based on knowledge base content', async () => {
    const result = await semanticQA('什么是机器学习？', tmpDir, embedding, db, vdb, settings)

    expect(result).toBeDefined()
    expect(result.answer).toBeTruthy()
    expect(result.answer.length).toBeGreaterThan(20)
    expect(result.sources).toBeDefined()
    expect(Array.isArray(result.sources)).toBe(true)
  }, 120000)

  it('2. returns sources referencing the correct pages', async () => {
    const result = await semanticQA('深度学习有哪些架构？', tmpDir, embedding, db, vdb, settings)

    expect(result.sources.length).toBeGreaterThan(0)
    // Sources should reference relevant pages
    const sourceTitles = result.sources.map(s => s.title)
    expect(sourceTitles.some(t => t.includes('深度学习'))).toBe(true)

    // Each source should have required fields
    for (const source of result.sources) {
      expect(source.title).toBeTruthy()
      expect(typeof source.chunk_index).toBe('number')
      expect(typeof source.similarity).toBe('number')
      expect(source.similarity).toBeGreaterThan(0)
      expect(source.similarity).toBeLessThanOrEqual(1)
    }
  }, 120000)

  it('3. handles empty knowledge base gracefully', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-empty-qa-'))
    fs.mkdirSync(path.join(emptyDir, 'wiki'), { recursive: true })
    fs.mkdirSync(path.join(emptyDir, 'schema'), { recursive: true })
    fs.writeFileSync(path.join(emptyDir, 'schema', 'system.md'), '# System', 'utf-8')

    const emptyDB = new IndexDB(emptyDir)
    const emptyVDB = new VectorDB(emptyDir)
    await emptyVDB.initialize()

    try {
      const result = await semanticQA('什么问题？', emptyDir, embedding, emptyDB, emptyVDB, settings)
      expect(result).toBeDefined()
      // Should give a graceful "not found" response
      expect(result.answer).toContain('未找到')
      expect(result.sources).toEqual([])
    } finally {
      try { emptyDB.close() } catch { /* ok */ }
      try { await emptyVDB.close() } catch { /* ok */ }
      fs.rmSync(emptyDir, { recursive: true, force: true })
    }
  }, 60000)

  it('4. answer is relevant to the question', async () => {
    const result = await semanticQA('CNN 用在什么领域？', tmpDir, embedding, db, vdb, settings)

    expect(result.answer).toBeTruthy()
    const answer = result.answer.toLowerCase()
    // Answer should mention relevant concepts from the KB
    const relevant = answer.includes('图像') || answer.includes('视觉') || answer.includes('cnn') || answer.includes('卷积')
    expect(relevant).toBe(true)
  }, 120000)

  it('5. handles Chinese questions correctly', async () => {
    const result = await semanticQA('监督学习和无监督学习有什么区别？', tmpDir, embedding, db, vdb, settings)

    expect(result.answer).toBeTruthy()
    expect(result.answer.length).toBeGreaterThan(30)
    // Should provide a substantive answer in Chinese
    expect(/[一-鿿]/.test(result.answer)).toBe(true)
  }, 120000)

  it('6. answer does not contain raw think tags', async () => {
    const result = await semanticQA('什么是 Transformer？', tmpDir, embedding, db, vdb, settings)

    expect(result.answer).toBeTruthy()
    expect(/<\s*think\s*>/i.test(result.answer)).toBe(false)
  }, 120000)

  it('7. deduplicates sources from the same page', async () => {
    const result = await semanticQA('机器学习的类型有哪些？', tmpDir, embedding, db, vdb, settings)

    expect(result.sources.length).toBeGreaterThan(0)
    // No duplicate (title, chunk_index) pairs
    const keys = result.sources.map(s => `${s.title}|${s.chunk_index}`)
    expect(new Set(keys).size).toBe(keys.length)
  }, 120000)

  it('8. returns error-like response for out-of-scope question', async () => {
    const result = await semanticQA('今天北京的天气怎么样？', tmpDir, embedding, db, vdb, settings)

    expect(result.answer).toBeTruthy()
    // Should indicate no relevant info found (not hallucinate weather)
    const answer = result.answer
    expect(
      answer.includes('未找到') || answer.includes('没有') || answer.includes('无法') || answer.includes('不相关')
    ).toBe(true)
  }, 120000)

  it('9. sources are ordered by similarity descending', async () => {
    const result = await semanticQA('监督学习是什么？', tmpDir, embedding, db, vdb, settings)

    if (result.sources.length >= 2) {
      for (let i = 1; i < result.sources.length; i++) {
        // Sources should be in descending similarity order
        expect(result.sources[i - 1].similarity).toBeGreaterThanOrEqual(result.sources[i].similarity)
      }
    }
  }, 120000)
})
