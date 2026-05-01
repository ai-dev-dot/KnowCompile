import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IndexDB } from '../electron/index-db'
import { IndexRebuilder } from '../electron/index-rebuilder'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Integration: Index Pipeline', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-integration-'))
    fs.mkdirSync(path.join(tmpDir, 'wiki'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'raw'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'schema'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('rebuilds index from wiki/ and raw/ files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'wiki', '人工智能.md'), '# 人工智能\n\n人工智能是计算机科学的一个分支。\n\n## 相关主题\n[[机器学习]]\n[[深度学习]]')
    fs.writeFileSync(path.join(tmpDir, 'wiki', '机器学习.md'), '# 机器学习\n\n机器学习是AI的子领域。\n\n## 相关主题\n[[人工智能]]\n[[神经网络]]')
    fs.writeFileSync(path.join(tmpDir, 'raw', 'ai-intro.txt'), '人工智能简介：AI 包含机器学习、深度学习、自然语言处理等子领域。')

    const rebuilder = new IndexRebuilder(tmpDir)
    const result = await rebuilder.rebuild()

    expect(result.pagesIndexed).toBe(2)
    expect(result.sourcesIndexed).toBe(1)
    expect(result.chunksIndexed).toBeGreaterThanOrEqual(2)

    // Verify SQLite has the data
    const db = new IndexDB(tmpDir)
    const pages = db.listPages()
    expect(pages.length).toBe(2)
    const sources = db.listSources()
    expect(sources.length).toBe(1)
    db.close()
  }, 60000)

  it('handles empty wiki/ and raw/ gracefully', async () => {
    const rebuilder = new IndexRebuilder(tmpDir)
    const result = await rebuilder.rebuild()
    expect(result.pagesIndexed).toBe(0)
    expect(result.sourcesIndexed).toBe(0)
    expect(result.errors.length).toBe(0)
  }, 60000)

  it('extracts links between pages', async () => {
    fs.writeFileSync(path.join(tmpDir, 'wiki', 'Page A.md'), '# Page A\n\nContent about A.\n\n## 相关主题\n[[Page B]]')
    fs.writeFileSync(path.join(tmpDir, 'wiki', 'Page B.md'), '# Page B\n\nContent about B.\n\n## 相关主题\n[[Page A]]')

    const rebuilder = new IndexRebuilder(tmpDir)
    await rebuilder.rebuild()

    const db = new IndexDB(tmpDir)
    const links = db.getAllLinks()
    expect(links.length).toBe(2) // A→B and B→A
    db.close()
  }, 60000)
})
