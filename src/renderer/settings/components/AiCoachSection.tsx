import { Dropdown, Input, Option } from '@fluentui/react-components';
import {
  Bot24Regular, Clipboard24Regular, Cloud24Regular, Key24Regular, Timer24Regular, WindowDevTools24Regular,
} from '@fluentui/react-icons';
import type { AiContextMode } from '../../../shared/aiCoach';
import type { Settings } from '../../../shared/settings';
import { useText } from '../text';
import type { Update } from '../useAppState';
import { SettingRow, SliderRow, SwitchRow } from './rows';

export function AiCoachSection({ settings: s, update }: { settings: Settings; update: Update }) {
  const t = useText();
  const off = !s.aiCoachEnabled;
  const contextLabel = (m: AiContextMode): string =>
    m === 'clipboard' ? t.aiContextClipboard : m === 'screen' ? t.aiContextScreen : t.aiContextAuto;

  return (
    <>
      <div className="card notes">
        <span className="icon"><Bot24Regular /></span>
        <div className="lbl">
          {t.aiCoachTitle}
          <span className="desc">{t.aiCoachDesc}</span>
        </div>
      </div>

      <SwitchRow icon={<Bot24Regular />} title={t.aiCoachEnabled} description={t.aiCoachEnabledDesc}
        checked={s.aiCoachEnabled} onChange={(v) => void update({ aiCoachEnabled: v })} />

      <SettingRow icon={<Clipboard24Regular />} title={t.aiContextMode} description={t.aiContextModeDesc} dim={off}>
        <Dropdown
          style={{ minWidth: 260 }}
          value={contextLabel(s.aiContextMode)}
          selectedOptions={[s.aiContextMode]}
          disabled={off}
          onOptionSelect={(_, d) => {
            const v = d.optionValue as AiContextMode | undefined;
            if (v) void update({ aiContextMode: v });
          }}
        >
          <Option value="screen" text={t.aiContextScreen}>{t.aiContextScreen}</Option>
          <Option value="auto" text={t.aiContextAuto}>{t.aiContextAuto}</Option>
          <Option value="clipboard" text={t.aiContextClipboard}>{t.aiContextClipboard}</Option>
        </Dropdown>
      </SettingRow>

      <SettingRow icon={<Cloud24Regular />} title={t.aiApiBase} description={t.aiApiBaseDesc} dim={off}>
        <Input
          style={{ width: 280 }}
          value={s.aiApiBase}
          disabled={off}
          onChange={(_, d) => void update({ aiApiBase: d.value })}
        />
      </SettingRow>
      <SettingRow icon={<Key24Regular />} title={t.aiApiKey} description={t.aiApiKeyDesc} dim={off}>
        <Input
          type="password"
          style={{ width: 280 }}
          value={s.aiApiKey}
          disabled={off}
          placeholder={t.aiApiKeyPlaceholder}
          onChange={(_, d) => void update({ aiApiKey: d.value })}
        />
      </SettingRow>
      <SettingRow icon={<WindowDevTools24Regular />} title={t.aiModel} description={t.aiModelDesc} dim={off}>
        <Input
          style={{ width: 220 }}
          value={s.aiModel}
          disabled={off}
          onChange={(_, d) => void update({ aiModel: d.value })}
        />
      </SettingRow>
      <SliderRow limit="aiBubbleSeconds" icon={<Timer24Regular />} title={t.aiBubbleSeconds}
        description={t.aiBubbleSecondsDesc} value={s.aiBubbleSeconds}
        format={(v) => `${v} s`} onChange={(v) => void update({ aiBubbleSeconds: v })} dim={off} />
    </>
  );
}
