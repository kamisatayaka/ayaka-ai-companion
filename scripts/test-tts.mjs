// 验证 Edge TTS 合成：运行 node scripts/test-tts.mjs（需要联网）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { stripStageDirections } from '../src/shared/ttsFilter.js'

console.log('=== 0. 舞台说明过滤测试 ===')
const sample = '（指尖在杯沿轻轻一划）真拿你没办法。我爱你。【内心：无奈】*她低头笑了笑*'
console.log('过滤后:', stripStageDirections(sample))

const tts = new MsEdgeTTS()
console.log('[1] 开始 setMetadata...')
await tts.setMetadata('zh-CN-XiaoxiaoNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
console.log('[2] setMetadata 完成，开始 toFile...')
const t0 = Date.now()
const { audioFilePath } = await tts.toFile(os.tmpdir(), '旅行者，夜深了，我在庭院里看雨。要一起喝杯茶吗？', {
  rate: '+10%'
})
console.log('[3] toFile 完成，耗时:', ((Date.now() - t0) / 1000).toFixed(1) + ' 秒')
const buf = fs.readFileSync(audioFilePath)
console.log('音频大小:', buf.length, 'bytes')
console.log('MP3 头:', buf.slice(0, 3).toString('hex'))
