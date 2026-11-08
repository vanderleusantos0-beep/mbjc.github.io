import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Home,
  Loader2,
  Lock,
  Navigation,
  RotateCw,
  Search,
  TriangleAlert,
  Undo2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useT } from '../i18n';
import type { DistUnit, Place } from '../types';
import type { ManeuverKind } from '../nav/routing';
import type { Charger } from '../nav/places';
import { searchPlace } from '../nav/places';
import type { NavStatus } from '../nav/useNavigation';
import { actionText } from '../nav/useNavigation';
import type { Maneuver, RouteData } from '../nav/routing';
import { fmt, fmtClock, fmtDuration, fmtLong } from '../util';
import { Panel, Row } from './ui';
import type { Key } from '../i18n';

export const ICON: Record<ManeuverKind, LucideIcon> = {
  left: CornerUpLeft,
  right: CornerUpRight,
  slight_left: ArrowUpLeft,
  slight_right: ArrowUpRight,
  sharp_left: ArrowLeft,
  sharp_right: ArrowRight,
  uturn: Undo2,
  straight: ArrowUp,
  roundabout: RotateCw,
  arrive: Flag,
};

interface Props {
  status: NavStatus;
  route: RouteData | null;
  dest: Place | null;
  next: { maneuver: Maneuver; distM: number } | null;
  remainingM: number;
  etaTs: number | null;
  rerouting: boolean;
  error: Key | null;
  locked: boolean;
  distUnit: DistUnit;
  home: Place | null;
  batteryPct: number | null;
  fullRangeKm: number;
  chargers: Charger[];
  chargersLoading: boolean;
  pos: { lat: number; lon: number } | null;
  onPlan: (p: Place) => void;
  onStart: () => void;
  onClear: () => void;
  onSaveHome: () => void;
  onLoadChargers: () => void;
  onSetError: (k: Key | null) => void;
}

export default function NavPanel(p: Props) {
  const { t, lang } = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim() || p.locked) return;
    setSearching(true);
    p.onSetError(null);
    try {
      const r = await searchPlace(q.trim(), lang, p.pos ?? undefined);
      setResults(r);
      if (!r.length) p.onSetError('err.noResults');
    } catch {
      p.onSetError('err.search');
    } finally {
      setSearching(false);
    }
  };

  const pick = (pl: Place) => {
    setResults([]);
    setQ('');
    p.onPlan(pl);
  };

  const needPct =
    p.route && p.batteryPct != null ? Math.ceil((p.route.length / 1000 / p.fullRangeKm) * 100) : null;
  const short = needPct != null && p.batteryPct != null && needPct > p.batteryPct;

  /* ---------- aktive Navigation: großes Abbiege-Element ---------- */
  if (p.status === 'active' && p.route) {
    const m = p.next?.maneuver;
    const Icon = m ? ICON[m.kind] : Navigation;
    return (
      <Panel className="border-gn/40 !shadow-[0_0_36px_-10px_rgb(var(--gn)/0.7)]">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-gn/60 bg-gn/15 text-gn shadow-[0_0_24px_rgb(var(--gn)/0.4)]">
            <Icon size={46} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <div className="font-digi text-3xl font-extrabold tabular-nums text-gn">{p.next ? fmtLong(p.next.distM, p.distUnit, lang) : '--'}</div>
            <div className="text-base font-semibold">{m ? actionText(t, m) : ''}</div>
            {m?.street && <div className="truncate text-sm text-mute">{m.street}</div>}
          </div>
        </div>
        {p.rerouting && (
          <p className="mt-2 flex items-center gap-2 text-sm text-am">
            <Loader2 size={16} className="animate-spin" /> {t('nav.rerouting')}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-x-4 border-t border-cy/15 pt-2">
          <Row label={t('nav.remaining')}>{fmtLong(p.remainingM, p.distUnit, lang)}</Row>
          <Row label={t('nav.eta')}>{p.etaTs ? fmtClock(new Date(p.etaTs), lang) : '–'}</Row>
        </div>
        {short && (
          <p className="mt-1 flex gap-2 text-xs text-am">
            <TriangleAlert size={14} className="shrink-0" /> {t('nav.batteryShort')}
          </p>
        )}
        <button className="btn mt-3 w-full border-rd/50 bg-rd/10 !text-rd" onClick={p.onClear}>
          {t('nav.stop')}
        </button>
      </Panel>
    );
  }

  return (
    <Panel title={t('nav.title')} icon={<Navigation size={14} />}>
      {p.status === 'planning' && (
        <p className="flex items-center gap-2 text-sm text-cy">
          <Loader2 size={16} className="animate-spin" /> {t('nav.planning')}
        </p>
      )}

      {p.status === 'preview' && p.route && p.dest && (
        <div>
          <div className="font-semibold">{p.dest.label}</div>
          <div className="mt-1">
            <Row label={t('nav.remaining')}>{fmtLong(p.route.length, p.distUnit, lang)}</Row>
            <Row label={t('nav.duration')}>{fmtDuration(p.route.durationS)}</Row>
            <Row label={t('nav.eta')}>{p.etaTs ? fmtClock(new Date(p.etaTs), lang) : '–'}</Row>
            {needPct != null && (
              <Row label={t('nav.batteryNeed')} tag="calculated">
                <span className={short ? 'text-am' : ''}>{fmt(needPct, 0, lang)} %</span>
              </Row>
            )}
          </div>
          {short && (
            <p className="flex gap-2 text-xs text-am">
              <TriangleAlert size={14} className="shrink-0" /> {t('nav.batteryShort')}
            </p>
          )}
          <button className="btn-primary mt-3 flex w-full items-center justify-center gap-2" onClick={p.onStart}>
            <Navigation size={20} /> {t('nav.start')}
          </button>
          <div className="mt-2 flex gap-2">
            <button className="btn flex-1 !py-2 text-sm" onClick={p.onClear}>
              {t('nav.cancel')}
            </button>
            {!p.locked && (
              <button className="btn flex-1 !py-2 text-sm" onClick={p.onSaveHome}>
                <Home size={16} /> {t('nav.saveHome')}
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-mute">{t('nav.routeNote')}</p>
        </div>
      )}

      {p.status === 'idle' && (
        <div>
          {p.locked ? (
            <p className="flex items-center gap-2 text-sm text-am">
              <Lock size={16} /> {t('nav.lockedMoving')}
            </p>
          ) : (
            <form onSubmit={search} className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('nav.search')}
                className="min-w-0 flex-1 rounded-2xl border border-cy/30 bg-bg/60 px-4 py-3 text-base text-ink outline-none placeholder:text-mute focus:border-cy"
              />
              <button className="btn !px-4" type="submit" aria-label={t('nav.go')} disabled={searching}>
                {searching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
              </button>
            </form>
          )}
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-cy/10 overflow-hidden rounded-2xl border border-cy/20">
              {results.map((r, i) => (
                <li key={i}>
                  <button className="w-full px-4 py-3 text-left text-sm hover:bg-cy/10" onClick={() => pick(r)}>
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn !py-2 text-sm" disabled={!p.home || !p.pos} onClick={() => p.home && pick(p.home)} title={p.home ? p.home.label : t('nav.noHome')}>
              <Home size={16} /> {t('nav.home')}
            </button>
            <button className="btn !py-2 text-sm" onClick={p.onLoadChargers} disabled={!p.pos || p.chargersLoading}>
              {p.chargersLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} {t('chargers.load')}
            </button>
          </div>
        </div>
      )}

      {p.error && <p className="mt-2 text-sm text-rd">{t(p.error)}</p>}

      {p.chargers.length > 0 && p.status !== 'active' && (
        <div className="mt-3 border-t border-cy/15 pt-2">
          <div className="label mb-1">{t('chargers.title')}</div>
          {p.chargers.slice(0, 3).map((c) => (
            <button key={c.id} disabled={p.locked || p.status === 'planning'} onClick={() => pick({ lat: c.lat, lon: c.lon, label: c.name || t('chargers.unnamed') })} className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-cy/10 disabled:opacity-60">
              <span className="flex min-w-0 items-center gap-2">
                <Zap size={15} className="shrink-0 text-tq" />
                <span className="truncate">{c.name || t('chargers.unnamed')}</span>
              </span>
              <span className="shrink-0 tabular-nums text-mute">{fmtLong(c.distM, p.distUnit, lang)}</span>
            </button>
          ))}
          <p className="text-[11px] text-mute">{t('chargers.note')}</p>
        </div>
      )}
    </Panel>
  );
}
