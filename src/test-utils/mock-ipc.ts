import { vi } from 'vitest'

export type MockIPCOverrides = Partial<Record<
  | 'kbPath' | 'wikiPages' | 'wikiContent' | 'backlinks' | 'extractedLinks'
  | 'searchResults' | 'settings' | 'graphData' | 'conversations' | 'gaps'
  | 'llmLogs' | 'qaAnalytics' | 'qaAnalyticsStats' | 'systemInfo',
  any
>>

export function createMockIPC(overrides: MockIPCOverrides = {}) {
  const o = overrides

  return {
    initKB: vi.fn().mockResolvedValue({ success: true }),
    getKBPath: vi.fn().mockResolvedValue(o.kbPath ?? '/fake/kb'),
    setKBPath: vi.fn().mockResolvedValue({ success: true }),
    selectKBPath: vi.fn().mockResolvedValue('/fake/kb/new'),

    listWikiPages: vi.fn().mockResolvedValue(o.wikiPages ?? [
      { name: '测试页面', path: '/fake/kb/wiki/测试页面.md', modifiedAt: '2026-05-01' },
    ]),
    readWikiPage: vi.fn().mockResolvedValue(o.wikiContent ?? '# 测试\n\n内容。'),
    writeWikiPage: vi.fn().mockResolvedValue({ success: true }),
    deleteWikiPage: vi.fn().mockResolvedValue({ success: true }),
    getBacklinks: vi.fn().mockResolvedValue(o.backlinks ?? []),
    extractLinks: vi.fn().mockResolvedValue(o.extractedLinks ?? []),

    listRawFiles: vi.fn().mockResolvedValue([]),
    copyToRaw: vi.fn().mockResolvedValue({ success: true }),
    readRawFile: vi.fn().mockResolvedValue('raw content'),

    listSchema: vi.fn().mockResolvedValue([]),
    writeSchema: vi.fn().mockResolvedValue({ success: true }),
    checkSchemaUpdate: vi.fn().mockResolvedValue({ updateAvailable: false, currentVersion: 1, latestVersion: 1 }),
    updateSchema: vi.fn().mockResolvedValue({ success: true, updated: [] }),

    getSettings: vi.fn().mockResolvedValue(o.settings ?? {}),
    saveSettings: vi.fn().mockResolvedValue({ success: true }),

    testLLM: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
    compile: vi.fn().mockResolvedValue('compiled output'),
    compileV2: vi.fn().mockResolvedValue({ compileOutput: 'output', plan: { updates: [], new_pages: [], conflicts: [] }, candidatePages: [] }),

    checkCompileStatus: vi.fn().mockResolvedValue({ compiled: false }),
    logCompile: vi.fn().mockResolvedValue({ success: true }),
    validateCompile: vi.fn().mockResolvedValue({ pageName: 'test', passed: 10, failed: 0, warnings: 0, issues: [], score: 100 }),
    validateCompileAll: vi.fn().mockResolvedValue({ reports: [], overallScore: 100 }),
    iterateCompile: vi.fn().mockResolvedValue({ rawFileName: 'test.md', iterations: 1, finalScore: 100, compileOutput: '', history: [] }),

    buildSearchIndex: vi.fn().mockResolvedValue({ success: true, count: 1 }),
    search: vi.fn().mockResolvedValue(o.searchResults ?? []),

    getGraphData: vi.fn().mockResolvedValue(o.graphData ?? { nodes: [], edges: [] }),

    loadSamples: vi.fn().mockResolvedValue({ success: true, count: 0 }),
    deleteSamples: vi.fn().mockResolvedValue({ success: true, deletedPages: [] }),
    trackSamplePage: vi.fn().mockResolvedValue({ success: true }),
    checkSamples: vi.fn().mockResolvedValue({ loaded: false }),

    exportHTML: vi.fn().mockResolvedValue({ success: true }),
    exportMarkdown: vi.fn().mockResolvedValue({ success: true }),
    backup: vi.fn().mockResolvedValue({ success: true }),

    rebuildIndex: vi.fn().mockResolvedValue({ pagesIndexed: 0, chunksIndexed: 0, sourcesIndexed: 0, errors: [] }),
    getIndexStatus: vi.fn().mockResolvedValue({ pages: 0, sources: 0, lastRebuild: '' }),

    qaV2: vi.fn().mockResolvedValue({ answer: '回答', sources: [] }),
    askStream: vi.fn().mockResolvedValue(undefined),
    onToken: vi.fn().mockReturnValue(() => {}),
    onTokenEnd: vi.fn().mockReturnValue(() => {}),

    sendFeedback: vi.fn().mockResolvedValue({ success: true }),

    listConversations: vi.fn().mockResolvedValue(o.conversations ?? []),
    createConversation: vi.fn().mockResolvedValue({ id: 'conv-1' }),
    getConversation: vi.fn().mockResolvedValue({ id: 'conv-1', messages: [] }),
    deleteConversation: vi.fn().mockResolvedValue({ success: true }),

    listGaps: vi.fn().mockResolvedValue(o.gaps ?? []),
    deleteGap: vi.fn().mockResolvedValue({ success: true }),
    getGapStats: vi.fn().mockResolvedValue({ total: 0, resolved: 0 }),

    getAdvancedSettings: vi.fn().mockResolvedValue({}),
    saveAdvancedSettings: vi.fn().mockResolvedValue({ success: true }),

    listConflicts: vi.fn().mockResolvedValue([]),
    resolveConflict: vi.fn().mockResolvedValue({ success: true }),

    archiveQA: vi.fn().mockResolvedValue({ success: true }),

    getSystemInfo: vi.fn().mockResolvedValue(o.systemInfo ?? {}),
    getMainLagSamples: vi.fn().mockResolvedValue([]),

    getLLMLogs: vi.fn().mockResolvedValue(o.llmLogs ?? []),
    getLLMLogStats: vi.fn().mockResolvedValue({ totalCalls: 0, totalErrors: 0, avgDurationMs: 0, callsByRole: {} }),

    getQAAnalytics: vi.fn().mockResolvedValue(o.qaAnalytics ?? []),
    getQAAnalyticsStats: vi.fn().mockResolvedValue(o.qaAnalyticsStats ?? {}),

    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnValue(() => {}),
    onPreloadProgress: vi.fn().mockReturnValue(() => {}),
  }
}
