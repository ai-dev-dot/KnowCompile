/**
 * LLM utility function tests — token estimation, cost, error categorization.
 * No LLM credentials needed. Usage: npx vitest run tests/llm-utils.test.ts
 */
import { describe, it, expect } from 'vitest'
import { estimateLLMTokens, estimateLLMCost, categorizeLLMError } from '../electron/llm-service'

// ==========================================================================
// estimateLLMTokens
// ==========================================================================

describe('estimateLLMTokens', () => {
  it('1. Chinese chars: length/2 rounded up', () => {
    expect(estimateLLMTokens('人工智能')).toBe(2) // 4 chars / 2
    expect(estimateLLMTokens('知识库问答助手')).toBe(4) // 7 chars / 2 = 3.5 → 4
  })

  it('2. English chars: length/2 rounded up', () => {
    expect(estimateLLMTokens('hello world')).toBe(6) // 11 / 2 = 5.5 → 6
  })

  it('3. mixed Chinese + English', () => {
    expect(estimateLLMTokens('AI 人工智能')).toBe(4) // 7 chars ('AI' + space + 人 工 智 能)
    expect(estimateLLMTokens('AI人工智能')).toBe(3) // 6 chars
  })

  it('4. empty string → 0', () => {
    expect(estimateLLMTokens('')).toBe(0)
  })

  it('5. single char → 1 token', () => {
    expect(estimateLLMTokens('A')).toBe(1)
  })

  it('6. even length → exact division', () => {
    expect(estimateLLMTokens('ABCD')).toBe(2)
  })
})

// ==========================================================================
// estimateLLMCost
// ==========================================================================

describe('estimateLLMCost', () => {
  it('1. Sonnet 4: $3 input + $15 output per 1M', () => {
    const cost = estimateLLMCost('claude-sonnet-4-20250514', 1000, 500)
    // (1000/1M)*3 + (500/1M)*15 = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 5)
  })

  it('2. Opus 4: $15 input + $75 output per 1M', () => {
    const cost = estimateLLMCost('claude-opus-4-20250514', 1000, 500)
    // (1000/1M)*15 + (500/1M)*75 = 0.015 + 0.0375 = 0.0525
    expect(cost).toBeCloseTo(0.0525, 5)
  })

  it('3. GPT-4o: $2.5 input + $10 output per 1M', () => {
    const cost = estimateLLMCost('gpt-4o', 1000, 500)
    expect(cost).toBeCloseTo(0.0075, 5)
  })

  it('4. unknown model → default pricing ($1/$5)', () => {
    const cost = estimateLLMCost('unknown-model-xyz', 1_000_000, 1_000_000)
    expect(cost).toBe(6) // 1 + 5 = 6
  })

  it('5. zero tokens → zero cost', () => {
    expect(estimateLLMCost('claude-sonnet-4-20250514', 0, 0)).toBe(0)
  })

  it('6. large token counts scale correctly', () => {
    const cost = estimateLLMCost('claude-sonnet-4-20250514', 1_000_000, 1_000_000)
    expect(cost).toBe(18) // 3 + 15
  })
})

// ==========================================================================
// categorizeLLMError
// ==========================================================================

describe('categorizeLLMError', () => {
  it('1. timeout → timeout', () => {
    expect(categorizeLLMError(new Error('Request timed out'))).toBe('timeout')
    expect(categorizeLLMError(new Error('ETIMEDOUT'))).toBe('timeout')
  })

  it('2. rate limit → rate_limit', () => {
    expect(categorizeLLMError(new Error('Rate limit exceeded'))).toBe('rate_limit')
    expect(categorizeLLMError(new Error('429 Too Many Requests'))).toBe('rate_limit')
    expect(categorizeLLMError(new Error('rate-limited'))).toBe('rate_limit')
  })

  it('3. auth → auth', () => {
    expect(categorizeLLMError(new Error('401 Unauthorized'))).toBe('auth')
    expect(categorizeLLMError(new Error('Invalid API key'))).toBe('auth')
    expect(categorizeLLMError(new Error('Authentication failed'))).toBe('auth')
  })

  it('4. network → network', () => {
    expect(categorizeLLMError(new Error('Network error'))).toBe('network')
    expect(categorizeLLMError(new Error('fetch failed'))).toBe('network')
    expect(categorizeLLMError(new Error('ECONNREFUSED'))).toBe('network')
  })

  it('5. unknown error → other', () => {
    expect(categorizeLLMError(new Error('Something went wrong'))).toBe('other')
    expect(categorizeLLMError(new Error('Internal server error'))).toBe('other')
  })

  it('6. no error → undefined', () => {
    expect(categorizeLLMError(undefined)).toBeUndefined()
  })

  it('7. AbortError → undefined (not a real error)', () => {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    expect(categorizeLLMError(err)).toBeUndefined()
  })
})
