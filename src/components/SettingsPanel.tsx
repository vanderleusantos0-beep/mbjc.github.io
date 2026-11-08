import { Volume2 } from 'lucide-react';
import { useT } from '../i18n';
import type { Settings } from '../settings';
import { fmt } from '../util';
import { Modal, Seg, SettingRow } from './ui';

interface Props {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  voices: SpeechSynthesisVoice[];
  onTest: () => void;
  onClose: () => void;
}

export default function SettingsPanel({ s, set, voices, onTest, onClose }: Props) {
  const { t } = useT();
  const toggle = (on: boolean, onChange: (v: boolean) => void) => (
    <Seg value={on ? 'on' : 'off'} options={[{ v: 'on', label: t('on') }, { v: 'off', label: t('off') }]} onChange={(v) => onChange(v === 'on')} />
  );

  return (
    <Modal title={t('set.title')} onClose={onClose}>
      <SettingRow label={t('set.language')}>
        <Seg value={s.lang} options={[{ v: 'de', label: '🇩🇪 Deutsch' }, { v: 'en', label: '🇬🇧 English' }]} onChange={(lang) => set({ lang, voiceURI: '' })} />
      </SettingRow>
      <SettingRow label={t('set.speedUnit')}>
        <Seg value={s.speedUnit} options={[{ v: 'kmh', label: 'km/h' }, { v: 'mph', label: 'mph' }]} onChange={(speedUnit) => set({ speedUnit })} />
      </SettingRow>
      <SettingRow label={t('set.distUnit')}>
        <Seg value={s.distUnit} options={[{ v: 'km', label: s.lang === 'de' ? 'Kilometer' : 'Kilometres' }, { v: 'mi', label: s.lang === 'de' ? 'Meilen' : 'Miles' }]} onChange={(distUnit) => set({ distUnit })} />
      </SettingRow>
      <SettingRow label={t('set.voice')}>{toggle(s.voiceOn, (voiceOn) => set({ voiceOn }))}</SettingRow>
      <SettingRow label={t('set.volume')}>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: +e.target.value })} className="w-40 accent-cyan-400" />
          <span className="w-10 text-right tabular-nums">{fmt(s.volume * 100, 0, s.lang)}%</span>
        </div>
      </SettingRow>
      <SettingRow label={t('set.voiceSel')}>
        <div className="flex items-center gap-2">
          <select value={s.voiceURI} onChange={(e) => set({ voiceURI: e.target.value })} className="max-w-[200px] rounded-xl border border-cy/30 bg-bg px-3 py-2 text-sm text-ink">
            <option value="">{t('set.voiceAuto')}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </select>
          <button className="btn !px-3 !py-2" onClick={onTest} aria-label={t('set.test')} title={t('set.test')}>
            <Volume2 size={18} />
          </button>
        </div>
      </SettingRow>
      <SettingRow label={t('set.brightness')}>
        <div className="flex items-center gap-3">
          <input type="range" min={0.5} max={1.1} step={0.05} value={s.brightness} onChange={(e) => set({ brightness: +e.target.value })} className="w-40 accent-cyan-400" />
          <span className="w-10 text-right tabular-nums">{fmt(s.brightness * 100, 0, s.lang)}%</span>
        </div>
      </SettingRow>
      <SettingRow label={t('set.dark')}>{toggle(s.dark, (dark) => set({ dark }))}</SettingRow>
      <SettingRow label={t('set.fullRange')} hint={t('set.fullRangeNote')}>
        <div className="flex items-center gap-2">
          <input type="number" min={5} max={200} value={s.fullRangeKm} onChange={(e) => set({ fullRangeKm: Math.max(5, Math.min(200, +e.target.value || 25)) })} className="w-20 rounded-xl border border-cy/30 bg-bg px-3 py-2 text-right text-ink" />
          <span className="text-mute">km</span>
        </div>
      </SettingRow>
      <SettingRow label={t('set.wheel')} hint={t('set.wheelNote')}>
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={2500} value={s.wheelMm || ''} placeholder="0" onChange={(e) => set({ wheelMm: Math.max(0, Math.min(2500, Math.round(+e.target.value || 0))) })} className="w-24 rounded-xl border border-cy/30 bg-bg px-3 py-2 text-right text-ink" />
          <span className="text-mute">mm</span>
        </div>
      </SettingRow>
      <SettingRow label={t('set.home')}>
        <div className="flex items-center gap-2">
          <span className="max-w-[180px] truncate text-sm text-mute">{s.home ? s.home.label : t('set.homeNone')}</span>
          {s.home && (
            <button className="btn !px-3 !py-2 text-sm" onClick={() => set({ home: null })}>
              {t('set.homeClear')}
            </button>
          )}
        </div>
      </SettingRow>
    </Modal>
  );
}
