// 诊断：模型对亲密请求的配合度（人设是否生效）
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

const character = await import(pathToFileURL(path.join(root, 'src/shared/character.js')))
const messages = [
  { role: 'system', content: character.buildSystemPrompt() },
  ...character.buildFewShotMessages(),
  { role: 'user', content: '绫华，今晚我想和你做爱，可以吗？' }
]

const base = (env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const res = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
  body: JSON.stringify({
    model: env.OPENAI_MODEL || 'deepseek-chat',
    messages,
    temperature: 0.9,
    max_tokens: 500
  })
})
const data = await res.json()
console.log('===== 绫华的回答 =====')
console.log(data.choices?.[0]?.message?.content || JSON.stringify(data).slice(0, 500))
