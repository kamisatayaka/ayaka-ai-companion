# Changelog

## [0.1.0] - 2026-08-13

Initial release.

### Added

- Character-driven conversations with any OpenAI-compatible LLM (persona card + few-shot guidance)
- Long-term memory: categorized extraction, latest-value-wins for identity, cross-session injection
- Alive-feeling interactions: typewriter output, thinking delays, proactive messages, time-aware greetings
- Text-to-speech with text-voice synchronization and stage-direction filtering
- Local voice cloning via GPT-SoVITS with graceful fallback
- Speech-to-text voice input (Whisper-compatible)
- Desktop experience: system tray, floating ball, auto-launch, close-to-tray
- One-click launcher: background voice server + single app window
- Local-first storage with automatic backups and protected memories

## [0.2.0] - 2026-08-16

### Added

- Dual persona modes (daily / intimate) with separate prompts, histories and memories
- Local AI image generation via Stable Diffusion WebUI Forge with a built-in prompt library (multi-select tags + CN→EN translation)
- Token-level streaming replies with per-sentence text-voice sync
- Tray option to quit with all background services

### Fixed

- Proactive messages now continue the recent conversation instead of starting from nowhere
- Image generation now frees GPU memory before rendering (4 GB VRAM friendly)
- Prompt direction conflicts (fixed "looking at viewer" forcing front-facing images)
- Multi-body artifacts and missing anatomy tags in NSFW prompts
