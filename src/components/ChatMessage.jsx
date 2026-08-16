import { character } from '../shared/character.js'
import avatar from '../assets/avatar.png'

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
      {!isUser && <img className="avatar-img" src={avatar} alt={character.name} />}
      <div className="bubble-wrap">
        {!isUser && <div className="name">{character.name}</div>}
        <div className={`bubble ${message.mode ? `mode-${message.mode}` : ''}`}>
          {message.content}
          {message.image && (
            <img
              className="chat-image"
              src={`data:${message.mime || 'image/png'};base64,${message.image}`}
              alt={message.content || ''}
            />
          )}
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
