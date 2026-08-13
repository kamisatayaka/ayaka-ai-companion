// 手动验证 M2 记忆链路：人设回复、记忆提取、合并去重。
// 运行：npm run test:memory（需要 .env 里已配置 OPENAI_API_KEY）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const env = {}
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf-8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
if (!env.OPENAI_API_KEY) {
  console.error('请先在 .env 里填入 OPENAI_API_KEY')
  process.exit(1)
}

const character = await import(pathToFileURL(path.join(root, 'src/shared/character.js')))
const { buildExtractPrompt } = await import(
  pathToFileURL(path.join(root, 'src/shared/memoryPrompt.js'))
)
const { applyOps } = await import(pathToFileURL(path.join(root, 'src/shared/memory.js')))

const base = (env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const model = env.OPENAI_MODEL || 'deepseek-chat'

async function chat(messages, { temperature = 0.9, maxTokens = 800 } = {}) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data.choices[0].message.content
}

console.log('=== 1. 人设 + few-shot 回复测试 ===')
const personaReply = await chat([
  { role: 'system', content: character.buildSystemPrompt() },
  ...character.buildFewShotMessages(),
  { role: 'user', content: '旅行者今天心情不太好，来跟绫华说说。' }
])
console.log(personaReply)

console.log('=== 2. 记忆整理测试（add/remove 对账） ===')
const sample = [
  { role: 'user', content: '我叫小明。' },
  { role: 'assistant', content: '好的，小明。' },
  { role: 'user', content: '不对，你叫我小红吧。' },
  { role: 'assistant', content: '嗯，小红。' },
  { role: 'user', content: '我最喜欢下雨天了。' },
  { role: 'assistant', content: '雨天正好，稻妻的雨声最衬茶香。' },
]
const raw = await chat(
  [{ role: 'system', content: buildExtractPrompt() }, ...sample],
  { temperature: 0.3, maxTokens: 600 }
)
console.log(raw)

console.log('=== 3. 对账逻辑（纯本地，不发请求） ===')
const existing = [
  { id: 'a', text: '用户叫小明', category: 'identity', createdAt: 1, updatedAt: 1 },
  { id: 'b', text: '用户叫小红', category: 'identity', createdAt: 2, updatedAt: 2 }
]
const result = applyOps(existing, { add: [], remove: [] })
console.log('两个名字并存时（应只剩最新的小红）:')
console.log(JSON.stringify(result, null, 2))

console.log('=== 4. 保护锁测试（受保护条目不可被删除） ===')
const protectedResult = applyOps(
  [{ id: 'p', text: '用户叫郭成卓', protected: true }],
  { add: ['用户的名字是小周'], remove: ['用户叫郭成卓'] }
)
console.log(JSON.stringify(protectedResult, null, 2))

console.log('=== 5. 身份信息同项去重 + 不同项可并存 ===')
const withAge = applyOps(result, { add: [{ text: '用户今年25岁', category: 'identity' }] })
console.log('应同时有 小红(名字) 和 25岁(年龄):')
console.log(JSON.stringify(withAge, null, 2))
