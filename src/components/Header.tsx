import { Bot, Lock, Settings, Volume2, VolumeX, Mic } from 'lucide-react';
import { useT } from '../i18n';
import type { AppMode, Lang, LinkInfo } from '../types';

interface Props {
  appMode: AppMode;
  link: LinkInfo;
  lang: Lang;
  voiceOn: boolean;
  moving: boolean;
  listening: boolean;
  micSupported: boolean;
  onMode: (m: AppMode) => void;
  onLang: (l: Lang) => void;
  onVoice: () => void;
  onAssistant: () => void;
  onMic: () => void;
  onSettings: () => void;
}

export default function Header(p: Props) {
  const { t } = useT();
  const pill =
    p.appMode === 'demo'
      ? { txt: t('mode.demo'), cls: 'border-am/60 text-am bg-am/10' }
      : p.link.state === 'connected'
        ? { txt: t('conn.connected'), cls: 'border-gn/60 text-gn bg-gn/10' }
        : p.link.state === 'lost'
          ? { txt: t('conn.lost'), cls: 'border-rd/60 text-rd bg-rd/10 animate-pulse' }
          : p.link.state === 'connecting'
            ? { txt: t('conn.connecting'), cls: 'border-am/60 text-am bg-am/10 animate-pulse' }
            : { txt: t('conn.none'), cls: 'border-mute/40 text-mute' };

  return (
    <header className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-cy/15 font-digi text-lg font-extrabold text-cy shadow-[0_0_18px_rgb(var(--cy)/0.5)]">S</div>
        <div className="font-digi text-base font-extrabold tracking-[0.25em]">{t('brand')}</div>
      </div>

      <div className="flex items-center gap-3" role="group" aria-label={t('mode.switchTitle')}>
        <div className="inline-flex rounded-2xl border border-cy/30 bg-bg/60 p-1">
          {(['demo', 'real'] as AppMode[]).map((m) => (
            <button
              key={m}
              onClick={() => p.onMode(m)}
              className={`rounded-xl px-4 py-2 text-xs font-bold tracking-widest transition ${p.appMode === m ? (m === 'demo' ? 'bg-am text-bg' : 'bg-gn text-bg') : 'text-mute hover:text-ink'}`}
            >
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>
        <span className={`hidden rounded-full border px-3 py-1.5 text-xs font-bold tracking-widest sm:inline ${pill.cls}`}>{pill.txt}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-xl border border-cy/30 bg-bg/60 p-0.5 text-xs font-bold">
          {(['de', 'en'] as Lang[]).map((l) => (
            <button key={l} onClick={() => p.onLang(l)} className={`rounded-lg px-2.5 py-2 ${p.lang === l ? 'bg-cy text-bg' : 'text-mute'}`}>
              {l === 'de' ? '🇩🇪 DE' : '🇬🇧 EN'}
            </button>
          ))}
        </div>
        <button className="btn !px-3 !py-2.5" onClick={p.onVoice} aria-label={p.voiceOn ? t('mute') : t('unmute')} title={p.voiceOn ? t('mute') : t('unmute')}>
          {p.voiceOn ? <Volume2 size={20} /> : <VolumeX size={20} className="text-mute" />}
        </button>
        <button className={`btn !px-3 !py-2.5 ${p.listening ? 'animate-pulse !border-rd !text-rd' : ''}`} onClick={p.onMic} disabled={!p.micSupported} aria-label={t('ai.mic')} title={p.micSupported ? t('ai.mic') : t('ai.noMic')}>
          <Mic size={20} />
        </button>
        <button className="btn !px-3 !py-2.5" onClick={p.onAssistant} aria-label={t('ai.title')} title={t('ai.title')}>
          <Bot size={20} />
        </button>
        <button className="btn !px-3 !py-2.5" onClick={p.onSettings} disabled={p.moving} aria-label={t('set.title')} title={p.moving ? t('set.lockedMoving') : t('set.title')}>
          {p.moving ? <Lock size={20} /> : <Settings size={20} />}
        </button>
      </div>
    </header>
  );
}
