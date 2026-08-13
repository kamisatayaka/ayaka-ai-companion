// 截图脚本：启动应用并抓取主窗口截图（需要 npm install --no-save ws）
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'

const root = 'G:/AI-girlfriendplan'
const electron = `${root}/node_modules/electron/dist/electron.exe`
const port = 9224
const out = `${root}/assets/screenshot.png`

const child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
  cwd: root,
  stdio: 'ignore',
  windowsHide: false
})

async function getMainPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'))
      if (page) return page
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('无法连接主窗口')
}

const page = await getMainPage()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.once('open', r))

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

await cdp('Page.enable')
await new Promise((r) => setTimeout(r, 2500))
const shot = await cdp('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log('截图已保存:', out)

child.kill()
process.exit(0)
