// Electron 主进程：负责创建窗口、读取配置、调用大模型、读写本地历史。
// 关键点：API Key 只在这个进程里使用，绝不放进前端代码。

import { app, BrowserWindow, ipcMain, Menu, screen, session, Tray } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { character, buildSystemPrompt, buildFewShotMessages } from '../src/shared/character.js'
import { buildExtractPrompt } from '../src/shared/memoryPrompt.js'
import { applyOps, guessCategory, reviewFact } from '../src/shared/memory.js'
import { stripStageDirections } from '../src/shared/ttsFilter.js'
import { buildImagePrompt, NEGATIVE_PROMPT, NSFW_NEGATIVE } from '../src/shared/imagePrompt.js'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !!process.env.VITE_DEV_SERVER_URL
// 数据全部放在项目目录内，不占系统盘
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getAppPath(), 'userdata'))
}
// 历史记录按人格分开：日常沿用 history.json，私密用 history-intimate.json
const historyFile = (personaKey) => {
  const key = personaKey || activePersona()
  return path.join(
    app.getPath('userData'),
    key === 'normal' ? 'history.json' : `history-${key}.json`
  )
}
// 记忆也按人格分开，防止私密对话提炼的记忆污染日常人格
const memoryFile = (personaKey) => {
  const key = personaKey || activePersona()
  return path.join(
    app.getPath('userData'),
    key === 'normal' ? 'memory.json' : `memory-${key}.json`
  )
}

// 读取 JSON 前剥离 BOM（有些编辑器/脚本会写入带 BOM 的 UTF-8，JSON.parse 会失败）
function readJson(file) {
  const raw = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '')
  return JSON.parse(raw)
}

// ---------- 长期记忆（M2）：读写 memory.json ----------
function loadMemory() {
  try {
    const data = readJson(memoryFile())
    // 老数据迁移：没有分类的记忆按文本补一个，保证身份信息也走「最新为准」规则
    const facts = (Array.isArray(data.facts) ? data.facts : []).map((f) => ({
      ...f,
      category: f.category || guessCategory(f.text || '')
    }))
    return {
      facts,
      processedUserCount: Number(data.processedUserCount) || 0
    }
  } catch {
    return { facts: [], processedUserCount: 0 }
  }
}

function saveMemory(memory) {
  // 先备份再覆盖：即使下次整理误删，也能从 .bak 恢复
  try {
    const current = memoryFile()
    if (fs.existsSync(current)) {
      fs.copyFileSync(current, `${current}.bak`)
    }
  } catch {
    // 备份失败不阻塞保存
  }
  fs.writeFileSync(memoryFile(), JSON.stringify(memory, null, 2), 'utf-8')
}

function saveMemoryAndNotify(memory) {
  saveMemory(memory)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('memory:updated', memory.facts)
  }
}

// 启动审查：清理存量里明显不合理/自相矛盾的记忆（有 .bak 备份兜底）
function auditMemory() {
  const memory = loadMemory()
  const before = memory.facts.length
  memory.facts = memory.facts.filter((f) => {
    const others = memory.facts.filter((x) => x.id !== f.id)
    return reviewFact(f, others).length === 0
  })
  if (memory.facts.length !== before) {
    console.log('[memory] 启动审查清理了', before - memory.facts.length, '条不合理记忆')
    saveMemoryAndNotify(memory)
  }
}

function buildMemoryPrompt(memory) {
  if (!memory.facts.length) return ''
  const lines = memory.facts.map((f) => `- ${f.text}`).join('\n')
  return (
    '关于旅行者，你记得这些事（在合适的时候自然用上；当旅行者问你是否记得某件事时，直接根据记忆自信作答，不要否认、不要说「不记得」；只有记忆里确实没有时才如实说明）：\n' +
    lines
  )
}

// ---------- 读取 .env（不引入额外依赖，手写一个极简解析器） ----------
function loadEnvFile() {
  const envPath = path.join(app.getAppPath(), '.env')
  if (!fs.existsSync(envPath)) return

  const content = fs.readFileSync(envPath, 'utf-8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    // 已存在的环境变量优先，不覆盖
    if (!(key in process.env)) process.env[key] = value
  }
}

// 必须在读取任何配置常量之前加载 .env，否则会拿到默认值（比如 401 打去 DeepSeek）
loadEnvFile()

// ---------- 人格配置（人格 ⇄ 模型厂商 ⇄ 人设提示词） ----------
const PERSONAS = {
  normal: {
    label: '日常',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    key: () => process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || ''
  },
  intimate: {
    label: '私密',
    baseUrl: 'http://localhost:11434/v1',
    model: 'huihui_ai/qwen2.5-abliterate:7b',
    key: () => ''
  }
}

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')
function loadSettings() {
  try {
    return readJson(settingsFile())
  } catch {
    return {}
  }
}
function saveSettings(settings) {
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf-8')
}
function activePersona() {
  const p = loadSettings().persona
  return PERSONAS[p] ? p : 'normal'
}
function getPersonaConfig(personaKey = activePersona()) {
  const p = PERSONAS[personaKey] || PERSONAS.normal
  return { baseUrl: p.baseUrl, model: p.model, key: p.key() }
}
function hasApiKey(cfg = getPersonaConfig()) {
  return !!(cfg.key || /localhost|127\.0\.0\.1/.test(cfg.baseUrl))
}

async function callOpenAICompatible(
  apiMessages,
  { temperature = 0.9, maxTokens = 800, timeoutMs = 60000 } = {},
  cfg
) {
  const { baseUrl, model, key } = cfg || getPersonaConfig()
  // 超时保护：模型请求卡住时自动中止，避免前端永远处于「等待中」无法输入
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (key) headers.Authorization = `Bearer ${key}`
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature,
        max_tokens: maxTokens,
        stream: false
      }),
      signal: controller.signal
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    return { role: 'assistant', content, mode: 'real' }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('请求超时，请稍后重试')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// M3 真·流式：模型边生成边把文字增量推给前端，体感不再「干等整段」
async function streamChatCompletions(
  apiMessages,
  onDelta,
  { temperature = 0.9, maxTokens = 800, timeoutMs = 180000 } = {},
  cfg
) {
  const { baseUrl, model, key } = cfg || getPersonaConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (key) headers.Authorization = `Bearer ${key}`
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            full += delta
            onDelta(delta)
          }
        } catch {
          // 个别无法解析的 SSE 行直接跳过，不打断对话
        }
      }
    }
    return full
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('请求超时，请稍后重试')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 本地演示模式（未配置 Key 时的兜底） ----------
const MOCK_REPLIES = [
  '嗯嗯，我在听。你继续说呀。',
  '下雨天收到你消息，心情好像都变好了。',
  '我正练一首新曲子，练到一半突然想到你。',
  '你说的这个我有点好奇，再多讲两句？',
  '哈哈，这让我想起昨天翻到的一部黑白老电影。'
]

function mockReply(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  const prefix = last ? `你刚才说「${String(last.content).slice(0, 24)}」——` : ''
  const pick = MOCK_REPLIES[messages.length % MOCK_REPLIES.length]
  return { role: 'assistant', content: `${prefix}${pick}`, mode: 'mock' }
}

// ---------- 长期记忆（M2）：提炼与合并 ----------
async function extractFacts(messages, currentFacts = []) {
  const data = await callOpenAICompatible(
    [
      { role: 'system', content: buildExtractPrompt(currentFacts) },
      ...messages.slice(-30)
    ],
    { temperature: 0.3, maxTokens: 600 },
    getPersonaConfig()
  )
  const cleaned = data.content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const parsed = JSON.parse(cleaned)
  return {
    add: Array.isArray(parsed.add)
      ? parsed.add
          .filter((it) =>
            typeof it === 'string'
              ? it.trim()
              : it && String(it.text || '').trim()
          )
          .map((it) =>
            typeof it === 'string'
              ? it.trim()
              : { ...it, text: String(it.text).trim() }
          )
      : [],
    remove: Array.isArray(parsed.remove)
      ? parsed.remove.map(String).map((s) => s.trim()).filter(Boolean)
      : []
  }
}

// 后台提炼记忆：不阻塞回复；失败静默，下次对话再试
let remembering = false
// 只把「上次整理之后」的新消息交给模型，避免旧历史里的矛盾信息反复触发误删
function unprocessedMessages(messages, processedUserCount) {
  let userSeen = 0
  const start = messages.findIndex((m) => {
    if (m.role === 'user') userSeen++
    return userSeen > processedUserCount
  })
  return start === -1 ? [] : messages.slice(start)
}

async function rememberAsync(messages, userCount) {
  // 防并发：上一条提取还没完成时，跳过本次（计数未更新，下一条消息会再触发）
  if (remembering) return
  remembering = true
  try {
    const memory = loadMemory()
    const newMessages = unprocessedMessages(messages, memory.processedUserCount)
    if (!newMessages.length) return
    const ops = await extractFacts(newMessages, memory.facts)
    const result = applyOps(memory.facts, ops)
    memory.facts = result.facts
    memory.processedUserCount = Math.max(memory.processedUserCount, userCount)
    saveMemoryAndNotify(memory)
    console.log('[memory] 整理完成 add/remove:', JSON.stringify(ops))
    if (result.rejected.length) {
      console.log('[memory] 审查拒绝:', JSON.stringify(result.rejected))
    }
  } catch (err) {
    // 整理失败不影响聊天
    console.error('[memory] 记忆整理失败（已跳过，不影响聊天）:', err?.message || err)
  } finally {
    remembering = false
  }
}

// ---------- IPC：前端通过这里和主进程通信 ----------
ipcMain.handle('chat:send', async (_event, { messages = [] } = {}) => {
  // 图片等富字段不发给模型（base64 太占 token）
  const plain = messages.map((m) => ({ role: m.role, content: m.content }))
  // 成本控制：只保留最近 40 条（约 20 轮），防止上下文无限膨胀
  const recent = plain.slice(-40)
  const memory = loadMemory()
  const personaKey = activePersona()
  const cfg = getPersonaConfig(personaKey)

  // 组装：人设卡 + few-shot 示例 + 最近历史
  const apiMessages = [
    { role: 'system', content: buildSystemPrompt(undefined, personaKey) },
    // few-shot：先给模型看几条绫华的对话范本，再进入真实对话
    ...buildFewShotMessages(personaKey),
    ...recent
  ]

  // 记忆提示贴近用户最新消息：对抗对话历史中此前的推脱，让模型直接采用记忆作答
  const memoryPrompt = buildMemoryPrompt(memory)
  if (memoryPrompt) {
    const lastUserIdx = apiMessages.map((m) => m.role).lastIndexOf('user')
    if (lastUserIdx >= 0) {
      apiMessages.splice(lastUserIdx, 0, { role: 'system', content: memoryPrompt })
    } else {
      apiMessages.push({ role: 'system', content: memoryPrompt })
    }
  }

  // 常识提示：用户说了明显不合理的话时，让绫华温柔纠正而不是无视
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (lastUser && lastUser.content) {
    const problems = reviewFact({ text: String(lastUser.content) }, memory.facts)
    if (problems.length) {
      const hint =
        `【提示】旅行者刚才的表述明显不合常理（${problems.join('；')}）。` +
        `请以${character.name}的口吻温柔地指出并和他确认，不要默默接受或忽略。`
      const lastUserIdx = apiMessages.map((m) => m.role).lastIndexOf('user')
      if (lastUserIdx >= 0) apiMessages.splice(lastUserIdx, 0, { role: 'system', content: hint })
    }
  }

  if (!hasApiKey(cfg)) return mockReply(recent)

  let reply
  try {
    // M3 流式输出：模型边生成边把文字推给前端，不用等整段完成
    const sender = _event.sender
    const full = await streamChatCompletions(apiMessages, (text) => {
      if (!sender.isDestroyed()) sender.send('chat:delta', { text })
    }, {}, cfg)
    reply = { role: 'assistant', content: full, mode: 'real' }
  } catch (err) {
    reply = {
      role: 'assistant',
      content: `（模型调用出错：${err.message}）`,
      mode: 'error'
    }
  }

  // M2：每条用户消息后都提炼一次记忆（用户要求，牺牲一点成本换及时性）
  const userCount = recent.filter((m) => m.role === 'user').length
  if (userCount - memory.processedUserCount >= 1) {
    rememberAsync(plain, userCount)
  }
  return reply
})

// ---------- 本地出图（Stable Diffusion WebUI Forge，127.0.0.1:7860） ----------
ipcMain.handle('image:generate', async (_event, { request = '', width = 512, height = 768, keys = [] } = {}) => {
  const sdUrl = (process.env.SD_URL || 'http://127.0.0.1:7860').replace(/\/+$/, '')
  // 私密人格出裸图，日常人格出正常图
  const nsfw = activePersona() === 'intimate'
  // 4GB 显存放不下聊天模型+出图模型：出图前先把 Ollama 模型卸掉，把显存让给 SD
  try {
    const ps = await fetch('http://localhost:11434/api/ps', {
      signal: AbortSignal.timeout(5000)
    })
      .then((r) => r.json())
      .catch(() => null)
    for (const m of ps?.models || []) {
      await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.name, keep_alive: 0 })
      }).catch(() => {})
    }
  } catch {}
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 300000)
  try {
    const res = await fetch(`${sdUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: buildImagePrompt(request, { nsfw, keys }),
        negative_prompt: nsfw ? `${NEGATIVE_PROMPT}, ${NSFW_NEGATIVE}` : NEGATIVE_PROMPT,
        width: Math.max(384, Math.min(768, Number(width) || 512)),
        height: Math.max(384, Math.min(1024, Number(height) || 768)),
        steps: 26,
        cfg_scale: 7,
        sampler_name: 'DPM++ 2M Karras',
        seed: -1
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`出图服务错误 HTTP ${res.status} ${text.slice(0, 120)}`)
    }
    const data = await res.json()
    const b64 = data.images?.[0]
    if (!b64) throw new Error('出图服务没有返回图片')
    return { imageBase64: b64, mime: 'image/png' }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('出图超时（服务正在加载模型，请稍后重试）')
    if (err.cause?.code === 'ECONNREFUSED' || /fetch failed|ECONNREFUSED/i.test(String(err.message))) {
      throw new Error('出图服务未启动（SD WebUI 未运行）')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
})

// M3 活人感：绫华主动发消息（不需要用户输入）
ipcMain.handle('chat:proactive', async () => {
  const memory = loadMemory()
  const personaKey = activePersona()
  const cfg = getPersonaConfig(personaKey)
  // 带上最近对话历史，让主动消息接着上文说，而不是凭空开场
  let recent = []
  try {
    const history = readJson(historyFile())
    recent = (Array.isArray(history) ? history : [])
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }))
  } catch {}
  const systemParts = [
    buildSystemPrompt(undefined, personaKey),
    '现在由你（绫华）主动给旅行者发一条消息：接着刚才的对话自然地延续下去，可以结合当前时间、天气氛围或你记得的事，一两句话即可，不要问一连串问题，不要太过刻意。'
  ]
  const memoryPrompt = buildMemoryPrompt(memory)
  if (memoryPrompt) systemParts.push(memoryPrompt)
  const apiMessages = [
    { role: 'system', content: systemParts.join('\n\n') },
    ...buildFewShotMessages(personaKey),
    ...recent,
    { role: 'user', content: '（现在轮到你主动开口了：接着上面聊的内容，直接发一条自然的消息，不要复述、不要问号轰炸）' }
  ]

  if (!hasApiKey(cfg)) {
    const PROACTIVE_MOCKS = [
      '忽然想到，今日的茶点还没尝过，旅行者要来一块吗？',
      '雨停了，庭院里的空气干净得很。你那边天气如何？',
      '刚练完一段剑舞，正好歇一歇。想听听今天遇见的趣事吗？'
    ]
    return {
      role: 'assistant',
      content: PROACTIVE_MOCKS[Math.floor(Math.random() * PROACTIVE_MOCKS.length)],
      mode: 'mock'
    }
  }

  try {
    return await callOpenAICompatible(apiMessages, { temperature: 1.0, maxTokens: 300 }, cfg)
  } catch (err) {
    return { role: 'assistant', content: `（主动消息发送失败：${err.message}）`, mode: 'error' }
  }
})

// M4 语音输入：调用 OpenAI 兼容的 /audio/transcriptions（Whisper 类接口）
ipcMain.handle('stt:transcribe', async (_event, audio) => {
  const key = process.env.STT_API_KEY
  if (!key) {
    return { error: '未配置 STT_API_KEY，语音输入暂不可用（详见 README 配置说明）' }
  }
  const base = (process.env.STT_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = process.env.STT_MODEL || 'whisper-1'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const form = new FormData()
    form.append('model', model)
    form.append('language', 'zh')
    form.append('file', new Blob([audio], { type: 'audio/webm' }), 'input.webm')
    const res = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    return { text: data.text || '' }
  } catch (err) {
    if (err.name === 'AbortError') return { error: '语音识别超时，请重试' }
    return { error: `语音识别失败：${err.message}` }
  } finally {
    clearTimeout(timer)
  }
})

// 本地音色克隆服务（GPT-SoVITS /tts 风格，OpenAI 无关）：GET 传参返回 WAV 音频
async function cloneTts(text, endpoint) {
  const url = new URL(endpoint)
  url.searchParams.set('text', text)
  url.searchParams.set('text_lang', 'zh')
  url.searchParams.set('prompt_lang', 'zh')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('返回空音频')
    return buf
  } finally {
    clearTimeout(timer)
  }
}

// M4 朗读回复：Edge TTS 神经语音（免费、无需 Key），合成 MP3 返回 base64
ipcMain.handle('tts:speak', async (_event, { text } = {}) => {
  if (!text) return { error: '没有可朗读的内容' }
  // 防御性过滤：把（动作描写）这类内容剔除，避免读出戏
  const content = stripStageDirections(text).slice(0, 300)

  // 优先：本地音色克隆服务（GPT-SoVITS 等），不可用时自动回退 Edge TTS
  const cloneUrl = process.env.CLONE_TTS_URL
  if (cloneUrl) {
    try {
      const buf = await cloneTts(content, cloneUrl)
      return { audioBase64: buf.toString('base64'), mime: 'audio/wav', cloned: true }
    } catch (err) {
      console.error('[tts] 克隆服务不可用，回退 Edge TTS:', err.message)
    }
  }

  try {
    const tts = new MsEdgeTTS()
    const voice = process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural'
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioFilePath } = await tts.toFile(os.tmpdir(), content, { rate: '+10%' })
    const buf = fs.readFileSync(audioFilePath)
    try {
      fs.unlinkSync(audioFilePath)
    } catch {}
    return { audioBase64: buf.toString('base64'), mime: 'audio/mpeg' }
  } catch (err) {
    return { error: `朗读失败：${err.message}` }
  }
})

ipcMain.handle('history:load', async () => {
  try {
    const messages = readJson(historyFile())
    // M2 自愈：启动时检查有没有漏提炼的消息（比如上次应用在提取完成前被关闭），补一次
    const memory = loadMemory()
    const userCount = messages.filter((m) => m.role === 'user').length
    if (userCount - memory.processedUserCount >= 1) {
      rememberAsync(messages, userCount)
    }
    return messages
  } catch {
    return []
  }
})

ipcMain.handle('history:save', async (_event, messages) => {
  // 先备份再覆盖：防止误清空/程序异常时丢聊天记录
  try {
    const current = historyFile()
    if (fs.existsSync(current)) {
      fs.copyFileSync(current, `${current}.bak`)
    }
  } catch {}
  fs.writeFileSync(historyFile(), JSON.stringify(messages, null, 2), 'utf-8')
  // 清空对话时同步重置记忆提取计数，否则下轮新对话不会再触发提炼
  if (Array.isArray(messages) && messages.length === 0) {
    const memory = loadMemory()
    memory.processedUserCount = 0
    saveMemory(memory)
  }
  return true
})

ipcMain.handle('app:status', async () => {
  const cfg = getPersonaConfig()
  return {
    mode: hasApiKey(cfg) ? 'real' : 'mock',
    model: cfg.model,
    persona: activePersona()
  }
})

// 人格切换：读取当前 / 切换并持久化
ipcMain.handle('persona:get', async () => ({
  current: activePersona(),
  personas: Object.entries(PERSONAS).map(([key, p]) => ({
    key,
    label: p.label,
    model: p.model
  }))
}))

ipcMain.handle('persona:set', async (_event, key) => {
  if (!PERSONAS[key]) return { error: '未知人格' }
  const settings = loadSettings()
  settings.persona = key
  saveSettings(settings)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('persona:changed', key)
  }
  return { ok: true }
})

ipcMain.handle('memory:list', async () => loadMemory().facts)

// 记忆管理：删除单条
ipcMain.handle('memory:delete', async (_event, id) => {
  const memory = loadMemory()
  memory.facts = memory.facts.filter((f) => f.id !== id)
  saveMemoryAndNotify(memory)
  return true
})

// 记忆管理：修改单条（文本/分类）
ipcMain.handle('memory:update', async (_event, id, patch = {}) => {
  const memory = loadMemory()
  const fact = memory.facts.find((f) => f.id === id)
  if (!fact) return { error: '找不到这条记忆' }
  const nextText = typeof patch.text === 'string' && patch.text.trim() ? patch.text.trim() : fact.text
  const nextCategory = patch.category || fact.category
  // 审查机制：手动编辑同样拦截不合理内容
  const problems = reviewFact(
    { text: nextText, category: nextCategory },
    memory.facts.filter((f) => f.id !== id)
  )
  if (problems.length) return { error: problems.join('；') }
  fact.text = nextText
  if (patch.category) fact.category = patch.category
  fact.updatedAt = Date.now()
  saveMemoryAndNotify(memory)
  return true
})

// ---------- 窗口（M6 桌面感） ----------
let mainWindow = null
let floatingWindow = null
let tray = null
let isQuitting = false

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: '神里绫华 · 白鹭公主',
    backgroundColor: '#141218',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 关闭主窗口时最小化到托盘，而不是退出
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  // 冒烟测试模式：窗口加载完成即退出，用于自动化验证
  if (process.env.SMOKE_TEST) {
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('[smoke] 渲染进程加载成功')
      fs.writeFileSync(path.join(app.getPath('temp'), 'ayaka-smoke-ok.txt'), String(Date.now()), 'utf-8')
      setTimeout(() => {
        isQuitting = true
        app.quit()
      }, 1500)
    })
  }
}

function showMainWindow() {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

function createFloatingWindow() {
  const { workArea } = screen.getPrimaryDisplay()
  floatingWindow = new BrowserWindow({
    width: 84,
    height: 84,
    x: workArea.x + workArea.width - 104,
    y: workArea.y + workArea.height - 104,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  floatingWindow.setAlwaysOnTop(true, 'floating')
  if (isDev) {
    floatingWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/floating.html`)
  } else {
    floatingWindow.loadFile(path.join(__dirname, '../dist/floating.html'))
  }
}

function setLoginItem(openAtLogin) {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin })
  } else {
    app.setLoginItemSettings({ openAtLogin, path: process.execPath, args: [app.getAppPath()] })
  }
  updateTrayMenu()
}

function updateTrayMenu() {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWindow },
      { label: '隐藏主窗口', click: () => mainWindow?.hide() },
      { type: 'separator' },
      {
        label: '桌面悬浮球',
        type: 'checkbox',
        checked: !!floatingWindow && floatingWindow.isVisible(),
        click: (item) => {
          if (!floatingWindow) return
          if (item.checked) floatingWindow.show()
          else floatingWindow.hide()
        }
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => setLoginItem(item.checked)
      },
      { type: 'separator' },
      {
        label: '退出并关闭后台服务',
        click: () => {
          isQuitting = true
          // 按端口关闭音色克隆(9880)与 SD 出图(7860)，Ollama 是独立常驻工具，不动它
          killServiceOnPort(9880)
          killServiceOnPort(7860)
          app.quit()
        }
      },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
}

// 找出监听指定端口的进程并结束（含子进程树），找不到就静默跳过
function killServiceOnPort(port) {
  try {
    const out = execSync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { encoding: 'utf8', windowsHide: true }
    )
    const pids = new Set()
    for (const line of out.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (/^\d+$/.test(pid)) pids.add(pid)
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true })
      } catch {}
    }
  } catch {}
}

function createTray() {
  tray = new Tray(path.join(__dirname, '../assets/tray.png'))
  tray.setToolTip('神里绫华 · 在你身边')
  updateTrayMenu()
  tray.on('click', showMainWindow)
}

ipcMain.handle('window:show-main', () => showMainWindow())
let floatingDragStartPos = null
ipcMain.handle('floating:drag-start', () => {
  floatingDragStartPos = floatingWindow ? floatingWindow.getPosition() : null
})
ipcMain.handle('floating:drag-end', () => {
  floatingDragStartPos = null
})
ipcMain.handle('floating:move', (_event, dx, dy) => {
  // 绝对定位：起点 + 位移，而不是「当前位置 + 位移」反复叠加（否则会越拖越快飞出去）
  if (!floatingWindow || !floatingDragStartPos) return
  floatingWindow.setPosition(
    Math.round(floatingDragStartPos[0] + dx),
    Math.round(floatingDragStartPos[1] + dy)
  )
})

// 单实例：重复启动时唤起已有窗口
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
  app.whenReady().then(() => {
    loadEnvFile()
    auditMemory()
    // 允许渲染进程使用麦克风（语音输入）
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media')
    })
    createWindow()
    createFloatingWindow()
    createTray()
    // 预热音色克隆管线：让用户第一次点「朗读」不用等模型初始化
    if (process.env.CLONE_TTS_URL) {
      cloneTts('你好', process.env.CLONE_TTS_URL).catch(() => {})
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 系统关机/注销等场景要真正退出，不能拦在托盘里
app.on('before-quit', () => {
  isQuitting = true
})
