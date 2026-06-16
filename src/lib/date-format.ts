/**
 * Date display formatting — pure, client-safe (no db, no React, no node). Both
 * the Server Components and the client TicketCard import this, so it must stay
 * dependency-free. Formatting is local-time on purpose: this is a localhost
 * single-user tool, so SSR (Node) and hydration (browser) share one machine's
 * timezone and produce identical strings.
 */

/**
 * The date formats offered in Settings. Display is date-only; tokens are
 * `YYYY` (4-digit year), `MM` (2-digit month), `DD` (2-digit day), each
 * appearing exactly once. Default is `YYYY/MM/DD`; the rest cover the common
 * locale conventions.
 */
export const DATE_FORMATS = [
  "YYYY/MM/DD",
  "YYYY-MM-DD",
  "MM/DD/YYYY",
  "DD/MM/YYYY",
  "DD.MM.YYYY",
] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

export const DEFAULT_DATE_FORMAT: DateFormat = "YYYY/MM/DD";

/** Narrow an arbitrary stored string to a known format, falling back to the
 *  default — so a hand-edited DB value or a dropped format can't break the UI. */
export function parseDateFormat(value: string): DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(value)
    ? (value as DateFormat)
    : DEFAULT_DATE_FORMAT;
}

/**
 * Render a millisecond epoch timestamp using the given format. Each token
 * (`YYYY`/`MM`/`DD`) appears once, so a single replace per token is sufficient
 * — and the year is always digits, so the later `MM`/`DD` replacements can't
 * collide with it.
 */
export function formatDate(ts: number, format: DateFormat): string {
  const d = new Date(ts);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return format.replace("YYYY", yyyy).replace("MM", mm).replace("DD", dd);
}

/** Local midnight (00:00) of the day containing `ts`. */
function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Parse an `<input type="date">` value (`YYYY-MM-DD`) into the local-midnight
 * epoch for that day, or null for an empty / malformed value. Built from the
 * date parts (not `new Date("YYYY-MM-DD")`, which is parsed as UTC) so the
 * stored timestamp matches local-time rendering everywhere else.
 */
export function dateInputToTimestamp(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** Render an epoch as the `YYYY-MM-DD` an `<input type="date">` expects. */
export function timestampToDateInput(ts: number): string {
  const d = new Date(ts);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Whole calendar days from `now` to `deadline`, both reduced to local midnight
 * so the count is by day boundary, not 24h span: positive = days remaining,
 * 0 = due today, negative = overdue. `Math.round` absorbs DST-shifted days
 * (23/25h). `now` is passed in (not read off the clock) so callers stay
 * deterministic — the board feeds it the server render time.
 */
export function daysUntil(deadline: number, now: number): number {
  const diff = startOfLocalDay(deadline) - startOfLocalDay(now);
  return Math.round(diff / 86_400_000);
}

/** Human-readable countdown for a deadline that's `days` away (see daysUntil). */
export function deadlineLabel(days: number): string {
  if (days === 0) return "Due today";
  const n = Math.abs(days);
  const unit = n === 1 ? "day" : "days";
  return days > 0 ? `${n} ${unit} left` : `${n} ${unit} overdue`;
}
