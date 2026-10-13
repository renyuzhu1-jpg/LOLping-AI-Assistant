import { describe, expect, it } from 'vitest';
import {
  AI_SKILLS, DEFAULT_AI_SKILL_BINDINGS, isUsefulClipboard, normalizeAiSkillBindings, skillForPing,
} from '../../src/shared/aiCoach';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/shared/settings';

describe('isUsefulClipboard', () => {
  it('rejects short junk and model ids', () => {
    expect(isUsefulClipboard('')).toBe(false);
    expect(isUsefulClipboard('hi')).toBe(false);
    expect(isUsefulClipboard('deepseek-flash')).toBe(false);
    expect(isUsefulClipboard('gpt-4o-mini')).toBe(false);
    expect(isUsefulClipboard('sk-abc1234567890123')).toBe(false);
    expect(isUsefulClipboard('https://api.deepseek.com')).toBe(false);
    expect(isUsefulClipboard('deepseek-flash', 'deepseek-flash')).toBe(false);
  });

  it('accepts real study passages', () => {
    const passage = '企业化经营何以推动新型农村集体经济有效运行？基于甘肃省前进牧业的案例研究。';
    expect(isUsefulClipboard(passage)).toBe(true);
  });
});

describe('ai coach defaults', () => {
  it('defaults to screen context', () => {
    expect(DEFAULT_SETTINGS.aiContextMode).toBe('screen');
    expect(normalizeSettings({}).aiContextMode).toBe('screen');
    expect(normalizeSettings({ aiContextMode: 'auto' }).aiContextMode).toBe('auto');
  });

  it('defaults skill bindings and allows unbinding', () => {
    expect(DEFAULT_SETTINGS.aiSkillBindings.assist).toBe('chatReply');
    expect(normalizeSettings({}).aiSkillBindings.assist).toBe('chatReply');
    expect(normalizeSettings({ aiSkillBindings: {} }).aiSkillBindings).toEqual({});
    expect(skillForPing(DEFAULT_AI_SKILL_BINDINGS, 'assist')).toBe('chatReply');
    expect(skillForPing({}, 'assist')).toBeNull();
    expect(normalizeAiSkillBindings({ assist: 'chatReply', danger: 'nope' }).danger).toBeUndefined();
    expect(AI_SKILLS.some((s) => s.id === 'chatReply')).toBe(true);
  });
});
