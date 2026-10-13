import { Button, Dropdown, Option } from '@fluentui/react-components';
import {
  ArrowReset24Regular, Flash24Regular, Link24Regular, LocalLanguage24Regular, Sparkle24Regular,
  Translate24Regular,
} from '@fluentui/react-icons';
import {
  AI_SKILLS, AI_TRANSLATE_LANGS, DEFAULT_AI_SKILL_BINDINGS,
  type AiSkillBindings, type AiSkillId, type AiTranslateLang,
} from '../../../shared/aiCoach';
import { ALL_PINGS, textureUrl, type PingId } from '../../../shared/pings';
import type { Settings } from '../../../shared/settings';
import { useText } from '../text';
import type { Update } from '../useAppState';
import { SettingRow } from './rows';

const NONE = '__none__';

/** Which ping currently triggers this skill (first match). */
function pingForSkill(bindings: AiSkillBindings, skillId: AiSkillId): PingId | null {
  for (const p of ALL_PINGS) {
    if (bindings[p.id] === skillId) return p.id;
  }
  return null;
}

export function SkillsSection({ settings: s, update }: { settings: Settings; update: Update }) {
  const t = useText();
  const off = !s.aiCoachEnabled;
  const bindings = s.aiSkillBindings;

  /** Bind skill → ping (1 skill : 1 ping). Clears the skill from any other ping and replaces that ping’s old skill. */
  const setSkillPing = (skillId: AiSkillId, pingId: PingId | null) => {
    const next: AiSkillBindings = { ...bindings };
    for (const p of ALL_PINGS) {
      if (next[p.id] === skillId) delete next[p.id];
    }
    if (pingId) next[pingId] = skillId;
    void update({ aiSkillBindings: next });
  };

  const setLangA = (lang: AiTranslateLang) => {
    const patch: Partial<Settings> = { aiTranslateLangA: lang };
    if (lang === s.aiTranslateLangB) {
      patch.aiTranslateLangB = lang === 'zh' ? 'en' : 'zh';
    }
    void update(patch);
  };

  const setLangB = (lang: AiTranslateLang) => {
    const patch: Partial<Settings> = { aiTranslateLangB: lang };
    if (lang === s.aiTranslateLangA) {
      patch.aiTranslateLangA = lang === 'zh' ? 'en' : 'zh';
    }
    void update(patch);
  };

  const pingLabel = (id: PingId | typeof NONE): string =>
    id === NONE ? t.skillsNone : t.pingNames[id];

  const langLabel = (id: AiTranslateLang): string => t.translateLangNames[id];

  return (
    <>
      <div className="card notes">
        <span className="icon"><Sparkle24Regular /></span>
        <div className="lbl">
          {t.skillsTitle}
          <span className="desc">{t.skillsDesc}</span>
          {off ? <span className="desc">{t.aiCoachEnabledDesc}</span> : null}
        </div>
      </div>

      <div className="card notes">
        <span className="icon"><Flash24Regular /></span>
        <div className="lbl">
          {t.skillsCatalogTitle}
          {AI_SKILLS.map((sk) => (
            <span key={sk.id} className="desc">
              <b>{t.skillNames[sk.id]}</b>
              {' — '}
              {t.skillDescs[sk.id]}
            </span>
          ))}
        </div>
      </div>

      <div className="card notes">
        <span className="icon"><Translate24Regular /></span>
        <div className="lbl">
          {t.translatePairTitle}
          <span className="desc">{t.translatePairDesc}</span>
        </div>
      </div>
      <SettingRow icon={<LocalLanguage24Regular />} title={t.translateLangA}
        description={`${langLabel(s.aiTranslateLangA)} → ${langLabel(s.aiTranslateLangB)}`} dim={off}>
        <Dropdown
          style={{ minWidth: 160 }}
          value={langLabel(s.aiTranslateLangA)}
          selectedOptions={[s.aiTranslateLangA]}
          disabled={off}
          onOptionSelect={(_, d) => {
            const v = d.optionValue as AiTranslateLang | undefined;
            if (v) setLangA(v);
          }}
        >
          {AI_TRANSLATE_LANGS.map((id) => (
            <Option key={id} value={id} text={langLabel(id)}>{langLabel(id)}</Option>
          ))}
        </Dropdown>
      </SettingRow>
      <SettingRow icon={<LocalLanguage24Regular />} title={t.translateLangB}
        description={`${langLabel(s.aiTranslateLangB)} → ${langLabel(s.aiTranslateLangA)}`} dim={off}>
        <Dropdown
          style={{ minWidth: 160 }}
          value={langLabel(s.aiTranslateLangB)}
          selectedOptions={[s.aiTranslateLangB]}
          disabled={off}
          onOptionSelect={(_, d) => {
            const v = d.optionValue as AiTranslateLang | undefined;
            if (v) setLangB(v);
          }}
        >
          {AI_TRANSLATE_LANGS.map((id) => (
            <Option key={id} value={id} text={langLabel(id)}>{langLabel(id)}</Option>
          ))}
        </Dropdown>
      </SettingRow>

      <div className="card notes">
        <span className="icon"><Link24Regular /></span>
        <div className="lbl" style={{ flex: 1 }}>
          {t.skillsBindTitle}
          <span className="desc">{t.skillsBindDesc}</span>
        </div>
        <div className="ctl">
          <Button
            icon={<ArrowReset24Regular />}
            onClick={() => void update({ aiSkillBindings: { ...DEFAULT_AI_SKILL_BINDINGS } })}
          >
            {t.skillsReset}
          </Button>
        </div>
      </div>

      {AI_SKILLS.map((sk) => {
        const current = pingForSkill(bindings, sk.id);
        const selected = current ?? NONE;
        const ping = current ? ALL_PINGS.find((p) => p.id === current) : undefined;
        return (
          <SettingRow
            key={sk.id}
            icon={
              ping
                ? <img className="skillPingIcon" src={textureUrl(ping.icon)} alt="" />
                : <Flash24Regular />
            }
            title={t.skillNames[sk.id]}
            description={current ? t.pingNames[current] : t.skillsUnbound}
            dim={off}
          >
            <Dropdown
              style={{ minWidth: 200 }}
              value={pingLabel(selected)}
              selectedOptions={[selected]}
              disabled={off}
              onOptionSelect={(_, d) => {
                const v = d.optionValue;
                if (v === NONE) setSkillPing(sk.id, null);
                else if (v) setSkillPing(sk.id, v as PingId);
              }}
            >
              <Option value={NONE} text={t.skillsNone}>{t.skillsNone}</Option>
              {ALL_PINGS.map((p) => (
                <Option key={p.id} value={p.id} text={t.pingNames[p.id]}>
                  {t.pingNames[p.id]}
                </Option>
              ))}
            </Dropdown>
          </SettingRow>
        );
      })}
    </>
  );
}
