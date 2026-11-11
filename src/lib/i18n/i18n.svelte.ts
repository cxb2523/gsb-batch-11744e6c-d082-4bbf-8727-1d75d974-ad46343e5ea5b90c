import { LOCALES, type Locale, type Plural } from './locales.js';
import en, { type Messages } from './messages/en.js';

const translations = import.meta.glob<Messages>(['./messages/*.ts', '!./messages/en.ts'], {
  import: 'default'
});

/** Everything the page says, swapped in place so whatever's showing it follows along */
export const t: Messages = $state({ ...en });

let locale = $state<Locale>('en');
let wanted: Locale = 'en';

const formats = $derived.by(() => {
  const { tag } = LOCALES[locale];
  return {
    plural: new Intl.PluralRules(tag),
    list: new Intl.ListFormat(tag),
    clock: new Intl.DateTimeFormat(tag, { timeStyle: 'medium', timeZone: 'Europe/London' }),
    // a made-up day in UTC, so a weekday or an hour reads the same wherever someone is
    weekday: new Intl.DateTimeFormat(tag, { weekday: 'long', timeZone: 'UTC' }),
    hour: new Intl.DateTimeFormat(tag, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }),
    time: new Intl.DateTimeFormat(tag, { timeStyle: 'short', timeZone: 'UTC' }),
    metres: new Intl.NumberFormat(tag, { style: 'unit', unit: 'meter' }),
    kilometres: new Intl.NumberFormat(tag, {
      style: 'unit',
      unit: 'kilometer',
      maximumFractionDigits: 0
    })
  };
});

/** The form for n, with n in place of the #, or whatever stands for that many */
export const count = (forms: Plural, n: number, as = String(n)) =>
  (forms[formats.plural.select(n)] ?? forms.other).replace('#', as);
export const list = (items: string[]) => formats.list.format(items);
export const clock = (at: number) => formats.clock.format(at);
/** Monday is 0 */
export const weekday = (day: number) => formats.weekday.format(Date.UTC(2024, 0, 1 + day));
export const hour = (hour: number) => formats.hour.format(Date.UTC(2024, 0, 1, hour));
/** As a timetable has it, from minutes after midnight, which can run on past the next one */
export const time = (minutes: number) => formats.time.format(Date.UTC(2024, 0, 1, 0, minutes));
/** To the nearest 10, as a crow-flies distance is only roughly how far it is to walk */
export const metres = (m: number) => formats.metres.format(Math.round(m / 10) * 10);
export const kilometres = (m: number) => formats.kilometres.format(m / 1000);

const messagesFor = (code: Locale) =>
  code === 'en' ? Promise.resolve(en) : translations[`./messages/${code}.ts`]();

export async function setLocale(code: Locale) {
  wanted = code;
  // a deploy since the page opened takes its old chunks away, so it stays as it is
  const messages = await messagesFor(code).catch(() => null);
  if (!messages || code !== wanted || code === locale) return;
  Object.assign(t, messages);
  locale = code;
  document.documentElement.lang = LOCALES[code].tag;
}
