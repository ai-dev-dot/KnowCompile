/**
 * LLMLogger tests — structured JSONL logging for LLM interactions
 * Usage: npx vitest run tests/llm-logger.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { logLLMInteraction, readLLMLogs, getLLMLogStats, LLMLogEntry } from '../electron/llm-logger'

function makeEntry(overrides?: Partial<LLMLogEntry>): LLMLogEntry {
  return {
    timestamp: new Date().toISOString(),
    model: 'test-model',
    provider: 'openai',
    role: 'compile',
    promptSummary: 'test prompt',
    responseSummary: 'test response',
    promptLen: 100,
    responseLen: 200,
    durationMs: 500,
    success: true,
    ...overrides,
  }
}

describe('LLMLogger', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowcompile-log-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a log entry to the daily JSONL file', () => {
    logLLMInteraction(tmpDir, makeEntry())

    const logDir = path.join(tmpDir, '.ai-notes', 'llm-logs')
    const files = fs.readdirSync(logDir)
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/)

    const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines.length).toBe(1)
    const parsed = JSON.parse(lines[0])
    expect(parsed.role).toBe('compile')
    expect(parsed.success).toBe(true)
  })

  it('appends to existing daily file', () => {
    logLLMInteraction(tmpDir, makeEntry())
    logLLMInteraction(tmpDir, makeEntry({ role: 'review' }))

    const logs = readLLMLogs(tmpDir)
    expect(logs.length).toBe(2)
    expect(logs[0].role).toBe('review') // newest first
    expect(logs[1].role).toBe('compile')
  })

  it('filters by role', () => {
    logLLMInteraction(tmpDir, makeEntry({ role: 'compile' }))
    logLLMInteraction(tmpDir, makeEntry({ role: 'review' }))
    logLLMInteraction(tmpDir, makeEntry({ role: 'qa' }))

    const compileLogs = readLLMLogs(tmpDir, { role: 'compile' })
    expect(compileLogs.length).toBe(1)

    const reviewLogs = readLLMLogs(tmpDir, { role: 'review' })
    expect(reviewLogs.length).toBe(1)
  })

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      logLLMInteraction(tmpDir, makeEntry())
    }
    expect(readLLMLogs(tmpDir).length).toBe(10)
    expect(readLLMLogs(tmpDir, { limit: 3 }).length).toBe(3)
  })

  it('computes stats correctly', () => {
    logLLMInteraction(tmpDir, makeEntry({ role: 'compile', durationMs: 100, success: true }))
    logLLMInteraction(tmpDir, makeEntry({ role: 'compile', durationMs: 300, success: false }))
    logLLMInteraction(tmpDir, makeEntry({ role: 'review', durationMs: 200, success: true }))

    const stats = getLLMLogStats(tmpDir)
    expect(stats.totalCalls).toBe(3)
    expect(stats.totalErrors).toBe(1)
    expect(stats.avgDurationMs).toBe(200)
    expect(stats.callsByRole.compile).toBe(2)
    expect(stats.callsByRole.review).toBe(1)
  })

  it('handles missing log directory gracefully', () => {
    const logs = readLLMLogs(tmpDir)
    expect(logs).toEqual([])

    const stats = getLLMLogStats(tmpDir)
    expect(stats.totalCalls).toBe(0)
  })

  it('does not throw on write failure (safety net)', () => {
    // Write to an invalid path should not throw
    expect(() => logLLMInteraction('/nonexistent/path/that/cannot/be/created', makeEntry())).not.toThrow()
  })
})
