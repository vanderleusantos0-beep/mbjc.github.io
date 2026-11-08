import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, ShieldCheck, TriangleAlert } from 'lucide-react';
import { I18nCtx, makeT } from './i18n';
import { useSettings } from './settings';
import { bluetoothManager, useBluetooth } from './ble/BluetoothManager';
import { useGps } from './gps/useGps';
import { buildVehicle, useDemoVehicle, useTrip } from './vehicle/vehicle';
import { useNavigation } from './nav/useNavigation';
import { pointAt } from './nav/routing';
import { findChargers, searchPlace, type Charger } from './nav/places';
import { useListen, useSpeech } from './voice/speech';
import { answer, chargerReply } from './assistant/assistant';
import type { AppMode, DriveMode, Fix } from './types';
import Header from './components/Header';
import SpeedPanel from './components/SpeedPanel';
import { BatteryPanel, TripPanel, VehiclePanel } from './components/VehicleInfo';
import ConnectionPanel from './components/ConnectionPanel';
import NavPanel from './components/NavPanel';
import MapView from './components/MapView';
import StatusBar from './components/StatusBar';
import SettingsPanel from './components/SettingsPanel';
import AssistantPanel, { type Msg } from './components/AssistantPanel';

const DEMO_LOCATION: Fix = { lat: 52.52, lon: 13.405, accuracy: 5, speedKmh: null, heading: null, ts: 0 };
const MOVING_KMH = 3;

export default function App() {
  const [s, set] = useSettings();
  const t = useMemo(() => makeT(s.lang), [s.lang]);
  const demo = s.appMode === 'demo';
  useEffect(() => bluetoothManager.setWheelCircumference(s.wheelMm), [s.wheelMm]);

  /* ---------- Datenquellen (getrennte Schichten) ---------- */
  const ble = useBluetooth();
  const gps = useGps();
  const [riding, setRiding] = useState(false);
  const [demoMode, setDemoMode] = useState<DriveMode>('NORMAL');
  const demoVeh = useDemoVehicle(demo, riding, demoMode);
  const [simFix, setSimFix] = useState<Fix | null>(null);

  const pos: Fix | null = demo && simFix ? simFix : (gps.fix ?? (demo ? DEMO_LOCATION : null));
  const gpsSimulated = demo && (simFix != null || !gps.fix);

  const vehicle = buildVehicle({
    appMode: s.appMode,
    ble: ble.readings,
    demo: demoVeh,
    demoMode,
    gpsSpeedKmh: gps.fix?.speedKmh ?? null,
    fullRangeKm: s.fullRangeKm,
  });
  const moving = (vehicle.speedKmh.value ?? 0) > MOVING_KMH;
  const trip = useTrip(vehicle.speedKmh.value);

  /* ---------- Sprache ---------- */
  const { speak, voices } = useSpeech({ lang: s.lang, enabled: s.voiceOn, volume: s.volume, voiceURI: s.voiceURI });

  /* ---------- Navigation ---------- */
  const nav = useNavigation({ pos, lang: s.lang, distUnit: s.distUnit, speak, t });

  // Demo: Position entlang der echten Route simulieren (klar als simuliert gekennzeichnet)
  const speedRef = useRef(0);
  speedRef.current = demoVeh.speed;
  const simActive = demo && nav.status === 'active';
  useEffect(() => {
    const route = nav.route;
    if (!simActive || !route) {
      setSimFix(null);
      return;
    }
    let along = 0;
    const id = window.setInterval(() => {
      along = Math.min(route.length, along + (speedRef.current / 3.6) * 0.5);
      const p = pointAt(route, along);
      setSimFix({ lat: p.lat, lon: p.lon, accuracy: 5, speedKmh: speedRef.current, heading: p.heading, ts: Date.now() });
    }, 500);
    return () => window.clearInterval(id);
  }, [simActive, nav.route]);

  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && nav.status === 'idle') setRiding(false);
    wasActive.current = nav.status === 'active';
  }, [nav.status]);

  const startNav = useCallback(() => {
    if (demo) setRiding(true);
    nav.start();
  }, [demo, nav]);

  /* ---------- Ladestationen ---------- */
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [chLoading, setChLoading] = useState(false);
  const loadChargers = useCallback(async (): Promise<Charger[]> => {
    if (!pos) {
      nav.setError('err.noGps');
      return [];
    }
    setChLoading(true);
    try {
      const l = await findChargers(pos.lat, pos.lon);
      setChargers(l);
      return l;
    } catch {
      nav.setError('err.chargers');
      return [];
    } finally {
      setChLoading(false);
    }
  }, [pos, nav]);

  /* ---------- Warnungen ---------- */
  const batt = vehicle.batteryPct.value;
  const warned = useRef({ l15: false, l5: false });
  useEffect(() => {
    if (batt == null) return;
    const w = warned.current;
    if (batt <= 5 && !w.l5) {
      w.l5 = w.l15 = true;
      speak(t('say.battery', { n: Math.round(batt) }));
    } else if (batt <= 15 && !w.l15) {
      w.l15 = true;
      speak(t('say.battery', { n: Math.round(batt) }));
    } else if (batt > 20) {
      w.l15 = w.l5 = false;
    }
  }, [batt, speak, t]);

  const prevLink = useRef(ble.link.state);
  useEffect(() => {
    if (prevLink.current === 'connected' && ble.link.state === 'lost') speak(t('conn.dropSay'));
    prevLink.current = ble.link.state;
  }, [ble.link.state, speak, t]);

  /* ---------- Assistent ---------- */
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'bot', text: t('ai.greeting') }]);
  const [aiOpen, setAiOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);

  const ask = async (q: string) => {
    const x = (de: string, en: string) => (s.lang === 'de' ? de : en);
    const say = (text: string) => {
      setMsgs((m) => [...m, { role: 'bot', text }]);
      speak(text);
    };
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    const r = answer(q, {
      lang: s.lang,
      appMode: s.appMode,
      battery: vehicle.batteryPct,
      range: vehicle.rangeKm,
      speed: vehicle.speedKmh,
      driveMode: vehicle.mode,
      fullRangeKm: s.fullRangeKm,
      speedUnit: s.speedUnit,
      distUnit: s.distUnit,
      route: nav.route && nav.dest ? { lengthM: nav.route.length, label: nav.dest.label, remainingM: nav.remainingM } : null,
      home: s.home,
    });
    say(r.text);
    const a = r.action;
    if (!a) return;
    if (a.type === 'home' && s.home) nav.plan(s.home);
    else if (a.type === 'stopNav') nav.clear();
    else if (a.type === 'startNav') {
      if (nav.status === 'preview') startNav();
      else say(x('Es ist keine Route zum Starten geplant.', 'There is no planned route to start.'));
    } else if (a.type === 'navigate') {
      try {
        const res = await searchPlace(a.query, s.lang, pos ?? undefined);
        if (!res.length) return say(x('Ich habe dieses Ziel nicht gefunden.', 'I could not find that destination.'));
        await nav.plan(res[0]);
        say(x(`Die Route nach ${res[0].label} ist bereit. Sage „Navigation starten“.`, `The route to ${res[0].label} is ready. Say "start navigation".`));
      } catch {
        say(t('err.search'));
      }
    } else if (a.type === 'chargers') {
      const l = await loadChargers();
      say(chargerReply(l, s.distUnit, s.lang, t('chargers.unnamed')));
    }
  };

  const listen = useListen(s.lang, (txt) => void ask(txt));
  const onMic = () => (listen.listening ? listen.stop() : listen.start());

  /* ---------- Sperren während der Fahrt ---------- */
  useEffect(() => {
    if (moving) setSetOpen(false);
  }, [moving]);

  const changeMode = (m: AppMode) => {
    if (m === s.appMode) return;
    nav.clear();
    setRiding(false);
    trip.reset();
    set({ appMode: m });
  };

  const canPick = !moving && nav.status !== 'active' && nav.status !== 'planning';
  const lowBattery = batt != null && batt <= 15;

  return (
    <I18nCtx.Provider value={{ lang: s.lang, t }}>
      <div
        className="flex min-h-[100dvh] flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:h-[100dvh] lg:overflow-hidden"
        style={{ filter: s.brightness !== 1 ? `brightness(${s.brightness})` : undefined }}
      >
        <Header
          appMode={s.appMode}
          link={ble.link}
          lang={s.lang}
          voiceOn={s.voiceOn}
          moving={moving}
          listening={listen.listening}
          micSupported={listen.supported}
          onMode={changeMode}
          onLang={(lang) => set({ lang, voiceURI: '' })}
          onVoice={() => set({ voiceOn: !s.voiceOn })}
          onAssistant={() => setAiOpen(true)}
          onMic={onMic}
          onSettings={() => setSetOpen(true)}
        />

        {demo && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-am/50 bg-am/10 px-4 py-2 text-sm font-semibold text-am">
            <span className="flex items-center gap-2">
              <TriangleAlert size={18} /> {t('banner.demo')}
            </span>
            <button className="btn !border-am/60 !bg-am/10 !py-1.5 text-xs !text-am" onClick={() => setRiding((r) => !r)}>
              {riding ? <Pause size={16} /> : <Play size={16} />} {riding ? t('demo.pause') : t('demo.start')}
            </button>
          </div>
        )}
        {!demo && (
          <div className="flex items-center gap-2 rounded-2xl border border-gn/50 bg-gn/10 px-4 py-2 text-sm font-semibold text-gn">
            <ShieldCheck size={18} className="shrink-0" /> {t('banner.real')}
          </div>
        )}
        {lowBattery && (
          <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rd/60 bg-rd/15 px-4 py-2 text-sm font-bold text-rd">
            <TriangleAlert size={18} /> {t('battery.warn', { n: Math.round(batt ?? 0) })}
            {vehicle.batteryPct.source === 'simulated' && ` (${t('src.simulated')})`}
          </div>
        )}
        {!demo && ble.link.state === 'lost' && (
          <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rd/60 bg-rd/15 px-4 py-2 text-sm font-bold text-rd animate-pulse">
            <TriangleAlert size={18} /> {t('conn.dropWarn')}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:grid-cols-[300px_minmax(300px,1fr)_minmax(0,1.5fr)] lg:grid-rows-[minmax(0,1fr)]">
          {/* Links: Akku, Reichweite, Fahrinfos */}
          <div className="order-3 flex flex-col gap-3 lg:order-1 lg:min-h-0 lg:overflow-y-auto">
            <BatteryPanel battery={vehicle.batteryPct} range={vehicle.rangeKm} mode={vehicle.mode} distUnit={s.distUnit} fullRangeKm={s.fullRangeKm} />
            <TripPanel distKm={trip.distKm} timeS={trip.timeS} avgKmh={trip.avgKmh} maxKmh={trip.maxKmh} distUnit={s.distUnit} speedUnit={s.speedUnit} onReset={trip.reset} />
            <VehiclePanel odometer={vehicle.odometerKm} temperature={vehicle.temperatureC} errors={vehicle.errors} distUnit={s.distUnit} />
          </div>

          {/* Mitte: Geschwindigkeit, Navigationsassistent */}
          <div className="order-1 flex flex-col gap-3 lg:order-2 lg:min-h-0 lg:overflow-y-auto">
            <SpeedPanel speed={vehicle.speedKmh} mode={vehicle.mode} unit={s.speedUnit} demo={demo} onDemoMode={setDemoMode} />
            {!demo && ble.link.state !== 'connected' && <ConnectionPanel link={ble.link} moving={moving} extraUuids={s.extraUuids} onExtraUuids={(extraUuids) => set({ extraUuids })} wheelMm={s.wheelMm} />}
            <NavPanel
              status={nav.status}
              route={nav.route}
              dest={nav.dest}
              next={nav.next}
              remainingM={nav.remainingM}
              etaTs={nav.etaTs}
              rerouting={nav.rerouting}
              error={nav.error}
              locked={moving && nav.status !== 'active'}
              distUnit={s.distUnit}
              home={s.home}
              batteryPct={batt}
              fullRangeKm={s.fullRangeKm}
              chargers={chargers}
              chargersLoading={chLoading}
              pos={pos}
              onPlan={nav.plan}
              onStart={startNav}
              onClear={nav.clear}
              onSaveHome={() => nav.dest && set({ home: nav.dest })}
              onLoadChargers={loadChargers}
              onSetError={nav.setError}
            />
            {!demo && ble.link.state === 'connected' && <ConnectionPanel link={ble.link} moving={moving} extraUuids={s.extraUuids} onExtraUuids={(extraUuids) => set({ extraUuids })} wheelMm={s.wheelMm} />}
          </div>

          {/* Rechts: Karte */}
          <div className="order-2 h-[60dvh] lg:order-3 lg:h-auto lg:min-h-0">
            <MapView
              fix={pos}
              route={nav.route}
              dest={nav.dest ? [nav.dest.lat, nav.dest.lon] : null}
              chargers={chargers}
              dark={s.dark}
              navActive={nav.status === 'active'}
              canPick={canPick}
              onPick={(lat, lon) => nav.plan({ lat, lon, label: t('nav.pickedPoint') })}
              onChargerClick={(c) => canPick && nav.plan({ lat: c.lat, lon: c.lon, label: c.name || t('chargers.unnamed') })}
              unnamed={t('chargers.unnamed')}
            />
          </div>
        </main>

        <StatusBar fix={pos} gpsStatus={gps.status} gpsSimulated={gpsSimulated} link={ble.link} appMode={s.appMode} voiceOn={s.voiceOn} moving={moving} />

        {setOpen && !moving && <SettingsPanel s={s} set={set} voices={voices} onTest={() => speak(t('set.testText'), true)} onClose={() => setSetOpen(false)} />}
        {aiOpen && <AssistantPanel messages={msgs} moving={moving} listening={listen.listening} micSupported={listen.supported} onAsk={(q) => void ask(q)} onMic={onMic} onClose={() => setAiOpen(false)} />}
      </div>
    </I18nCtx.Provider>
  );
}
