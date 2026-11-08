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


function getErrorMessage(error: unknown): {
  name: string;
  message: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name || 'UnknownError',
      message: error.message || 'Keine Fehlerbeschreibung vorhanden',
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}


/**
 * Prüft, ob Web Bluetooth und HTTPS verfügbar sind.
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
    window.isSecureContext;

  return {
    ok: webBluetooth && secure,
    webBluetooth,
    secure,
  };
}


/**
 * Scooter OS Bluetooth Manager
 *
 * Unterstützt:
 * - Web Bluetooth
 * - Bluefy auf unterstützten iOS-Versionen
 * - Geräteauswahl
 * - GATT-Service-Erkennung
 * - Batterie-Adapter
 * - CSC-Adapter
 * - Device Information
 * - Verbindungsabbruch-Erkennung
 * - Automatische Wiederverbindung
 * - Detaillierte Fehlerdiagnose
 *
 * Es werden keine Fahrbefehle gesendet.
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


  /**
   * Radumfang für berechnete Geschwindigkeit.
   */
  setWheelCircumference = (mm: number) => {
    this.wheelMm =
      Number.isFinite(mm) && mm > 0 ? mm : 0;
  };


  /**
   * React Store
   */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);

    return () => {
      this.listeners.delete(fn);
    };
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


  /**
   * Bluetooth-Verbindung starten.
   *
   * Wichtig:
   * Diese Funktion direkt über einen Button-Klick aufrufen,
   * damit Bluefy den Bluetooth-Auswahldialog öffnen kann.
   */
  async connect(extraUuids = ''): Promise<void> {

    const generation = ++this.generation;

    const support = bleSupport();

    if (!support.webBluetooth) {
      this.setLink({
        state: 'error',
        error: 'unsupported',
        errorDetail:
          'Web Bluetooth wird von diesem Browser nicht bereitgestellt. Bitte prüfe die Bluefy-Bluetooth-Unterstützung.',
      });

      return;
    }


    if (!support.secure) {
      this.setLink({
        state: 'error',
        error: 'insecure',
        errorDetail:
          'Die Verbindung benötigt HTTPS oder localhost.',
      });

      return;
    }


    const extra = parseServiceUuids(extraUuids);

    if (extra.invalid.length > 0) {
      this.setLink({
        state: 'error',
        error: 'badUuid',
        errorDetail:
          `Ungültige UUIDs: ${extra.invalid.join(', ')}`,
      });

      return;
    }


    window.clearTimeout(this.retryTimer);

    this.manualDisconnect = false;

    this.setLink({
      state: 'connecting',
      error: null,
      errorDetail: null,
      attempt: 0,
    });


    try {

      console.info('[Scooter OS] Öffne Bluetooth-Auswahl');


      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,

        optionalServices: allOptionalServices(extra.valid),
      });


      if (generation !== this.generation) {
        return;
      }


      console.info(
        '[Scooter OS] Gerät ausgewählt:',
        device.name,
      );


      this.releaseDevice();

      this.device = device;

      this.manualDisconnect = false;

      device.addEventListener(
        'gattserverdisconnected',
        this.onDisconnected,
      );


      await this.attach(device, generation);

    } catch (error) {

      if (generation !== this.generation) {
        return;
      }

      this.fail(error);
    }
  }


  /**
   * Vorherige Verbindung lösen.
   */
  private releaseDevice() {

    const device = this.device;

    if (!device) return;


    device.removeEventListener(
      'gattserverdisconnected',
      this.onDisconnected,
    );


    this.runStop();


    if (device.gatt?.connected) {
      device.gatt.disconnect();
    }


    this.device = null;
  }


  /**
   * Erneut verbinden.
   */
  async reconnect(): Promise<void> {

    window.clearTimeout(this.retryTimer);

    if (!this.device) {
      return this.connect();
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

      this.fail(error);
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
        device.gatt.disconnect();
      }
    }


    this.device = null;


    this.snap = {
      link: {
        ...INITIAL_LINK,
      },
      readings: {},
    };

    this.emit();
  }


  /**
   * GATT-Verbindung und Geräteerkennung.
   */
  private async attach(
    device: BluetoothDevice,
    generation: number,
  ): Promise<void> {

    if (!device.gatt) {
      throw new DOMException(
        'Das Gerät stellt keinen GATT-Server bereit.',
        'NetworkError',
      );
    }


    console.info('[Scooter OS] Verbinde GATT');


    const server = await device.gatt.connect();


    if (generation !== this.generation) {
      server.disconnect();
      return;
    }


    console.info('[Scooter OS] GATT verbunden');


    /**
     * Dienste erkennen.
     */
    const services = await discoverServices(server);


    if (generation !== this.generation) return;


    console.info(
      '[Scooter OS] Erkannte Dienste:',
      services,
    );


    /**
     * Adapter auswählen.
     */
    const candidates = pickAdapters(
      services.map((service) => service.uuid),
    );


    /**
     * Geräteinformationen lesen.
     */
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

      error:
        candidates.length > 0
          ? null
          : 'noProtocol',

      errorDetail:
        candidates.length > 0
          ? null
          : 'Bluetooth verbunden, aber kein unterstütztes Fahrzeugprotokoll gefunden.',

      attempt: 0,

      rssi: null,
    });


    /**
     * RSSI optional überwachen.
     */
    this.watchRssi(device);


    /**
     * Alte Adapter stoppen.
     */
    this.runStop();


    const started: typeof candidates = [];


    /**
     * Adapter einzeln starten.
     */
    for (const adapter of candidates) {

      if (generation !== this.generation) return;

      try {

        console.info(
          '[Scooter OS] Starte Adapter:',
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
          '[Scooter OS] Adapter konnte nicht gestartet werden:',
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

      error:
        started.length > 0
          ? null
          : 'noProtocol',

      errorDetail:
        started.length > 0
          ? null
          : 'Verbindung hergestellt. Keine unterstützten Datenadapter aktiv.',

    });


    console.info(
      '[Scooter OS] Verbindung vollständig hergestellt',
    );
  }


  /**
   * Wird bei Verbindungsverlust aufgerufen.
   */
  private onDisconnected = () => {

    console.warn(
      '[Scooter OS] Bluetooth-Verbindung verloren',
    );


    this.runStop();


    this.snap = {
      ...this.snap,
      readings: {},
    };


    if (this.manualDisconnect) {

      this.setLink({
        ...INITIAL_LINK,
      });

      return;
    }


    this.setLink({

      state: 'lost',

      error: 'gatt',

      errorDetail:
        'Bluetooth-Verbindung zum Roller wurde unterbrochen.',

      attempt: 0,

    });


    this.scheduleRetry(1);
  };


  /**
   * Automatische Wiederverbindung.
   */
  private scheduleRetry(attempt: number) {

    if (
      attempt > RETRY_DELAYS.length ||
      !this.device
    ) {

      this.setLink({

        state: 'lost',

        attempt: 0,

        errorDetail:
          'Automatische Wiederverbindung fehlgeschlagen. Bitte manuell verbinden.',

      });

      return;
    }


    this.setLink({

      state: 'lost',

      attempt,

      errorDetail:
        `Wiederverbindung Versuch ${attempt} von 3`,

    });


    this.retryTimer = window.setTimeout(

      async () => {

        if (
          this.manualDisconnect ||
          !this.device
        ) {
          return;
        }


        const generation = this.generation;


        try {

          console.info(
            `[Scooter OS] Wiederverbindung ${attempt}/3`,
          );


          await this.attach(
            this.device,
            generation,
          );


        } catch (error) {

          console.warn(
            '[Scooter OS] Wiederverbindung fehlgeschlagen:',
            error,
          );


          this.scheduleRetry(attempt + 1);
        }

      },

      RETRY_DELAYS[attempt - 1],

    );
  }


  /**
   * Adapter stoppen.
   */
  private runStop() {

    for (const stop of this.stops) {

      try {

        stop();

      } catch (error) {

        console.warn(
          '[Scooter OS] Adapter konnte nicht gestoppt werden:',
          error,
        );
      }
    }


    this.stops = [];
  }


  /**
   * RSSI optional überwachen.
   *
   * Nicht alle Browser unterstützen diese Funktion.
   */
  private watchRssi(device: BluetoothDevice) {

    const d = device as unknown as {

      watchAdvertisements?: () => Promise<void>;

      addEventListener: (
        type: string,
        listener: (event: { rssi?: number }) => void,
      ) => void;

    };


    if (
      typeof d.watchAdvertisements !== 'function'
    ) {
      return;
    }


    d.addEventListener(
      'advertisementreceived',
      (event) => {

        if (typeof event.rssi === 'number') {

          this.setLink({
            rssi: event.rssi,
          });
        }
      },
    );


    d.watchAdvertisements().catch((error) => {

      console.info(
        '[Scooter OS] RSSI nicht verfügbar:',
        error,
      );

    });
  }


  /**
   * Fehlerdiagnose.
   */
  private fail(error: unknown) {
    const details = getErrorMessage(error);
    const name = details.name;
    const message = details.message;

    console.error('[Scooter OS] Bluetooth-Fehler:', error);
    console.error('[Scooter OS] Fehlername:', name);
    console.error('[Scooter OS] Fehlermeldung:', message);

    let code: BleErrorCode = 'unknown';

    if (name === 'NotFoundError' || name === 'AbortError') {
      code = 'cancelled';
    } else if (name === 'SecurityError' || name === 'NotAllowedError') {
      code = 'denied';
    } else if (name === 'NetworkError' || name === 'InvalidStateError') {
      code = 'gatt';
    } else if (name === 'NotSupportedError') {
      code = 'unsupported';
    }

    // Den tatsächlichen Browserfehler auch bei einem Abbruch anzeigen.
    this.setLink({
      state: code === 'cancelled' ? 'disconnected' : 'error',
      error: code,
      errorDetail: `${name}: ${message}`,
    });
  }

}


/**
 * Globale Bluetooth-Instanz.
 */
export const bluetoothManager =
  new BluetoothManager();


/**
 * React Hook.
 */
export function useBluetooth(): BleSnapshot {

  return useSyncExternalStore(

    bluetoothManager.subscribe,

    bluetoothManager.getSnapshot,

  );
}
