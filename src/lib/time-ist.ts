/**
 * Date/time helpers that force Asia/Kolkata (IST, UTC+5:30).
 *
 * Everything that flows through the API is UTC. Backtest reports are for
 * Indian users, so we render and export in IST end-to-end. Use these helpers
 * instead of raw toLocaleString so we stay consistent site-wide.
 */

type DateInput = Date | string | number;

const IST_TZ = "Asia/Kolkata";
const IST_LOCALE = "en-IN";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30

function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

/** "04 Jan 2024, 06:59" — full date + time in IST for tables / tooltips. */
export function formatISTDateTime(input: DateInput): string {
  const d = toDate(input);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(IST_LOCALE, {
    timeZone: IST_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "04 Jan 2024" — date only in IST. */
export function formatISTDate(input: DateInput): string {
  const d = toDate(input);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(IST_LOCALE, {
    timeZone: IST_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "Jan 04" — short month+day, used for chart X-axis labels. */
export function formatISTAxisShort(input: DateInput): string {
  const d = toDate(input);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(IST_LOCALE, {
    timeZone: IST_TZ,
    month: "short",
    day: "numeric",
  });
}

/** "Jan '24" — month + 2-digit year for cumulative chart axis. */
export function formatISTAxisMonthYear(input: DateInput): string {
  const d = toDate(input);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(IST_LOCALE, {
    timeZone: IST_TZ,
    month: "short",
    year: "2-digit",
  });
}

/** "2024-01-04 06:59:00" — CSV-friendly IST string (no timezone suffix). */
export function formatISTCsv(input: DateInput): string {
  const d = toDate(input);
  if (isNaN(d.getTime())) return "";
  // Shift UTC → IST by adding +5:30, then read the shifted date's UTC parts.
  // This gives IST wall-clock components without relying on locale output
  // (which varies between "Jan" and "January" etc.).
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mi = String(shifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

/**
 * "2024-01-04" — IST day key for bucketing (heatmaps, daily aggregates).
 * Bucket boundaries align with IST midnight, not UTC midnight.
 */
export function getISTDayKey(input: DateInput): string {
  const d = toDate(input);
  if (isNaN(d.getTime())) return "";
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}
