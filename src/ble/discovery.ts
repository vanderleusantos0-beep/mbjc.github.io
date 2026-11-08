import type { GattServiceInfo } from '../types';

/**
 * Geräteerkennung und GATT-Service-Erkennung (rein lesend).
 * Web Bluetooth gibt nur Services frei, die beim Verbinden per optionalServices
 * angefragt wurden – deshalb können zusätzliche, aus der offiziellen
 * Hersteller-Dokumentation bekannte UUIDs angegeben werden. Es werden keine
 * unbekannten Characteristics gelesen oder beschrieben.
 */

const HEX4 = /^[0-9a-f]{4}$/;
const HEX8 = /^[0-9a-f]{8}$/;
const UUID128 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseServiceUuids(input: string): { valid: BluetoothServiceUUID[]; invalid: string[] } {
  const valid: BluetoothServiceUUID[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    if (HEX4.test(hex) || HEX8.test(hex)) valid.push(parseInt(hex, 16));
    else if (UUID128.test(raw)) valid.push(raw);
    else invalid.push(raw);
  }
  return { valid, invalid };
}

function propsOf(p: BluetoothCharacteristicProperties): string[] {
  const out: string[] = [];
  if (p.read) out.push('read');
  if (p.write) out.push('write');
  if (p.writeWithoutResponse) out.push('writeWithoutResponse');
  if (p.notify) out.push('notify');
  if (p.indicate) out.push('indicate');
  return out;
}

export async function discoverServices(server: BluetoothRemoteGATTServer): Promise<GattServiceInfo[]> {
  let services: BluetoothRemoteGATTService[] = [];
  try {
    services = await server.getPrimaryServices();
  } catch {
    services = [];
  }
  const out: GattServiceInfo[] = [];
  for (const s of services) {
    let chars: BluetoothRemoteGATTCharacteristic[] = [];
    try {
      chars = await s.getCharacteristics();
    } catch {
      chars = [];
    }
    out.push({
      uuid: s.uuid.toLowerCase(),
      characteristics: chars.map((c) => ({ uuid: c.uuid.toLowerCase(), properties: propsOf(c.properties) })),
    });
  }
  return out;
}

export interface DeviceInfo {
  manufacturer: string | null;
  model: string | null;
  firmware: string | null;
}

/** Device Information Service (0x180A) – Bluetooth-SIG-Standard, nur lesen. */
export async function readDeviceInfo(server: BluetoothRemoteGATTServer): Promise<DeviceInfo> {
  const empty: DeviceInfo = { manufacturer: null, model: null, firmware: null };
  try {
    const svc = await server.getPrimaryService(0x180a);
    const dec = new TextDecoder();
    const read = async (id: number): Promise<string | null> => {
      try {
        const c = await svc.getCharacteristic(id);
        const v = dec.decode(await c.readValue()).replace(/\0/g, '').trim();
        return v || null;
      } catch {
        return null;
      }
    };
    return { manufacturer: await read(0x2a29), model: await read(0x2a24), firmware: await read(0x2a26) };
  } catch {
    return empty;
  }
}

const SERVICE_NAMES: Record<string, string> = {
  '1800': 'Generic Access',
  '1801': 'Generic Attribute',
  '180a': 'Device Information',
  '180f': 'Battery Service',
  '1816': 'Cycling Speed and Cadence',
};
const CHAR_NAMES: Record<string, string> = {
  '2a19': 'Battery Level',
  '2a24': 'Model Number String',
  '2a26': 'Firmware Revision String',
  '2a29': 'Manufacturer Name String',
  '2a5b': 'CSC Measurement',
};

/** Kurzform für Bluetooth-SIG-UUIDs plus Klartextname nur für standardisierte Einträge. */
export function describeUuid(uuid: string, kind: 'service' | 'characteristic'): string {
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/.exec(uuid);
  if (!m) return uuid;
  const name = (kind === 'service' ? SERVICE_NAMES : CHAR_NAMES)[m[1]];
  return `0x${m[1].toUpperCase()}${name ? ` · ${name}` : ''}`;
}
