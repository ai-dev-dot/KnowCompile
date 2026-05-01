/**
 * Safe LLM API config loader for integration tests.
 *
 * Resolution order:
 *   1. KNOWCOMPILE_API_KEY env var (for CI / one-off runs)
 *   2. %APPDATA%/knowcompile/settings.json (app's configured provider)
 *
 * The settings file lives outside the repo so credentials never land in git.
 * .env files are also git-ignored (see .gitignore: .env, .env.*).
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

export interface LLMSettings {
  provider: string
  apiKey: string
  baseURL: string
  model: string
}

export function loadLLMSettings(): LLMSettings | null {
  // -- env var overrides --
  const envKey = process.env.KNOWCOMPILE_API_KEY
  if (envKey) {
    return {
      provider: process.env.KNOWCOMPILE_PROVIDER || 'openai',
      apiKey: envKey,
      baseURL: process.env.KNOWCOMPILE_BASE_URL || '',
      model: process.env.KNOWCOMPILE_MODEL || 'gpt-4o',
    }
  }

  // -- AppData settings file --
  const settingsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'knowcompile', 'settings.json')
  if (!fs.existsSync(settingsPath)) return null

  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const llm = raw.llm
    if (!llm || !llm.apiKey) return null
    return {
      provider: llm.provider || 'openai',
      apiKey: llm.apiKey,
      baseURL: llm.baseURL || '',
      model: llm.model || 'gpt-4o',
    }
  } catch {
    return null
  }
}

/** Throw a clear skip message when no API key is configured. */
export function requireLLMSettings(): LLMSettings {
  const settings = loadLLMSettings()
  if (!settings) {
    throw new Error(
      'No LLM API key configured. Set KNOWCOMPILE_API_KEY env var or ' +
      'configure the app first (settings are saved to %APPDATA%/knowcompile/settings.json).',
    )
  }
  return settings
}
