// 朗读前过滤：去掉动作/环境描写等「给眼睛看、不给耳朵听」的内容。
// 支持（）、【】、半角 ()、*斜体动作* 四种写法。
export function stripStageDirections(text) {
  const out = text
    .replace(/（[^（）]*）/g, '')
    .replace(/【[^【】]*】/g, '')
    .replace(/\([^()]*\)/g, '')
    .replace(/\*[^*]*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // 万一整句话都是描写，返回原文兜底，避免没东西可读
  return out || text
}
