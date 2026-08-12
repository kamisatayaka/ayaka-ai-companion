// 复现脚本：通过 Chrome DevTools 协议驱动真实应用，模拟「发消息 → 清空 → 再发消息」。
// 运行：node scripts/repro-clear.mjs（需要 npm install --no-save ws）
import { WebSocket } from 'ws'
import { spawn } from 'node:child_process'

const root = 'G:/AI-girlfriendplan'
const electron = `${root}/node_modules/electron/dist/electron.exe`
const port = 9223

const child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
  cwd: root,
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: true
})

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      // 现在有两个窗口（主窗口 + 悬浮球），复现脚本只操作主窗口
      const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'))
      if (page) return page
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('无法连接 DevTools 端口')
}

const page = await getPageTarget()
const ws = new WebSocket(page.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})

function cdp(method, params = {}) {
  return new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evalJs(expression) {
  const res = await cdp('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (res.result?.exceptionDetails) {
    throw new Error(res.result.exceptionDetails.text)
  }
  return res.result?.result?.value
}

const state = () =>
  evalJs(`JSON.stringify({
    rows: document.querySelectorAll('.message-row').length,
    typing: !!document.querySelector('.typing'),
    btnDisabled: document.querySelector('.send-btn')?.disabled,
    textValue: document.querySelector('textarea')?.value || ''
  })`)

const typeAndSend = (text) =>
  evalJs(`(() => {
    const ta = document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.send-btn').click();
    return 'sent';
  })()`)

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await new Promise((r) => ws.once('open', r))
await wait(4000)

console.log('初始状态:', await state())

console.log('→ 发送第一条消息（真实模型）')
await typeAndSend('你好，绫华，我叫小周。')
await wait(15000)
console.log('发送后状态:', await state())

console.log('→ 清空对话')
await evalJs(`document.querySelector('.clear-btn').click(); 'opened'`)
await wait(500)
console.log('弹窗出现:', await evalJs(`!!document.querySelector('.confirm-card')`))
await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 'esc'`)
await wait(400)
console.log('Esc 后弹窗关闭:', await evalJs(`!document.querySelector('.confirm-card')`))
await evalJs(`document.querySelector('.clear-btn').click(); 'reopened'`)
await wait(500)
await evalJs(`document.querySelector('.btn-danger').click(); 'confirmed'`)
await wait(2500)
console.log('清空后状态:', await state())

console.log('→ 清空后再发一条')
await typeAndSend('还在吗？')
await wait(15000)
console.log('清空后发送状态:', await state())

console.log('→ 测试绫华主动消息（IPC 直调，验证真实生成效果）')
const proactive = await evalJs(`window.api.sendProactive()`)
console.log('主动消息内容:', proactive?.content || JSON.stringify(proactive))

console.log('→ 测试 TTS 朗读（Edge TTS 合成 MP3）')
const tts = await evalJs(`window.api.speak('旅行者，夜深了，要一起喝杯茶吗？')`)
console.log('TTS 结果:', tts?.error ? `错误: ${tts.error}` : `音频 base64 长度: ${tts?.audioBase64?.length || 0}`)

child.kill()
process.exit(0)
