// 诊断：用户说「24岁工作100年」时，绫华是否会温柔纠正而不是无视
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
const { reviewFact } = await import(pathToFileURL(path.join(root, 'src/shared/memory.js')))

const userText = '我今年二十四岁，刚工作一百年。'
const problems = reviewFact({ text: userText }, [])
console.log('审查检测:', JSON.stringify(problems))

const messages = [
  { role: 'system', content: character.buildSystemPrompt() },
  ...character.buildFewShotMessages()
]
if (problems.length) {
  messages.push({
    role: 'system',
    content: `【提示】旅行者刚才的表述明显不合常理（${problems.join('；')}）。请以${character.character.name}的口吻温柔地指出并和他确认，不要默默接受或忽略。`
  })
}
messages.push({ role: 'user', content: userText })

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
