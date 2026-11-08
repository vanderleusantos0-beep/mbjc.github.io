import { useEffect, useRef, useState } from 'react';
import type { DeviceReadings, DriveMode, Reading, Source, VehicleData } from '../types';

export const MODE_FACTOR: Record<DriveMode, number> = { ECO: 1.15, NORMAL: 1, SPORT: 0.8 };

/** Geschätzte Reichweite aus Akkustand – ein BERECHNETER Wert, kein Messwert. */
export function rangeFor(pct: number, mode: DriveMode | null, fullRangeKm: number): number {
  return (fullRangeKm * pct * MODE_FACTOR[mode ?? 'NORMAL']) / 100;
}

function na<T>(): Reading<T> {
  return { value: null, source: 'unavailable' };
}
function rd<T>(value: T | null | undefined, source: Source): Reading<T> {
  return value == null ? na<T>() : { value, source };
}

export interface DemoState {
  speed: number;
  battery: number;
  odo: number;
  temp: number;
}

const DEMO_MAX: Record<DriveMode, number> = { ECO: 15, NORMAL: 20, SPORT: 25 };

/** Simulierte Fahrzeugdaten (nur im DEMO-Modus aktiv). */
export function useDemoVehicle(active: boolean, riding: boolean, mode: DriveMode): DemoState {
  const [s, setS] = useState<DemoState>({ speed: 0, battery: 82, odo: 1234.5, temp: 24 });
  const ref = useRef({ riding, mode });
  ref.current = { riding, mode };

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const { riding: r, mode: m } = ref.current;
      setS((p) => {
        const target = r ? DEMO_MAX[m] * (0.82 + 0.18 * Math.sin(Date.now() / 3500)) : 0;
        let speed = p.speed + (target - p.speed) * 0.18;
        if (!r && speed < 0.4) speed = 0;
        const dt = 0.5;
        return {
          speed,
          battery: Math.max(0, p.battery - (speed > 0 ? 0.012 * dt * (1 + speed / 20) : 0)),
          odo: p.odo + (speed * dt) / 3600,
          temp: p.temp + ((24 + speed * 0.5 - p.temp) * 0.01),
        };
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [active]);

  return s;
}

export function buildVehicle(a: {
  appMode: 'demo' | 'real';
  ble: DeviceReadings;
  demo: DemoState;
  demoMode: DriveMode;
  gpsSpeedKmh: number | null;
  fullRangeKm: number;
}): VehicleData {
  if (a.appMode === 'demo') {
    return {
      speedKmh: rd(a.demo.speed, 'simulated'),
      batteryPct: rd(a.demo.battery, 'simulated'),
      rangeKm: rd(rangeFor(a.demo.battery, a.demoMode, a.fullRangeKm), 'simulated'),
      mode: rd(a.demoMode, 'simulated'),
      odometerKm: rd(a.demo.odo, 'simulated'),
      temperatureC: rd(a.demo.temp, 'simulated'),
      errors: rd<string[]>([], 'simulated'),
    };
  }
  const b = a.ble;
  const speed: Reading<number> =
    b.speedKmh != null ? rd(b.speedKmh, b.speedSource ?? 'device') : a.gpsSpeedKmh != null ? rd(a.gpsSpeedKmh, 'gps') : na();
  const range: Reading<number> =
    b.rangeKm != null
      ? rd(b.rangeKm, 'device')
      : b.batteryPct != null
        ? rd(rangeFor(b.batteryPct, b.mode ?? null, a.fullRangeKm), 'calculated')
        : na();
  return {
    speedKmh: speed,
    batteryPct: rd(b.batteryPct, 'device'),
    rangeKm: range,
    mode: rd(b.mode, 'device'),
    odometerKm: rd(b.odometerKm, 'device'),
    temperatureC: rd(b.temperatureC, 'device'),
    errors: rd(b.errors, 'device'),
  };
}

export function useTrip(speedKmh: number | null) {
  const [s, setS] = useState({ dist: 0, time: 0, max: 0 });
  const sp = useRef(speedKmh);
  sp.current = speedKmh;
  useEffect(() => {
    const id = window.setInterval(() => {
      const v = sp.current ?? 0;
      if (v > 1) setS((p) => ({ dist: p.dist + v / 3600, time: p.time + 1, max: Math.max(p.max, v) }));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  return {
    distKm: s.dist,
    timeS: s.time,
    maxKmh: s.max,
    avgKmh: s.time > 0 ? s.dist / (s.time / 3600) : null,
    reset: () => setS({ dist: 0, time: 0, max: 0 }),
  };
}
