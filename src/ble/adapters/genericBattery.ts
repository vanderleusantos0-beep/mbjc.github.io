import { u16, type ScooterAdapter } from './types';

/**
 * Standard-Adapter auf Basis des von der Bluetooth SIG standardisierten
 * Battery Service (0x180F) / Battery Level (0x2A19, 0–100 %).
 *
 * Das ist KEIN Hersteller-Protokoll: Er funktioniert nur bei Geräten, die den
 * Standard-Batteriedienst anbieten, und liefert ausschließlich den Akkustand.
 * Geschwindigkeit, Fahrmodus, Kilometerstand usw. liefert er nicht.
 */
const BATTERY_SERVICE = 0x180f;
const BATTERY_LEVEL = 0x2a19;

export const genericBatteryAdapter: ScooterAdapter = {
  id: 'ble-standard-battery',
  label: 'Standard BLE Battery Service (0x180F)',
  serviceUuids: [BATTERY_SERVICE],
  supports: (found) => found.includes(u16(BATTERY_SERVICE)),

  async start({ server, emit }) {
    const service = await server.getPrimaryService(BATTERY_SERVICE);
    const ch = await service.getCharacteristic(BATTERY_LEVEL);

    const publish = (dv: DataView | undefined) => {
      if (!dv || dv.byteLength < 1) return;
      const v = dv.getUint8(0);
      if (v >= 0 && v <= 100) emit({ batteryPct: v });
    };

    publish(await ch.readValue());

    let poll: number | undefined;
    const onChange = (ev: Event) => publish((ev.target as BluetoothRemoteGATTCharacteristic).value);

    if (ch.properties.notify) {
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', onChange);
    } else if (ch.properties.read) {
      poll = window.setInterval(() => {
        ch.readValue().then(publish).catch(() => undefined);
      }, 10000);
    }

    return () => {
      if (poll !== undefined) window.clearInterval(poll);
      ch.removeEventListener('characteristicvaluechanged', onChange);
      if (ch.properties.notify && ch.service.device.gatt?.connected) {
        ch.stopNotifications().catch(() => undefined);
      }
    };
  },
};
