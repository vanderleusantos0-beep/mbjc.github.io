import { useSyncExternalStore } from 'react';
import type { BleErrorCode, DeviceReadings, LinkInfo } from '../types';
import { allOptionalServices, pickAdapters } from './adapters';
import { discoverServices, parseServiceUuids, readDeviceInfo } from './discovery';

export interface BleSnapshot {
  link: LinkInfo;
  readings: DeviceReadings;
}

const INITIAL_LINK: LinkInfo = {
  state: 'disconnected',
  deviceName: null,
  model: null,
  manufacturer: null,
  firmware: null,
  adapters: [],
  services: [],
  protocolSupported: false,
  rssi: null,
  error: null,
  errorDetail: null,
  attempt: 0,
};

const RETRY_DELAYS = [2000, 4000, 8000];

export function bleSupport(): { ok: boolean; webBluetooth: boolean; secure: boolean } {
  const webBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  return { ok: webBluetooth && secure, webBluetooth, secure };
}

/**
 * Bluetooth-Manager: Verbindung, Geräteerkennung, GATT-Service-Erkennung.
 * Datenübertragung und -interpretation liegen in den Protokoll-Adaptern,
 * die Anzeige im Dashboard (React). Der Manager sendet selbst nichts an den Roller.
 */
class BluetoothManager {
  private snap: BleSnapshot = { link: INITIAL_LINK, readings: {} };
  private listeners = new Set<() => void>();
  private device: BluetoothDevice | null = null;
  private stops: Array<() => void> = [];
  private manualDisconnect = false;
  private retryTimer: number | undefined;
  private wheelMm = 0;

  /** Radumfang aus den Einstellungen (für berechnete Geschwindigkeit aus Raddrehzahl). */
  setWheelCircumference = (mm: number) => {
    this.wheelMm = Number.isFinite(mm) && mm > 0 ? mm : 0;
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snap;

  private emit() {
    this.listeners.forEach((l) => l());
  }
  private setLink(p: Partial<LinkInfo>, readings?: DeviceReadings) {
    this.snap = { link: { ...this.snap.link, ...p }, readings: readings ?? this.snap.readings };
    this.emit();
  }
  private merge(r: DeviceReadings) {
    this.snap = { ...this.snap, readings: { ...this.snap.readings, ...r } };
    this.emit();
  }

  /**
   * `extraUuids`: optionale, kommagetrennte Service-UUIDs aus offizieller Hersteller-Dokumentation.
   * Alles bis zum requestDevice()-Aufruf läuft synchron, damit die Nutzer-Geste gültig bleibt.
   */
  async connect(extraUuids = ''): Promise<void> {
    const sup = bleSupport();
    if (!sup.webBluetooth) return this.setLink({ state: 'error', error: 'unsupported' });
    if (!sup.secure) return this.setLink({ state: 'error', error: 'insecure' });
    const extra = parseServiceUuids(extraUuids);
    if (extra.invalid.length) return this.setLink({ state: 'error', error: 'badUuid', errorDetail: extra.invalid.join(', ') });

    window.clearTimeout(this.retryTimer);
    this.setLink({ state: 'connecting', error: null, errorDetail: null, attempt: 0 });
    try {
      // Systemdialog des Browsers: Nutzer wählt den Roller aus.
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: allOptionalServices(extra.valid),
      });
      this.releaseDevice();
      this.device = device;
      this.manualDisconnect = false;
      device.addEventListener('gattserverdisconnected', this.onDisconnected);
      await this.attach(device);
    } catch (e) {
      this.fail(e);
    }
  }

  /** Vorheriges Gerät sauber lösen, wenn ein anderes gewählt wurde. */
  private releaseDevice() {
    const d = this.device;
    if (!d) return;
    d.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.runStop();
    if (d.gatt?.connected) d.gatt.disconnect();
    this.device = null;
  }

  async reconnect(): Promise<void> {
    window.clearTimeout(this.retryTimer);
    if (!this.device) return this.connect();
    this.manualDisconnect = false;
    this.setLink({ state: 'connecting', error: null, errorDetail: null, attempt: 0 });
    try {
      await this.attach(this.device);
    } catch (e) {
      this.fail(e);
    }
  }

  disconnect(): void {
    this.manualDisconnect = true;
    window.clearTimeout(this.retryTimer);
    this.runStop();
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.setLink({ ...INITIAL_LINK }, {});
  }

  private async attach(device: BluetoothDevice): Promise<void> {
    if (!device.gatt) throw new DOMException('no gatt', 'NetworkError');
    const server = await device.gatt.connect();

    // GATT-Service-Erkennung (nur Services, die per optionalServices freigegeben wurden)
    const services = await discoverServices(server);
    const candidates = pickAdapters(services.map((s) => s.uuid));
    const info = await readDeviceInfo(server);
    const model = [info.manufacturer, info.model].filter(Boolean).join(' ') || device.name || null;

    this.setLink({
      state: 'connected',
      deviceName: device.name ?? null,
      model,
      manufacturer: info.manufacturer,
      firmware: info.firmware,
      services,
      adapters: candidates.map((a) => ({ id: a.id, label: a.label })),
      protocolSupported: candidates.length > 0,
      error: candidates.length ? null : 'noProtocol',
      errorDetail: null,
      attempt: 0,
      rssi: null,
    });
    this.watchRssi(device);

    // Datenübertragung: jeder Adapter einzeln; ein fehlschlagender Adapter stoppt die anderen nicht.
    this.runStop();
    const started: typeof candidates = [];
    for (const a of candidates) {
      try {
        this.stops.push(
          await a.start({ server, emit: (r) => this.merge(r), getWheelCircumferenceMm: () => this.wheelMm }),
        );
        started.push(a);
      } catch {
        /* Dienst/Characteristic nicht lesbar → Adapter nicht aktiv */
      }
    }
    this.setLink({
      adapters: started.map((a) => ({ id: a.id, label: a.label })),
      protocolSupported: started.length > 0,
      error: started.length ? null : 'noProtocol',
    });
  }

  private onDisconnected = () => {
    this.runStop();
    // Alte Werte nie als "live" stehen lassen.
    this.snap = { ...this.snap, readings: {} };
    if (this.manualDisconnect) {
      this.setLink({ ...INITIAL_LINK });
      return;
    }
    this.setLink({ state: 'lost', attempt: 0 });
    this.scheduleRetry(1);
  };

  private scheduleRetry(attempt: number) {
    if (attempt > RETRY_DELAYS.length || !this.device) {
      this.setLink({ state: 'lost', attempt: 0 });
      return;
    }
    this.setLink({ state: 'lost', attempt });
    this.retryTimer = window.setTimeout(async () => {
      if (this.manualDisconnect || !this.device) return;
      try {
        await this.attach(this.device);
      } catch {
        this.scheduleRetry(attempt + 1);
      }
    }, RETRY_DELAYS[attempt - 1]);
  }

  private runStop() {
    for (const stop of this.stops) {
      try {
        stop();
      } catch {
        /* Gerät evtl. schon getrennt */
      }
    }
    this.stops = [];
  }

  private watchRssi(device: BluetoothDevice) {
    // Experimentell (Chrome-Flag): nicht überall verfügbar → dann bleibt RSSI "n/v".
    const d = device as unknown as {
      watchAdvertisements?: () => Promise<void>;
      addEventListener: (t: string, f: (e: { rssi?: number }) => void) => void;
    };
    if (typeof d.watchAdvertisements !== 'function') return;
    d.addEventListener('advertisementreceived', (e) => {
      if (typeof e.rssi === 'number') this.setLink({ rssi: e.rssi });
    });
    d.watchAdvertisements().catch(() => undefined);
  }

  private fail(e: unknown) {
    const name = (e as { name?: string })?.name;
    let code: BleErrorCode = 'unknown';
    if (name === 'NotFoundError') code = 'cancelled';
    else if (name === 'SecurityError' || name === 'NotAllowedError') code = 'denied';
    else if (name === 'NetworkError' || name === 'InvalidStateError') code = 'gatt';
    else if (name === 'NotSupportedError') code = 'unsupported';
    if (code === 'cancelled') {
      this.setLink({ state: this.snap.link.state === 'connected' ? 'connected' : 'disconnected', error: code, errorDetail: null });
    } else {
      this.setLink({ state: 'error', error: code, errorDetail: null });
    }
  }
}

export const bluetoothManager = new BluetoothManager();

export function useBluetooth(): BleSnapshot {
  return useSyncExternalStore(bluetoothManager.subscribe, bluetoothManager.getSnapshot);
}
