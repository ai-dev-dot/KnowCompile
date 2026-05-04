const { getSettings } = require('./dist-electron/settings-store')

const s = getSettings()
console.log('Provider:', s.llm?.provider)
console.log('Model:', s.llm?.model)
console.log('Base URL:', s.llm?.baseURL || '(default)')
console.log('API Key set:', !!s.llm?.apiKey)
console.log('API Key prefix:', s.llm?.apiKey?.slice(0, 12))

// Check if model name starts with "minimax"
console.log('\nModel contains minimax:', /minimax/i.test(s.llm?.model || ''))
