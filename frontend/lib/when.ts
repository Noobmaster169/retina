const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A timestamp for people: "14 Mar 2026, 08:12".
 *
 * Built from the UTC parts rather than through `toLocaleString`, for two
 * reasons. A server component and the browser that hydrates it are not always
 * in the same timezone or locale, and a date that renders differently in the
 * two is a hydration mismatch that shows up as a flicker and a console error.
 * And every timestamp in this product is UTC in the database, so reading them
 * all in one zone is what makes two screens agree about when something
 * happened.
 */
export function formatWhen(iso: string, withTime = true): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const day = `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
  if (!withTime) return day;
  const hours = String(at.getUTCHours()).padStart(2, "0");
  const minutes = String(at.getUTCMinutes()).padStart(2, "0");
  return `${day}, ${hours}:${minutes}`;
}

/** The short form for a dense column: "14 Mar 08:12". */
export function formatWhenShort(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const hours = String(at.getUTCHours()).padStart(2, "0");
  const minutes = String(at.getUTCMinutes()).padStart(2, "0");
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${hours}:${minutes}`;
}
