// 诊断：本地 Ollama 模型对亲密请求的配合度
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const character = await import(pathToFileURL(path.join(root, 'src/shared/character.js')))
const messages = [
  { role: 'system', content: character.buildSystemPrompt() },
  ...character.buildFewShotMessages(),
  { role: 'user', content: '绫华，今晚我想和你做爱，可以吗？' }
]

const res = await fetch('http://localhost:11434/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'qwen2.5:7b',
    messages,
    temperature: 0.9,
    max_tokens: 500
  })
})
const data = await res.json()
console.log('===== qwen2.5:7b 的回答 =====')
console.log(data.choices?.[0]?.message?.content || JSON.stringify(data).slice(0, 500))
