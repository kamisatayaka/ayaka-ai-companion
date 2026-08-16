import { useRef, useState } from 'react'
import { character } from '../shared/character.js'
import { PROMPT_CATEGORIES } from '../shared/imagePrompt.js'

export default function MessageInput({ disabled, onSend, onGenerateImage, onActivity }) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState('')
  const [selTags, setSelTags] = useState([])
  const [showTags, setShowTags] = useState(false)
  const recorderRef = useRef(null)

  function toggleTag(key) {
    setSelTags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function submit() {
    if (!text.trim() || disabled) return
    onSend(text)
    setText('')
  }

  function showNotice(msg) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 5000)
  }

  // M4 语音输入：录音 → 主进程调 Whisper 兼容接口转文字 → 填入输入框
  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop()
      return
    }
    setNotice('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        if (!chunks.length) return
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          const buf = await blob.arrayBuffer()
          const res = await window.api.transcribeAudio(buf)
          if (res?.error) {
            showNotice(res.error)
            return
          }
          if (res?.text) {
            // 去掉 SenseVoice 常带的 emoji，避免转写结果里混入表情符号
            const clean = res.text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim()
            setText((prev) => (prev ? prev + ' ' : '') + clean)
            onActivity?.()
          }
        } catch (err) {
          showNotice(`语音识别出错：${err.message}`)
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch (err) {
      showNotice(`无法使用麦克风：${err.message}`)
    }
  }

  return (
    <div className="input-wrap">
      {notice && <div className="mic-notice">{notice}</div>}
      {showTags && (
        <div className="tag-panel">
          {PROMPT_CATEGORIES.map((cat) => (
            <div className="tag-cat" key={cat.label}>
              <div className="tag-cat-label">{cat.label}</div>
              <div className="tag-chips">
                {cat.items.map((it) => (
                  <button
                    key={it.key}
                    className={`tag-chip ${selTags.includes(it.key) ? 'active' : ''}`}
                    onClick={() => toggleTag(it.key)}
                  >
                    {it.key}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="input-bar">
        <button
          className={`mic-btn ${recording ? 'recording' : ''}`}
          onClick={toggleRecord}
          title={recording ? '停止录音' : '语音输入'}
        >
          {recording ? '■' : '🎤'}
        </button>
        <textarea
          value={text}
          rows={1}
          placeholder={`跟${character.name}说点什么…`}
          onChange={(e) => {
            setText(e.target.value)
            onActivity?.()
          }}
          onKeyDown={(e) => {
            // Enter 发送，Shift+Enter 换行；isComposing 防止中文输入法选字时误发送
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button
          className="img-btn"
          title="把想看的画面写进输入框，再点这个出图（本地 SD 出图）"
          onClick={() => {
            if (disabled) return
            onGenerateImage?.(text, selTags)
            setText('')
          }}
          disabled={disabled}
        >
          🖼️ 发图
        </button>
        <button
          className={`tag-btn ${selTags.length ? 'has-tags' : ''}`}
          title="选择画面提示词（可多选）"
          onClick={() => setShowTags((v) => !v)}
        >
          提示词{selTags.length ? ` (${selTags.length})` : ''}
        </button>
        <button className="send-btn" onClick={submit} disabled={disabled || !text.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}
