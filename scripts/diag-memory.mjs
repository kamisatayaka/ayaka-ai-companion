// 诊断：复刻 chat:send 的真实提示词，直接问模型能否读到记忆
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
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
const memoryPath = path.join(os.homedir(), 'AppData', 'Roaming', '神里绫华 AI 陪伴', 'memory.json')
const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf-8'))

const lines = memory.facts.map((f) => `- ${f.text}`).join('\n')
const memoryPrompt =
  '关于旅行者，你记得这些事（在合适的时候自然用上；当旅行者问你是否记得某件事时，直接根据记忆自信作答，不要否认、不要说「不记得」；只有记忆里确实没有时才如实说明）：\n' +
  lines

const system = character.buildSystemPrompt() + '\n\n' + memoryPrompt
const historyPath = path.join(os.homedir(), 'AppData', 'Roaming', '神里绫华 AI 陪伴', 'history.json')
const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
const recent = history.slice(-40)
const question = '我工作了几年我给忘了，你能告诉我吗'
const messages = [
  { role: 'system', content: character.buildSystemPrompt() },
  ...character.buildFewShotMessages(),
  ...recent,
]
// 记忆提示插在用户最新消息前面（离问题最近，对抗历史中的推脱）
messages.splice(messages.length - 1, 0, {
  role: 'system',
  content: memoryPrompt
})
messages.push({ role: 'user', content: question })

console.log('===== 注入的记忆 =====')
console.log(lines)
console.log('===== 对话历史（最后 6 条） =====')
console.log(recent.slice(-6).map((m) => `${m.role}: ${String(m.content).slice(0, 60)}`).join('\n'))
console.log('===== 请求 =====')
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
console.log('===== 模型的回答 =====')
console.log(data.choices?.[0]?.message?.content || JSON.stringify(data).slice(0, 500))
