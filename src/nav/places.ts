import type { Lang, Place } from '../types';
import { haversine } from '../util';

export async function searchPlace(q: string, lang: Lang, near?: { lat: number; lon: number }): Promise<Place[]> {
  const p = new URLSearchParams({ format: 'jsonv2', q, limit: '5', 'accept-language': lang });
  if (near) {
    // bevorzugt Treffer in der Umgebung (~50 km), schränkt aber nicht hart ein
    const d = 0.5;
    p.set('viewbox', `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`);
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${p}`);
  if (!res.ok) throw new Error('search');
  const arr = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return arr.map((a) => ({ lat: +a.lat, lon: +a.lon, label: a.display_name.split(',').slice(0, 3).join(',').trim() }));
}

export interface Charger {
  id: number;
  lat: number;
  lon: number;
  name: string;
  distM: number;
}

export async function findChargers(lat: number, lon: number, radiusM = 5000): Promise<Charger[]> {
  const q = `[out:json][timeout:15];node["amenity"="charging_station"](around:${radiusM},${lat},${lon});out 40;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error('chargers');
  const json = (await res.json()) as {
    elements: { id: number; lat: number; lon: number; tags?: Record<string, string> }[];
  };
  return json.elements
    .map((e) => ({
      id: e.id,
      lat: e.lat,
      lon: e.lon,
      name: e.tags?.name || e.tags?.operator || e.tags?.brand || '',
      distM: haversine([lat, lon], [e.lat, e.lon]),
    }))
    .sort((a, b) => a.distM - b.distM)
    .slice(0, 8);
}
