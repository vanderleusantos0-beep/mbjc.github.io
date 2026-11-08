import { Bluetooth, BluetoothConnected, Loader2, RefreshCw, TriangleAlert, Unplug } from 'lucide-react';
import type { Key } from '../i18n';
import { useT } from '../i18n';
import { bleSupport, bluetoothManager } from '../ble/BluetoothManager';
import { describeUuid } from '../ble/discovery';
import type { LinkInfo } from '../types';
import { Panel, Row } from './ui';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const CSC_ID = 'ble-standard-csc';

interface Props {
  link: LinkInfo;
  moving: boolean;
  extraUuids: string;
  onExtraUuids: (v: string) => void;
  wheelMm: number;
}

export default function ConnectionPanel({ link, moving, extraUuids, onExtraUuids, wheelMm }: Props) {
  const { t } = useT();
  const sup = bleSupport();
  const busy = link.state === 'connecting';
  const onlyStandard = link.adapters.length > 0 && link.adapters.every((a) => a.id.startsWith('ble-standard'));
  const needsWheel = link.adapters.some((a) => a.id === CSC_ID) && wheelMm <= 0;

  return (
    <Panel title="BLUETOOTH" icon={<Bluetooth size={14} />}>
      {link.state === 'connected' ? (
        <div>
          <div className="flex items-center gap-2 font-digi text-sm font-extrabold tracking-widest text-gn">
            <BluetoothConnected size={20} /> {t('conn.connected')}
          </div>
          <div className="mt-2">
            <Row label={t('conn.model')}>{link.model ?? '–'}</Row>
            {link.manufacturer && <Row label={t('conn.manufacturer')}>{link.manufacturer}</Row>}
            {link.firmware && <Row label={t('conn.firmware')}>{link.firmware}</Row>}
            <Row label={t('conn.quality')}>
              {link.rssi != null ? `${link.rssi} dBm` : <span className="text-xs font-normal text-mute">{t('conn.qualityNa')}</span>}
            </Row>
          </div>

          <div className="label mt-2">{t('conn.adapters')}</div>
          {link.adapters.length ? (
            <ul className="mt-1 space-y-0.5 text-xs">
              {link.adapters.map((a) => (
                <li key={a.id} className="text-gn">
                  ● {a.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 flex gap-2 rounded-xl border border-am/40 bg-am/10 p-3 text-xs text-am">
              <TriangleAlert size={16} className="shrink-0" /> {t('conn.noProtocol')}
            </p>
          )}
          {needsWheel && (
            <p className="mt-2 flex gap-2 rounded-xl border border-am/40 bg-am/10 p-3 text-xs text-am">
              <TriangleAlert size={16} className="shrink-0" /> {t('conn.needWheel')}
            </p>
          )}
          {onlyStandard && <p className="mt-2 text-xs text-mute">{t('conn.genericNote')}</p>}

          <details className="mt-3 rounded-xl border border-cy/15 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-cy">{t('conn.services')}</summary>
            {link.services.length === 0 ? (
              <p className="mt-2 text-mute">{t('conn.servicesNone')}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {link.services.map((s) => (
                  <li key={s.uuid}>
                    <div className="break-all font-semibold">{describeUuid(s.uuid, 'service')}</div>
                    <ul className="ml-3 mt-0.5 space-y-0.5 text-mute">
                      {s.characteristics.map((c) => (
                        <li key={c.uuid} className="break-all">
                          {describeUuid(c.uuid, 'characteristic')} <span className="text-[10px]">[{c.properties.join(', ') || '–'}]</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-mute">{t('conn.readOnly')}</p>
          </details>

          <button className="btn mt-3 w-full" onClick={() => bluetoothManager.disconnect()}>
            <Unplug size={18} /> {t('conn.disconnect')}
          </button>
        </div>
      ) : link.state === 'lost' ? (
        <div>
          <div className="flex items-center gap-2 font-digi text-sm font-extrabold tracking-widest text-rd">
            <TriangleAlert size={20} /> {t('conn.lost')}
          </div>
          {link.attempt > 0 && <p className="mt-2 text-sm text-mute">{t('conn.retrying', { n: link.attempt })}</p>}
          <button className="btn-primary mt-3 flex w-full items-center justify-center gap-2" onClick={() => bluetoothManager.reconnect()}>
            <RefreshCw size={18} /> {t('conn.reconnect')}
          </button>
          <button className="btn mt-2 w-full !py-2 text-sm" onClick={() => bluetoothManager.disconnect()}>
            {t('conn.disconnect')}
          </button>
        </div>
      ) : (
        <div>
          <div className="font-semibold text-ink">{t('conn.none')}</div>
          <button
            className="btn-primary mt-3 flex w-full items-center justify-center gap-2"
            onClick={() => bluetoothManager.connect(extraUuids)}
            disabled={busy || moving || !sup.ok}
            style={busy || moving || !sup.ok ? { opacity: 0.5, boxShadow: 'none' } : undefined}
          >
            {busy ? <Loader2 size={20} className="animate-spin" /> : <Bluetooth size={20} />}
            {busy ? t('conn.connecting') : t('conn.connect')}
          </button>
          {moving && <p className="mt-2 text-xs text-am">{t('conn.lockedMoving')}</p>}
          {link.error && link.error !== 'noProtocol' && (
            <p className={`mt-2 text-sm ${link.error === 'cancelled' ? 'text-mute' : 'text-rd'}`}>
              {t(`err.${link.error}` as Key, { u: link.errorDetail ?? '' })}
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-mute">{t('conn.hint')}</p>

          <details className="mt-3 rounded-xl border border-cy/15 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-cy">{t('conn.advanced')}</summary>
            <label className="mt-2 block text-mute" htmlFor="extra-uuids">
              {t('conn.extraLabel')}
            </label>
            <input
              id="extra-uuids"
              value={extraUuids}
              onChange={(e) => onExtraUuids(e.target.value)}
              placeholder={t('conn.extraPlaceholder')}
              spellCheck={false}
              autoCapitalize="off"
              disabled={moving}
              className="mt-1 w-full rounded-xl border border-cy/30 bg-bg px-3 py-2 text-ink"
            />
            <p className="mt-1 text-mute">{t('conn.extraHint')}</p>
          </details>
        </div>
      )}

      <div className="mt-3 border-t border-cy/15 pt-2">
        <div className="label mb-1">{t('conn.compat')}</div>
        <Row label={t('conn.webBt')}>
          <span className={sup.webBluetooth ? 'text-gn' : 'text-rd'}>{sup.webBluetooth ? t('conn.ok') : t('conn.no')}</span>
        </Row>
        <Row label={t('conn.https')}>
          <span className={sup.secure ? 'text-gn' : 'text-rd'}>{sup.secure ? t('conn.ok') : t('conn.no')}</span>
        </Row>
        {(!sup.webBluetooth || isIos()) && <p className="text-xs text-am">{isIos() ? t('conn.iosHint') : t('err.unsupported')}</p>}
      </div>
    </Panel>
  );
}
