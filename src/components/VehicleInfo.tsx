import { BatteryCharging, Gauge, Thermometer } from 'lucide-react';
import type { DistUnit, DriveMode, Reading, SpeedUnit } from '../types';
import { useT } from '../i18n';
import { distLabel, distOf, fmt, fmtDuration, speedLabel, speedOf } from '../util';
import { rangeFor } from '../vehicle/vehicle';
import { Panel, Row, SourceTag } from './ui';

export type BatteryState = 'full' | 'normal' | 'low' | 'critical' | 'unknown';
export const batteryState = (p: number | null): BatteryState =>
  p == null ? 'unknown' : p >= 90 ? 'full' : p >= 30 ? 'normal' : p >= 15 ? 'low' : 'critical';

const COLOR: Record<BatteryState, string> = {
  full: 'bg-gn text-gn',
  normal: 'bg-cy text-cy',
  low: 'bg-am text-am',
  critical: 'bg-rd text-rd',
  unknown: 'bg-mute text-mute',
};

export function BatteryPanel(props: {
  battery: Reading<number>;
  range: Reading<number>;
  mode: Reading<DriveMode>;
  distUnit: DistUnit;
  fullRangeKm: number;
}) {
  const { t, lang } = useT();
  const pct = props.battery.value;
  const st = batteryState(pct);
  const ecoRange = pct != null ? rangeFor(pct, 'ECO', props.fullRangeKm) : null;
  const du = distLabel(props.distUnit);

  return (
    <Panel title={t('battery.title')} icon={<BatteryCharging size={14} />}>
      <div className="flex items-end justify-between">
        <div className={`font-digi text-5xl font-extrabold tabular-nums ${COLOR[st].split(' ')[1]}`}>
          {pct != null ? fmt(pct, 0, lang) : '--'}
          <span className="ml-1 text-xl">%</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-sm font-bold uppercase tracking-widest ${COLOR[st].split(' ')[1]}`}>{t(`battery.${st}`)}</span>
          <SourceTag source={props.battery.source} />
        </div>
      </div>

      <div className="mt-3 h-5 overflow-hidden rounded-full border border-cy/30 bg-bg/60 p-[3px]" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full ${COLOR[st].split(' ')[0]} ${st === 'critical' ? 'animate-pulse' : ''}`}
          style={{ width: `${pct ?? 0}%`, transition: 'width 0.8s ease, background-color 0.5s', boxShadow: '0 0 14px currentColor' }}
        />
      </div>

      <div className="mt-4 border-t border-cy/15 pt-3">
        <div className="label mb-1">{t('range.title')}</div>
        <div className="flex items-baseline justify-between">
          <div className="font-digi text-3xl font-extrabold text-tq tabular-nums">
            {props.range.value != null ? fmt(distOf(props.range.value, props.distUnit), 1, lang) : '--'}
            <span className="ml-1 text-base">{du}</span>
          </div>
          <SourceTag source={props.range.source} />
        </div>
        {ecoRange != null && props.mode.value !== 'ECO' && (
          <Row label={t('range.eco')} tag="calculated">
            {fmt(distOf(ecoRange, props.distUnit), 1, lang)} {du}
          </Row>
        )}
        {ecoRange != null && (
          <p className="text-[11px] text-mute">{t('range.ecoNote', { n: `${fmt(distOf(props.fullRangeKm, props.distUnit), 0, lang)} ${du}` })}</p>
        )}
      </div>
    </Panel>
  );
}

export function TripPanel(props: {
  distKm: number;
  timeS: number;
  avgKmh: number | null;
  maxKmh: number;
  distUnit: DistUnit;
  speedUnit: SpeedUnit;
  onReset: () => void;
}) {
  const { t, lang } = useT();
  return (
    <Panel title={t('trip.title')} icon={<Gauge size={14} />}>
      <Row label={t('trip.distance')} tag="calculated">
        {fmt(distOf(props.distKm, props.distUnit), 2, lang)} {distLabel(props.distUnit)}
      </Row>
      <Row label={t('trip.time')}>{fmtDuration(props.timeS)}</Row>
      <Row label={t('trip.avg')}>
        {props.avgKmh != null ? fmt(speedOf(props.avgKmh, props.speedUnit), 1, lang) : '–'} {speedLabel(props.speedUnit)}
      </Row>
      <Row label={t('trip.max')}>
        {fmt(speedOf(props.maxKmh, props.speedUnit), 1, lang)} {speedLabel(props.speedUnit)}
      </Row>
      <button className="btn mt-2 w-full !py-2 text-sm" onClick={props.onReset}>
        {t('trip.reset')}
      </button>
    </Panel>
  );
}

export function VehiclePanel(props: {
  odometer: Reading<number>;
  temperature: Reading<number>;
  errors: Reading<string[]>;
  distUnit: DistUnit;
}) {
  const { t, lang } = useT();
  const { odometer: o, temperature: te, errors: e } = props;
  const na = <span className="text-mute">–</span>;
  return (
    <Panel title={t('veh.title')} icon={<Thermometer size={14} />}>
      <Row label={t('veh.odo')} tag={o.source}>
        {o.value != null ? `${fmt(distOf(o.value, props.distUnit), 1, lang)} ${distLabel(props.distUnit)}` : na}
      </Row>
      <Row label={t('veh.temp')} tag={te.source}>
        {te.value != null ? `${fmt(te.value, 0, lang)} °C` : na}
      </Row>
      <Row label={t('veh.errors')} tag={e.source}>
        {e.value == null ? na : e.value.length === 0 ? <span className="text-gn">{t('veh.noErrors')}</span> : <span className="text-rd">{e.value.join(', ')}</span>}
      </Row>
    </Panel>
  );
}
