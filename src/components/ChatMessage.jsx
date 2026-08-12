import { character } from '../shared/character.js'

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ChatMessage({ message, animating, onSpeak }) {
  const isUser = message.role === 'user'
  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && <div className="avatar">{character.name[0]}</div>}
      <div className="bubble-wrap">
        {!isUser && <div className="name">{character.name}</div>}
        <div className={`bubble ${message.mode ? `mode-${message.mode}` : ''}`}>
          {message.content}
          {animating && <span className="caret" />}
        </div>
        <div className="meta">
          {formatTime(message.ts)}
          {!isUser && (
            <button className="speak-btn" title="朗读" onClick={() => onSpeak?.(message.content)}>
              🔊 朗读
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
