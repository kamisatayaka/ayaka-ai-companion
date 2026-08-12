import { useRef, useState } from 'react'
import { character } from '../shared/character.js'

export default function MessageInput({ disabled, onSend, onActivity }) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState('')
  const recorderRef = useRef(null)

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
        <button className="send-btn" onClick={submit} disabled={disabled || !text.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}
