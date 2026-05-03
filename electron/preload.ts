import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_CHANNELS = new Set([
  // KB management
  'kb:init', 'kb:get-path', 'kb:set-path', 'kb:select', 'preload:embedding',
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
  // QA streaming + feedback (Phase 1)
  'qa:ask-stream', 'qa:token', 'qa:token-end', 'qa:feedback',
  // Compile
  'compile:check', 'compile:log', 'compile:validate', 'compile:validate-all', 'compile:iterate',
  // Conflicts
  'conflicts:list', 'conflicts:resolve',
  // Index & Diagnostics & Logs
  'index:rebuild', 'index:status', 'diagnostics:system-info', 'diagnostics:main-lag',
  'rebuild:progress',
  'llm-logs:list', 'llm-logs:stats',
  'qa-analytics:list', 'qa-analytics:stats',
  // Search & Graph
  'search:build', 'search:query', 'graph:data',
  // Export & Backup
  'export:html', 'export:markdown', 'export:backup',
  // Samples
  'samples:load', 'samples:track-page', 'samples:delete', 'samples:check',
  // QA archive
  'wiki:archive-qa',
  // Progress events (push channels used via on())
  'preload:progress', 'compile:progress',
  // Conversation management
  'conv:list', 'conv:create', 'conv:delete', 'conv:get',
  // Knowledge gaps
  'gaps:list', 'gaps:delete',
])

const api = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      throw new Error(`Blocked IPC channel: ${channel}`)
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      throw new Error(`Blocked IPC listener channel: ${channel}`)
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
