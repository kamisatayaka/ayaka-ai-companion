// 悬浮球：点击唤起主窗口，按住拖动可移动位置
const bubble = document.getElementById('bubble')
const dot = document.getElementById('dot')

window.api.getStatus().then((s) => {
  if (s && s.mode === 'real') dot.classList.add('online')
})

bubble.addEventListener('click', () => window.api.showMainWindow())
bubble.addEventListener('contextmenu', (e) => e.preventDefault())

// 手动拖动（透明无边框窗口不能用 -webkit-app-region，它会吞掉点击事件）
bubble.addEventListener('mousedown', (e) => {
  const startX = e.screenX
  const startY = e.screenY
  window.api.floatingDragStart()
  const onMove = (ev) => {
    window.api.moveFloatingBy(ev.screenX - startX, ev.screenY - startY)
  }
  const onUp = () => {
    window.api.floatingDragEnd()
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
})
