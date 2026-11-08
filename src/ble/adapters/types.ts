import type { DeviceReadings } from '../../types';

/**
 * Austauschbare Protokollschnittstelle.
 *
 * Ein Adapter kennt GENAU EIN dokumentiertes Bluetooth-Protokoll (Hersteller/Modell)
 * und übersetzt GATT-Daten in `DeviceReadings`. Der BluetoothManager kennt keine
 * Hersteller-Details. Adapter dürfen ausschließlich lesen/abonnieren – keine
 * Schreibbefehle, solange diese nicht offiziell dokumentiert und sicher sind.
 */
export interface AdapterContext {
  server: BluetoothRemoteGATTServer;
  /** Meldet tatsächlich gelesene Werte (nur diese gelten als "ROLLER"-Daten). */
  emit: (r: DeviceReadings) => void;
  /** Vom Nutzer eingestellter Radumfang in mm (0 = nicht gesetzt). Nur für Adapter, die daraus berechnen. */
  getWheelCircumferenceMm: () => number;
}

export interface ScooterAdapter {
  readonly id: string;
  readonly label: string;
  /**
   * Hersteller-Adapter für ein dokumentiertes Modell setzen `exclusive: true`:
   * Passt ein solcher Adapter, laufen nur er (statt der generischen Standard-Adapter),
   * damit sich Werte nicht gegenseitig überschreiben.
   */
  readonly exclusive?: boolean;
  /** Services, die der Browser beim Verbinden freigeben soll (optionalServices). */
  readonly serviceUuids: BluetoothServiceUUID[];
  /** Entscheidet anhand der auf dem Gerät gefundenen Service-UUIDs (kanonisch, 128 Bit, klein). */
  supports(foundServiceUuids: string[]): boolean;
  /** Startet Lesen/Notifications. Liefert eine Stop-Funktion. */
  start(ctx: AdapterContext): Promise<() => void>;
}

export const u16 = (n: number) => `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
