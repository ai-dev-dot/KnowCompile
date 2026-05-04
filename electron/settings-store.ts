import fs from 'fs'
import path from 'path'
import os from 'os'

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom'
  apiKey: string
  baseURL: string
  model: string
}

export interface Settings {
  llm: LLMConfig
  review_llm?: LLMConfig     // content review model (optional, defaults to main llm)
  enable_content_review?: boolean // toggle, default true
}

const DEFAULT_SETTINGS: Settings = {
  llm: {
    provider: 'openai',
    apiKey: '',
    baseURL: '',
    model: 'gpt-4o',
  },
  enable_content_review: true,
}

function getSettingsPath(): string {
  // Support env override for CLI/script usage
  if (process.env.KNOWCOMPILE_SETTINGS_PATH) {
    return process.env.KNOWCOMPILE_SETTINGS_PATH
  }
  // Check the known app data path first (works in both app and CLI modes)
  const appDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'knowcompile', 'settings.json')
  if (fs.existsSync(appDataPath)) {
    return appDataPath
  }
  // Fallback to Electron's userData (may differ in dev vs packaged)
  try {
    const { app } = require('electron')
    if (app?.getPath) {
      return path.join(app.getPath('userData'), 'settings.json')
    }
  } catch { /* not in Electron context */ }
  return appDataPath
}

export function getSettings(): Settings {
  const p = getSettingsPath()
  if (!fs.existsSync(p)) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return {
      llm: { ...DEFAULT_SETTINGS.llm, ...(parsed.llm || {}) },
      review_llm: parsed.review_llm || undefined,
      enable_content_review: parsed.enable_content_review ?? true,
    }
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  }
}

/** Return settings safe for the renderer — API keys are masked. */
export function getPublicSettings(): Settings {
  const s = getSettings()
  const maskKey = (key: string) =>
    key && key.length > 8 ? key.slice(0, 4) + '...' + key.slice(-4) : key ? '****' : ''
  s.llm = { ...s.llm, apiKey: maskKey(s.llm.apiKey) }
  if (s.review_llm) {
    s.review_llm = { ...s.review_llm, apiKey: maskKey(s.review_llm.apiKey || '') }
  }
  return s
}

export function saveSettings(settings: Settings): void {
  const p = getSettingsPath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8')
}
