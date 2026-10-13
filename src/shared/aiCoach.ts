import { ALL_PINGS, type PingId } from './pings';

/** How the coach gathers what you were looking at. */
export type AiContextMode = 'auto' | 'clipboard' | 'screen';
export const AI_CONTEXT_MODES: readonly AiContextMode[] = ['auto', 'clipboard', 'screen'];

/**
 * Built-in skills. Add a new entry here (and i18n + prompt branch) to ship a skill;
 * users bind it to any ping in the Skills tab.
 */
export type AiSkillId =
  | 'explain'
  | 'background'
  | 'trap'
  | 'nextStep'
  | 'checkIn'
  | 'chatReply'
  | 'translate'
  | 'formula'
  | 'deepDive'
  | 'devil'
  | 'quiz';

/** Runtime behaviour family for capture / prompts. */
export type AiSkillKind = 'study' | 'chat' | 'translate' | 'formula';

export interface AiSkillDef {
  id: AiSkillId;
  kind: AiSkillKind;
}

/** Ordered catalog shown in the Skills tab. Append new skills at the end. */
export const AI_SKILLS: readonly AiSkillDef[] = [
  { id: 'explain', kind: 'study' },
  { id: 'background', kind: 'study' },
  { id: 'trap', kind: 'study' },
  { id: 'nextStep', kind: 'study' },
  { id: 'checkIn', kind: 'study' },
  { id: 'chatReply', kind: 'chat' },
  { id: 'translate', kind: 'translate' },
  { id: 'formula', kind: 'formula' },
  { id: 'deepDive', kind: 'study' },
  { id: 'devil', kind: 'study' },
  { id: 'quiz', kind: 'study' },
];

/**
 * Languages for the Translate skill pair (A ↔ B).
 * Detect side A → translate to B; detect side B → translate to A.
 */
export type AiTranslateLang =
  | 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'ru' | 'pt' | 'vi' | 'th' | 'ar' | 'it' | 'id';

export const AI_TRANSLATE_LANGS: readonly AiTranslateLang[] = [
  'zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'vi', 'th', 'ar', 'it', 'id',
];

export const isAiTranslateLang = (v: unknown): v is AiTranslateLang =>
  typeof v === 'string' && (AI_TRANSLATE_LANGS as readonly string[]).includes(v);

/** English names used in API prompts (stable, not UI locale). */
export const AI_TRANSLATE_LANG_EN: Record<AiTranslateLang, string> = {
  zh: 'Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
  pt: 'Portuguese',
  vi: 'Vietnamese',
  th: 'Thai',
  ar: 'Arabic',
  it: 'Italian',
  id: 'Indonesian',
};

export const AI_SKILL_IDS: readonly AiSkillId[] = AI_SKILLS.map((s) => s.id);

export const isAiSkillId = (v: unknown): v is AiSkillId =>
  typeof v === 'string' && (AI_SKILL_IDS as readonly string[]).includes(v);

export function skillDef(id: AiSkillId): AiSkillDef {
  return AI_SKILLS.find((s) => s.id === id) ?? AI_SKILLS[0];
}

/** Ping → skill. Missing / invalid keys mean “no skill” for that ping. */
export type AiSkillBindings = Partial<Record<PingId, AiSkillId>>;

/** Sensible starter map (matches the old hard-coded ping → coach moves). */
export const DEFAULT_AI_SKILL_BINDINGS: AiSkillBindings = {
  missing: 'explain',
  needvision: 'background',
  danger: 'trap',
  push: 'nextStep',
  omw: 'checkIn',
  assist: 'chatReply',
  allin: 'deepDive',
  enemyvision: 'devil',
  bait: 'quiz',
};

export function normalizeAiSkillBindings(raw: unknown): AiSkillBindings {
  const out: AiSkillBindings = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_AI_SKILL_BINDINGS };
  }
  const obj = raw as Record<string, unknown>;
  for (const ping of ALL_PINGS) {
    const v = obj[ping.id];
    if (v === null || v === '' || v === 'none' || v === 'off') continue;
    if (isAiSkillId(v)) out[ping.id] = v;
  }
  return out;
}

export function skillForPing(bindings: AiSkillBindings, pingId: PingId): AiSkillId | null {
  const id = bindings[pingId];
  return id && isAiSkillId(id) ? id : null;
}

export const AI_REPLY_MAX = 800;

/**
 * Clipboard text that looks like leftover setup junk (API keys, model ids) must not replace the screen.
 * Real passages for study are usually longer and don't look like config tokens.
 */
export function isUsefulClipboard(text: string, modelHint = ''): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (/^sk-[A-Za-z0-9_\-]{8,}/i.test(t)) return false;
  if (/^https?:\/\/\S+$/i.test(t)) return false;
  const model = modelHint.trim().toLowerCase();
  if (model && t.toLowerCase() === model) return false;
  // Short lines that are mostly model / vendor tokens (e.g. "deepseek-flash" copied from settings).
  if (t.length <= 64 && /^(deepseek|gpt|claude|qwen|moonshot|glm|o1|o3)[\w.\-:/]*$/i.test(t)) return false;
  if (t.length <= 48 && /(api[_-]?key|bearer\s|openai|anthropic)/i.test(t)) return false;
  return true;
}

export function isAiContextMode(v: unknown): v is AiContextMode {
  return typeof v === 'string' && (AI_CONTEXT_MODES as readonly string[]).includes(v);
}
