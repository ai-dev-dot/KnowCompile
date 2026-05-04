const { getSettings } = require('./dist-electron/settings-store')
const { chat } = require('./dist-electron/llm-service')

async function main() {
  const s = getSettings()
  console.log('Provider:', s.llm.provider, '| Model:', s.llm.model, '| BaseURL:', s.llm.baseURL || 'default')

  console.log('Sending hello...')
  try {
    const result = await chat([{ role: 'user', content: 'Reply with just "hello"' }])
    console.log('SUCCESS:', result.slice(0, 200))
  } catch (err) {
    console.error('FAILED:', err.message)
    process.exit(1)
  }
}
main()
