/**
 * Pure calendar-date utilities.
 *
 * Calendar dates (deadlines, follow-ups, application dates) are handled as `YYYY-MM-DD` strings and never
 * converted through local time: all arithmetic is done in UTC on midnight values, so no timezone can shift a day.
 * "Today" is always computed in the user's timezone (default Europe/Paris).
 */
import { TZDate } from "@date-fns/tz";

export type ISODate = string; // YYYY-MM-DD

export const DEFAULT_TIMEZONE = "Europe/Paris";
export const DEFAULT_DATE_LOCALE = "en-GB";
const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function toUTC(date: ISODate): number {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Calendar date of an instant in a timezone. */
export function toISODate(instant: Date, timeZone: string = DEFAULT_TIMEZONE): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayISO(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): ISODate {
  return toISODate(now, timeZone);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + Math.round(days) * DAY_MS);
}

export function addMonths(date: ISODate, months: number): ISODate {
  const d = new Date(toUTC(date));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return fromUTC(d.getTime());
}

/** a - b, in days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISO(...dates: (ISODate | null | undefined)[]): ISODate | null {
  const valid = dates.filter((d): d is ISODate => !!d);
  return valid.length ? valid.reduce((m, d) => (d < m ? d : m)) : null;
}

export function maxISO(...dates: (ISODate | null | undefined)[]): ISODate | null {
  const valid = dates.filter((d): d is ISODate => !!d);
  return valid.length ? valid.reduce((m, d) => (d > m ? d : m)) : null;
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

export function isWeekend(date: ISODate): boolean {
  const d = dayOfWeek(date);
  return d === 0 || d === 6;
}

// ---------------------------------------------------------------------------
// Holidays & business days
// ---------------------------------------------------------------------------

export type HolidayCalendarKey = "FR" | "NONE";

/** Easter Sunday (Gregorian, anonymous algorithm). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return fromUTC(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map<string, Set<ISODate>>();

/** French public holidays (metropolitan France). */
export function frenchHolidays(year: number): ISODate[] {
  const easter = easterSunday(year);
  const fixed = ["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"].map((md) => `${year}-${md}`);
  return [...fixed, addDays(easter, 1), addDays(easter, 39), addDays(easter, 50)].sort();
}

export function holidaysFor(calendar: HolidayCalendarKey, year: number): Set<ISODate> {
  const key = `${calendar}:${year}`;
  let set = holidayCache.get(key);
  if (!set) {
    set = new Set(calendar === "FR" ? frenchHolidays(year) : []);
    holidayCache.set(key, set);
  }
  return set;
}

export interface BusinessCalendar {
  holidays: HolidayCalendarKey;
  /** Extra non-working days (vacations…). */
  extraClosedDays?: ISODate[];
}

export function isBusinessDay(date: ISODate, calendar: BusinessCalendar = { holidays: "NONE" }): boolean {
  if (isWeekend(date)) return false;
  const year = Number(date.slice(0, 4));
  if (holidaysFor(calendar.holidays, year).has(date)) return false;
  if (calendar.extraClosedDays?.includes(date)) return false;
  return true;
}

export function nextBusinessDay(date: ISODate, calendar?: BusinessCalendar): ISODate {
  let d = date;
  for (let guard = 0; guard < 60 && !isBusinessDay(d, calendar); guard++) d = addDays(d, 1);
  return d;
}

/** Adds N business days (N ≥ 0). addBusinessDays(d, 0) returns d unchanged. */
export function addBusinessDays(date: ISODate, days: number, calendar?: BusinessCalendar): ISODate {
  let d = date;
  let remaining = Math.max(0, Math.round(days));
  let guard = 0;
  while (remaining > 0 && guard < 10_000) {
    d = addDays(d, 1);
    if (isBusinessDay(d, calendar)) remaining--;
    guard++;
  }
  return d;
}

export function countBusinessDaysBetween(from: ISODate, to: ISODate, calendar?: BusinessCalendar): number {
  if (to <= from) return 0;
  let count = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isBusinessDay(d, calendar)) count++;
  return count;
}

export interface IntervalOptions {
  businessDays?: boolean;
  calendar?: BusinessCalendar;
}

/** date + N days (calendar or business days). */
export function addInterval(date: ISODate, days: number, options: IntervalOptions = {}): ISODate {
  if (options.businessDays) return addBusinessDays(date, days, options.calendar);
  return addDays(date, days);
}

// ---------------------------------------------------------------------------
// Months & weeks (calendar view)
// ---------------------------------------------------------------------------

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

/** weekStartsOn: 1 = Monday */
export function startOfWeek(date: ISODate, weekStartsOn = 1): ISODate {
  const dow = dayOfWeek(date);
  const delta = (dow - weekStartsOn + 7) % 7;
  return addDays(date, -delta);
}

/** Weeks (arrays of 7 dates) covering the month of `date`. */
export function monthGrid(date: ISODate, weekStartsOn = 1): ISODate[][] {
  const first = startOfWeek(startOfMonth(date), weekStartsOn);
  const last = endOfMonth(date);
  const weeks: ISODate[][] = [];
  let cursor = first;
  while (cursor <= last || weeks.length < 5) {
    const week: ISODate[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (weeks.length >= 6) break;
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// Due status
// ---------------------------------------------------------------------------

export type DueKind = "overdue" | "today" | "tomorrow" | "soon" | "week" | "later";

export interface DueStatus {
  kind: DueKind;
  /** due - today (negative when overdue). */
  days: number;
  label: string;
}

export function dueStatus(due: ISODate, today: ISODate): DueStatus {
  const days = diffDays(due, today);
  if (days < 0) return { kind: "overdue", days, label: days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days` };
  if (days === 0) return { kind: "today", days, label: "Today" };
  if (days === 1) return { kind: "tomorrow", days, label: "Tomorrow" };
  if (days <= 3) return { kind: "soon", days, label: `In ${days} days` };
  if (days <= 7) return { kind: "week", days, label: `In ${days} days` };
  return { kind: "later", days, label: `In ${days} days` };
}

export function relativeDayLabel(date: ISODate, today: ISODate): string {
  const days = diffDays(date, today);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `In ${days} days`;
  return `${-days} days ago`;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export type DateStyle = "short" | "medium" | "long" | "weekday" | "dayMonth";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(locale: string, style: DateStyle, timeZone: string): Intl.DateTimeFormat {
  const key = `${locale}|${style}|${timeZone}`;
  let f = dateFormatters.get(key);
  if (!f) {
    const options: Intl.DateTimeFormatOptions =
      style === "short"
        ? { day: "2-digit", month: "2-digit", year: "numeric" }
        : style === "medium"
          ? { day: "numeric", month: "short", year: "numeric" }
          : style === "long"
            ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
            : style === "weekday"
              ? { weekday: "short", day: "numeric", month: "short" }
              : { day: "numeric", month: "short" };
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    dateFormatters.set(key, f);
  }
  return f;
}

/** Format a calendar date (ISO string) without any timezone shift. */
export function formatISODate(date: ISODate | null | undefined, style: DateStyle = "short", locale = DEFAULT_DATE_LOCALE): string {
  if (!date || !isISODate(date)) return "—";
  return dateFormatter(locale, style, "UTC").format(new Date(toUTC(date)));
}

/** Format an instant in the user's timezone. */
export function formatInstant(
  instant: Date | string | null | undefined,
  options: { timeZone?: string; locale?: string; withDate?: boolean; withTime?: boolean; style?: DateStyle } = {},
): string {
  if (!instant) return "—";
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "—";
  const { timeZone = DEFAULT_TIMEZONE, locale = DEFAULT_DATE_LOCALE, withDate = true, withTime = true, style = "medium" } = options;
  const parts: string[] = [];
  if (withDate) parts.push(dateFormatter(locale, style, timeZone).format(d));
  if (withTime) parts.push(formatTime(d, timeZone, locale));
  return parts.join(" · ");
}

export function formatTime(instant: Date, timeZone = DEFAULT_TIMEZONE, locale = DEFAULT_DATE_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(instant);
}

export function formatRelativeInstant(instant: Date | string, now: Date = new Date()): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const seconds = Math.round((now.getTime() - d.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const future = seconds < 0;
  const fmt = (n: number, unit: string) => (future ? `in ${n} ${unit}${n > 1 ? "s" : ""}` : `${n} ${unit}${n > 1 ? "s" : ""} ago`);
  if (abs < 45) return future ? "in a few seconds" : "just now";
  if (abs < 3600) return fmt(Math.round(abs / 60), "minute");
  if (abs < 86_400) return fmt(Math.round(abs / 3600), "hour");
  if (abs < 86_400 * 30) return fmt(Math.round(abs / 86_400), "day");
  if (abs < 86_400 * 365) return fmt(Math.round(abs / (86_400 * 30)), "month");
  return fmt(Math.round(abs / (86_400 * 365)), "year");
}

// ---------------------------------------------------------------------------
// Zoned wall time <-> instant (interviews)
// ---------------------------------------------------------------------------

/** Converts a wall-clock time in a timezone to an instant. */
export function zonedTimeToInstant(date: ISODate, time: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const tz = new TZDate(y, m - 1, d, hh || 0, mm || 0, 0, timeZone);
  return new Date(tz.getTime());
}

/** Splits an instant into the wall-clock date + time of a timezone. */
export function instantToZonedParts(instant: Date, timeZone: string = DEFAULT_TIMEZONE): { date: ISODate; time: string } {
  const date = toISODate(instant, timeZone);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(instant);
  return { date, time: time === "24:00" ? "00:00" : time };
}

/** Best-effort parse of user/AI provided dates (YYYY-MM-DD, DD/MM/YYYY, ISO datetime) into an ISODate. */
export function coerceISODate(value: unknown, timeZone: string = DEFAULT_TIMEZONE): ISODate | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : toISODate(value, timeZone);
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (isISODate(s)) return s;
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (fr) {
    const iso = `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
    return isISODate(iso) ? iso : null;
  }
  const isoPrefix = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
  if (isoPrefix) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? toISODate(d, timeZone) : isoPrefix[1];
    return isISODate(isoPrefix[1]) ? isoPrefix[1] : null;
  }
  return null;
}
