// 纯函数：按模型给出的 add/remove 操作整理记忆。与 Electron 无关，方便单独测试。

export const IDENTITY = 'identity'

// ---------- 审查机制：拦截明显不合理/自相矛盾的记忆 ----------
const CN_NUMS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

export function cnToInt(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  if (s === '十') return 10
  if (s === '百') return 100
  let total = 0
  let current = 0
  for (const ch of s) {
    if (ch === '百') {
      total += (current || 1) * 100
      current = 0
    } else if (ch === '十') {
      total += (current || 1) * 10
      current = 0
    } else if (ch in CN_NUMS) {
      current = CN_NUMS[ch]
    } else {
      return NaN
    }
  }
  return total + current
}

function extractAge(text) {
  const m = String(text).match(/(\d+|[一二两三四五六七八九十百]+)岁/)
  if (!m) return null
  const n = cnToInt(m[1])
  return Number.isFinite(n) ? n : null
}

function extractWorkYears(text) {
  const m = String(text).match(/工作(?:了)?(\d+|[一二两三四五六七八九十百]+)年/)
  if (!m) return null
  const n = cnToInt(m[1])
  return Number.isFinite(n) ? n : null
}

export function reviewFact(fact, existingFacts = []) {
  const problems = []
  const text = String(fact?.text || '')
  const age = extractAge(text) ?? extractAgeFromFacts(existingFacts)
  const workYears = extractWorkYears(text)

  if (age != null && (age < 1 || age > 120)) {
    problems.push(`年龄不合理：${age}岁`)
  }
  if (workYears != null && (workYears < 0 || workYears > 80)) {
    problems.push(`工作时长不合理：${workYears}年`)
  }
  if (age != null && workYears != null && workYears > Math.max(0, age - 10)) {
    problems.push(`年龄与工作时长矛盾：${age}岁的人不可能工作${workYears}年`)
  }
  return problems
}

function extractAgeFromFacts(facts) {
  for (const f of facts) {
    const n = extractAge(f?.text)
    if (n != null) return n
  }
  return null
}

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
  const rejected = []
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
      const newFact = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        category,
        createdAt: now,
        updatedAt: now,
        protected: false
      }
      // 审查机制：明显不合理/自相矛盾的记忆拒绝入库
      const problems = reviewFact(newFact, facts)
      if (problems.length) {
        rejected.push({ text, problems })
        continue
      }
      facts.push(newFact)
    }
  }
  // 身份信息同一项只保留最新一条（防止「小明」「小红」并存）
  facts = keepLatestIdentity(facts)
  // 最多保留 50 条，超出时淘汰最久没更新的
  if (facts.length > 50) {
    facts.sort((a, b) => a.updatedAt - b.updatedAt)
    facts.splice(0, facts.length - 50)
  }
  return { facts, rejected }
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
