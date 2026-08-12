# voice-clone：绫华音色克隆工作区

> 当前状态：**环境 100% 就绪，只差参考音频**。具体步骤见项目根目录的 [音色克隆指南.md](../音色克隆指南.md)。

## 已完成（全部验证通过）

- [x] 克隆 GPT-SoVITS 仓库到 `GPT-SoVITS/`
- [x] 创建 Python 3.12 虚拟环境 `venv/`
- [x] 安装中文合成所需依赖（`requirements-cn.txt`，含 Python 3.12 兼容补丁）
- [x] 下载 v2 预训练模型：
  - `GPT-SoVITS/GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/`（GPT + SoVITS）
  - `.../chinese-hubert-base/`、`.../chinese-roberta-wwm-ext-large/`
- [x] 下载并解压 G2PW（中文多音字模型）→ `GPT-SoVITS/GPT_SoVITS/text/G2PWModel/`
- [x] 下载 `ffmpeg.exe` / `ffprobe.exe` → `GPT-SoVITS/` 根目录
- [x] CUDA 版 torch（`2.11.0+cu128`），实测 `torch.cuda.is_available() = True`（RTX 3050）
- [x] `api_v2.py` 启动验证：模型全部加载成功，服务监听 `127.0.0.1:9880`
- [x] 12 分钟长音频已切片为 **140 段**（`slices/*.wav`，3~20 秒）
- [x] SenseVoice 自动转写完成，清单在 `slices/manifest.txt`（文件名 + 文字）
- [x] 转写模型本地化（`asr-models/SenseVoiceSmall`），不再依赖在线下载

## 你只需要做

1. 打开 `slices/manifest.txt`，**挑 1~3 段**台词干净、人声清晰的（3~15 秒最佳）；
2. **校对文字**：ASR 可能有错字，`prompt_text` 必须和音频说的完全一致，否则影响音色质量；
3. 启动服务（保持窗口开着）：

```powershell
cd G:\AI-girlfriendplan\voice-clone
.\venv\Scripts\python.exe GPT-SoVITS\api_v2.py
```

4. 编辑 `G:\AI-girlfriendplan\.env`，把 `CLONE_TTS_URL` 配上参考音频（`\` 写 `%5C`，`:` 写 `%3A`）：

```env
CLONE_TTS_URL=http://127.0.0.1:9880/tts?ref_audio_path=你的参考音频绝对路径&prompt_text=这段音频的原文
```

5. 重启应用，点绫华消息下的「🔊 朗读」试听。

> 换参考音频不用重启服务：先 `GET http://127.0.0.1:9880/set_refer_audio?ref_audio_path=新路径&prompt_text=新原文&prompt_lang=zh` 再试。

## 备注

- 参考音频路径里的 `\` 要写成 `%5C`，`:` 写成 `%3A`；建议用英文路径。
- 克隆服务没启动时，应用会自动回退到晓晓（Edge TTS），不影响使用。
- 服务必须保持运行（一键启动 bat 会自动拉起；手动运行时别关那个窗口）。

## 环境修补记录（遇到同类问题可参考）

- **torchcodec 报错**：torchaudio 2.11 默认用 TorchCodec 解码，需要 FFmpeg 共享 DLL；已给 `GPT_SoVITS/TTS_infer_pack/TTS.py` 打补丁，加载参考音频失败时自动回退 soundfile（纯 Python，无需额外 DLL）。
- **fast_langdetect 缓存目录缺失**：首次合成报 `Cache directory not found`，创建 `GPT_SoVITS/pretrained_models/fast_langdetect/` 后自动下载模型。
- **G2PW 目录多套一层**：zip 解压后是 `G2PWModel/G2PWModel/`，需把内容上移一层，否则报找不到 `config.py`。
