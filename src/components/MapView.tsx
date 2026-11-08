import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useState } from 'react';
import type { Fix, LatLon } from '../types';
import type { RouteData } from '../nav/routing';
import type { Charger } from '../nav/places';
import { useT } from '../i18n';

interface Props {
  fix: Fix | null;
  route: RouteData | null;
  dest: LatLon | null;
  chargers: Charger[];
  dark: boolean;
  navActive: boolean;
  canPick: boolean;
  onPick: (lat: number, lon: number) => void;
  onChargerClick: (c: Charger) => void;
  unnamed: string;
}

const pin = (txt: string, color: string) =>
  L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div class="pin" style="background:${color};box-shadow:0 0 14px ${color}">${txt}</div>`,
  });

const meIcon = L.divIcon({
  className: '',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: `<div class="me-marker"><div class="pulse"></div><svg class="arrow" viewBox="0 0 44 44"><path d="M22 5 L33 35 L22 28 L11 35 Z" fill="#22d3ee" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></div>`,
});

export default function MapView(p: Props) {
  const { t } = useT();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ me?: L.Marker; route?: L.LayerGroup; ends?: L.LayerGroup; chargers?: L.LayerGroup }>({});
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const cb = useRef(p);
  cb.current = p;

  // Karte einmal anlegen
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([52.52, 13.405], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.zoomControl.setPosition('bottomright');
    layers.current.route = L.layerGroup().addTo(m);
    layers.current.ends = L.layerGroup().addTo(m);
    layers.current.chargers = L.layerGroup().addTo(m);
    m.on('dragstart', () => {
      follow.current = false;
      setFollowing(false);
    });
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (cb.current.canPick) cb.current.onPick(e.latlng.lat, e.latlng.lng);
    });
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    map.current = m;
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      layers.current = {};
    };
  }, []);

  // Eigene Position + Richtungspfeil
  useEffect(() => {
    const m = map.current;
    if (!m || !p.fix) return;
    const ll: LatLon = [p.fix.lat, p.fix.lon];
    if (!layers.current.me) layers.current.me = L.marker(ll, { icon: meIcon, zIndexOffset: 1000, interactive: false }).addTo(m);
    else layers.current.me.setLatLng(ll);
    const arrow = layers.current.me.getElement()?.querySelector<SVGElement>('.arrow');
    if (arrow) arrow.style.transform = `rotate(${p.fix.heading ?? 0}deg)`;
    if (follow.current) m.setView(ll, p.navActive ? Math.max(m.getZoom(), 17) : m.getZoom(), { animate: true });
  }, [p.fix, p.navActive]);

  // Route + Start/Ziel
  useEffect(() => {
    const { route, ends } = layers.current;
    if (!route || !ends || !map.current) return;
    route.clearLayers();
    ends.clearLayers();
    if (p.route) {
      L.polyline(p.route.coords, { color: '#3b82f6', weight: 12, opacity: 0.25, lineCap: 'round' }).addTo(route);
      L.polyline(p.route.coords, { color: '#3b82f6', weight: 5, opacity: 0.95, lineCap: 'round' }).addTo(route);
      L.marker(p.route.coords[0], { icon: pin('S', '#4ade80'), interactive: false }).addTo(ends);
      if (!p.navActive) {
        follow.current = false;
        setFollowing(false);
        map.current.fitBounds(L.latLngBounds(p.route.coords), { padding: [50, 50] });
      }
    }
    if (p.dest) L.marker(p.dest, { icon: pin('Z', '#f87171'), interactive: false }).addTo(ends);
  }, [p.route, p.dest, p.navActive]);

  // Bei Navigationsstart wieder folgen
  useEffect(() => {
    if (p.navActive) {
      follow.current = true;
      setFollowing(true);
    }
  }, [p.navActive]);

  // Ladestationen
  useEffect(() => {
    const g = layers.current.chargers;
    if (!g) return;
    g.clearLayers();
    p.chargers.forEach((c) => {
      const mk = L.marker([c.lat, c.lon], {
        icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: `<div class="pin" style="background:#2dd4bf;box-shadow:0 0 12px #2dd4bf;width:26px;height:26px">⚡</div>` }),
        title: c.name || p.unnamed,
      }).addTo(g);
      mk.on('click', () => cb.current.onChargerClick(c));
    });
  }, [p.chargers, p.unnamed]);

  const recenter = () => {
    follow.current = true;
    setFollowing(true);
    if (p.fix && map.current) map.current.setView([p.fix.lat, p.fix.lon], Math.max(map.current.getZoom(), 16), { animate: true });
  };

  return (
    <div className="panel relative isolate h-full min-h-[320px] overflow-hidden !rounded-3xl p-0">
      <div ref={el} className={`h-full w-full ${p.dark ? 'dark-map' : ''}`} />
      {!following && p.fix && (
        <button
          onClick={recenter}
          className="btn absolute bottom-3 left-3 z-[500] !rounded-full !px-4 !py-3 backdrop-blur"
          aria-label={t('recenter')}
        >
          <LocateFixed size={20} /> <span className="hidden sm:inline">{t('recenter')}</span>
        </button>
      )}
    </div>
  );
}
