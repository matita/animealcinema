// Date and category logic shared by the home page and the movie detail page.
// Every "day" is handled as a YYYY-MM-DD string in the Europe/Rome time zone.

const TZ = 'Europe/Rome';
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_YEAR = /^\d{4}$/;

// Movies without an end date stay "in sala" for this many days after release
// (same rule the previous home page used).
const DAYS_SHOWN_WITHOUT_END = 30;

const isDay = (value) => typeof value === 'string' && ISO_DAY.test(value);
const isYear = (value) => typeof value === 'string' && ISO_YEAR.test(value);

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Noon UTC keeps the calendar day unchanged when formatted in Europe/Rome.
const toDate = (iso) => new Date(toUTC(iso) + 12 * 60 * 60 * 1000);

export function today() {
  // Local-only override to test the sections, e.g. TODAY=2026-10-31 npm run build
  if (!process.env.CI && isDay(process.env.TODAY)) return process.env.TODAY;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

export const daysBetween = (from, to) => Math.round((toUTC(to) - toUTC(from)) / DAY_MS);

export function addDays(iso, days) {
  return new Date(toUTC(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

function format(value, options) {
  const date = isDay(value) ? toDate(value) : new Date(value);
  return new Intl.DateTimeFormat('it-IT', { timeZone: TZ, ...options }).format(date);
}

// --- Single date parts -------------------------------------------------------

export const weekdayShort = (iso) => format(iso, { weekday: 'short' }).replace('.', '');
export const weekdayLong = (iso) => format(iso, { weekday: 'long' });
export const dayNumber = (iso) => format(iso, { day: 'numeric' });
export const monthShort = (iso) => format(iso, { month: 'short' }).replace('.', '');
export const monthLong = (iso) => format(iso, { month: 'long' });
export const yearOf = (iso) => iso.slice(0, 4);

// "23 settembre" / "23 settembre 2026"
export const dateLong = (iso, withYear = true) =>
  withYear ? `${dayNumber(iso)} ${monthLong(iso)} ${yearOf(iso)}` : `${dayNumber(iso)} ${monthLong(iso)}`;

// "1 feb 2026" / "1 feb"
export const dateShort = (iso, withYear = true) =>
  withYear ? `${dayNumber(iso)} ${monthShort(iso)} ${yearOf(iso)}` : `${dayNumber(iso)} ${monthShort(iso)}`;

// "mercoledì 23 settembre"
export const dateWithWeekday = (iso) => `${weekdayLong(iso)} ${dateLong(iso, false)}`;

// --- Ranges ------------------------------------------------------------------

// "19 – 25 nov 2026", "1 feb – 16 dic 2026", "28 dic 2026 – 3 gen 2027"
export function rangeShort(start, end) {
  if (yearOf(start) !== yearOf(end)) return `${dateShort(start)} – ${dateShort(end)}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${dayNumber(start)} – ${dateShort(end)}`;
  return `${dateShort(start, false)} – ${dateShort(end)}`;
}

// "19 – 25 novembre", "30 novembre – 6 dicembre", "28 dicembre 2026 – 3 gennaio 2027"
export function rangeLong(start, end) {
  if (yearOf(start) !== yearOf(end)) return `${dateLong(start)} – ${dateLong(end)}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${dayNumber(start)} – ${dateLong(end, false)}`;
  return `${dateLong(start, false)} – ${dateLong(end, false)}`;
}

// --- Relative wording --------------------------------------------------------

export const days = (n) => (n === 1 ? '1 giorno' : `${n} giorni`);
export const inDays = (n) => `Tra ${days(n)}`;
export const remaining = (n) => (n === 0 ? 'Ultimo giorno oggi' : `Ancora ${days(n)}`);

// --- Categories --------------------------------------------------------------

// status: 'now' (in sala), 'week' (prossimi 7 giorni), 'upcoming' (in programma),
//         'ended' (programmazione terminata), 'tba' (data da annunciare)
export function describe(movie, todayIso = today()) {
  const release = isDay(movie.theaterReleaseDate) ? movie.theaterReleaseDate : null;
  const end = isDay(movie.theaterEndDate) ? movie.theaterEndDate : null;
  const currentYear = Number(yearOf(todayIso));
  const endYearPassed = isYear(movie.theaterEndDate) && Number(movie.theaterEndDate) < currentYear;
  const info = { release, end, releaseYear: isYear(movie.theaterReleaseDate) ? movie.theaterReleaseDate : null };

  if (!release) {
    const ended = (end && end < todayIso) || endYearPassed
      || (info.releaseYear && Number(info.releaseYear) < currentYear);
    return { ...info, status: ended ? 'ended' : 'tba' };
  }

  if (release > todayIso) {
    const daysUntil = daysBetween(todayIso, release);
    return {
      ...info,
      status: daysUntil <= 7 ? 'week' : 'upcoming',
      daysUntil,
      daysInTheater: end ? daysBetween(release, end) + 1 : null,
    };
  }

  if (end) {
    return end >= todayIso
      ? { ...info, status: 'now', daysLeft: daysBetween(todayIso, end) }
      : { ...info, status: 'ended' };
  }

  const shown = !endYearPassed && daysBetween(release, todayIso) <= DAYS_SHOWN_WITHOUT_END;
  return { ...info, status: shown ? 'now' : 'ended' };
}

const byReleaseThenTitle = (a, b) =>
  a.info.release.localeCompare(b.info.release) || a.movie.title.localeCompare(b.movie.title, 'it');

export function homeSections(movies, todayIso = today()) {
  const items = movies.map((movie) => ({ movie, info: describe(movie, todayIso) }));
  const pick = (status) => items.filter((item) => item.info.status === status).sort(byReleaseThenTitle);

  const upcoming = pick('upcoming');
  const months = [];
  for (const item of upcoming) {
    const key = item.info.release.slice(0, 7);
    let group = months.at(-1);
    if (group?.key !== key) {
      group = { key, month: monthLong(item.info.release), year: yearOf(item.info.release), items: [] };
      months.push(group);
    }
    group.items.push(item);
  }

  return { today: todayIso, now: pick('now'), week: pick('week'), upcoming, months };
}

// --- Misc --------------------------------------------------------------------

// "23 settembre 2026, 20:05" in Rome time
export function buildTime(date = new Date()) {
  const time = format(date, { hour: '2-digit', minute: '2-digit' });
  return `${format(date, { day: 'numeric', month: 'long', year: 'numeric' })}, ${time}`;
}

// "17 set 2026" from an ISO timestamp
export const publishedShort = (value) =>
  value ? format(value, { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '';

export function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export const sourcesByDate = (sources = []) =>
  [...sources].sort((a, b) => (b.publishedDate ? new Date(b.publishedDate) : 0) - (a.publishedDate ? new Date(a.publishedDate) : 0));
