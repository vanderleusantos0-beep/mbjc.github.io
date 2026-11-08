import { useSyncExternalStore } from 'react';

import type {
  BleErrorCode,
  DeviceReadings,
  LinkInfo,
} from '../types';

import {
  allOptionalServices,
  pickAdapters,
} from './adapters';

import {
  discoverServices,
  parseServiceUuids,
  readDeviceInfo,
} from './discovery';

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

type BluetoothErrorDetails = {
  name: string;
  message: string;
  code: string;
  constructorName: string;
};

function getErrorMessage(error: unknown): BluetoothErrorDetails {
  const value = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    constructor?: { name?: string };
  } | null;

  const name =
    typeof value?.name === 'string' && value.name
      ? value.name
      : 'UnknownError';

  const message =
    typeof value?.message === 'string' && value.message
      ? value.message
      : String(error);

  return {
    name,
    message,
    code:
      value?.code !== undefined && value.code !== null
        ? String(value.code)
        : 'nicht verfügbar',
    constructorName:
      value?.constructor?.name || typeof error,
  };
}

/**
 * Prüft die Browser-Voraussetzungen.
 * Diese Prüfung bestätigt noch nicht, dass der Browser BLE-Geräte
 * tatsächlich auswählen oder verbinden kann.
 */
export function bleSupport(): {
  ok: boolean;
  webBluetooth: boolean;
  secure: boolean;
} {
  const webBluetooth =
    typeof navigator !== 'undefined' &&
    'bluetooth' in navigator &&
    !!navigator.bluetooth &&
    typeof navigator.bluetooth.requestDevice === 'function';

  const secure =
    typeof window !== 'undefined' &&
    window.isSecureContext === true;

  return {
    ok: webBluetooth && secure,
    webBluetooth,
    secure,
  };
}

/**
 * Scooter OS Bluetooth Manager
 *
 * Ausschließlich passive/read-only Kommunikation:
 * - Web Bluetooth Geräteauswahl
 * - GATT-Verbindung
 * - Service-Erkennung
 * - vorhandene Read-only Adapter
 * - Geräteinformationen
 * - Fehlerdiagnose
 *
 * Es werden keine GATT-Schreibbefehle und keine Fahrbefehle gesendet.
 */
class BluetoothManager {
  private snap: BleSnapshot = {
    link: INITIAL_LINK,
    readings: {},
  };

  private listeners = new Set<() => void>();
  private device: BluetoothDevice | null = null;
  private stops: Array<() => void> = [];
  private manualDisconnect = false;
  private retryTimer: number | undefined;
  private wheelMm = 0;
  private generation = 0;

  setWheelCircumference = (mm: number) => {
    this.wheelMm =
      Number.isFinite(mm) && mm > 0 ? mm : 0;
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private setLink(
    patch: Partial<LinkInfo>,
    readings?: DeviceReadings,
  ) {
    this.snap = {
      link: {
        ...this.snap.link,
        ...patch,
      },
      readings: readings ?? this.snap.readings,
    };
    this.emit();
  }

  private merge(readings: DeviceReadings) {
    this.snap = {
      ...this.snap,
      readings: {
        ...this.snap.readings,
        ...readings,
      },
    };
    this.emit();
  }

  private getBrowserDiagnostics() {
    return {
      userAgent:
        typeof navigator !== 'undefined'
          ? navigator.userAgent
          : 'nicht verfügbar',
      platform:
        typeof navigator !== 'undefined'
          ? navigator.platform
          : 'nicht verfügbar',
      secureContext:
        typeof window !== 'undefined'
          ? window.isSecureContext
          : false,
      bluetoothAvailable:
        typeof navigator !== 'undefined' &&
        !!navigator.bluetooth,
      requestDeviceAvailable:
        typeof navigator !== 'undefined' &&
        typeof navigator.bluetooth?.requestDevice === 'function',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Bluetooth-Geräteauswahl starten.
   *
   * Diese Methode muss direkt durch einen echten Button-Klick
   * aufgerufen werden. Kein setTimeout und kein vorgelagertes await
   * vor requestDevice(), da Browser sonst die Nutzeraktion verlieren können.
   */
  async connect(extraUuids = ''): Promise<void> {
    const generation = ++this.generation;
    let phase = 'Voraussetzungen werden geprüft';

    const support = bleSupport();

    if (!support.webBluetooth) {
      this.setLink({
        state: 'error',
        error: 'unsupported',
        errorDetail:
          'Web Bluetooth ist in diesem Browser nicht verfügbar. ' +
          'Browserdiagnose: ' +
          JSON.stringify(this.getBrowserDiagnostics()),
      });
      return;
    }

    if (!support.secure) {
      this.setLink({
        state: 'error',
        error: 'insecure',
        errorDetail:
          'Web Bluetooth benötigt HTTPS oder localhost.',
      });
      return;
    }

    const extra = parseServiceUuids(extraUuids);

    if (extra.invalid.length > 0) {
      this.setLink({
        state: 'error',
        error: 'badUuid',
        errorDetail:
          `Ungültige Service-UUIDs: ${extra.invalid.join(', ')}`,
      });
      return;
    }

    window.clearTimeout(this.retryTimer);
    this.manualDisconnect = false;

    // Alte Adapter und eine eventuell bestehende Verbindung sauber beenden.
    this.runStop();
    this.releaseDevice();

    this.setLink({
      state: 'connecting',
      error: null,
      errorDetail: null,
      attempt: 0,
    });

    try {
      const diagnostics = this.getBrowserDiagnostics();
      console.info('[Scooter OS] Browserdiagnose:', diagnostics);

      const optionalServices = allOptionalServices(extra.valid);
      console.info(
        '[Scooter OS] Angeforderte optionale Services:',
        optionalServices,
      );

      phase = 'Bluetooth-Geräteauswahl (requestDevice)';
      console.info('[Scooter OS] Rufe requestDevice() auf');

      // Wichtig: Dieser Aufruf bleibt direkt im synchronen Ablauf
      // des Button-Klicks, ohne vorherige asynchrone Arbeit.
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices,
      });

      if (generation !== this.generation) return;

      phase = 'Gerät ausgewählt';
      console.info('[Scooter OS] Gerät ausgewählt:', {
        name: device.name ?? '(kein Gerätename)',
        id: device.id,
      });

      this.device = device;
      this.manualDisconnect = false;

      device.addEventListener(
        'gattserverdisconnected',
        this.onDisconnected,
      );

      phase = 'GATT-Verbindung';
      await this.attach(device, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error, phase);
    }
  }

  /**
   * Vorherige Verbindung und Event-Listener lösen.
   */
  private releaseDevice() {
    const device = this.device;
    if (!device) return;

    device.removeEventListener(
      'gattserverdisconnected',
      this.onDisconnected,
    );

    if (device.gatt?.connected) {
      try {
        device.gatt.disconnect();
      } catch (error) {
        console.warn(
          '[Scooter OS] Fehler beim Trennen der alten Verbindung:',
          error,
        );
      }
    }

    this.device = null;
  }

  /**
   * Erneut verbinden, sofern ein zuvor ausgewähltes Gerät vorhanden ist.
   * Der Browser kann je nach Plattform verlangen, dass die Geräteauswahl
   * erneut vom Benutzer ausgelöst wird.
   */
  async reconnect(): Promise<void> {
    window.clearTimeout(this.retryTimer);

    if (!this.device) {
      await this.connect();
      return;
    }

    this.manualDisconnect = false;
    const generation = ++this.generation;

    this.setLink({
      state: 'connecting',
      error: null,
      errorDetail: null,
      attempt: 0,
    });

    try {
      await this.attach(this.device, generation);
    } catch (error) {
      this.fail(error, 'Manueller Wiederverbindungsversuch');
    }
  }

  /**
   * Verbindung manuell trennen.
   */
  disconnect(): void {
    this.generation++;
    this.manualDisconnect = true;
    window.clearTimeout(this.retryTimer);
    this.runStop();

    const device = this.device;

    if (device) {
      device.removeEventListener(
        'gattserverdisconnected',
        this.onDisconnected,
      );

      if (device.gatt?.connected) {
        try {
          device.gatt.disconnect();
        } catch (error) {
          console.warn(
            '[Scooter OS] Fehler beim Trennen:',
            error,
          );
        }
      }
    }

    this.device = null;

    this.snap = {
      link: { ...INITIAL_LINK },
      readings: {},
    };

    this.emit();
  }

  /**
   * GATT verbinden und ausschließlich lesbare Informationen erfassen.
   */
  private async attach(
    device: BluetoothDevice,
    generation: number,
  ): Promise<void> {
    if (!device.gatt) {
      throw new DOMException(
        'Das ausgewählte Gerät stellt keinen GATT-Server bereit.',
        'NetworkError',
      );
    }

    console.info('[Scooter OS] Starte GATT-Verbindung');

    const server = await device.gatt.connect();

    if (generation !== this.generation) {
      try {
        server.disconnect();
      } catch {
        // Verbindung ist bereits beendet.
      }
      return;
    }

    console.info('[Scooter OS] GATT verbunden');

    const services = await discoverServices(server);

    if (generation !== this.generation) return;

    console.info(
      '[Scooter OS] Erkannte GATT-Dienste:',
      services,
    );

    const candidates = pickAdapters(
      services.map((service) => service.uuid),
    );

    const info = await readDeviceInfo(server);

    if (generation !== this.generation) return;

    const model =
      [info.manufacturer, info.model]
        .filter(Boolean)
        .join(' ') ||
      device.name ||
      null;

    this.setLink({
      state: 'connected',
      deviceName: device.name ?? null,
      model,
      manufacturer: info.manufacturer,
      firmware: info.firmware,
      services,
      adapters: candidates.map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
      })),
      protocolSupported: candidates.length > 0,
      error: candidates.length > 0 ? null : 'noProtocol',
      errorDetail:
        candidates.length > 0
          ? null
          : 'Bluetooth ist verbunden, aber es wurde kein passender Datenadapter gefunden. Die Seriennummer kann trotzdem lesbar sein.',
      attempt: 0,
      rssi: null,
    });

    this.runStop();

    const started: typeof candidates = [];

    for (const adapter of candidates) {
      if (generation !== this.generation) return;

      try {
        console.info(
          '[Scooter OS] Starte Read-only-Adapter:',
          adapter.label,
        );

        const stop = await adapter.start({
          server,
          emit: (readings) => {
            if (generation !== this.generation) return;
            this.merge(readings);
          },
          getWheelCircumferenceMm: () => this.wheelMm,
        });

        if (generation !== this.generation) {
          stop();
          return;
        }

        this.stops.push(stop);
        started.push(adapter);
      } catch (error) {
        console.warn(
          '[Scooter OS] Read-only-Adapter fehlgeschlagen:',
          adapter.id,
          error,
        );
      }
    }

    if (generation !== this.generation) return;

    this.setLink({
      adapters: started.map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
      })),
      protocolSupported: started.length > 0,
      error: started.length > 0 ? null : 'noProtocol',
      errorDetail:
        started.length > 0
          ? null
          : 'GATT-Verbindung steht, aber keiner der vorhandenen Read-only-Adapter konnte Daten liefern.',
    });

    console.info('[Scooter OS] Verbindungsaufbau abgeschlossen');
  }

  /**
   * Wird bei einem unerwarteten Verbindungsverlust aufgerufen.
   */
  private onDisconnected = () => {
    console.warn('[Scooter OS] GATT-Verbindung wurde getrennt');
    this.runStop();

    this.snap = {
      ...this.snap,
      readings: {},
    };

    if (this.manualDisconnect) {
      this.setLink({ ...INITIAL_LINK });
      return;
    }

    this.setLink({
      state: 'lost',
      error: 'gatt',
      errorDetail:
        'Die Bluetooth-Verbindung zum Roller wurde unterbrochen.',
      attempt: 0,
    });

    this.scheduleRetry(1);
  };

  /**
   * Automatische Wiederverbindung mit begrenzten Versuchen.
   */
  private scheduleRetry(attempt: number) {
    if (attempt > RETRY_DELAYS.length || !this.device) {
      this.setLink({
        state: 'lost',
        attempt: 0,
        errorDetail:
          'Automatische Wiederverbindung fehlgeschlagen. Bitte erneut manuell verbinden.',
      });
      return;
    }

    this.setLink({
      state: 'lost',
      attempt,
      errorDetail: `Wiederverbindung: Versuch ${attempt} von 3`,
    });

    this.retryTimer = window.setTimeout(async () => {
      if (this.manualDisconnect || !this.device) return;

      const generation = this.generation;

      try {
        console.info(
          `[Scooter OS] Wiederverbindung ${attempt}/3`,
        );

        await this.attach(this.device, generation);
      } catch (error) {
        console.warn(
          '[Scooter OS] Wiederverbindung fehlgeschlagen:',
          error,
        );
        this.scheduleRetry(attempt + 1);
      }
    }, RETRY_DELAYS[attempt - 1]);
  }

  /**
   * Alle aktiven Adapter beenden.
   */
  private runStop() {
    for (const stop of this.stops) {
      try {
        stop();
      } catch (error) {
        console.warn(
          '[Scooter OS] Adapter konnte nicht beendet werden:',
          error,
        );
      }
    }

    this.stops = [];
  }

  /**
   * RSSI ist optional und wird von vielen Browsern nicht unterstützt.
   * Ein Fehler hier darf die normale Verbindung nicht beeinträchtigen.
   */
  private watchRssi(device: BluetoothDevice) {
    const extended = device as BluetoothDevice & {
      watchAdvertisements?: () => Promise<void>;
    };

    if (
      typeof extended.watchAdvertisements !== 'function'
    ) {
      console.info(
        '[Scooter OS] RSSI/Advertisement-Monitoring nicht unterstützt',
      );
      return;
    }

    const listener = (event: Event) => {
      const advertisement = event as Event & {
        rssi?: number;
      };

      if (typeof advertisement.rssi === 'number') {
        this.setLink({ rssi: advertisement.rssi });
      }
    };

    extended.addEventListener(
      'advertisementreceived',
      listener,
    );

    extended.watchAdvertisements().catch((error) => {
      console.info(
        '[Scooter OS] RSSI nicht verfügbar:',
        error,
      );
    });
  }

  /**
   * Einheitliche Browser-Fehlerdiagnose.
   */
  private fail(
    error: unknown,
    phase = 'Unbekannte Phase',
  ) {
    const details = getErrorMessage(error);

    const diagnostics = {
      phase,
      name: details.name,
      message: details.message,
      code: details.code,
      constructor: details.constructorName,
      browser: this.getBrowserDiagnostics(),
    };

    console.error(
      '[Scooter OS] Bluetooth-Fehlerdiagnose:',
      diagnostics,
      error,
    );

    let code: BleErrorCode = 'unknown';

    if (
      details.name === 'NotFoundError' ||
      details.name === 'AbortError'
    ) {
      code = 'cancelled';
    } else if (
      details.name === 'SecurityError' ||
      details.name === 'NotAllowedError'
    ) {
      code = 'denied';
    } else if (
      details.name === 'NetworkError' ||
      details.name === 'InvalidStateError'
    ) {
      code = 'gatt';
    } else if (details.name === 'NotSupportedError') {
      code = 'unsupported';
    }

    this.setLink({
      state:
        code === 'cancelled'
          ? 'disconnected'
          : 'error',
      error: code,
      errorDetail:
        `Phase: ${phase}\n` +
        `Fehler: ${details.name}\n` +
        `Nachricht: ${details.message}\n` +
        `Code: ${details.code}\n` +
        `Typ: ${details.constructorName}\n` +
        `Browser: ${this.getBrowserDiagnostics().userAgent}`,
    });
  }
}

/**
 * Globale Bluetooth-Instanz.
 */
export const bluetoothManager = new BluetoothManager();

/**
 * React Hook für den Bluetooth-Status.
 */
export function useBluetooth(): BleSnapshot {
  return useSyncExternalStore(
    bluetoothManager.subscribe,
    bluetoothManager.getSnapshot,
  );
}
