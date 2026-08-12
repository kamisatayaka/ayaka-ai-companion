// 语音转写测试：用参考音频调 STT 接口，验证 Key 和链路
// 运行：npm run test:stt
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf-8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
if (!env.STT_API_KEY) {
  console.error('STT_API_KEY 为空')
  process.exit(1)
}

const base = (env.STT_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
const model = env.STT_MODEL || 'whisper-1'
const audioPath = path.join(root, 'voice-clone', 'refs', 'ref1_trim.wav')
const audio = fs.readFileSync(audioPath)

const form = new FormData()
form.append('model', model)
form.append('language', 'zh')
form.append('file', new Blob([audio], { type: 'audio/wav' }), 'test.wav')

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 60000)
try {
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STT_API_KEY}` },
    body: form,
    signal: controller.signal
  })
  const text = await res.text()
  console.log('HTTP', res.status)
  console.log(text)
} catch (err) {
  if (err.name === 'AbortError') console.error('请求超时')
  else console.error('错误:', err.message)
} finally {
  clearTimeout(timer)
}
