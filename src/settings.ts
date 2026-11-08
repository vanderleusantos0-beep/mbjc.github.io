import { useCallback, useEffect, useState } from 'react';
import type { AppMode, DistUnit, Lang, Place, SpeedUnit } from './types';

export interface Settings {
  lang: Lang;
  speedUnit: SpeedUnit;
  distUnit: DistUnit;
  voiceOn: boolean;
  volume: number; // 0..1
  voiceURI: string; // '' = automatisch
  brightness: number; // 0.5..1.1
  dark: boolean;
  fullRangeKm: number; // Nennreichweite bei 100 % im Modus NORMAL
  /** Radumfang in mm für Geschwindigkeit aus Raddrehzahl (BLE Cycling Speed & Cadence); 0 = nicht gesetzt. */
  wheelMm: number;
  /** Zusätzliche Service-UUIDs aus offizieller Hersteller-Dokumentation (nur zum Auflisten/Lesen freigeben). */
  extraUuids: string;
  appMode: AppMode;
  home: Place | null;
}

const KEY = 'scooter-os.settings.v1';

const DEFAULTS: Settings = {
  lang: 'de',
  speedUnit: 'kmh',
  distUnit: 'km',
  voiceOn: true,
  volume: 0.9,
  voiceURI: '',
  brightness: 1,
  dark: true,
  fullRangeKm: 25,
  wheelMm: 0,
  extraUuids: '',
  appMode: 'demo',
  home: null,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignorieren */
  }
  return DEFAULTS;
}

export function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* Speicher voll / gesperrt */
    }
    document.documentElement.dataset.theme = s.dark ? 'dark' : 'light';
    document.documentElement.lang = s.lang;
  }, [s]);

  const update = useCallback((p: Partial<Settings>) => setS((prev) => ({ ...prev, ...p })), []);
  return [s, update];
}
