/**
 * Gap Store unit tests — knowledge gap tracking.
 * Usage: npx vitest run tests/gap-store.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { logGap, listGaps, resolveGap, deleteGap, extractGapTopic } from '../electron/gap-store'

describe('GapStore', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-gap-test-'))
    const notesDir = path.join(tmpDir, '.ai-notes')
    fs.mkdirSync(notesDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('1. logs a gap and lists it', () => {
    logGap(tmpDir, '什么是量子计算？')

    const gaps = listGaps(tmpDir)
    expect(gaps.length).toBe(1)
    expect(gaps[0].question).toBe('什么是量子计算？')
    expect(gaps[0].resolved).toBe(false)
    expect(gaps[0].id).toBeTruthy()
    expect(gaps[0].createdAt).toBeTruthy()
  })

  it('2. logs multiple gaps and returns all', () => {
    logGap(tmpDir, '问题一')
    logGap(tmpDir, '问题二')
    logGap(tmpDir, '问题三')

    expect(listGaps(tmpDir).length).toBe(3)
  })

  it('3. resolves a gap', () => {
    const gap = logGap(tmpDir, '测试问题')
    expect(listGaps(tmpDir)[0].resolved).toBe(false)

    resolveGap(tmpDir, gap.id)
    expect(listGaps(tmpDir)[0].resolved).toBe(true)
  })

  it('4. deletes a gap', () => {
    logGap(tmpDir, '问题一')
    const gap2 = logGap(tmpDir, '问题二')
    logGap(tmpDir, '问题三')

    deleteGap(tmpDir, gap2.id)
    const gaps = listGaps(tmpDir)
    expect(gaps.length).toBe(2)
    expect(gaps.every(g => g.question !== '问题二')).toBe(true)
  })

  it('5. handles empty gap store gracefully', () => {
    expect(listGaps(tmpDir)).toEqual([])
  })

  it('6. deleteGap returns false for non-existent id', () => {
    expect(deleteGap(tmpDir, 'nonexistent')).toBe(false)
  })

  it('7. resolveGap returns false for non-existent id', () => {
    expect(resolveGap(tmpDir, 'nonexistent')).toBe(false)
  })

  it('8. extractGapTopic returns first meaningful words', () => {
    expect(extractGapTopic('什么是深度学习中最重要的概念？')).toBeTruthy()
    expect(extractGapTopic('？？？').length).toBeGreaterThan(0) // fallback
  })

  it('9. gaps persist across reads (same file)', () => {
    logGap(tmpDir, '持久化测试')
    // Read twice — should get same result
    expect(listGaps(tmpDir).length).toBe(1)
    expect(listGaps(tmpDir).length).toBe(1)
  })

  it('10. idempotent: logging same question twice creates two entries', () => {
    logGap(tmpDir, '相同问题')
    logGap(tmpDir, '相同问题')
    expect(listGaps(tmpDir).length).toBe(2)
  })
})
