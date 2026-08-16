import { useEffect, useRef, useState } from 'react'
import ChatMessage from './components/ChatMessage.jsx'
import MessageInput from './components/MessageInput.jsx'
import { character } from './shared/character.js'
import { stripStageDirections } from './shared/ttsFilter.js'
import avatar from './assets/avatar.png'

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
  const [personaState, setPersonaState] = useState({ current: 'normal', personas: [] })
  const [memories, setMemories] = useState([])
  const [showMemories, setShowMemories] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editCategory, setEditCategory] = useState('other')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [memoryNotice, setMemoryNotice] = useState('')
  const [confirming, setConfirming] = useState(false)
  // M3 打字机效果：reveal = { index, count }，表示第 index 条消息已显示前 count 个字符
  const [reveal, setReveal] = useState(null)
  // M3 真·流式：正在逐字生成的消息下标（该消息内容由 chat:delta 增量填充）
  const [streamingIndex, setStreamingIndex] = useState(null)
  // 音画同步：流式消息当前已「显示」的字数（开启朗读时按语音节奏推进）
  const [displayLen, setDisplayLen] = useState(0)
  // 等待语音期间先隐藏文字，避免「先出全文→清空→重打」
  const [pendingReveal, setPendingReveal] = useState(null)
  // M4 语音：自动朗读开关与当前播放的音频
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [ttsNotice, setTtsNotice] = useState('')
  const audioRef = useRef(null)
  // 语音与打字机同步：音频就绪后把剩余文字的显示速度调到与语音一致
  const revealDelayRef = useRef(null)
  const revealCountRef = useRef(0)
  const listRef = useRef(null)
  // 代际标记：清空对话时 +1，用于作废等待中的旧回复，防止「复活」旧对话
  const generationRef = useRef(0)
  // M3：主动消息调度与最新消息引用
  const nextProactiveRef = useRef(Date.now() + IDLE_BEFORE_FIRST_MS)
  const messagesRef = useRef(messages)
  // 逐句音画同步：已收到但未入队的残句、待处理的句子队列、处理中标记
  const streamBufferRef = useRef('')
  const pendingSentencesRef = useRef([])
  const processingRef = useRef(false)
  const queueDoneResolveRef = useRef(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // 按句切分：返回 [完整句子数组, 剩余未完整部分]
  function takeCompleteSentences(buffer) {
    const out = []
    let last = 0
    const re = /[。！？…!?；;]/g
    let m
    while ((m = re.exec(buffer))) {
      out.push(buffer.slice(last, m.index + 1))
      last = m.index + 1
    }
    return [out, buffer.slice(last)]
  }

  function enqueueSentences(text) {
    streamBufferRef.current += text
    const [sentences, rest] = takeCompleteSentences(streamBufferRef.current)
    streamBufferRef.current = rest
    if (sentences.length) pendingSentencesRef.current.push(...sentences)
  }

  function waitQueueEmpty() {
    return new Promise((resolve) => {
      if (!processingRef.current && pendingSentencesRef.current.length === 0) {
        resolve()
      } else {
        queueDoneResolveRef.current = resolve
      }
    })
  }

  // 逐句处理：先合成语音，再让文字按语音时长匀速显示并同时播放
  async function processSentenceQueue(gen) {
    if (processingRef.current) return
    processingRef.current = true
    const startedAt = Date.now()
    try {
      while (pendingSentencesRef.current.length) {
        if (gen !== generationRef.current) return
        const sentence = pendingSentencesRef.current.shift()
        // 兜底：整条回复逐句处理超过 90 秒，直接显示剩余文字，不再等语音，避免界面像卡死
        if (Date.now() - startedAt > 90000) {
          setDisplayLen((d) => d + sentence.length)
          continue
        }
        const audio = await prepareSpeechAudio(sentence)
        if (gen !== generationRef.current) return
        await revealSentenceWithAudio(sentence, audio, gen)
      }
    } finally {
      processingRef.current = false
      if (queueDoneResolveRef.current) {
        const resolve = queueDoneResolveRef.current
        queueDoneResolveRef.current = null
        resolve()
      }
    }
  }

  function revealSentenceWithAudio(sentence, audio, gen) {
    return new Promise((resolve) => {
      const total = sentence.length
      if (!audio || total === 0) {
        setDisplayLen((d) => d + total)
        resolve()
        return
      }
      const applyPace = () => {
        const durMs = (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 2) * 1000
        const per = Math.min(120, Math.max(12, durMs / total))
        playSpeechAudio(audio)
        let shown = 0
        const step = () => {
          if (gen !== generationRef.current) return resolve()
          shown += 1
          setDisplayLen((d) => d + 1)
          if (shown >= total) return resolve()
          setTimeout(step, per)
        }
        step()
      }
      if (Number.isFinite(audio.duration) && audio.duration > 0) applyPace()
      else {
        audio.addEventListener('loadedmetadata', applyPace, { once: true })
        // 兜底：元数据 2.5 秒内没就绪，按默认节奏继续，绝不让流程悬死
        setTimeout(() => {
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) applyPace()
        }, 2500)
      }
    })
  }

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

  // 让「文字显示完」和「语音说完」同时发生
  function syncRevealWithAudio(audio, text) {
    if (!audio) return
    const apply = () => {
      const remaining = text.length - revealCountRef.current
      if (remaining <= 0) return
      const ms = (audio.duration || 2) * 1000
      // 每字延迟夹在 12~120ms，避免太快或像卡住
      revealDelayRef.current = Math.min(120, Math.max(12, ms / remaining))
    }
    if (Number.isFinite(audio.duration) && audio.duration > 0) apply()
    else audio.addEventListener('loadedmetadata', apply, { once: true })
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
      const [history, appStatus, memoryFacts, personaInfo] = await Promise.all([
        window.api.loadHistory(),
        window.api.getStatus(),
        window.api.getMemories(),
        window.api.getPersona()
      ])
      if (history && history.length > 0) {
        setMessages(history)
      } else {
        setMessages([{ role: 'assistant', content: greeting(), ts: Date.now() }])
      }
      setStatus(appStatus)
      setMemories(memoryFacts || [])
      setPersonaState(personaInfo || { current: 'normal', personas: [] })
    })()
    const offMemory = window.api.onMemoryUpdated((facts) => setMemories(facts))
    const offPersona = window.api.onPersonaChanged((key) =>
      setPersonaState((prev) => ({ ...prev, current: key }))
    )
    return () => {
      offMemory()
      offPersona()
    }
  }, [])

  // 人格切换：持久化 + 刷新状态显示
  async function switchPersona(key) {
    if (key === personaState.current) return
    stopSpeak()
    // 作废在途的流式回复/主动消息，避免串到新人格的对话框里
    generationRef.current++
    setTyping(false)
    setStreamingIndex(null)
    setDisplayLen(0)
    setPendingReveal(null)
    await window.api.setPersona(key)
    setPersonaState((prev) => ({ ...prev, current: key }))
    setStatus(await window.api.getStatus())
    setMemories(await window.api.getMemories())
    // 每个人格有自己独立的对话历史，切过来就加载各自的
    const history = await window.api.loadHistory()
    if (history && history.length > 0) {
      setMessages(history)
    } else {
      setMessages([{ role: 'assistant', content: greeting(), ts: Date.now() }])
    }
  }

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
      if (reply.content && reply.mode !== 'error') setPendingReveal(final.length - 1)
      setMessages(final)
      await window.api.saveHistory(final)
      setMemories(await window.api.getMemories())
      if (reply.content && reply.mode !== 'error') {
        const revealDone = () => {
          setTyping(false)
          nextProactiveRef.current = Date.now() + IDLE_AFTER_PROACTIVE_MS
        }
        if (autoSpeak) {
          // 同步呈现：先等语音就绪（期间显示打字点点），再让文字和语音同时开始
          prepareSpeechAudio(reply.content).then((audio) => {
            if (gen !== generationRef.current) return
            if (audio) {
              startReveal(final.length - 1, reply.content, revealDone)
              syncRevealWithAudio(audio, reply.content)
              playSpeechAudio(audio)
            } else {
              startReveal(final.length - 1, reply.content, revealDone)
              speakFallback(stripStageDirections(reply.content))
            }
          })
        } else {
          startReveal(final.length - 1, reply.content, revealDone)
        }
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
    setPendingReveal(null)
    revealDelayRef.current = null
    revealCountRef.current = 0
    let count = 0
    const step = () => {
      if (gen !== generationRef.current) return // 对话被清空，中断动画
      count += 1
      revealCountRef.current = count
      if (count >= text.length) {
        setReveal(null)
        revealDelayRef.current = null
        onDone?.()
        return
      }
      setReveal({ index, count })
      const delay = revealDelayRef.current ?? (28 + Math.random() * 18)
      setTimeout(step, delay)
    }
    setReveal({ index, count: 0 })
    setTimeout(step, 150)
  }

  // 用户活跃时推迟主动消息
  function handleActivity() {
    nextProactiveRef.current = Date.now() + IDLE_AFTER_CHAT_MS
  }

  // 记忆管理：开始编辑 / 保存 / 删除
  function startEditMemory(m) {
    setEditingId(m.id)
    setEditText(m.text)
    setEditCategory(m.category || 'other')
  }

  async function saveEditMemory(id) {
    const text = editText.trim()
    if (!text) return
    const res = await window.api.updateMemory(id, { text, category: editCategory })
    if (res && res.error) {
      setMemoryNotice(`审查未通过：${res.error}`)
      setTimeout(() => setMemoryNotice(''), 5000)
      return
    }
    setMemories((prev) =>
      prev.map((f) => (f.id === id ? { ...f, text, category: editCategory } : f))
    )
    setEditingId(null)
    setConfirmDeleteId(null)
  }

  async function handleDeleteMemory(m) {
    await window.api.deleteMemory(m.id)
    setMemories((prev) => prev.filter((f) => f.id !== m.id))
    setConfirmDeleteId(null)
  }

  async function handleSend(text) {
    if (!text.trim() || typing) return
    stopSpeak()
    const gen = generationRef.current
    const userMsg = { role: 'user', content: text.trim(), ts: Date.now() }
    const withUser = [...messages, userMsg]
    setMessages(withUser)
    setTyping(true)
    const syncMode = autoSpeak
    nextProactiveRef.current = Date.now() + IDLE_AFTER_CHAT_MS
    try {
      // M3 活人感：随机「思考」延迟，短消息快、长消息慢
      await sleep(600 + Math.min(2400, text.length * 25) + Math.random() * 1200)
      if (gen !== generationRef.current) return

      // M3 真·流式：先放一个空的绫华占位消息，模型边生成边逐字填入
      const assistantIndex = withUser.length
      const placeholder = { role: 'assistant', content: '', ts: Date.now(), streaming: true }
      setMessages([...withUser, placeholder])
      setStreamingIndex(assistantIndex)
      setDisplayLen(0)
      streamBufferRef.current = ''
      pendingSentencesRef.current = []
      const offDelta = window.api.onChatDelta(({ text }) => {
        if (gen !== generationRef.current) return
        setMessages((prev) =>
          prev.map((m, i) => (i === assistantIndex ? { ...m, content: m.content + text } : m))
        )
        if (syncMode) {
          // 开启朗读：句子入队，逐句音画同步
          enqueueSentences(text)
          processSentenceQueue(gen)
        } else {
          // 不朗读：文字随生成直接全量显示
          setDisplayLen((prev) => prev + text.length)
        }
      })

      let reply
      try {
        reply = await window.api.sendChat({ messages: withUser })
      } finally {
        offDelta()
      }
      // 等待期间对话被清空或重新开始：丢弃这条迟到的回复
      if (gen !== generationRef.current) return

      if (reply.content && reply.mode !== 'error') {
        if (syncMode) {
          // 末尾残句也入队，等语音全部播完再收尾，保证音画同步到底
          if (streamBufferRef.current) {
            pendingSentencesRef.current.push(streamBufferRef.current)
            streamBufferRef.current = ''
          }
          processSentenceQueue(gen)
          await waitQueueEmpty()
          if (gen !== generationRef.current) return
          setDisplayLen(reply.content.length)
        }
      }
      setStreamingIndex(null)
      const final = [...withUser, { ...reply, ts: Date.now() }]
      setMessages(final)
      await window.api.saveHistory(final)
      setMemories(await window.api.getMemories())
      setTyping(false)
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

  // M6 本地出图：把请求发到 SD WebUI，生成图片作为一条绫华的消息
  async function handleGenerateImage(text, keys = []) {
    if (typing) return
    stopSpeak()
    const gen = generationRef.current
    const typed = (text || '').trim()
    if (!typed) {
      showTtsNotice('没写描述，画了一张默认的。下次先把想看的画面写进输入框，再点「发图」')
    }
    const req = typed || '让我看看你现在的样子'
    const isIntimate = personaState.current === 'intimate'
    const selNote = isIntimate && keys.length ? `（画面提示：${keys.join('、')}）` : ''
    const userMsg = { role: 'user', content: `${req}${selNote}`, ts: Date.now() }
    const withUser = [...messagesRef.current, userMsg]
    setMessages(withUser)
    setTyping(true)
    nextProactiveRef.current = Date.now() + IDLE_AFTER_CHAT_MS
    try {
      const res = await window.api.generateImage({
        request: req,
        width: 512,
        height: 768,
        keys: isIntimate ? keys : []
      })
      if (gen !== generationRef.current) return
      const imgMsg = {
        role: 'assistant',
        content: '（刚画好的，给你。）',
        image: res.imageBase64,
        mime: res.mime || 'image/png',
        ts: Date.now()
      }
      const final = [...withUser, imgMsg]
      setMessages(final)
      await window.api.saveHistory(final)
      setMemories(await window.api.getMemories())
      if (autoSpeak) speak(imgMsg.content)
      setTyping(false)
    } catch (err) {
      if (gen !== generationRef.current) return
      const final = [
        ...withUser,
        { role: 'assistant', content: `（出图失败：${err.message}）`, mode: 'error', ts: Date.now() }
      ]
      setMessages(final)
      await window.api.saveHistory(final)
      setTyping(false)
    }
  }

  async function handleClearConfirmed() {
    setConfirming(false)
    stopSpeak()
    setPendingReveal(null)
    try {
      await window.api.saveHistory([])
      // 作废等待中的回复，并解除可能卡住的输入锁定
      generationRef.current++
      setTyping(false)
      setStreamingIndex(null)
      setDisplayLen(0)
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
          <img className="avatar-img small" src={avatar} alt={character.name} />
          <div>
            <div className="title">{character.name} · 白鹭公主</div>
            <div className="status">
              <span className={`dot ${status.mode === 'real' ? 'online' : 'mock'}`} />
              {status.mode === 'real'
                ? `${personaState.current === 'intimate' ? '私密' : '日常'}模式 · ${status.model}`
                : '本地模拟模式（配置 .env 后接入真实模型）'}
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="persona-switch">
            {personaState.personas.map((p) => (
              <button
                key={p.key}
                className={`persona-btn ${personaState.current === p.key ? 'active' : ''}`}
                onClick={() => switchPersona(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
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
          {memoryNotice && <div className="memory-notice">{memoryNotice}</div>}
          {memories.length === 0 ? (
            <div className="memory-empty">还没有记忆。多聊几句，她会慢慢记住关于你的事。</div>
          ) : (
            memories.map((m) => (
              <div className="memory-item" key={m.id}>
                {editingId === m.id ? (
                  <div className="memory-edit">
                    <input
                      className="memory-edit-input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveEditMemory(m.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <select
                      className="memory-edit-select"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                    >
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <button className="memory-op solid" onClick={() => saveEditMemory(m.id)}>保存</button>
                    <button className="memory-op" onClick={() => setEditingId(null)}>取消</button>
                  </div>
                ) : (
                  <>
                    <span className="memory-tag">{CATEGORY_LABELS[m.category] || '其他'}</span>
                    {m.text}
                    <span className="memory-actions">
                      <button className="memory-op" onClick={() => startEditMemory(m)}>改</button>
                      {confirmDeleteId === m.id ? (
                        <button className="memory-op danger-solid" onClick={() => handleDeleteMemory(m)}>确认删</button>
                      ) : (
                        <button className="memory-op danger" onClick={() => setConfirmDeleteId(m.id)}>删</button>
                      )}
                    </span>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <main className="chat" ref={listRef}>
        {messages.map((msg, i) => {
          if (pendingReveal === i) return null // 语音就绪前不显示，用打字点点代替
          const animating = reveal !== null && reveal.index === i
          if (streamingIndex === i && displayLen === 0) return null
          const content =
            animating && reveal !== null
              ? msg.content.slice(0, reveal.count)
              : streamingIndex === i
                ? msg.content.slice(0, displayLen)
                : msg.content
          return (
            <ChatMessage
              key={i}
              message={{ ...msg, content }}
              animating={animating}
              onSpeak={speak}
            />
          )
        })}
        {typing && !reveal && (streamingIndex === null || displayLen === 0) && (
          <div className="message-row assistant">
            <img className="avatar-img" src={avatar} alt={character.name} />
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

      <MessageInput
        key={personaState.current}
        disabled={typing}
        onSend={handleSend}
        onGenerateImage={handleGenerateImage}
        onActivity={handleActivity}
      />

      {confirming && (
        <div className="overlay" onClick={() => setConfirming(false)}>
          <div
            className="confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <img className="confirm-avatar" src={avatar} alt={character.name} />
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
