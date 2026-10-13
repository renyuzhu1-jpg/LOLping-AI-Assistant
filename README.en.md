# LOLping AI Assistant

League of Legends–style **signal wheel** + desktop **AI assist**. Pin a signal on anything on screen; the AI looks at the area around the pin and answers in a bubble.

This fork builds on [darrenprx/lolPing](https://github.com/darrenprx/lolPing) (MIT). Extra features: AI vision coach, skill bindings, translate (A↔B), formula explain, bubble hover/copy.

- Upstream: https://github.com/darrenprx/lolPing  
- This repo: https://github.com/renyuzhu1-jpg/LOLping-AI-Assistant  

[中文说明](README.md)

## Quick start

1. Download the installer from [Releases](https://github.com/renyuzhu1-jpg/LOLping-AI-Assistant/releases)  
2. Settings → **AI Assist**: API base URL, key, and a **vision** model  
3. Settings → **Skills**: bind skills to signals; set translate language pair  
4. Hold **Alt**, pick a signal, pin it — wait for the bubble  

```bash
npm install
npm run dev
npm run dist   # → release/lolPing-Setup-<version>.exe
```

## License

MIT, same as upstream. Credit to [Danrui Meng / darrenprx](https://github.com/darrenprx).
