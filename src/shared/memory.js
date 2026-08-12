// 纯函数：按模型给出的 add/remove 操作整理记忆。与 Electron 无关，方便单独测试。
export function applyOps(existing, { add = [], remove = [] } = {}) {
  let facts = existing.filter(
    // 受保护的事实（如已确认的名字）不可被模型删除
    (f) => f.protected || !remove.some((r) => f.text === r || f.text.includes(r) || r.includes(f.text))
  )
  const now = Date.now()
  for (const text of add) {
    const hit = facts.find(
      (f) => f.text === text || f.text.includes(text) || text.includes(f.text)
    )
    if (hit) {
      hit.updatedAt = now
    } else {
      facts.push({
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        createdAt: now,
        updatedAt: now,
        protected: false
      })
    }
  }
  // 最多保留 50 条，超出时淘汰最久没更新的
  if (facts.length > 50) {
    facts.sort((a, b) => a.updatedAt - b.updatedAt)
    facts.splice(0, facts.length - 50)
  }
  return facts
}
