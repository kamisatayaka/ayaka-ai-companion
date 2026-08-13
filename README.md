# 神里绫华 · 白鹭公主（AI 桌面陪伴练手项目）

参考米哈游《BSide: Olivia Lin》的「灵魂」思路做的练手项目：一个有人设、像真人朋友一样的 AI 桌面陪伴角色。当前目标是**可运行的角色聊天 MVP**，不做商业化功能。

## 当前进度

**M0~M6 全部完成 ✅**，项目功能：

- Electron + Vite + React 桌面应用，可启动、可构建
- 角色卡 + few-shot 示例对话驱动的 AI 对话（神里绫华：稻妻社奉行神里家大小姐、白鹭公主）
- 聊天界面（消息气泡、打字动画、时间段问候、中文输入法兼容）
- 活人感（随机「思考」延迟、回复逐字显示、安静时绫华主动找话题，不打扰打字/未聚焦状态）
- 语音（Edge TTS 神经语音朗读回复，可自动朗读；语音输入录音转文字，已配硅基流动 SenseVoice）
- 桌面感（系统托盘、透明悬浮球、开机自启）
- 本地历史记录（JSON 文件，重启可续聊，可一键清空）
- 长期记忆（每条消息后自动提炼并记住关于你的重要信息，下次对话自然用上，界面可查看）
- OpenAI 兼容大模型接入（DeepSeek / Kimi / 通义 / Ollama 均可）
- 未配置 API Key 时自动进入本地模拟模式，应用开箱即用

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 桌面壳 | Electron |
| 前端 | React 18 + Vite 6 |
| 样式 | 原生 CSS（暗色系） |
| AI | OpenAI 兼容 Chat Completions API |
| 语音合成 | Edge TTS（`msedge-tts`，免费无需 Key） |
| 语音识别 | OpenAI 兼容 `/audio/transcriptions`（Whisper 类，需自配 Key） |
| 数据 | 本地 JSON（`userData/history.json`） |

## 快速开始

前置要求：Node.js 18+，npm。

**最简单的方式**：双击项目根目录的 [一键启动.bat](./一键启动.bat)，它会自动检查依赖、构建界面并启动应用，出错时窗口会停住显示原因。

如果配置了音色克隆（`.env` 里有 `CLONE_TTS_URL`），一键启动会**自动先启动 GPT-SoVITS 音色服务**并等它就绪，再启动应用；服务没起来会自动回退到晓晓朗读，不影响使用。

**桌面感小贴士**：关闭主窗口 = 最小化到系统托盘（应用不退出）；托盘图标右键可「显示/隐藏主窗口、开关悬浮球、开机自启、退出」；桌面悬浮球点击打开主窗口、按住可拖动。

手动方式：

```bash
# 1. 安装依赖
npm install

# 2. 开发模式（热更新）
npm run dev

# 3. 或：构建后以生产模式运行
npm run build
npm start
```

> 国内网络安装依赖时，如果 Electron 二进制下载报证书错误，先设置镜像再装：
>
> ```powershell
> $env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
> npm install
> ```

## 配置真实模型（可选）

复制 `.env.example` 为 `.env`，填入密钥后重启应用：

```env
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

- 支持任何 OpenAI 兼容接口，换厂商只改 `OPENAI_BASE_URL` 和 `OPENAI_MODEL`。
- 不配置时应用自动进入**本地模拟模式**，界面与流程完全可用，方便先学 UI 和架构。
- `.env` 已加入 `.gitignore`，Key 不会进版本库；Key 只在 Electron 主进程中使用，不暴露给前端。

**语音（可选）**

- **朗读回复**：开箱即用（Edge TTS 免费），可在 `.env` 里改 `TTS_VOICE`（默认 `zh-CN-XiaoxiaoNeural` 晓晓）。
- **自动过滤舞台说明**：朗读时会自动跳过（动作描写）这类括号内容，只读真正的台词，不出戏。
- **音色克隆（进阶）**：想让绫华用「自己的声音」，本地跑 GPT-SoVITS 后配置 `CLONE_TTS_URL`，朗读自动优先用克隆音色、失败回退晓晓。完整步骤见 [音色克隆指南.md](./音色克隆指南.md)。
- **语音输入**：需要一个支持 `/audio/transcriptions` 的 Whisper 兼容 Key（DeepSeek 不支持；可用 OpenAI `whisper-1` 或 Groq `whisper-large-v3`），配置后点输入框旁的 🎤 说话，转写结果填入输入框。

```env
STT_API_KEY=你的语音转写 Key
STT_BASE_URL=https://api.openai.com/v1
STT_MODEL=whisper-1
```

## 项目结构

```
G:\AI-girlfriendplan
├── README.md                  # 本文件
├── 学习日志.md                 # 每一步做了什么 + 独立学习路径（强烈建议阅读）
├── 复刻BSide-Olivia-Lin项目总结.md  # 原始需求文档
├── package.json
├── vite.config.js
├── index.html
├── .env.example               # 模型配置示例
├── electron/
│   ├── main.js                # 主进程：窗口、.env、大模型、本地历史
│   └── preload.cjs            # 预加载：安全暴露 window.api
└── src/
    ├── main.jsx               # React 挂载入口
    ├── App.jsx                # 聊天应用主组件
    ├── styles.css             # 全局样式
    ├── shared/
    │   └── character.js       # 角色卡（人设集中地）
    └── components/
        ├── ChatMessage.jsx    # 单条消息气泡
        └── MessageInput.jsx   # 输入框
```

## 数据存储位置

聊天记录保存在 Electron 的 `userData` 目录下 `history.json`：

```
%APPDATA%\神里绫华 AI 陪伴\history.json
```

长期记忆保存在同一目录下的 `memory.json`。

纯本地存储，无账号、无云同步。

## 关键设计决策

- **角色卡注入**：每次对话把 `src/shared/character.js` 的人设作为 system prompt 发给模型，保证角色一致；改人设只改一个文件。
- **Few-shot 示例**：角色卡里附带 4 条「旅行者问、绫华答」的对话范本，让模型模仿语气而不是只靠抽象描述。
- **长期记忆**：每条用户消息后，后台整理「关于你的重要信息」存入 `memory.json`，下次对话注入；整理时会带上已有记忆做增删对账，避免自相矛盾；记忆有上限，成本可控。
- **成本控制**：上下文只保留最近约 20 轮（40 条消息），防止对话无限膨胀。
- **安全**：`contextIsolation` 开启、`nodeIntegration` 关闭，前端通过 `preload` + IPC 与主进程通信。
- **模拟模式**：无 Key 也能完整跑通，把「联网依赖」和「界面开发」解耦。

## 路线图

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M0 | Electron + React + Vite 骨架 | ✅ |
| M1 | 角色聊天 MVP（角色卡 + 对话 + 本地历史） | ✅ |
| M2 | 长期记忆（提炼用户信息、跨会话注入） | ✅ |
| M3 | 活人感（时段问候、打字动画、随机延迟、主动消息） | ✅ |
| M4 | 语音（Edge TTS 朗读✅、语音输入✅ 需配置 Whisper 接口） | ✅ |
| M6 | 桌面感（悬浮球、托盘、开机自启；动态壁纸已砍） | ✅ |

## 学习指引

如果你想一边做一边学会这套技术栈，请阅读 [学习日志.md](./学习日志.md)：每一步都写明了「做了什么、为什么、怎么独立学会」，并配有官方文档链接和可上手的小练习。
