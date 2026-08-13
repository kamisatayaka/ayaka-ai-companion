// 纯函数：按模型给出的 add/remove 操作整理记忆。与 Electron 无关，方便单独测试。

export const IDENTITY = 'identity'

// 老数据没有 category 时，按文本猜一个，保证迁移后身份信息仍走「最新为准」规则
export function guessCategory(text) {
  if (/用户(?:叫|自称|希望|喜欢被|今年|年龄|岁|住在|来自|的?(?:名字|称呼|昵称))/.test(text)) return IDENTITY
  if (/喜欢|讨厌|爱|不爱|想(?:要|去)/.test(text)) return 'preference'
  if (/生日|纪念日|周[一二三四五六日天]|月|假期|考试|旅行/.test(text)) return 'date'
  return 'other'
}

// 身份信息再细分「项」（名字/年龄/所在地），同一项只保留最新一条
function identityKind(text) {
  if (/名字|叫|称呼|自称|昵称/.test(text)) return 'name'
  if (/岁|年龄/.test(text)) return 'age'
  if (/住|来自|城市|老家/.test(text)) return 'location'
  return 'other'
}

export function applyOps(existing, { add = [], remove = [] } = {}) {
  let facts = existing.filter(
    // 受保护的事实不可被模型删除；身份信息的最新为准在 keepLatestIdentity 里执行
    (f) => f.protected || !remove.some((r) => f.text === r || f.text.includes(r) || r.includes(f.text))
  )
  const now = Date.now()
  for (const item of add) {
    const text = typeof item === 'string' ? item : String(item?.text || '').trim()
    if (!text) continue
    const category =
      typeof item === 'string' ? guessCategory(text) : item?.category || guessCategory(text)
    const hit = facts.find((f) => f.text === text || f.text.includes(text) || text.includes(f.text))
    if (hit) {
      hit.updatedAt = now
      if (category) hit.category = category
    } else {
      facts.push({
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        category,
        createdAt: now,
        updatedAt: now,
        protected: false
      })
    }
  }
  // 身份信息同一项只保留最新一条（防止「小明」「小红」并存）
  facts = keepLatestIdentity(facts)
  // 最多保留 50 条，超出时淘汰最久没更新的
  if (facts.length > 50) {
    facts.sort((a, b) => a.updatedAt - b.updatedAt)
    facts.splice(0, facts.length - 50)
  }
  return facts
}

function keepLatestIdentity(facts) {
  const groups = new Map()
  for (const f of facts) {
    if (f.category !== IDENTITY) continue
    const key = identityKind(f.text)
    const latest = groups.get(key)
    if (!latest || f.updatedAt >= latest.updatedAt) groups.set(key, f)
  }
  const keepIds = new Set([...groups.values()].map((f) => f.id))
  return facts.filter((f) => f.category !== IDENTITY || keepIds.has(f.id))
}
