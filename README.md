# 神里绫华 · 白鹭公主

一个以「AI 虚拟陪伴」为核心的桌面应用。她会记住你、理解你，用你自己的声音陪你聊天——在系统托盘的角落里，始终等你。

## 功能特性

- **角色化对话**：人设驱动的 AI 聊天（神里绫华：稻妻社奉行神里家大小姐、白鹭公主），支持任意 OpenAI 兼容大模型（DeepSeek / Kimi / 通义 / Ollama 等）
- **长期记忆**：自动提炼并分类记住关于你的重要信息（身份 / 喜好 / 日期 / 关系 / 状态），身份信息「同一项只保留最新一条」，跨会话自然使用
- **活人感**：打字机逐字输出、随机思考延迟、安静时主动找话题、时间段问候
- **语音朗读**：神经语音朗读回复，文字与语音同步呈现；自动跳过（动作描写）等舞台说明
- **音色克隆**：接入本地 GPT-SoVITS，让角色用定制音色说话（部署见 [语音克隆部署指南](./语音克隆部署指南.md)）
- **语音输入**：录音转文字（Whisper 兼容接口），说话即可输入
- **桌面体验**：系统托盘、透明悬浮球、开机自启、关闭即最小化
- **本地优先**：全部数据存储在本机，无账号、无云同步

## 技术架构

| 模块 | 技术 |
| --- | --- |
| 桌面壳 | Electron |
| 前端 | React 18 + Vite 6 |
| 样式 | 原生 CSS（暗色主题） |
| 对话模型 | OpenAI 兼容 Chat Completions API |
| 语音合成 | Edge TTS + 本地 GPT-SoVITS 音色克隆 |
| 语音识别 | OpenAI 兼容 `/audio/transcriptions`（Whisper 类） |
| 数据 | 本地 JSON（`history.json` / `memory.json`） |

## 快速开始

前置要求：Node.js 18+，npm。

**一键启动**：双击 [一键启动.bat](./一键启动.bat)——自动检查依赖、构建界面、拉起后台音色服务（若已配置）并启动应用；启动器完成后自动关闭，全程只有一个应用窗口。

手动方式：

```bash
npm install
npm run dev        # 开发模式（热更新）
npm run build      # 构建
npm start          # 生产模式运行
```

> 国内网络安装依赖时，若 Electron 二进制下载报证书错误，先设置镜像再安装：
>
> ```powershell
> $env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
> npm install
> ```

## 模型配置

复制 `.env.example` 为 `.env` 并填写：

```env
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

- 兼容任意 OpenAI 风格接口，切换厂商只需修改 `OPENAI_BASE_URL` 与 `OPENAI_MODEL`；
- 未配置密钥时自动进入**本地演示模式**，全部交互流程可完整体验；
- `.env` 已加入 `.gitignore`，密钥不会进入版本库，且只在主进程中使用。

## 语音能力

- **朗读回复**：开箱即用（Edge TTS），可在 `.env` 中指定 `TTS_VOICE`；
- **自动朗读**：默认开启，文字与语音同步呈现；
- **音色克隆**：本地部署 GPT-SoVITS 后配置 `CLONE_TTS_URL`，朗读自动优先使用克隆音色，服务不可用时优雅回退（详见 [语音克隆部署指南](./语音克隆部署指南.md)）；
- **语音输入**：配置 Whisper 兼容接口后，点击输入框旁的 🎤 说话即可转文字。

```env
STT_API_KEY=你的语音转写 Key
STT_BASE_URL=https://api.openai.com/v1
STT_MODEL=whisper-1
```

## 桌面体验

- 关闭主窗口 = 最小化到系统托盘（应用不退出）；
- 托盘图标右键可管理：显示 / 隐藏主窗口、桌面悬浮球开关、开机自启、退出；
- 桌面悬浮球：点击唤起主窗口，按住可拖动位置。

## 项目结构

```
├── README.md                    # 项目说明（本文件）
├── 语音克隆部署指南.md           # 音色克隆部署文档
├── package.json
├── vite.config.js
├── index.html                   # 主窗口页面
├── floating.html / floating.js  # 桌面悬浮球页面
├── .env.example                 # 配置模板
├── electron/
│   ├── main.js                  # 主进程：窗口、托盘、模型调用、数据存储
│   └── preload.cjs              # 预加载：安全暴露 window.api
├── src/
│   ├── App.jsx                  # 应用主组件
│   ├── styles.css
│   ├── shared/                  # 角色卡、记忆、语音过滤等共享逻辑
│   └── components/              # 消息、输入等组件
├── assets/                      # 托盘图标等资源
└── scripts/                     # 测试与验证脚本
```

## 数据与隐私

- 聊天记录与长期记忆保存在应用数据目录（`%APPDATA%\神里绫华 AI 陪伴\`），纯本地存储；
- 写入前自动备份（`.bak`），关键记忆带保护锁，防误删；
- 无账号体系、无遥测、无云同步。

## 设计要点

- **角色卡注入**：人设集中管理，每次对话注入 system prompt，保证角色一致性；
- **Few-shot 引导**：附带对话范本，让模型模仿语气而非抽象描述；
- **记忆结构化**：分类存储 + 身份信息最新为准 + 自动去重；
- **成本控制**：上下文仅保留最近约 20 轮，记忆有上限；
- **安全**：`contextIsolation` 开启、`nodeIntegration` 关闭，前端经 IPC 与主进程通信。

## 路线图

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| 对话 | 角色卡驱动聊天、本地历史、few-shot 引导 | ✅ |
| 记忆 | 分类长期记忆、跨会话注入、防冲突 | ✅ |
| 活人感 | 打字机、随机延迟、主动消息、时段问候 | ✅ |
| 语音 | 朗读、音色克隆、语音输入、文字语音同步 | ✅ |
| 桌面 | 托盘、悬浮球、开机自启 | ✅ |
