/** The platform's business time zone (scheduling in the admin panel, statistics days). */
export const BUSINESS_TIME_ZONE = "Europe/Warsaw";

/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. +120 in Polish summer time). */
function offsetMinutes(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** Parses a `datetime-local` value ("2026-10-20T10:00") as wall-clock time in `timeZone`. */
export function parseLocalDateTime(value: string, timeZone = BUSINESS_TIME_ZONE): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const asUtc = new Date(`${value}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  // Two passes handle the day the clocks change.
  let result = new Date(asUtc.getTime() - offsetMinutes(asUtc, timeZone) * 60_000);
  result = new Date(asUtc.getTime() - offsetMinutes(result, timeZone) * 60_000);
  return result;
}
