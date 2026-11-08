import { useEffect, useRef, useState } from 'react';
import type { Fix } from '../types';
import { bearing, haversine } from '../util';

export type GpsStatus = 'unsupported' | 'searching' | 'ok' | 'denied' | 'error';

/** Reine GPS-Schicht (Browser Geolocation). Kennt weder Fahrzeug noch Navigation. */
export function useGps(): { fix: Fix | null; status: GpsStatus } {
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<GpsStatus>(() => ('geolocation' in navigator ? 'searching' : 'unsupported'));
  const prev = useRef<Fix | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const c = p.coords;
        let heading = c.heading != null && Number.isFinite(c.heading) ? c.heading : null;
        const last = prev.current;
        if (heading == null && last && haversine([last.lat, last.lon], [c.latitude, c.longitude]) > 5) {
          heading = bearing([last.lat, last.lon], [c.latitude, c.longitude]);
        } else if (heading == null && last) {
          heading = last.heading;
        }
        const next: Fix = {
          lat: c.latitude,
          lon: c.longitude,
          accuracy: c.accuracy,
          speedKmh: c.speed != null && Number.isFinite(c.speed) ? c.speed * 3.6 : null,
          heading,
          ts: p.timestamp,
        };
        prev.current = next;
        setFix(next);
        setStatus('ok');
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    // Signal als veraltet markieren, wenn lange keine Position kam.
    const stale = window.setInterval(() => {
      if (prev.current && Date.now() - prev.current.ts > 15000) setStatus('searching');
    }, 5000);
    return () => {
      navigator.geolocation.clearWatch(id);
      window.clearInterval(stale);
    };
  }, []);

  return { fix, status };
}

/** 0 = kein Signal … 3 = sehr gut, aus der vom Browser gemeldeten Genauigkeit. */
export function gpsLevel(fix: Fix | null, status: GpsStatus): 0 | 1 | 2 | 3 {
  if (!fix || status !== 'ok') return 0;
  if (fix.accuracy <= 10) return 3;
  if (fix.accuracy <= 30) return 2;
  return 1;
}
