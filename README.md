# LOLping AI Assistant｜随处发信号的桌面 AI 助手

<p align="center">
  <img src="assets/textures/generic_ping.png" width="56" alt="lolPing">
</p>

<p align="center">
  英雄联盟风格的<strong>信号轮盘</strong> + 可自定义的<strong>桌面 AI 辅助</strong><br>
  看论文卡公式、聊微信想不出回复、英文段落要互译——按住快捷键钉一下，屏幕旁直接给你答案。
</p>

<p align="center">
  <a href="https://github.com/renyuzhu1-jpg/LOLping-AI-Assistant/releases/latest"><b>下载 Windows 安装包</b></a>
  ·
  <a href="README.en.md">English</a>
</p>

---

## 缘起

源于在抖音上随手发了条评论，呼声意外很高。自己平时也常查文献，却一直没找到顺手的辅助工具。

本项目基于 GitHub 开源项目 [darrenprx/lolPing](https://github.com/darrenprx/lolPing)（MIT 许可），我在其上增加了桌面 AI 辅助、技能绑定、翻译、公式解释等功能。如有未尽事宜或原作者有异议，请联系删除。欢迎交流想法与建议。

- 上游项目：[https://github.com/darrenprx/lolPing](https://github.com/darrenprx/lolPing)
- 本仓库：[https://github.com/renyuzhu1-jpg/LOLping-AI-Assistant](https://github.com/renyuzhu1-jpg/LOLping-AI-Assistant)

---

## 一句话是什么

**LOLping AI Assistant** 是一款 Windows 桌面小工具：像游戏里一样甩出信号轮盘，把「我想问 / 我想译 / 我想回」钉在屏幕任意位置；再配上 **AI 辅助**，自动看落点附近的画面，在气泡里回复。

不用自己截图、不用切窗口复制粘贴（当然也可以用剪贴板）。

---

## 能解决什么

| 场景 | 怎么用 |
| --- | --- |
| 读知网 / PDF / 网页论文 | 钉在难懂句子或公式上 → 解释、补背景、公式解读 |
| 微信 / QQ 等聊天 | 钉在聊天窗口 → 识别上下文，给 3 条可发送的回复建议 |
| 中英（或其他语言）对照 | 钉在段落上 → 按配置语言对自动互译 |
| 远程协作 / 一起看屏幕 | 进房间，把信号同步给队友（端到端加密） |

---

## 核心能力

### 1. 信号轮盘（随时可用）

- 按住触发键（默认 **Alt**）拖动鼠标 → 打开英雄联盟风格轮盘  
- 危险、推进、正在赶来、请求协助……多种信号，可自定义轮盘  
- 支持表情轮盘、房间同步、开机自启等基础能力  

### 2. AI 辅助（看屏幕、答钉点）

- 开启后：打出**已绑定技能**的信号，就会自动截取钉点附近屏幕并调用大模型  
- 默认看「信号附近屏幕」；气泡可悬停保留、拖选复制（支持 **Ctrl+C** / 复制按钮）  
- 兼容 OpenAI 协议接口（如 DeepSeek 等），API Key 只存在本机  

### 3. 技能系统（自由绑定）

技能是可复用的 AI 动作。在设置 → **技能** 里，把任意技能绑到任意信号。

| 技能 | 做什么 |
| --- | --- |
| 解释钉点 | 只讲红圈附近的一两句话 |
| 补背景 | 补前置概念 |
| 揪坑点 | 指出常见误区 |
| 下一步 | 给可执行的学习动作 |
| 辅导确认 | 短确认你卡在哪 |
| 聊天回复 | 识聊天，给 3 条短回复 |
| 翻译 | 语言 A ↔ 语言 B 自动互译（可配置，默认中英） |
| 公式解释 | 解读论文公式：含义、符号、怎么读 |
| 深入一点 | 再讲深一点（气泡仍保持短） |
| 唱反调 | 审稿人 / 反方视角 |
| 出题考我 | 就刚看的内容出题 |

---

## 快速上手

1. 从 [Releases](https://github.com/renyuzhu1-jpg/LOLping-AI-Assistant/releases) 下载 `lolPing-Setup-*.exe` 并安装  
2. 打开设置 → **AI 辅助**：填写 API 地址、Key、**识图模型**（读屏幕必须用支持视觉的模型）  
3. 打开 **技能**：配置翻译语言对；把「公式解释 / 聊天回复 / 翻译」等绑到你顺手的信号  
4. 按住 **Alt** 拖动 → 选中信号 → 钉在目标上 → 等气泡  

**小提示**

- 气泡**悬停不消失**，移开后按「气泡时长」再消失；可拖选文字后 Ctrl+C，或点「复制」  
- 读屏幕请用识图模型；纯文本模型看不了截图  
- 安装包未做代码签名时，Windows 可能提示「未知发布者」，选「仍要运行」即可  

---

## 开发者运行

```bash
npm install
npm run dev
```

打包 Windows 安装包：

```bash
npm run dist
# 产物：release/lolPing-Setup-<version>.exe
```

更完整的原项目说明见上游仓库，或本仓库的 [English README](README.en.md)。

---

## 隐私说明

- API Key、模型名只保存在本机 `settings.json`，不会发给本项目服务器  
- AI 请求走你自己配置的 API 地址  
- 房间信号与昵称端到端加密；开启互联网中继时，中继看不到信号内容  

---

## 适合谁

- 读论文、写材料时需要「钉一下就讲清楚」的人  
- 聊天场合想快速有几条得体回复的人  
- 喜欢英雄联盟式交互、又想把桌面效率做进一个小轮盘里的人  

---

## 致谢与许可

- 感谢原作者 [Danrui Meng / darrenprx](https://github.com/darrenprx) 开源 [lolPing](https://github.com/darrenprx/lolPing)  
- 本仓库在其 MIT 许可基础上二次开发  
- 有问题或想加新技能，欢迎提 Issue / 讨论  

## 版本

- 产品名：LOLping AI Assistant（基于 lolPing）  
- 当前版本：见 [Releases](https://github.com/renyuzhu1-jpg/LOLping-AI-Assistant/releases) / `package.json`  
- 平台：Windows x64  
- 口号：随处发信号  
