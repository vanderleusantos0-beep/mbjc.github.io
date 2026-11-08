import { Bluetooth, BluetoothConnected, BluetoothOff, Clock, Satellite, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import type { Fix, LinkInfo } from '../types';
import { gpsLevel, type GpsStatus } from '../gps/useGps';
import { fmtClock } from '../util';

export default function StatusBar(p: {
  fix: Fix | null;
  gpsStatus: GpsStatus;
  gpsSimulated: boolean;
  link: LinkInfo;
  appMode: 'demo' | 'real';
  voiceOn: boolean;
  moving: boolean;
}) {
  const { t, lang } = useT();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const lvl = p.gpsSimulated ? 3 : gpsLevel(p.fix, p.gpsStatus);
  const gpsText = p.gpsSimulated
    ? t('status.gpsSim')
    : p.gpsStatus === 'ok' && p.fix
      ? `${t('status.gpsOk')} ${t('status.acc', { n: Math.round(p.fix.accuracy) })}`
      : p.gpsStatus === 'denied'
        ? t('status.gpsDenied')
        : p.gpsStatus === 'unsupported'
          ? t('status.gpsUnsupported')
          : t('status.gpsSearching');

  const BtIcon = p.link.state === 'connected' ? BluetoothConnected : p.link.state === 'connecting' ? Bluetooth : BluetoothOff;
  const btText =
    p.appMode === 'demo'
      ? t('mode.demo')
      : p.link.state === 'connected'
        ? t('conn.connected')
        : p.link.state === 'lost'
          ? t('conn.lost')
          : p.link.state === 'connecting'
            ? t('conn.connecting')
            : t('conn.none');
  const btColor = p.appMode === 'demo' ? 'text-am' : p.link.state === 'connected' ? 'text-gn' : p.link.state === 'lost' ? 'text-rd' : 'text-mute';

  return (
    <footer className="panel flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3 text-sm">
      <div className="flex items-center gap-2">
        <Satellite size={18} className={lvl > 0 ? 'text-gn' : 'text-mute'} />
        <span className="flex items-end gap-0.5" aria-hidden>
          {[1, 2, 3].map((i) => (
            <span key={i} className={`w-1.5 rounded-sm ${i <= lvl ? 'bg-gn' : 'bg-mute/30'}`} style={{ height: 6 + i * 4 }} />
          ))}
        </span>
        <span className={p.gpsSimulated ? 'text-am' : ''}>
          {t('status.gps')}: {gpsText}
        </span>
      </div>
      <div className={`flex items-center gap-2 ${btColor}`}>
        <BtIcon size={18} /> {btText}
      </div>
      <div className="flex items-center gap-2">
        {p.voiceOn ? <Volume2 size={18} className="text-cy" /> : <VolumeX size={18} className="text-mute" />}
        <span className="text-mute">{p.voiceOn ? '' : t('status.voiceOff')}</span>
      </div>
      {p.moving && <span className="font-semibold text-am">{t('status.moving')}</span>}
      <div className="flex items-center gap-2 font-digi text-base font-bold tabular-nums">
        <Clock size={18} className="text-cy" /> {fmtClock(now, lang, true)}
      </div>
    </footer>
  );
}
