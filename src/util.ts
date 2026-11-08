import type { DistUnit, Lang, LatLon, SpeedUnit } from './types';

export const KM_PER_MI = 1.609344;
const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLon, b: LatLon): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x =
    Math.cos(rad(a[0])) * Math.sin(rad(b[0])) -
    Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const locale = (l: Lang) => (l === 'de' ? 'de-DE' : 'en-GB');

export function fmt(n: number | null | undefined, dec: number, l: Lang): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return n.toLocaleString(locale(l), { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export const speedOf = (kmh: number, u: SpeedUnit) => (u === 'mph' ? kmh / KM_PER_MI : kmh);
export const distOf = (km: number, u: DistUnit) => (u === 'mi' ? km / KM_PER_MI : km);
export const speedLabel = (u: SpeedUnit) => (u === 'mph' ? 'mph' : 'km/h');
export const distLabel = (u: DistUnit) => (u === 'mi' ? 'mi' : 'km');

/** Anzeige-Entfernung (Meter-Eingabe). */
export function fmtLong(meters: number, u: DistUnit, l: Lang): string {
  if (u === 'mi') {
    const mi = meters / 1609.344;
    if (mi < 0.1) return `${Math.max(10, Math.round((meters * 3.28084) / 10) * 10)} ft`;
    return `${fmt(mi, 1, l)} mi`;
  }
  if (meters < 1000) return `${Math.max(5, Math.round(meters / 5) * 5)} m`;
  return `${fmt(meters / 1000, 1, l)} km`;
}

/** Gesprochene Entfernung ("500 Metern" / "500 meters"). */
export function speakDist(meters: number, u: DistUnit, l: Lang): string {
  const de = l === 'de';
  if (u === 'mi') {
    const ft = meters * 3.28084;
    if (ft < 1000) {
      const n = Math.max(100, Math.round(ft / 100) * 100);
      return de ? `${n} Fuß` : `${n} feet`;
    }
    const mi = fmt(meters / 1609.344, 1, l);
    return de ? `${mi} Meilen` : `${mi} miles`;
  }
  if (meters < 1000) {
    const n = meters >= 100 ? Math.round(meters / 50) * 50 : Math.max(10, Math.round(meters / 10) * 10);
    return de ? `${n} Metern` : `${n} meters`;
  }
  const km = fmt(meters / 1000, 1, l);
  return de ? `${km} Kilometern` : `${km} kilometers`;
}

/** Gesprochene Entfernung im Nominativ/Akkusativ für "noch X entfernt". */
export function speakDistPlain(meters: number, u: DistUnit, l: Lang): string {
  const de = l === 'de';
  if (u === 'mi') {
    const mi = fmt(meters / 1609.344, 1, l);
    return de ? `${mi} Meilen` : `${mi} miles`;
  }
  if (meters < 1000) {
    const n = Math.round(meters / 10) * 10;
    return de ? `${n} Meter` : `${n} meters`;
  }
  const km = fmt(meters / 1000, 1, l);
  return de ? `${km} Kilometer` : `${km} kilometers`;
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

export function fmtClock(d: Date, l: Lang, seconds = false): string {
  return d.toLocaleTimeString(locale(l), {
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
  });
}
