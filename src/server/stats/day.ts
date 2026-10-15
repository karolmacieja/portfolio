/** Statistics days follow Polish local time (the platform's market). */
export const STATS_TIME_ZONE = "Europe/Warsaw";

/** "YYYY-MM-DD" of `date` in the statistics time zone. */
export function statsDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STATS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** A day key as stored in `@db.Date` columns. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** The `count` day keys ending with `last` (inclusive), oldest first. */
export function dayRange(last: string, count: number): string[] {
  const end = dayToDate(last).getTime();
  return Array.from({ length: count }, (_, i) =>
    new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}
