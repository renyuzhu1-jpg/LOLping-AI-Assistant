import { clipboard, desktopCapturer, nativeImage, screen, type NativeImage } from 'electron';
import {
  AI_REPLY_MAX, AI_TRANSLATE_LANG_EN, isUsefulClipboard, skillDef, skillForPing,
  type AiSkillId, type AiTranslateLang,
} from '../shared/aiCoach';
import type { Strings } from '../shared/i18n';
import type { PingId } from '../shared/pings';
import type { Settings } from '../shared/settings';
import type { OverlayManager, SharedPing } from './overlayManager';

/** Tight crop half-size around the ping (CSS px) — the only region the answer should cover. */
const FOCUS_HALF = 220;
/** Wider crop for chat-reply skill (needs more of the thread). */
const CHAT_FOCUS_HALF = 380;
/** Longest edge for images sent to the API (keeps base64 small so vision models accept them). */
const MAX_EDGE = 1400;
const JPEG_QUALITY = 78;

export interface AiCoachDeps {
  getSettings(): Settings;
  text(): Strings;
  overlays: OverlayManager;
}

type ContextSource = 'screen' | 'clipboard' | 'both';

interface CoachContext {
  text: string;
  /** Full-page JPEG with a red focus ring at the ping. */
  pageJpeg: Buffer | null;
  /** Tight crop JPEG around the ping. */
  focusJpeg: Buffer | null;
  /** Ping position on the page image, 0–100. */
  focusPct: { x: number; y: number } | null;
  source: ContextSource;
}

/** Desktop AI assist: ping → screen crop → bubble reply. */
export class AiCoach {
  private seq = 0;

  constructor(private readonly deps: AiCoachDeps) {}

  onLocalPing(p: SharedPing): void {
    const s = this.deps.getSettings();
    if (!s.aiCoachEnabled) return;
    const skillId = skillForPing(s.aiSkillBindings, p.id);
    if (!skillId) return;
    const runId = ++this.seq;
    void this.run(runId, p, skillId).catch((err) => console.warn('[ai-coach]', err));
  }

  private async run(runId: number, p: SharedPing, skillId: AiSkillId): Promise<void> {
    const s = this.deps.getSettings();
    const t = this.deps.text();
    const ms = s.aiBubbleSeconds * 1000;
    const skill = skillDef(skillId);
    const title = t.aiBubbleTitle(t.skillNames[skillId]);

    const thinking = skill.kind === 'chat'
      ? t.aiThinkingChat
      : skill.kind === 'translate'
        ? t.aiThinkingTranslate
        : skill.kind === 'formula'
          ? t.aiThinkingFormula
          : t.aiThinking;
    // ms: 0 = sticky until the reply bubble replaces it (hover still works on the reply).
    this.deps.overlays.aiBubble(p.displayId, {
      x: p.x, y: p.y, title, body: thinking, pingId: p.id, ms: 0,
    });

    const wideFocus = skill.kind === 'chat' || skill.kind === 'translate' || skill.kind === 'formula';
    const ctx = await this.gatherContext(s, p, wideFocus);
    if (runId !== this.seq) return;
    if (!ctx.text && !ctx.pageJpeg && !ctx.focusJpeg) {
      this.deps.overlays.aiBubble(p.displayId, {
        x: p.x, y: p.y, title, body: t.aiErrNoContext, pingId: p.id, ms,
      });
      return;
    }

    const reply = s.aiApiKey.trim()
      ? await this.callApi(s, skillId, p.id, ctx).catch((err) => {
        console.warn('[ai-coach] api', err);
        return null;
      })
      : offlineReply(skillId, ctx.text, t, s.aiTranslateLangA, s.aiTranslateLangB);

    if (runId !== this.seq) return;
    const raw = (reply ?? t.aiErrRequest).slice(0, AI_REPLY_MAX);
    const body = withSourcePrefix(raw, ctx.source, t);
    this.deps.overlays.aiBubble(p.displayId, { x: p.x, y: p.y, title, body, pingId: p.id, ms });
  }

  private async gatherContext(s: Settings, p: SharedPing, wideFocus: boolean): Promise<CoachContext> {
    const mode = s.aiContextMode;
    const rawClip = await clipboardText();
    const clip = isUsefulClipboard(rawClip, s.aiModel) ? rawClip.trim() : '';

    if (mode === 'clipboard') {
      return { text: clip, pageJpeg: null, focusJpeg: null, focusPct: null, source: 'clipboard' };
    }

    const shot = await captureScreenBundle(this.deps.overlays, p.displayId, p.x, p.y, wideFocus);
    const hasScreen = !!(shot?.pageJpeg || shot?.focusJpeg);

    if (mode === 'screen') {
      return {
        text: '',
        pageJpeg: shot?.pageJpeg ?? null,
        focusJpeg: shot?.focusJpeg ?? null,
        focusPct: shot?.focusPct ?? null,
        source: 'screen',
      };
    }

    // auto: screen first; clean clipboard is optional supplement
    if (hasScreen && clip) {
      return {
        text: clip,
        pageJpeg: shot!.pageJpeg,
        focusJpeg: shot!.focusJpeg,
        focusPct: shot!.focusPct,
        source: 'both',
      };
    }
    if (hasScreen) {
      return {
        text: '',
        pageJpeg: shot!.pageJpeg,
        focusJpeg: shot!.focusJpeg,
        focusPct: shot!.focusPct,
        source: 'screen',
      };
    }
    if (clip) return { text: clip, pageJpeg: null, focusJpeg: null, focusPct: null, source: 'clipboard' };
    return { text: '', pageJpeg: null, focusJpeg: null, focusPct: null, source: 'screen' };
  }

  private async callApi(s: Settings, skillId: AiSkillId, pingId: PingId, ctx: CoachContext): Promise<string> {
    const t = this.deps.text();
    const kind = skillDef(skillId).kind;
    const chat = kind === 'chat';
    const translate = kind === 'translate';
    const formula = kind === 'formula';
    const system = systemPrompt(skillId, t, s.aiTranslateLangA, s.aiTranslateLangB);
    const pct = ctx.focusPct;
    const userText = chat
      ? chatUserPrompt(skillId, pingId, ctx, pct, t)
      : translate
        ? translateUserPrompt(skillId, pingId, ctx, pct, t, s.aiTranslateLangA, s.aiTranslateLangB)
        : formula
          ? formulaUserPrompt(skillId, pingId, ctx, pct, t)
          : studyUserPrompt(skillId, pingId, ctx, pct, t);

    type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
    const content: Part[] = [{ type: 'text', text: userText }];
    if (ctx.pageJpeg) {
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${ctx.pageJpeg.toString('base64')}` } });
    }
    if (ctx.focusJpeg) {
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${ctx.focusJpeg.toString('base64')}` } });
    }

    const url = `${s.aiApiBase.replace(/\/+$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${s.aiApiKey.trim()}`,
      },
      body: JSON.stringify({
        model: s.aiModel,
        temperature: chat ? 0.55 : translate ? 0.2 : formula ? 0.25 : 0.3,
        max_tokens: chat ? 700 : translate ? 900 : formula ? 700 : 500,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const data = await res.json() as { choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[] };
    const raw = data.choices?.[0]?.message?.content;
    const text = typeof raw === 'string'
      ? raw.trim()
      : Array.isArray(raw)
        ? raw.map((part) => (typeof part === 'object' && part && 'text' in part ? String(part.text ?? '') : '')).join('').trim()
        : '';
    if (!text) throw new Error('empty');
    return text;
  }
}

function sourceLabel(source: ContextSource, t: Strings): string {
  if (source === 'clipboard') return t.aiSourceClipboard;
  if (source === 'both') return t.aiSourceBoth;
  return t.aiSourceScreen;
}

function withSourcePrefix(body: string, source: ContextSource, t: Strings): string {
  const tag = sourceLabel(source, t);
  if (body.startsWith(`【${tag}】`) || body.startsWith(`[${tag}]`)) return body;
  return t.lang === 'zh-CN' ? `【${tag}】${body}` : `[${tag}] ${body}`;
}

async function clipboardText(): Promise<string> {
  try {
    return (await clipboard.readText()).slice(0, 8000);
  } catch {
    return '';
  }
}

function skillMission(skillId: AiSkillId, t: Strings): string {
  return t.skillDescs[skillId];
}

function systemPrompt(
  skillId: AiSkillId,
  t: Strings,
  langA: AiTranslateLang = 'zh',
  langB: AiTranslateLang = 'en',
): string {
  const kind = skillDef(skillId).kind;
  if (kind === 'chat') {
    return [
      'You are lolPing’s chat reply coach. The user pinged a chat window (WeChat / QQ / Discord / Teams / browser chat / game chat / etc.).',
      'You receive a full-screen screenshot (red ring = ping) and a wider crop around that area.',
      'Read the visible conversation near the red ring. Infer who is speaking and what the latest messages ask or imply.',
      'Then suggest short replies the USER can send next — ready to copy/paste, matching tone and language of the chat.',
      'If images are present, you CAN see them; never claim the image failed to load unless both attachments are truly missing.',
      'Never discuss AI model names, API keys, or app settings.',
      `Mission: ${skillMission(skillId, t)}`,
      'No markdown fences. No preamble.',
    ].join(' ');
  }
  if (kind === 'translate') {
    const a = AI_TRANSLATE_LANG_EN[langA];
    const b = AI_TRANSLATE_LANG_EN[langB];
    return [
      'You are lolPing’s screen translator.',
      'You receive a full-screen screenshot (red ring = ping) and a crop around that area.',
      `Configured language pair: ${a} ↔ ${b}.`,
      `Detect which side the focus text is closer to. If it is mainly ${a}, translate into ${b}. If mainly ${b}, translate into ${a}.`,
      'If the text is clearly a third language, still map it to the nearer of the two and translate into the other.',
      'Translate ONLY the text near the red ring / focus crop — not the whole page.',
      'If images are present, you CAN see them; never claim the image failed to load unless both attachments are truly missing.',
      'Never discuss AI model names, API keys, or app settings.',
      `Mission: ${skillMission(skillId, t)}`,
      'No markdown fences. No preamble.',
    ].join(' ');
  }
  if (kind === 'formula') {
    return [
      'You are lolPing’s formula coach for academic papers.',
      'You receive a full-page screenshot (red ring = ping) and a crop around an equation / formula.',
      'Explain ONLY the formula under/near the red ring — not the whole paper.',
      'Read math notation carefully (subscripts, superscripts, Greek letters, operators, fractions, sums, integrals).',
      'If images are present, you CAN see them; never claim the image failed to load unless both attachments are truly missing.',
      'Never discuss AI model names, API keys, or app settings.',
      `Mission: ${skillMission(skillId, t)}`,
      'No markdown fences. No preamble.',
    ].join(' ');
  }
  return [
    'You are lolPing’s desktop study coach. The user pings one small spot they do not understand.',
    'You receive a full-page screenshot (with a red ring) and a tight focus crop.',
    'Answer ONLY about the text under/near the red ring (the focus crop). One short explanation of that fragment — never the whole paper.',
    'If images are present, you CAN see them; never claim the image failed to load unless both attachments are truly missing.',
    'Never discuss AI model names, API keys, or app settings unless that text is literally in the focus crop.',
    `Mission: ${skillMission(skillId, t)}`,
    'No markdown fences. No preamble.',
  ].join(' ');
}

function studyUserPrompt(
  skillId: AiSkillId,
  pingId: PingId,
  ctx: CoachContext,
  pct: { x: number; y: number } | null,
  t: Strings,
): string {
  return [
    `Skill: ${skillId} (${t.skillNames[skillId]})`,
    `Ping: ${pingId} (${t.pingNames[pingId]})`,
    `Context source: ${ctx.source}`,
    ctx.pageJpeg || ctx.focusJpeg
      ? [
        'Two images may be attached:',
        '1) PAGE — full screen/page overview. A bright RED RING marks where the user pinged.',
        pct ? `   The ring centre is about ${pct.x.toFixed(0)}% from the left and ${pct.y.toFixed(0)}% from the top of image 1.` : '',
        '2) FOCUS — a tight crop around that ping (the only text you should explain).',
        'Use PAGE only to know which paper/section this is. Your answer must cover ONLY the 1–3 sentences nearest the red ring / FOCUS crop.',
        'Do NOT summarize the whole abstract or page. Do NOT discuss sidebar AI widgets. Do NOT mention model names or APIs.',
      ].filter(Boolean).join('\n')
      : 'No screen image available.',
    ctx.text.trim()
      ? `Optional clipboard (use only if it matches the focus):\n"""\n${ctx.text.slice(0, 4000)}\n"""`
      : '',
    'Reply in the same language as the on-screen text. ~120 Chinese characters or ~80 English words. Plain language first, then one short tip.',
  ].filter(Boolean).join('\n');
}

function chatUserPrompt(
  skillId: AiSkillId,
  pingId: PingId,
  ctx: CoachContext,
  pct: { x: number; y: number } | null,
  t: Strings,
): string {
  return [
    `Skill: ${skillId} (${t.skillNames[skillId]}) — chat reply mode`,
    `Ping: ${pingId} (${t.pingNames[pingId]})`,
    `Context source: ${ctx.source}`,
    ctx.pageJpeg || ctx.focusJpeg
      ? [
        'Two images may be attached:',
        '1) PAGE — full screen. RED RING = where the user asked for help (usually on a chat thread).',
        pct ? `   Ring centre ≈ ${pct.x.toFixed(0)}% left, ${pct.y.toFixed(0)}% top of image 1.` : '',
        '2) FOCUS — wider crop of the chat near that ping.',
        'Read the last few messages in that chat. Ignore unrelated desktop UI, ads, and sidebars.',
      ].filter(Boolean).join('\n')
      : 'No screen image available.',
    ctx.text.trim()
      ? `Optional clipboard (use only if it is part of this chat):\n"""\n${ctx.text.slice(0, 4000)}\n"""`
      : '',
    [
      'Output format (same language as the chat):',
      '1) One short line: what the other person just asked / the situation (≤30 Chinese chars or ≤15 English words).',
      '2) Then 3 numbered reply suggestions, each one short message ready to send (casual if the chat is casual).',
      'Example shape:',
      '对方在约周末见面。',
      '1. 可以啊，周六下午行吗？',
      '2. 这周末有点满，下周呢？',
      '3. 好呀，你定个时间我来。',
      'If no chat is visible, say so in one line and suggest re-pinging on the chat window.',
    ].join('\n'),
  ].filter(Boolean).join('\n');
}

function formulaUserPrompt(
  skillId: AiSkillId,
  pingId: PingId,
  ctx: CoachContext,
  pct: { x: number; y: number } | null,
  t: Strings,
): string {
  return [
    `Skill: ${skillId} (${t.skillNames[skillId]}) — formula mode`,
    `Ping: ${pingId} (${t.pingNames[pingId]})`,
    `Context source: ${ctx.source}`,
    ctx.pageJpeg || ctx.focusJpeg
      ? [
        'Two images may be attached:',
        '1) PAGE — full paper/screen. RED RING = the formula to explain.',
        pct ? `   Ring centre ≈ ${pct.x.toFixed(0)}% left, ${pct.y.toFixed(0)}% top of image 1.` : '',
        '2) FOCUS — crop around that formula (explain this only).',
        'Use PAGE only for equation number / nearby variable definitions if visible.',
      ].filter(Boolean).join('\n')
      : 'No screen image available.',
    ctx.text.trim()
      ? `Optional clipboard (LaTeX or text of the formula, use if it matches the focus):\n"""\n${ctx.text.slice(0, 4000)}\n"""`
      : '',
    [
      'Output format (same language as the paper’s surrounding prose; prefer Chinese if the UI/paper context is Chinese):',
      '1) One line: plain-language reading of the formula (what it computes / asserts).',
      '2) Bullet-like short lines for key symbols (name = meaning). Skip obvious ones if crowded.',
      '3) One short tip: how this formula connects to the nearest sentence, or a common pitfall.',
      'Keep it compact for an on-screen bubble (~150 Chinese characters or ~100 English words).',
      'If no formula is visible near the ring, say so in one line.',
    ].join('\n'),
  ].filter(Boolean).join('\n');
}

function translateUserPrompt(
  skillId: AiSkillId,
  pingId: PingId,
  ctx: CoachContext,
  pct: { x: number; y: number } | null,
  t: Strings,
  langA: AiTranslateLang,
  langB: AiTranslateLang,
): string {
  const a = AI_TRANSLATE_LANG_EN[langA];
  const b = AI_TRANSLATE_LANG_EN[langB];
  const aUi = t.translateLangNames[langA];
  const bUi = t.translateLangNames[langB];
  return [
    `Skill: ${skillId} (${t.skillNames[skillId]}) — translate mode`,
    `Ping: ${pingId} (${t.pingNames[pingId]})`,
    `Language pair: ${a} (${aUi}) ↔ ${b} (${bUi})`,
    `Context source: ${ctx.source}`,
    ctx.pageJpeg || ctx.focusJpeg
      ? [
        'Two images may be attached:',
        '1) PAGE — full screen. RED RING = the text to translate.',
        pct ? `   Ring centre ≈ ${pct.x.toFixed(0)}% left, ${pct.y.toFixed(0)}% top of image 1.` : '',
        '2) FOCUS — crop around that ping (translate this text only).',
      ].filter(Boolean).join('\n')
      : 'No screen image available.',
    ctx.text.trim()
      ? `Optional clipboard (use only if it matches the focus text):\n"""\n${ctx.text.slice(0, 4000)}\n"""`
      : '',
    [
      'Output format:',
      `1) One short line: detected direction, e.g. "${a} → ${b}" or "${b} → ${a}" (use these English names).`,
      '2) The translation only — faithful, natural, keep numbers/names. No extra commentary.',
      'If no readable text is near the ring, say so in one short line.',
    ].join('\n'),
  ].filter(Boolean).join('\n');
}

function offlineReply(
  skillId: AiSkillId,
  context: string,
  t: Strings,
  langA: AiTranslateLang = 'zh',
  langB: AiTranslateLang = 'en',
): string {
  const snip = context.trim().replace(/\s+/g, ' ').slice(0, 48);
  const hint = snip ? `「${snip}${context.trim().length > 48 ? '…' : ''}」` : '';
  const name = t.skillNames[skillId];
  if (skillDef(skillId).kind === 'chat') {
    return t.lang === 'zh-CN'
      ? `${name}：把信号钉在聊天窗口上，配识图模型后给 3 条建议。${hint}\n(${t.aiOfflineHint})`
      : `${name}: ping a chat window, use a vision model for 3 suggestions. ${hint}\n(${t.aiOfflineHint})`;
  }
  if (skillDef(skillId).kind === 'translate') {
    const pair = `${t.translateLangNames[langA]} ↔ ${t.translateLangNames[langB]}`;
    return t.lang === 'zh-CN'
      ? `${name}（${pair}）：钉在要译的文字上，配识图模型后自动双向翻译。${hint}\n(${t.aiOfflineHint})`
      : `${name} (${pair}): ping the text, use a vision model for A↔B translation. ${hint}\n(${t.aiOfflineHint})`;
  }
  if (skillDef(skillId).kind === 'formula') {
    return t.lang === 'zh-CN'
      ? `${name}：钉在论文公式上，配识图模型后解读含义与符号。${hint}\n(${t.aiOfflineHint})`
      : `${name}: ping a paper formula, use a vision model to explain symbols. ${hint}\n(${t.aiOfflineHint})`;
  }
  return t.lang === 'zh-CN'
    ? `${name}已触发。${hint || '钉点附近'}需要识图模型才能读屏。\n(${t.aiOfflineHint})`
    : `${name} armed. Set a vision model to read the focus crop. ${hint}\n(${t.aiOfflineHint})`;
}

interface ScreenBundle {
  pageJpeg: Buffer | null;
  focusJpeg: Buffer | null;
  focusPct: { x: number; y: number };
}

/** Full display capture → marked page JPEG + tight focus JPEG. */
async function captureScreenBundle(
  overlays: OverlayManager,
  displayId: number,
  cssX: number,
  cssY: number,
  wideFocus = false,
): Promise<ScreenBundle | null> {
  const display = screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  const dipW = display.bounds.width;
  const dipH = display.bounds.height;
  const physW = Math.max(1, Math.round(dipW * scale));
  const physH = Math.max(1, Math.round(dipH * scale));
  const focusHalfCss = wideFocus ? CHAT_FOCUS_HALF : FOCUS_HALF;

  overlays.setCaptureHidden(true);
  try {
    await delay(60);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: physW, height: physH },
    });
    const src = sources.find((s) => s.display_id === String(display.id))
      ?? sources.find((s) => s.display_id === String(displayId))
      ?? sources[0];
    if (!src || src.thumbnail.isEmpty()) return null;

    const full = src.thumbnail;
    const size = full.getSize();
    const sx = size.width / physW;
    const sy = size.height / physH;
    const px = Math.round(cssX * scale * sx);
    const py = Math.round(cssY * scale * sy);
    const focusPct = {
      x: size.width > 0 ? (px / size.width) * 100 : 50,
      y: size.height > 0 ? (py / size.height) * 100 : 50,
    };

    const marked = drawFocusRing(full, px, py);
    const pageJpeg = toApiJpeg(marked);

    const half = Math.round(focusHalfCss * scale * Math.min(sx, sy));
    const fx = Math.max(0, Math.min(size.width - 1, px - half));
    const fy = Math.max(0, Math.min(size.height - 1, py - half));
    const fw = Math.min(half * 2, size.width - fx);
    const fh = Math.min(half * 2, size.height - fy);
    let focusJpeg: Buffer | null = null;
    if (fw >= 24 && fh >= 24) {
      focusJpeg = toApiJpeg(full.crop({ x: fx, y: fy, width: fw, height: fh }));
    }

    if (!pageJpeg && !focusJpeg) return null;
    return { pageJpeg, focusJpeg, focusPct };
  } catch (err) {
    console.warn('[ai-coach] capture failed', err);
    return null;
  } finally {
    overlays.setCaptureHidden(false);
  }
}

/** Resize (if needed) and encode JPEG for vision APIs. */
function toApiJpeg(img: NativeImage): Buffer | null {
  if (img.isEmpty()) return null;
  let out = img;
  const { width, height } = out.getSize();
  const long = Math.max(width, height);
  if (long > MAX_EDGE) {
    const scale = MAX_EDGE / long;
    out = out.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: 'better',
    });
  }
  try {
    const jpeg = out.toJPEG(JPEG_QUALITY);
    return jpeg.length > 0 ? jpeg : null;
  } catch {
    return null;
  }
}

/** Paint a red ring + crosshair on a copy of the bitmap (BGRA). */
function drawFocusRing(img: NativeImage, cx: number, cy: number): NativeImage {
  try {
    const { width, height } = img.getSize();
    const buf = Buffer.from(img.toBitmap());
    const stride = width * 4;
    const radii = [28, 29, 30, 31, 18, 19]; // thick outer ring + inner hint
    const setRed = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const i = y * stride + x * 4;
      buf[i] = 40; // B
      buf[i + 1] = 40; // G
      buf[i + 2] = 255; // R
      buf[i + 3] = 255;
    };
    for (const r of radii) {
      for (let a = 0; a < 360; a += 2) {
        const rad = (a * Math.PI) / 180;
        setRed(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)));
      }
    }
    for (let d = -36; d <= 36; d++) {
      setRed(cx + d, cy);
      setRed(cx, cy + d);
    }
    return nativeImage.createFromBitmap(buf, { width, height });
  } catch (err) {
    console.warn('[ai-coach] mark failed', err);
    return img;
  }
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
