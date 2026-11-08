import { useEffect, useRef, useState } from 'react';
import { Bot, Lock, Mic, MicOff, Send } from 'lucide-react';
import { useT } from '../i18n';
import { Modal } from './ui';

export interface Msg {
  role: 'user' | 'bot';
  text: string;
}

interface Props {
  messages: Msg[];
  moving: boolean;
  listening: boolean;
  micSupported: boolean;
  onAsk: (q: string) => void;
  onMic: () => void;
  onClose: () => void;
}

export default function AssistantPanel(p: Props) {
  const { t } = useT();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [p.messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || p.moving) return;
    p.onAsk(text.trim());
    setText('');
  };
  const chips = [t('ai.q1'), t('ai.q2'), t('ai.q3'), t('ai.q4'), t('ai.q5')];

  return (
    <Modal title={t('ai.title')} onClose={p.onClose}>
      <p className="mb-3 flex gap-2 text-xs text-mute">
        <Bot size={14} className="mt-0.5 shrink-0" /> {t('ai.demoNote')}
      </p>
      <div className="mb-3 flex max-h-[38dvh] min-h-[120px] flex-col gap-2 overflow-y-auto">
        {p.messages.map((m, i) => (
          <div key={i} className={`max-w-[88%] rounded-2xl px-4 py-2 text-sm ${m.role === 'user' ? 'self-end bg-cy/20 text-ink' : 'self-start border border-cy/20 bg-panel/70'}`}>
            {m.text}
          </div>
        ))}
        <div ref={end} />
      </div>

      {!p.moving && (
        <div className="mb-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c} className="rounded-full border border-cy/30 px-3 py-1.5 text-xs text-cy hover:bg-cy/10" onClick={() => p.onAsk(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {p.moving && (
        <p className="mb-2 flex items-center gap-2 text-xs text-am">
          <Lock size={14} /> {t('ai.lockedMoving')}
        </p>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={p.moving}
          placeholder={p.listening ? t('ai.listening') : t('ai.placeholder')}
          className="min-w-0 flex-1 rounded-2xl border border-cy/30 bg-bg/60 px-4 py-3 text-base outline-none placeholder:text-mute focus:border-cy disabled:opacity-50"
        />
        <button type="button" onClick={p.onMic} disabled={!p.micSupported} className={`btn !px-4 ${p.listening ? 'animate-pulse !border-rd !text-rd' : ''}`} aria-label={t('ai.mic')} title={p.micSupported ? t('ai.mic') : t('ai.noMic')}>
          {p.micSupported ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button type="submit" disabled={p.moving || !text.trim()} className="btn !px-4" aria-label={t('ai.send')}>
          <Send size={20} />
        </button>
      </form>
      {!p.micSupported && <p className="mt-2 text-xs text-mute">{t('ai.noMic')}</p>}
    </Modal>
  );
}
