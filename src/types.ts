export type Lang = 'de' | 'en';
export type SpeedUnit = 'kmh' | 'mph';
export type DistUnit = 'km' | 'mi';
export type AppMode = 'demo' | 'real';
export type DriveMode = 'ECO' | 'NORMAL' | 'SPORT';
export type LatLon = [number, number];

/** Woher ein Wert stammt. Nur 'device' sind echte Roller-Daten. */
export type Source = 'device' | 'calculated' | 'simulated' | 'gps' | 'unavailable';

export interface Reading<T> {
  value: T | null;
  source: Source;
}

export interface VehicleData {
  speedKmh: Reading<number>;
  batteryPct: Reading<number>;
  rangeKm: Reading<number>;
  mode: Reading<DriveMode>;
  odometerKm: Reading<number>;
  temperatureC: Reading<number>;
  errors: Reading<string[]>;
}

/** Rohwerte, die ein Protokoll-Adapter tatsächlich vom Roller gelesen hat. */
export interface DeviceReadings {
  speedKmh?: number;
  /** 'calculated', wenn der Adapter die Geschwindigkeit aus Rohdaten (z. B. Raddrehzahl) ableitet. Standard: 'device'. */
  speedSource?: 'device' | 'calculated';
  batteryPct?: number;
  rangeKm?: number;
  mode?: DriveMode;
  odometerKm?: number;
  temperatureC?: number;
  errors?: string[];
}

export type LinkState = 'disconnected' | 'connecting' | 'connected' | 'lost' | 'error';
export type BleErrorCode = 'unsupported' | 'insecure' | 'cancelled' | 'denied' | 'gatt' | 'noProtocol' | 'badUuid' | 'unknown';

/** Ergebnis der GATT-Service-Erkennung (nur freigegebene Services, rein lesend aufgelistet). */
export interface GattServiceInfo {
  uuid: string;
  characteristics: { uuid: string; properties: string[] }[];
}

export interface LinkInfo {
  state: LinkState;
  deviceName: string | null;
  model: string | null;
  manufacturer: string | null;
  firmware: string | null;
  /** Aktive Protokoll-Adapter (mehrere Standard-Profile können gleichzeitig laufen). */
  adapters: { id: string; label: string }[];
  services: GattServiceInfo[];
  protocolSupported: boolean;
  rssi: number | null;
  error: BleErrorCode | null;
  errorDetail: string | null;
  attempt: number;
}

export interface Fix {
  lat: number;
  lon: number;
  accuracy: number;
  speedKmh: number | null;
  heading: number | null;
  ts: number;
}

export interface Place {
  lat: number;
  lon: number;
  label: string;
}
