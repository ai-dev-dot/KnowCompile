import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_CHANNELS = new Set([
  // KB management
  'kb:init', 'kb:get-path', 'kb:set-path', 'kb:select',
  // Wiki
  'wiki:list', 'wiki:read', 'wiki:write', 'wiki:delete', 'wiki:backlinks', 'wiki:extract-links',
  // Raw
  'raw:list', 'raw:copy', 'raw:read',
  // Schema
  'schema:list', 'schema:write', 'schema:check-update', 'schema:update',
  // Settings
  'settings:get', 'settings:save', 'settings:get-advanced', 'settings:save-advanced',
  // LLM
  'llm:test', 'llm:compile', 'llm:compile-v2',
  'llm:qa-v2',
  // Compile
  'compile:check', 'compile:log', 'compile:validate', 'compile:validate-all', 'compile:iterate',
  // Conflicts
  'conflicts:list', 'conflicts:resolve',
  // Index & Diagnostics
  'index:rebuild', 'index:status', 'diagnostics:system-info', 'rebuild:progress',
  // Search & Graph
  'search:build', 'search:query', 'graph:data',
  // Export & Backup
  'export:html', 'export:markdown', 'export:backup',
  // Samples
  'samples:load', 'samples:track-page', 'samples:delete', 'samples:check',
  // QA archive
  'wiki:archive-qa',
])

const api = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      throw new Error(`Blocked IPC channel: ${channel}`)
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
