// 图像提示词：绫华的外貌描述 + 负面词 + 拼装器。
// LoRA 装好后把文件名填进 AYAKA_LORA， likeness 会明显提升。

export const AYAKA_HAIR_FACE = [
  'kamisato ayaka (genshin impact), genshin impact, 1girl, (solo:1.3)',
  'long hair, white hair, light blue hair, hair between eyes, sidelocks, blue eyes',
  'black hair ribbon, solo, masterpiece, best quality, ultra-detailed, anime style'
].join(', ')

export const AYAKA_CLOTHING = 'white kimono, blue kimono, japanese clothes, frilled skirt'

export const AYAKA_LORA = ''

export const NEGATIVE_PROMPT = [
  'lowres, bad anatomy, bad hands, missing fingers, extra digits, fused fingers',
  'worst quality, low quality, blurry, jpeg artifacts, watermark, signature, text, logo, extra limbs',
  'multiple girls, multiple people, 2girls, 3girls, 4girls, duplicate, extra person, extra body, merged bodies, double body, clone'
].join(', ')

// 私密人格：自动追加裸体描述，并禁止打码
export const NSFW_TAGS = 'nude, naked, no clothes, bare breasts, erotic, uncensored'
export const NSFW_NEGATIVE =
  'censored, mosaic censoring, bar censor, underwear, swimsuit, clothing, kimono, skirt, dress, clothes, towel, no penis, hidden genitals, penis removed, censored genitals'

// 提示词素材库：二级菜单的数据源，同时供「自由输入自动翻译」使用
export const PROMPT_CATEGORIES = [
  {
    label: '身体部位',
    items: [
      { key: '小穴', re: /小穴|阴部|逼|屄|肉缝|下面/, tags: 'pussy, exposed pussy' },
      { key: '阴蒂', re: /阴蒂|豆豆/, tags: 'clitoris, clit' },
      { key: '乳房', re: /奶子|乳房|巨乳|胸部|奶|乳/, tags: 'breasts, big breasts' },
      { key: '乳头', re: /乳头|乳首/, tags: 'nipples' },
      { key: '屁眼', re: /屁眼|菊花|肛门|后穴|后面/, tags: '(spread asshole:1.5), (anal:1.3), anal, spread asshole, from behind, rear view, close-up, on all fours, face down ass up, bent over, legs spread, presenting' },
      { key: '大腿', re: /大腿|美腿|双腿/, tags: 'thighs' },
      { key: '阴毛', re: /阴毛/, tags: 'pubic hair' }
    ]
  },
  {
    label: '姿势',
    items: [
      { key: '张开双腿', re: /张开|分开|岔开|张开腿|张开.*腿/, tags: 'spread legs, legs apart' },
      { key: '趴着', re: /趴好|趴着|四肢着地/, tags: 'on all fours' },
      { key: '跪着', re: /跪下|跪着|跪姿/, tags: 'kneeling, on knees' },
      { key: '蹲下', re: /蹲下|蹲着/, tags: 'squatting, crouching' },
      { key: '躺下', re: /躺下|躺平|仰卧/, tags: 'lying, lying on back' },
      { key: '侧躺', re: /侧躺/, tags: 'lying on side' },
      { key: '翘臀', re: /翘臀|撅起|撅屁股|翘起/, tags: '(ass up:1.2), ass up, presenting, rear view, close-up' },
      { key: '撅高屁股', re: /撅高|脸朝下|趴高/, tags: 'face down ass up, on all fours, presenting, from behind, rear view, close-up, (ass up:1.3)' },
      { key: '站立', re: /站着|站立/, tags: 'standing' },
      { key: '坐着', re: /坐着/, tags: 'sitting' },
      { key: '拥抱', re: /抱住|拥抱/, tags: 'hugging, embrace' },
      { key: '自慰', re: /手淫|自慰|扣/, tags: 'masturbation, fingering' },
      { key: '露出', re: /露出|掀开/, tags: 'exhibitionism, exposing' },
      { key: '回头', re: /回头|回眸/, tags: 'looking back' }
    ]
  },
  {
    label: '性行为',
    items: [
      { key: '后入', re: /后入|背后位|从后面|从背后/, tags: '(doggystyle:1.3), from behind, doggystyle, rear view, back view, legs spread, on all fours, (penis:1.3), visible penis, penis inside, uncensored' },
      { key: '插入', re: /插进来|插进|插入|进去|操我|做爱|操/, tags: 'sex, penetration, (penis:1.3), visible penis, penis inside, uncensored' },
      { key: '口交', re: /口交|吃鸡巴|吹箫|含住|吮|舔/, tags: 'blowjob, fellatio, licking, (penis:1.3), visible penis, penis in mouth, uncensored' },
      { key: '口爆', re: /口爆|射嘴里/, tags: 'cum in mouth, (penis:1.3), visible penis, uncensored' },
      { key: '吞精', re: /吞精/, tags: 'swallowing cum, (penis:1.2), visible penis, uncensored' },
      { key: '乳交', re: /乳交|夹胸|胸推/, tags: 'paizuri, titjob, (penis:1.3), visible penis, uncensored' },
      { key: '足交', re: /足交|脚交/, tags: 'footjob, (penis:1.3), visible penis, uncensored' },
      { key: '手交', re: /手交|打飞机|撸/, tags: 'handjob, (penis:1.3), visible penis, uncensored' },
      { key: '颜射', re: /颜射|射在脸上/, tags: 'facial, cum on face, (penis:1.2), visible penis, uncensored' },
      { key: '内射', re: /内射|射进去|中出/, tags: 'creampie, cum inside, (penis:1.2), visible penis, uncensored' },
      { key: '射精', re: /射精|射了/, tags: 'cumshot, (penis:1.3), visible penis, uncensored' },
      { key: '肛交', re: /肛交|操屁眼|后庭/, tags: 'anal sex, (penis:1.3), visible penis, penis in ass, uncensored' },
      { key: '指交', re: /指交|手指/, tags: 'fingering' },
      { key: '潮吹', re: /潮吹|喷水/, tags: 'squirting, gushing' },
      { key: '高潮', re: /高潮|去了/, tags: 'orgasm' },
      { key: '发情', re: /淫水|湿透|发情/, tags: 'wet, aroused' },
      { key: '骑乘', re: /骑乘|坐上来|女上位|骑上去/, tags: 'cowgirl position' },
      { key: '传教士', re: /正面|传教士|正面上/, tags: 'missionary position' },
      { key: '站立做爱', re: /站立做爱|站着干/, tags: 'standing sex' },
      { key: '69', re: /69/, tags: 'sixty-nine position' },
      { key: '群交', re: /群交|多人/, tags: 'group sex' },
      { key: '3P', re: /3p|三人/, tags: 'threesome' }
    ]
  },
  {
    label: '表情神态',
    items: [
      { key: '淫荡', re: /淫荡|痴女|淫乱/, tags: 'lustful, lewd, aroused' },
      { key: '脸红', re: /脸红|害羞/, tags: 'blush, embarrassed' },
      { key: '舔唇', re: /舔唇|舔嘴/, tags: 'licking lips' },
      { key: '阿黑颜', re: /阿黑颜|翻白眼|失神/, tags: 'ahegao' },
      { key: '流口水', re: /流口水|口水/, tags: 'drooling, saliva' },
      { key: '眼泪', re: /眼泪|泪目/, tags: 'tears' },
      { key: '魅惑', re: /魅惑|勾引|诱惑/, tags: 'seductive, tempting' }
    ]
  },
  {
    label: '视角',
    items: [
      { key: '背面', re: /背面|从后面|从背后|背后|背对/, tags: '(rear view:1.2), from behind, rear view, back view' },
      { key: '侧面', re: /侧面|侧身/, tags: 'side view' },
      { key: '正面', re: /正面|正脸/, tags: 'facing viewer, front view' },
      { key: '俯视', re: /俯视|上面看|居高/, tags: 'from above, top-down view' },
      { key: '仰视', re: /仰视|下面看/, tags: 'from below, low angle' }
    ]
  },
  {
    label: '场景道具',
    items: [
      { key: '床上', re: /床上|床/, tags: 'on bed' },
      { key: '浴室', re: /浴室|洗澡|淋浴/, tags: 'in bathroom, showering' },
      { key: '镜子', re: /镜子/, tags: 'mirror' },
      { key: '户外', re: /户外|野外|露天/, tags: 'outdoors, in public' },
      { key: '捆绑', re: /捆绑|绑起来|绳子/, tags: 'bondage, tied up' },
      { key: '眼罩', re: /眼罩/, tags: 'blindfold' },
      { key: '项圈', re: /项圈|狗链|项链/, tags: 'collar, leash' },
      { key: '玩具', re: /玩具|按摩棒/, tags: 'sex toy, vibrator' },
      { key: '跳蛋', re: /跳蛋/, tags: 'vibrator' },
      { key: '口球', re: /口球/, tags: 'ball gag' },
      { key: '蜡烛', re: /蜡烛/, tags: 'candle wax' },
      { key: '鞭子', re: /鞭子/, tags: 'whip' },
      { key: '丝袜', re: /丝袜/, tags: 'pantyhose, stockings' }
    ]
  }
]

// 自由输入的中文 → 英文标签（自动翻译）
export function translateRequestToTags(request = '') {
  const hits = []
  for (const cat of PROMPT_CATEGORIES) {
    for (const item of cat.items) {
      if (item.re.test(request)) hits.push(item.tags)
    }
  }
  return hits.join(', ')
}

// 菜单选中的 key → 英文标签
export function tagsForKeys(keys = []) {
  const hits = []
  for (const cat of PROMPT_CATEGORIES) {
    for (const item of cat.items) {
      if (keys.includes(item.key)) hits.push(item.tags)
    }
  }
  return hits.join(', ')
}

export function buildImagePrompt(userRequest = '', { loraName = AYAKA_LORA, nsfw = false, keys = [] } = {}) {
  // 裸图时去掉和服/裙子等衣服标签，避免和「脱光」打架
  const base = nsfw ? AYAKA_HAIR_FACE : `${AYAKA_HAIR_FACE}, ${AYAKA_CLOTHING}`
  const parts = [base]
  // 日常模式不注入任何 NSFW 标签/翻译，只有私密模式才用提示词菜单
  const selKeys = nsfw ? keys : []
  if (nsfw) parts.push(NSFW_TAGS)
  const keyTags = tagsForKeys(selKeys)
  if (keyTags) parts.push(keyTags)
  const req = String(userRequest || '').trim()
  const mapped = nsfw && req ? translateRequestToTags(req) : ''
  if (mapped) parts.push(mapped)
  // 日常正脸图才加「看镜头」；一旦涉及背面/屁股/裸露，不再锁死朝向
  const wantsRear = /from behind|doggystyle|ass up|anal|rear view|back view|从后面|从背后|背面|背后|背对|屁股|屁眼|翘臀|后入/.test(
    `${keyTags} ${mapped} ${req}`
  )
  if (!nsfw && !wantsRear) parts.push('looking at viewer, smile')
  if (req) {
    parts.push(req) // 原文也保留，交给模型理解
  }
  if (loraName) parts.push(`<lora:${loraName}:0.9>`)
  return parts.join(', ')
}
