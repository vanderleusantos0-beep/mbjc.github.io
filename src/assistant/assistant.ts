import type { AppMode, DistUnit, DriveMode, Lang, Place, Reading, SpeedUnit } from '../types';
import type { Charger } from '../nav/places';
import { MODE_FACTOR } from '../vehicle/vehicle';
import { distLabel, distOf, fmt, fmtLong, speedLabel, speedOf } from '../util';

export interface AssistCtx {
  lang: Lang;
  appMode: AppMode;
  battery: Reading<number>;
  range: Reading<number>;
  speed: Reading<number>;
  driveMode: Reading<DriveMode>;
  fullRangeKm: number;
  speedUnit: SpeedUnit;
  distUnit: DistUnit;
  route: { lengthM: number; label: string; remainingM: number } | null;
  home: Place | null;
}

export type AssistAction =
  | { type: 'chargers' }
  | { type: 'home' }
  | { type: 'navigate'; query: string }
  | { type: 'startNav' }
  | { type: 'stopNav' };

export interface AssistReply {
  text: string;
  action?: AssistAction;
}

/**
 * Regelbasierter Demo-Assistent (keine KI-API). Antwortet nur mit Werten, die
 * tatsächlich vorliegen, und nennt deren Herkunft. Austauschbar gegen eine echte KI-API.
 */
export function answer(q: string, c: AssistCtx): AssistReply {
  const de = c.lang === 'de';
  const x = (a: string, b: string) => (de ? a : b);
  const s = q.toLowerCase();
  const du = distLabel(c.distUnit);
  const note = (r: Reading<unknown>) =>
    r.source === 'device'
      ? ''
      : r.source === 'calculated'
        ? x(` (Schätzung aus Akkustand und Nennreichweite von ${fmt(distOf(c.fullRangeKm, c.distUnit), 0, c.lang)} ${du})`, ` (estimate from battery level and nominal range of ${fmt(distOf(c.fullRangeKm, c.distUnit), 0, c.lang)} ${du})`)
        : r.source === 'simulated'
          ? x(' (simulierter Demo-Wert)', ' (simulated demo value)')
          : r.source === 'gps'
            ? x(' (aus GPS)', ' (from GPS)')
            : '';

  // Navigation steuern
  if (/(navigation|navigieren).*(start|beginn)|(start|beginn).*(navigation)|start navigation/.test(s)) return { text: x('Okay, ich starte die Navigation.', 'Okay, starting navigation.'), action: { type: 'startNav' } };
  if (/(beend|stopp|abbrech).*(navigation)|(stop|end|cancel).*(navigation)/.test(s)) return { text: x('Navigation beendet.', 'Navigation ended.'), action: { type: 'stopNav' } };

  // Ziel per Sprache
  const nav = s.match(/(?:navigiere|navigier|bring mich|route|fahr(?:e)?|navigate|take me|directions?)\s+(?:mich\s+)?(?:nach|zu|zum|zur|to|towards)\s+(.+)/);
  if (nav && !/hause|home/.test(nav[1])) {
    const place = nav[1].replace(/[.?!]+$/, '').trim();
    return { text: x(`Ich suche die Route nach ${place}.`, `Looking for a route to ${place}.`), action: { type: 'navigate', query: place } };
  }

  if (/nach hause|\bhome\b|heimweg/.test(s)) {
    if (!c.home) return { text: x('Du hast noch keine Heimadresse gespeichert. Wähle ein Ziel und tippe auf „Als Zuhause speichern“, solange du stehst.', 'You have not saved a home address yet. Pick a destination and tap "Save as home" while stationary.') };
    return { text: x(`Ich berechne die Route nach Hause (${c.home.label}).`, `Calculating the route home (${c.home.label}).`), action: { type: 'home' } };
  }

  if (/ladestation|laden|charging|charger/.test(s)) return { text: x('Ich suche Ladestationen in deiner Nähe.', 'Searching for charging stations nearby.'), action: { type: 'chargers' } };

  if (/(wie viel|wieviel|how much).*(akku|battery)|akku.*(ziel|benötig|brauche)|battery.*(need|destination|get there)/.test(s)) {
    if (!c.route) return { text: x('Es ist noch kein Ziel gewählt. Nenne mir ein Ziel, dann berechne ich den Akkubedarf.', 'No destination is set. Tell me a destination and I will estimate the battery needed.') };
    if (c.battery.value == null) return { text: x('Der Akkustand liegt nicht vor, daher kann ich den Bedarf nicht beurteilen.', 'The battery level is not available, so I cannot judge the need.') };
    const full = c.fullRangeKm * MODE_FACTOR[c.driveMode.value ?? 'NORMAL'];
    const need = Math.ceil((c.route.lengthM / 1000 / full) * 100);
    const ok = need <= c.battery.value;
    return {
      text: x(
        `Bis ${c.route.label} sind es ${fmtLong(c.route.remainingM, c.distUnit, c.lang)}. Dafür brauchst du etwa ${need} % Akku, du hast ${fmt(c.battery.value, 0, c.lang)} %. ${ok ? 'Das sollte reichen.' : 'Das könnte knapp werden.'} Schätzung auf Basis der Nennreichweite.`,
        `To ${c.route.label} it is ${fmtLong(c.route.remainingM, c.distUnit, c.lang)}. You need roughly ${need} % battery and have ${fmt(c.battery.value, 0, c.lang)} %. ${ok ? 'That should be enough.' : 'That could be tight.'} Estimate based on the nominal range.`,
      ),
    };
  }

  if (/wie schnell|geschwindigkeit|tempo|how fast|speed/.test(s)) {
    if (c.speed.value == null) return { text: x('Aktuell liegt keine Geschwindigkeit vor.', 'No speed value is available right now.') };
    return { text: x(`Du fährst gerade ${fmt(speedOf(c.speed.value, c.speedUnit), 0, c.lang)} ${speedLabel(c.speedUnit)}${note(c.speed)}.`, `You are going ${fmt(speedOf(c.speed.value, c.speedUnit), 0, c.lang)} ${speedLabel(c.speedUnit)}${note(c.speed)}.`) };
  }

  if (/wie weit|reichweite|how far|range/.test(s)) {
    if (c.range.value == null) return { text: x('Dazu liegen mir aktuell keine Akkudaten vor.', 'No battery data is available right now.') };
    return { text: x(`Du kannst noch etwa ${fmt(distOf(c.range.value, c.distUnit), 1, c.lang)} ${du} fahren${note(c.range)}.`, `You can ride about ${fmt(distOf(c.range.value, c.distUnit), 1, c.lang)} ${du} more${note(c.range)}.`) };
  }

  if (/akku|battery|ladestand|charge level/.test(s)) {
    if (c.battery.value == null) return { text: x('Der Akkustand liegt nicht vor.', 'The battery level is not available.') };
    return { text: x(`Dein Akkustand beträgt ${fmt(c.battery.value, 0, c.lang)} Prozent${note(c.battery)}.`, `Your battery level is ${fmt(c.battery.value, 0, c.lang)} percent${note(c.battery)}.`) };
  }

  if (/wann|ankunft|eta|arrive|how long|wie lange/.test(s) && c.route) {
    return { text: x(`Bis zum Ziel sind es noch ${fmtLong(c.route.remainingM, c.distUnit, c.lang)}.`, `${fmtLong(c.route.remainingM, c.distUnit, c.lang)} left to the destination.`) };
  }

  return {
    text: x(
      'Das habe ich nicht verstanden. Frag mich z. B. nach Reichweite, Akku, Geschwindigkeit, Ladestationen oder sag „Navigiere nach …“.',
      'I did not get that. Ask about range, battery, speed, charging stations, or say "Navigate to …".',
    ),
  };
}

export function chargerReply(list: Charger[], unit: DistUnit, lang: Lang, unnamed: string): string {
  const de = lang === 'de';
  if (!list.length) return de ? 'In deiner Nähe habe ich keine Ladestationen gefunden.' : 'I found no charging stations nearby.';
  const c = list[0];
  const name = c.name || unnamed;
  return de
    ? `Die nächste Ladestation ist ${name}, etwa ${fmtLong(c.distM, unit, lang)} entfernt (Luftlinie).`
    : `The nearest charging station is ${name}, about ${fmtLong(c.distM, unit, lang)} away (straight line).`;
}
