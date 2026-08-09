/** Weekend / date helpers for Trips feed sections. */

export type WeekendWindow = {
  /** Friday 00:00 local */
  start: Date;
  /** Sunday 23:59:59.999 local */
  end: Date;
  key: string;
  label: string;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Friday of the weekend that contains `ref` (or the upcoming Friday if Mon–Thu). */
export function weekendContaining(ref: Date = new Date()): WeekendWindow {
  const day = ref.getDay(); // 0 Sun … 5 Fri 6 Sat
  const friday = startOfDay(ref);
  if (day === 0) {
    // Sunday → this weekend's Friday was 2 days ago
    friday.setDate(friday.getDate() - 2);
  } else if (day < 5) {
    // Mon–Thu → upcoming Friday
    friday.setDate(friday.getDate() + (5 - day));
  } else if (day === 6) {
    // Saturday → yesterday was Friday
    friday.setDate(friday.getDate() - 1);
  }
  // day === 5 → already Friday
  const sunday = endOfDay(new Date(friday));
  sunday.setDate(friday.getDate() + 2);
  return {
    start: friday,
    end: sunday,
    key: friday.toISOString().slice(0, 10),
    label: 'This weekend',
  };
}

export function nextWeekendAfter(w: WeekendWindow, indexFromThis: number): WeekendWindow {
  const friday = startOfDay(w.start);
  friday.setDate(friday.getDate() + 7 * indexFromThis);
  const sunday = endOfDay(new Date(friday));
  sunday.setDate(friday.getDate() + 2);
  let label = 'Next weekend';
  if (indexFromThis === 0) label = 'This weekend';
  else if (indexFromThis === 1) label = 'Next weekend';
  else {
    label = friday.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' weekend';
  }
  return {
    start: friday,
    end: sunday,
    key: friday.toISOString().slice(0, 10),
    label,
  };
}

/** Generate upcoming weekend windows starting from "this weekend". */
export function upcomingWeekends(count = 12, ref: Date = new Date()): WeekendWindow[] {
  const base = weekendContaining(ref);
  return Array.from({ length: count }, (_, i) => nextWeekendAfter(base, i));
}

export function parseISODate(iso?: string | null): Date | null {
  if (!iso) return null;
  // Date-only strings must be local calendar days — `new Date('YYYY-MM-DD')` is UTC
  // and shifts the weekday backward in US timezones.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local calendar YYYY-MM-DD (avoid UTC shift from toISOString). */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Trip overlaps a weekend if any day of [dateStart, dateEnd] intersects Fri–Sun. */
export function tripOverlapsWeekend(
  dateStart: string | null | undefined,
  dateEnd: string | null | undefined,
  weekend: WeekendWindow,
): boolean {
  const start = parseISODate(dateStart) ?? parseISODate(dateEnd);
  const end = parseISODate(dateEnd) ?? start;
  if (!start || !end) return false;
  const s = startOfDay(start).getTime();
  const e = endOfDay(end).getTime();
  return s <= weekend.end.getTime() && e >= weekend.start.getTime();
}

export function tripInDateRange(
  dateStart: string | null | undefined,
  dateEnd: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const start = parseISODate(dateStart) ?? parseISODate(dateEnd);
  const end = parseISODate(dateEnd) ?? start;
  if (!start || !end) return false;
  return (
    startOfDay(start).getTime() <= endOfDay(rangeEnd).getTime() &&
    endOfDay(end).getTime() >= startOfDay(rangeStart).getTime()
  );
}

/** "Friday - Sunday" style label from ISO dates. */
export function shortWeekdayRange(
  dateStart?: string | null,
  dateEnd?: string | null,
  fallback = '',
): string {
  const s = parseISODate(dateStart);
  const e = parseISODate(dateEnd) ?? s;
  if (!s || !e) return fallback;
  const a = s.toLocaleDateString([], { weekday: 'long' });
  const b = e.toLocaleDateString([], { weekday: 'long' });
  if (a === b) return a;
  return `${a} - ${b}`;
}

/** "Oct 10 – Oct 12" calendar range for album / trip previews. */
export function shortCalendarRange(
  dateStart?: string | null,
  dateEnd?: string | null,
  fallback = '',
): string {
  const s = parseISODate(dateStart);
  const e = parseISODate(dateEnd) ?? s;
  if (!s || !e) return fallback;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const a = s.toLocaleDateString([], opts);
  const b = e.toLocaleDateString([], opts);
  if (a === b) return a;
  return `${a} – ${b}`;
}

export function formatTripNames(firstNames: string[]): string {
  const names = firstNames.filter(Boolean);
  if (names.length === 0) return 'Trip';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]}`;
  return `${names[0]}, ${names[1]}, ${names[2]}...`;
}

/** Sidebar / header label for a trip chat, e.g. "Santorini, Greece trip". */
export function tripChatTitle(
  city: string,
  country?: string | null,
): string {
  let c = (city || '').trim();
  // Strip accidental duplicated "trip" suffixes / placeholder
  c = c.replace(/\s+trip$/i, '').trim();
  if (!c || /^trip$/i.test(c)) c = '';
  const co = (country || '').trim();
  if (!c && !co) return 'Trip chat';
  const place = co ? (c ? `${c}, ${co}` : co) : c;
  return `${place} trip`;
}
