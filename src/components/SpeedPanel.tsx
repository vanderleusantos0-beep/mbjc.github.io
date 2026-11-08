import type { DriveMode, Reading, SpeedUnit } from '../types';
import { useT } from '../i18n';
import { fmt, speedLabel, speedOf } from '../util';
import { SourceTag } from './ui';

const MODES: DriveMode[] = ['ECO', 'NORMAL', 'SPORT'];
const R = 118;
const C = 2 * Math.PI * R;
const ARC = C * 0.75;

export default function SpeedPanel(props: {
  speed: Reading<number>;
  mode: Reading<DriveMode>;
  unit: SpeedUnit;
  demo: boolean;
  onDemoMode: (m: DriveMode) => void;
}) {
  const { t, lang } = useT();
  const { speed, mode, unit } = props;
  const shown = speed.value != null ? speedOf(speed.value, unit) : null;
  const scaleMax = unit === 'mph' ? 20 : 30;
  const ratio = shown != null ? Math.min(1, shown / scaleMax) : 0;

  return (
    <section className="panel flex flex-col items-center p-4">
      <h2 className="label mb-1">{t('speed.title')}</h2>
      <div className="relative aspect-square w-full max-w-[300px]">
        <svg viewBox="0 0 280 280" className="absolute inset-0 rotate-[135deg]" aria-hidden>
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgb(var(--tq))" />
              <stop offset="100%" stopColor="rgb(var(--cy))" />
            </linearGradient>
          </defs>
          <circle cx="140" cy="140" r={R} fill="none" stroke="rgb(var(--cy) / 0.14)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${ARC} ${C}`} />
          <circle
            cx="140"
            cy="140"
            r={R}
            fill="none"
            stroke="url(#g)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${ARC * ratio} ${C}`}
            style={{ transition: 'stroke-dasharray 0.5s ease', filter: 'drop-shadow(0 0 8px rgb(var(--cy) / 0.8))' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-digi text-[clamp(4rem,12vw,5.5rem)] font-extrabold leading-none text-ink tabular-nums" style={{ textShadow: '0 0 24px rgb(var(--cy) / 0.55)' }}>
            {shown != null ? fmt(shown, 0, lang) : '--'}
          </div>
          <div className="mt-1 text-sm font-semibold tracking-widest text-cy">{speedLabel(unit)}</div>
          <div className="mt-2">
            <SourceTag source={speed.source} />
          </div>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2" role="group" aria-label={props.demo ? t('drive.demoSet') : t('drive.readonly')} title={props.demo ? t('drive.demoSet') : t('drive.readonly')}>
        {MODES.map((m) => {
          const on = mode.value === m;
          return (
            <button
              key={m}
              disabled={!props.demo}
              onClick={() => props.onDemoMode(m)}
              className={`rounded-xl border px-4 py-2 text-xs font-bold tracking-[0.2em] transition disabled:cursor-default ${
                on
                  ? m === 'SPORT'
                    ? 'border-rd/70 bg-rd/20 text-rd shadow-[0_0_14px_rgb(var(--rd)/0.5)]'
                    : m === 'ECO'
                      ? 'border-gn/70 bg-gn/20 text-gn shadow-[0_0_14px_rgb(var(--gn)/0.5)]'
                      : 'border-cy/70 bg-cy/20 text-cy shadow-[0_0_14px_rgb(var(--cy)/0.5)]'
                  : 'border-mute/30 text-mute/70'
              }`}
            >
              {m}
            </button>
          );
        })}
        <SourceTag source={mode.source} />
      </div>
    </section>
  );
}
