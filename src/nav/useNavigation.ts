import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DistUnit, Fix, Lang, Place } from '../types';
import type { Key, TFn } from '../i18n';
import { speakDist, speakDistPlain } from '../util';
import { fetchRoute, project, type Maneuver, type RouteData } from './routing';

export type NavStatus = 'idle' | 'planning' | 'preview' | 'active';

const OFF_ROUTE_M = 45;
const THRESHOLDS = [500, 200, 50];

interface Opts {
  pos: Fix | null;
  lang: Lang;
  distUnit: DistUnit;
  speak: (s: string) => void;
  t: TFn;
}

export function actionText(t: TFn, m: Maneuver): string {
  if (m.kind === 'roundabout' && m.exit) return t('act.roundaboutExit', { n: m.exit });
  return t(`act.${m.kind}` as Key);
}

/** Navigation: Route, Fortschritt, Abweichung, Neuberechnung, Ansagen – ausschließlich aus echten Routendaten. */
export function useNavigation(o: Opts) {
  const [dest, setDest] = useState<Place | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [status, setStatus] = useState<NavStatus>('idle');
  const [error, setError] = useState<Key | null>(null);
  const [along, setAlong] = useState(0);
  const [rerouting, setRerouting] = useState(false);

  const posRef = useRef(o.pos);
  posRef.current = o.pos;
  const optsRef = useRef(o);
  optsRef.current = o;
  const destRef = useRef<Place | null>(null);
  const routeId = useRef(0);
  const announced = useRef(new Set<string>());
  const offCount = useRef(0);
  const bucket = useRef(Infinity);
  const reroutingRef = useRef(false);

  const clear = useCallback(() => {
    setStatus('idle');
    setRoute(null);
    setDest(null);
    destRef.current = null;
    setAlong(0);
    setError(null);
    announced.current.clear();
    offCount.current = 0;
    bucket.current = Infinity;
  }, []);

  const plan = useCallback(async (place: Place) => {
    const p = posRef.current;
    if (!p) {
      setError('err.noGps');
      return;
    }
    setDest(place);
    destRef.current = place;
    setStatus('planning');
    setError(null);
    try {
      const r = await fetchRoute([p.lat, p.lon], [place.lat, place.lon]);
      routeId.current++;
      setRoute(r);
      setAlong(0);
      setStatus('preview');
    } catch {
      setRoute(null);
      setStatus('idle');
      setError('err.route');
    }
  }, []);

  const start = useCallback(() => {
    if (!route) return;
    const { speak, t, distUnit, lang } = optsRef.current;
    announced.current.clear();
    offCount.current = 0;
    bucket.current = Math.floor(route.length / 5000);
    setStatus('active');
    speak(`${t('say.started')} ${t('say.remaining', { d: speakDistPlain(route.length, distUnit, lang) })}`);
  }, [route]);

  // Fortschritt, Ansagen, Abweichung
  useEffect(() => {
    if (status !== 'active' || !route || !o.pos) return;
    const { speak, t, distUnit, lang } = optsRef.current;
    const pos = o.pos;
    const { off, along: a } = project(route, [pos.lat, pos.lon]);
    setAlong(a);

    // Ziel erreicht
    if (route.length - a < 25) {
      speak(t('say.arrived'));
      clear();
      return;
    }

    // Abweichung (nur bei brauchbarer GPS-Genauigkeit)
    if (off > OFF_ROUTE_M && pos.accuracy <= 40) {
      offCount.current++;
      if (offCount.current >= 3 && !reroutingRef.current && destRef.current) {
        reroutingRef.current = true;
        setRerouting(true);
        speak(t('say.offRoute'));
        const d = destRef.current;
        fetchRoute([pos.lat, pos.lon], [d.lat, d.lon])
          .then((r) => {
            routeId.current++;
            announced.current.clear();
            offCount.current = 0;
            bucket.current = Math.floor(r.length / 5000);
            setRoute(r);
            setAlong(0);
          })
          .catch(() => setError('err.route'))
          .finally(() => {
            reroutingRef.current = false;
            setRerouting(false);
          });
        return;
      }
    } else {
      offCount.current = 0;
    }

    // Restentfernung alle 5 km
    const remaining = route.length - a;
    const b = Math.floor(remaining / 5000);
    if (b < bucket.current) {
      if (b >= 1 && bucket.current !== Infinity) {
        speak(t('say.remaining', { d: speakDistPlain(remaining, distUnit, lang) }));
      }
      bucket.current = b;
    }

    // Abbiegeansage
    const idx = route.maneuvers.findIndex((m) => m.atDist > a - 10);
    if (idx >= 0) {
      const m = route.maneuvers[idx];
      const d = Math.max(0, m.atDist - a);
      const thr = m.kind === 'arrive' ? [200] : THRESHOLDS;
      const th = [...thr].reverse().find((x) => d <= x); // kleinste erfüllte Schwelle
      if (th !== undefined) {
        const key = `${routeId.current}:${idx}:${th}`;
        if (!announced.current.has(key)) {
          thr.filter((x) => x >= th).forEach((x) => announced.current.add(`${routeId.current}:${idx}:${x}`));
          if (m.kind === 'arrive') speak(t('say.arriveSoon'));
          else speak(t('say.in', { d: speakDist(d, distUnit, lang), a: actionText(t, m) }));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.pos, status, route]);

  const next = useMemo(() => {
    if (!route) return null;
    const i = route.maneuvers.findIndex((m) => m.atDist > along - 10);
    if (i < 0) return null;
    const m = route.maneuvers[i];
    return { maneuver: m, distM: Math.max(0, m.atDist - along) };
  }, [route, along]);

  const remainingM = route ? Math.max(0, route.length - along) : 0;
  const etaTs = route ? Date.now() + route.durationS * 1000 * (remainingM / (route.length || 1)) : null;

  return { dest, route, status, error, rerouting, next, remainingM, etaTs, plan, start, clear, setError };
}
