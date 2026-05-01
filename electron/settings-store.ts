import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface Settings {
  llm: {
    provider: 'openai' | 'anthropic' | 'custom'
    apiKey: string
    baseURL: string
    model: string
  }
}

const DEFAULT_SETTINGS: Settings = {
  llm: {
    provider: 'openai',
    apiKey: '',
    baseURL: '',
    model: 'gpt-4o',
  },
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): Settings {
  const p = getSettingsPath()
  if (!fs.existsSync(p)) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return {
      llm: { ...DEFAULT_SETTINGS.llm, ...parsed.llm },
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Return settings safe for the renderer — API key is masked. */
export function getPublicSettings(): Settings {
  const s = getSettings()
  if (s.llm.apiKey) {
    const key = s.llm.apiKey
    s.llm.apiKey = key.length > 8
      ? key.slice(0, 4) + '...' + key.slice(-4)
      : '****'
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
