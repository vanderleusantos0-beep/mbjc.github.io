import { u16, type ScooterAdapter } from './types';

/**
 * Standard-Adapter auf Basis des Bluetooth-SIG-Profils Cycling Speed and Cadence
 * (Service 0x1816, Characteristic CSC Measurement 0x2A5B, nur Notifications).
 *
 * Kein Hersteller-Protokoll: Nur Geräte, die dieses Standardprofil anbieten, liefern Daten.
 * Das Profil überträgt kumulierte Radumdrehungen mit Zeitstempel – die Geschwindigkeit
 * wird daraus mit dem vom Nutzer eingestellten Radumfang BERECHNET und deshalb als
 * "BERECHNET" (nicht "ROLLER") gekennzeichnet. Ohne Radumfang wird keine Geschwindigkeit gemeldet.
 */
const CSC_SERVICE = 0x1816;
const CSC_MEASUREMENT = 0x2a5b;
/** Keine neue Radumdrehung in dieser Zeit → Rad steht (Geschwindigkeit 0, berechnet). */
const STOP_AFTER_MS = 3000;
/** Alles darüber ist ein Mess-/Parsefehler und wird verworfen. */
const MAX_PLAUSIBLE_KMH = 100;

export interface CscWheelSample {
  /** Kumulierte Radumdrehungen (uint32, läuft über). */
  revs: number;
  /** Zeitpunkt der letzten Radumdrehung in 1/1024 s (uint16, läuft über). */
  time: number;
}

/** CSC-Measurement-Paket laut Bluetooth-SIG-Spezifikation; null, wenn keine Raddaten enthalten sind. */
export function parseCsc(dv: DataView): CscWheelSample | null {
  if (dv.byteLength < 1) return null;
  const flags = dv.getUint8(0);
  if ((flags & 0x01) === 0 || dv.byteLength < 7) return null;
  return { revs: dv.getUint32(1, true), time: dv.getUint16(5, true) };
}

/** Geschwindigkeit zwischen zwei unterschiedlichen Radereignissen; null = kein neues Ereignis / unplausibel. */
export function wheelSpeedKmh(prev: CscWheelSample, cur: CscWheelSample, circumferenceMm: number): number | null {
  let dRev = cur.revs - prev.revs;
  if (dRev < 0) dRev += 0x100000000;
  let dTime = cur.time - prev.time;
  if (dTime < 0) dTime += 0x10000;
  if (dTime === 0 || circumferenceMm <= 0) return null;
  const kmh = ((dRev * circumferenceMm) / 1000 / (dTime / 1024)) * 3.6;
  return kmh >= 0 && kmh <= MAX_PLAUSIBLE_KMH ? kmh : null;
}

export const cyclingSpeedAdapter: ScooterAdapter = {
  id: 'ble-standard-csc',
  label: 'Standard BLE Cycling Speed & Cadence (0x1816)',
  serviceUuids: [CSC_SERVICE],
  supports: (found) => found.includes(u16(CSC_SERVICE)),

  async start({ server, emit, getWheelCircumferenceMm }) {
    const service = await server.getPrimaryService(CSC_SERVICE);
    const ch = await service.getCharacteristic(CSC_MEASUREMENT);

    let prev: CscWheelSample | null = null;
    let stopTimer: number | undefined;

    const onChange = (ev: Event) => {
      const dv = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (!dv) return;
      const cur = parseCsc(dv);
      if (!cur) return;
      const circ = getWheelCircumferenceMm();
      if (!prev) {
        prev = cur;
        return;
      }
      const kmh = wheelSpeedKmh(prev, cur, circ);
      if (kmh == null) return; // gleiches Radereignis erneut gemeldet → Vergleichswert behalten
      prev = cur;
      emit({ speedKmh: kmh, speedSource: 'calculated' });
      window.clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => emit({ speedKmh: 0, speedSource: 'calculated' }), STOP_AFTER_MS);
    };

    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', onChange);

    return () => {
      window.clearTimeout(stopTimer);
      ch.removeEventListener('characteristicvaluechanged', onChange);
      if (ch.service.device.gatt?.connected) ch.stopNotifications().catch(() => undefined);
    };
  },
};
