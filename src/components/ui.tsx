import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Key } from '../i18n';
import { useT } from '../i18n';
import type { Source } from '../types';

const STYLE: Record<Source, string> = {
  device: 'text-gn border-gn/50',
  calculated: 'text-am border-am/50',
  simulated: 'text-am border-am/50',
  gps: 'text-cy border-cy/50',
  unavailable: 'text-mute border-mute/40',
};

export function SourceTag({ source }: { source: Source }) {
  const { t } = useT();
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold tracking-widest ${STYLE[source]}`}>
      {t(`src.${source}` as Key)}
    </span>
  );
}

export function Row({ label, children, tag }: { label: string; children: ReactNode; tag?: Source }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-mute">{label}</span>
      <span className="flex items-center gap-2 text-right font-semibold tabular-nums">
        {children}
        {tag && <SourceTag source={tag} />}
      </span>
    </div>
  );
}

export function Panel({ title, icon, children, className = '' }: { title?: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 ${className}`}>
      {title && (
        <h2 className="label mb-2 flex items-center gap-2">
          {icon}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="panel flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-b-none bg-bg/95 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-cy/20 px-5 py-4">
          <h2 className="font-digi text-sm font-extrabold tracking-[0.2em] text-cy">{title}</h2>
          <button className="rounded-xl p-2 text-mute hover:text-ink" onClick={onClose} aria-label={t('set.close')}>
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-2xl border border-cy/30 bg-bg/60 p-1">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${value === o.v ? 'bg-cy text-bg shadow-[0_0_16px_rgb(var(--cy)/0.5)]' : 'text-mute hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cy/10 py-3 last:border-0">
      <div className="min-w-0">
        <div className="font-semibold">{label}</div>
        {hint && <div className="text-xs text-mute">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
