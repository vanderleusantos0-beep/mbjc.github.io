# Scooter OS – Digitalcockpit

React + TypeScript + Tailwind + Leaflet. Zwei getrennte Modi: **DEMO** (simuliert) und **ECHT** (Web Bluetooth).

```bash
npm install
npm run dev      # localhost zählt als sicherer Kontext
npm run build
```
Web Bluetooth und Geolocation brauchen HTTPS (oder localhost). Empfohlen: Chrome/Edge (Desktop, Android). iOS/Safari: nicht unterstützt → native App oder Bluetooth-Bridge nötig.

## Architektur
```
src/ble/BluetoothManager.ts   Verbindung, Geräteauswahl, Abbruch-Erkennung, Auto-Reconnect (3 Versuche), Adapter-Steuerung
src/ble/discovery.ts          Geräte-/GATT-Service-Erkennung (rein lesend), Device Information, UUID-Eingabe
src/ble/adapters/types.ts     Schnittstelle ScooterAdapter (austauschbar, Datenübertragung + Interpretation)
src/ble/adapters/index.ts     Registrierung; passende Adapter werden anhand der gefundenen Services gewählt
src/ble/adapters/genericBattery.ts   Standard-BLE Battery Service 0x180F (Akkustand)
src/ble/adapters/cyclingSpeed.ts     Standard-BLE Cycling Speed & Cadence 0x1816 (Geschwindigkeit, BERECHNET)
src/vehicle/vehicle.ts        Datenquellen-Mischung + Herkunftskennzeichnung, Demo-Simulation
src/gps  src/nav  src/voice  src/assistant   GPS, Routing/Ansagen, TTS/STT, Assistent
src/components                Anzeige
```
Jeder Wert trägt eine Herkunft: `ROLLER` (vom Gerät gelesen), `BERECHNET`, `SIMULIERT`, `GPS`, `N/V`.
Im ECHT-Modus erscheinen nie simulierte Werte; fehlende Werte zeigen `--` / `N/V`.

## Wichtig: Hersteller-Protokoll
Es sind **bewusst keine** erfundenen Hersteller-UUIDs oder Datenformate enthalten. Ohne Hersteller-Adapter liest die App nur, was der Bluetooth-SIG-Standard definiert, und nur, wenn der Roller diese Dienste anbietet:

| Standardprofil | UUID | Ergebnis im Dashboard |
|---|---|---|
| Battery Service | 0x180F / 0x2A19 | Akkustand, Herkunft `ROLLER` |
| Device Information | 0x180A | Hersteller, Modell, Firmware |
| Cycling Speed & Cadence | 0x1816 / 0x2A5B | Geschwindigkeit aus Radumdrehungen × Radumfang (Einstellungen), Herkunft `BERECHNET` |

Fahrmodus, Kilometerstand, Temperatur und Fehlercodes erscheinen erst, wenn ein Adapter für ein **dokumentiertes** Protokoll existiert; bis dahin stehen sie als `N/V` da (auch „keine Fehler“ wird nie behauptet). Viele Roller (z. B. mit App-Pairing/Authentifizierung) bieten diese Standarddienste nicht an – dann verbindet die App, zeigt unter „Erkannte GATT-Dienste“, was freigegeben ist, und liefert keine Fahrzeugdaten. Web Bluetooth listet nur Dienste auf, die beim Verbinden angefragt wurden; weitere UUIDs aus der **offiziellen** Herstellerdokumentation lassen sich unter „Erweitert“ eintragen.

Mehrere passende Standard-Adapter laufen gleichzeitig. Ein Hersteller-Adapter mit `exclusive: true` verdrängt sie.

### Neuen Scooter-Adapter hinzufügen
1. `src/ble/adapters/<hersteller>.ts` anlegen und `ScooterAdapter` implementieren (`serviceUuids`, `supports`, `start`, `exclusive: true`).
2. In `start()` nur **lesen/abonnieren** und mit `emit({ speedKmh, batteryPct, … })` nur tatsächlich gelesene Werte melden.
3. In `src/ble/adapters/index.ts` in `ADAPTERS` eintragen. Werte, die aus Rohdaten abgeleitet werden, mit `speedSource: 'calculated'` melden (bzw. im Adapter entsprechend kennzeichnen).

## Sicherheit
- Es werden keine Schreibbefehle an den Roller gesendet; der Fahrmodus wird nur angezeigt.
- Ab > 3 km/h sind Einstellungen, Zieleingabe, Tastatureingabe und Verbinden gesperrt; Sprachsteuerung und Ansagen bleiben aktiv.

## Externe Dienste (benötigen Internet)
Kartenkacheln (OpenStreetMap), Routing (routing.openstreetmap.de, Fahrradprofil), Suche (Nominatim), Ladestationen (Overpass). Für Produktivbetrieb eigene Instanzen oder Anbieter mit passender Nutzungsvereinbarung verwenden.

## iOS / Safari (Bridge-Architektur)
Safari und alle iOS-Browser unterstützen Web Bluetooth nicht. Die Oberfläche trennt Datenquelle und Anzeige bereits: Alles läuft über `DeviceReadings` (siehe `src/types.ts`) und `LinkInfo`. Eine native App oder ein lokaler Bridge-Dienst übernimmt dort BLE und liefert dieselben Werte (z. B. per WebSocket) – dafür muss nur ein weiterer Transport neben `BluetoothManager` ergänzt werden, der `DeviceReadings` einspeist. **Dieser Transport ist noch nicht implementiert**; die App zeigt unter iOS nur den Hinweis.

## Getestet / nicht getestet
Geprüft: Syntax aller Quelldateien, Vollständigkeit der DE/EN-Texte, CSC-Parser (inkl. Überlauf) und UUID-Parser per Testskript. **Nicht** geprüft: `npm run build` und der Betrieb mit einem echten Roller – beides war in der Entwicklungsumgebung nicht möglich (kein Paketzugriff, keine Bluetooth-Hardware).
