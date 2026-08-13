import { useEffect, useRef, useState } from 'react'
import ChatMessage from './components/ChatMessage.jsx'
import MessageInput from './components/MessageInput.jsx'
import { character } from './shared/character.js'
import { stripStageDirections } from './shared/ttsFilter.js'

// M3 活人感：空闲多久绫华会主动发消息
const IDLE_BEFORE_FIRST_MS = 45_000
const IDLE_AFTER_CHAT_MS = 45_000
const IDLE_AFTER_PROACTIVE_MS = 180_000

const CATEGORY_LABELS = {
  identity: '身份',
  preference: '喜好',
  date: '日期',
  relationship: '关系',
  status: '状态',
  other: '其他'
}

function greeting() {
  const h = new Date().getHours()
  const part = h < 5 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好'
  return `${part}，我是${character.name}。庭院的景色正好，能同你一道说说话，我很高兴。`
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  const [status, setStatus] = useState({ mode: 'mock', model: '' })
  const [memories, setMemories] = useState([])
  const [showMemories, setShowMemories] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // M3 打字机效果：reveal = { index, count }，表示第 index 条消息已显示前 count 个字符
  const [reveal, setReveal] = useState(null)
  // M4 语音：自动朗读开关与当前播放的音频
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [ttsNotice, setTtsNotice] = useState('')
  const audioRef = useRef(null)
  const listRef = useRef(null)
  // 代际标记：清空对话时 +1，用于作废等待中的旧回复，防止「复活」旧对话
  const generationRef = useRef(0)
  // M3：主动消息调度与最新消息引用
  const nextProactiveRef = useRef(Date.now() + IDLE_BEFORE_FIRST_MS)
  const messagesRef = useRef(messages)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // M4：合成语音（主进程 Edge/克隆 TTS），返回可播放的 Audio；失败返回 null
  async function prepareSpeechAudio(text) {
    const clean = stripStageDirections(text)
    if (!clean) return null
    try {
      const res = await window.api.speak(clean)
      if (res?.audioBase64) {
        const mime = res.mime || 'audio/mpeg'
        return new Audio(`data:${mime};base64,${res.audioBase64}`)
      }
      console.error('[tts]', res?.error || '未知错误')
      showTtsNotice('音色服务未连接，正在使用备用语音')
      return null
    } catch (err) {
      console.error('[tts]', err)
      showTtsNotice('音色服务未连接，正在使用备用语音')
      return null
    }
  }

  function playSpeechAudio(audio) {
    if (!audio) return
    stopSpeak()
    audioRef.current = audio
    audio.play().catch(() => {})
  }

  // 手动「朗读」按钮
  async function speak(text) {
    const clean = stripStageDirections(text)
    if (!clean) return
    stopSpeak()
    const audio = await prepareSpeechAudio(text)
    if (audio) playSpeechAudio(audio)
    else speakFallback(clean)
  }

  function showTtsNotice(msg) {
    setTtsNotice(msg)
    setTimeout(() => setTtsNotice(''), 5000)
  }

  function speakFallback(text) {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    synth.speak(u)
  }

  function stopSpeak() {
    audioRef.current?.pause()
    audioRef.current = null
    window.speechSynthesis?.cancel()
  }

  useEffect(() => {
    ;(async () => {
      const [history, appStatus, memoryFacts] = await Promise.all([
        window.api.loadHistory(),
        window.api.getStatus(),
        window.api.getMemories()
      ])
      if (history && history.length > 0) {
        setMessages(history)
      } else {
        setMessages([{ role: 'assistant', content: greeting(), ts: Date.now() }])
      }
      setStatus(appStatus)
      setMemories(memoryFacts || [])
    })()
    return window.api.onMemoryUpdated((facts) => setMemories(facts))
  }, [])

  // 新消息或打字状态变化时自动滚到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, typing, reveal])

  // Esc 关闭清空确认弹窗
  useEffect(() => {
    if (!confirming) return
    const onKey = (e) => {
      if (e.key === 'Escape') setConfirming(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirming])

  // M3：主动消息调度器——用户安静一段时间后，绫华自己开口
  useEffect(() => {
    const timer = setInterval(() => {
      if (typing) return
      if (Date.now() < nextProactiveRef.current) return
      if (!document.hasFocus()) {
        // 窗口没聚焦就推迟，避免打扰
        nextProactiveRef.current = Date.now() + 30_000
        return
      }
      handleProactive()
    }, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing])

  async function handleProactive() {
    if (typing) return
    const gen = generationRef.current
    setTyping(true)
    try {
      // 随机「思考」延迟，让消息来得自然
      await sleep(800 + Math.random() * 1800)
      if (gen !== generationRef.current) return
      const reply = await window.api.sendProactive()
      if (gen !== generationRef.current) return
      const final = [...messagesRef.current, { ...reply, ts: Date.now() }]
      setMessages(final)
      await window.api.saveHistory(final)
      setMemories(await window.api.getMemories())
      if (reply.content && reply.mode !== 'error') {
        // 并行合成：打字机显示期间后台生成语音，显示完立刻播（几乎无等待感）
        const pendingAudio = autoSpeak ? prepareSpeechAudio(reply.content) : null
        startReveal(final.length - 1, reply.content, () => {
          setTyping(false)
          nextProactiveRef.current = Date.now() + IDLE_AFTER_PROACTIVE_MS
          if (pendingAudio) {
            pendingAudio.then((audio) => {
              if (gen !== generationRef.current) return
              if (audio) playSpeechAudio(audio)
              else speakFallback(stripStageDirections(reply.content))
            })
          }
        })
      } else {
        setTyping(false)
        nextProactiveRef.current = Date.now() + IDLE_AFTER_PROACTIVE_MS
      }
    } catch (err) {
      console.error('[proactive] 主动消息失败:', err)
      setTyping(false)
      nextProactiveRef.current = Date.now() + IDLE_AFTER_PROACTIVE_MS
    }
  }

  // 打字机效果：把整段文本逐字显示出来，播完调用 onDone
  function startReveal(index, text, onDone) {
    const gen = generationRef.current
    let count = 0
    const step = () => {
      if (gen !== generationRef.current) return // 对话被清空，中断动画
      count += 1
      if (count >= text.length) {
        setReveal(null)
        onDone?.()
        return
      }
      setReveal({ index, count })
      setTimeout(step, 28 + Math.random() * 18)
    }
    setReveal({ index, count: 0 })
    setTimeout(step, 150)
  }

  // 用户活跃时推迟主动消息
  function handleActivity() {
    nextProactiveRef.current = Date.now() + IDLE_AFTER_CHAT_MS
  }

  async function handleSend(text) {
    if (!text.trim() || typing) return
    stopSpeak()
    const gen = generationRef.current
    const userMsg = { role: 'user', content: text.trim(), ts: Date.now() }
    const withUser = [...messages, userMsg]
    setMessages(withUser)
    setTyping(true)
    nextProactiveRef.current = Date.now() + IDLE_AFTER_CHAT_MS
    try {
      // M3 活人感：随机「思考」延迟，短消息快、长消息慢
      await sleep(600 + Math.min(2400, text.length * 25) + Math.random() * 1200)
      if (gen !== generationRef.current) return
      const reply = await window.api.sendChat({ messages: withUser })
      // 等待期间对话被清空或重新开始：丢弃这条迟到的回复
      if (gen !== generationRef.current) return
      const final = [...withUser, { ...reply, ts: Date.now() }]
      setMessages(final)
      await window.api.saveHistory(final)
      setMemories(await window.api.getMemories())
      if (reply.content && reply.mode !== 'error') {
        // 并行合成：打字机显示期间后台生成语音，显示完立刻播
        const pendingAudio = autoSpeak ? prepareSpeechAudio(reply.content) : null
        startReveal(final.length - 1, reply.content, () => {
          setTyping(false)
          if (pendingAudio) {
            pendingAudio.then((audio) => {
              if (gen !== generationRef.current) return
              if (audio) playSpeechAudio(audio)
              else speakFallback(stripStageDirections(reply.content))
            })
          }
        })
      } else {
        setTyping(false)
      }
    } catch (err) {
      if (gen !== generationRef.current) return
      const final = [
        ...withUser,
        { role: 'assistant', content: `（本地出了点问题：${err.message}）`, ts: Date.now(), mode: 'error' }
      ]
      setMessages(final)
      await window.api.saveHistory(final)
      setTyping(false)
    }
  }

  async function handleClearConfirmed() {
    setConfirming(false)
    stopSpeak()
    try {
      await window.api.saveHistory([])
      // 作废等待中的回复，并解除可能卡住的输入锁定
      generationRef.current++
      setTyping(false)
      setMessages([{ role: 'assistant', content: greeting(), ts: Date.now() }])
      setShowMemories(false)
    } catch (err) {
      setMessages([
        { role: 'assistant', content: `（清空失败：${err.message}）`, mode: 'error', ts: Date.now() }
      ])
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="avatar small">{character.name[0]}</div>
          <div>
            <div className="title">{character.name} · 白鹭公主</div>
            <div className="status">
              <span className={`dot ${status.mode === 'real' ? 'online' : 'mock'}`} />
              {status.mode === 'real'
                ? `模型已连接 · ${status.model}`
                : '本地模拟模式（配置 .env 后接入真实模型）'}
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button
            className={`memory-btn ${autoSpeak ? 'active' : ''}`}
            onClick={() => setAutoSpeak(!autoSpeak)}
          >
            朗读 {autoSpeak ? '开' : '关'}
          </button>
          <button className="memory-btn" onClick={() => setShowMemories(!showMemories)}>
            记忆 {memories.length}
          </button>
          <button className="clear-btn" onClick={() => setConfirming(true)}>清空对话</button>
        </div>
      </header>

      {showMemories && (
        <div className="memory-panel">
          <div className="memory-title">{character.name}记得这些事</div>
          {memories.length === 0 ? (
            <div className="memory-empty">还没有记忆。多聊几句，她会慢慢记住关于你的事。</div>
          ) : (
            memories.map((m) => (
              <div className="memory-item" key={m.id}>
                <span className="memory-tag">{CATEGORY_LABELS[m.category] || '其他'}</span>
                {m.text}
              </div>
            ))
          )}
        </div>
      )}

      <main className="chat" ref={listRef}>
        {messages.map((msg, i) => {
          const animating = reveal !== null && reveal.index === i
          const content = animating ? msg.content.slice(0, reveal.count) : msg.content
          return (
            <ChatMessage
              key={i}
              message={{ ...msg, content }}
              animating={animating}
              onSpeak={speak}
            />
          )
        })}
        {typing && !reveal && (
          <div className="message-row assistant">
            <div className="avatar">{character.name[0]}</div>
            <div className="bubble-wrap">
              <div className="name">{character.name}</div>
              <div className="bubble typing">
                <span className="dot-anim" />
                <span className="dot-anim" />
                <span className="dot-anim" />
              </div>
            </div>
          </div>
        )}
      </main>

      {ttsNotice && <div className="tts-notice">{ttsNotice}</div>}

      <MessageInput disabled={typing} onSend={handleSend} onActivity={handleActivity} />

      {confirming && (
        <div className="overlay" onClick={() => setConfirming(false)}>
          <div
            className="confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-avatar">{character.name[0]}</div>
            <div className="confirm-title" id="clear-dialog-title">清空对话</div>
            <div className="confirm-text">
              确定要清空和{character.name}的全部聊天记录吗？此操作不可恢复。
            </div>
            <div className="confirm-actions">
              <button className="btn-ghost" onClick={() => setConfirming(false)}>取消</button>
              <button className="btn-danger" onClick={handleClearConfirmed}>清空</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
