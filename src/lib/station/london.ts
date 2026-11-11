const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LONDON = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'short',
  hour: 'numeric',
  hourCycle: 'h23'
});

/** The day it is in London, Monday first, and the hour */
export function londonNow() {
  const parts = Object.fromEntries(LONDON.formatToParts().map((p) => [p.type, p.value]));
  return { day: DAYS.indexOf(parts.weekday), hour: Number(parts.hour) };
}
