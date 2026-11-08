import { cyclingSpeedAdapter } from './cyclingSpeed';
import { genericBatteryAdapter } from './genericBattery';
import type { ScooterAdapter } from './types';

/**
 * Registrierte Protokoll-Adapter. Aktuell nur Bluetooth-SIG-Standardprofile.
 * Es gibt bewusst KEINE erfundenen Hersteller-UUIDs: Ein Hersteller-Adapter wird erst
 * ergänzt (mit `exclusive: true`), wenn das Protokoll des Modells offiziell dokumentiert ist.
 * Siehe README, Abschnitt "Neuen Scooter-Adapter hinzufügen".
 */
export const ADAPTERS: ScooterAdapter[] = [genericBatteryAdapter, cyclingSpeedAdapter];

/** Alle Services, die beim Geräteauswahl-Dialog als optionalServices freigegeben werden. */
export function allOptionalServices(extra: BluetoothServiceUUID[] = []): BluetoothServiceUUID[] {
  const set = new Set<BluetoothServiceUUID>(['device_information']);
  ADAPTERS.forEach((a) => a.serviceUuids.forEach((u) => set.add(u)));
  extra.forEach((u) => set.add(u));
  return Array.from(set);
}

/** Alle passenden Adapter; ein exklusiver Hersteller-Adapter verdrängt die Standard-Adapter. */
export function pickAdapters(foundServiceUuids: string[]): ScooterAdapter[] {
  const matching = ADAPTERS.filter((a) => a.supports(foundServiceUuids));
  const exclusive = matching.find((a) => a.exclusive);
  return exclusive ? [exclusive] : matching;
}
