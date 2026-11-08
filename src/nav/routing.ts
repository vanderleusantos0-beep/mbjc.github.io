import type { LatLon } from '../types';

export type ManeuverKind =
  | 'left'
  | 'right'
  | 'slight_left'
  | 'slight_right'
  | 'sharp_left'
  | 'sharp_right'
  | 'uturn'
  | 'straight'
  | 'roundabout'
  | 'arrive';

export interface Maneuver {
  kind: ManeuverKind;
  /** Position der Abbiegung als Strecke (m) entlang der Route. */
  atDist: number;
  street: string;
  exit?: number;
}

export interface RouteData {
  coords: LatLon[]; // [lat, lon]
  cum: number[]; // kumulierte Strecke (m) je Koordinate
  length: number; // m
  durationS: number;
  maneuvers: Maneuver[];
}

// Fahrrad-Routing (OSM-Daten, FOSSGIS-OSRM). Austauschbar.
const BASE = 'https://routing.openstreetmap.de/routed-bike/route/v1/driving';

interface OsrmStep {
  distance: number;
  name?: string;
  maneuver: { type: string; modifier?: string; exit?: number };
}

function classify(type: string, mod?: string): ManeuverKind | null {
  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return null;
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') return 'roundabout';
  if (type === 'exit roundabout' || type === 'exit rotary') return null;
  switch (mod) {
    case 'left':
    case 'right':
    case 'uturn':
      return mod;
    case 'slight left':
      return 'slight_left';
    case 'slight right':
      return 'slight_right';
    case 'sharp left':
      return 'sharp_left';
    case 'sharp right':
      return 'sharp_right';
    default:
      return null; // geradeaus: keine Ansage
  }
}

function cumulative(coords: LatLon[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + metres(coords[i - 1], coords[i]));
  }
  return cum;
}

function metres(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r;
  const dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Berechnet eine echte Route inkl. Abbiegehinweisen. Wirft bei Fehlern. */
export async function fetchRoute(from: LatLon, to: LatLon, signal?: AbortSignal): Promise<RouteData> {
  const url = `${BASE}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('route-http');
  const json = await res.json();
  const r = json?.routes?.[0];
  if (json?.code !== 'Ok' || !r) throw new Error('route-none');

  const coords: LatLon[] = (r.geometry.coordinates as [number, number][]).map(([lon, lat]) => [lat, lon]);
  const cum = cumulative(coords);
  const length = cum[cum.length - 1];
  const scale = r.distance > 0 ? length / r.distance : 1;

  const maneuvers: Maneuver[] = [];
  let acc = 0;
  for (const step of (r.legs as { steps: OsrmStep[] }[]).flatMap((l) => l.steps)) {
    const kind = classify(step.maneuver.type, step.maneuver.modifier);
    if (kind) {
      maneuvers.push({ kind, atDist: acc * scale, street: step.name ?? '', exit: step.maneuver.exit });
    }
    acc += step.distance;
  }
  // Ziel immer als letzte Ansage sicherstellen
  if (!maneuvers.length || maneuvers[maneuvers.length - 1].kind !== 'arrive') {
    maneuvers.push({ kind: 'arrive', atDist: length, street: '' });
  }
  return { coords, cum, length, durationS: r.duration, maneuvers };
}

/** Projiziert eine Position auf die Route: Abstand zur Route (m) und Strecke entlang der Route (m). */
export function project(route: RouteData, p: LatLon): { off: number; along: number } {
  const cosLat = Math.cos((p[0] * Math.PI) / 180);
  let best = { off: Infinity, along: 0 };
  const { coords, cum } = route;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = (a[1] - p[1]) * cosLat * 111320;
    const ay = (a[0] - p[0]) * 111320;
    const bx = (b[1] - p[1]) * cosLat * 111320;
    const by = (b[0] - p[0]) * 111320;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (off < best.off) best = { off, along: cum[i] + t * (cum[i + 1] - cum[i]) };
  }
  return best;
}

/** Position und Fahrtrichtung bei Strecke d entlang der Route (für die Demo-Simulation). */
export function pointAt(route: RouteData, d: number): { lat: number; lon: number; heading: number } {
  const { coords, cum } = route;
  const dist = Math.max(0, Math.min(route.length, d));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < dist) i++;
  const a = coords[i - 1];
  const b = coords[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (dist - cum[i - 1]) / seg));
  const heading = (Math.atan2((b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180), b[0] - a[0]) * 180) / Math.PI;
  return { lat: a[0] + (b[0] - a[0]) * t, lon: a[1] + (b[1] - a[1]) * t, heading: (heading + 360) % 360 };
}
