// Time helpers. All displayed scheduling is anchored to Brasília time
// (America/Sao_Paulo, UTC-3, no DST), independent of the server timezone.

export const TZ = "America/Sao_Paulo";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const weekdayFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** "YYYY-MM-DD" of the given instant in Brasília time. */
export function dateKeyOf(instant: Date = new Date()): string {
  return dateFmt.format(instant);
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Kickoff slots, local Brasília time. */
export const KICKOFF_SLOTS = [
  "11:00",
  "13:30",
  "16:00",
  "17:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
  "21:30",
  "22:00",
] as const;

/** Epoch ms of a Brasília-local date+time (UTC-3 fixed). */
export function kickoffMs(dateKey: string, slot: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = slot.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh + 3, mm);
}

export function formatTimeMs(ms: number): string {
  return timeFmt.format(new Date(ms));
}

export function formatWeekday(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const label = weekdayFmt.format(new Date(Date.UTC(y, m - 1, d, 15, 0)));
  return label.replace(".", "").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatFullDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return fmt.format(new Date(Date.UTC(y, m - 1, d, 15, 0)));
}

export const MATCH_LIVE_MINUTES = 105;
export const MATCH_SETTLE_MINUTES = 150;

export type MatchPhase = "upcoming" | "live" | "finished";

export function matchPhase(kickoff: number, now: number): MatchPhase {
  if (now < kickoff) return "upcoming";
  if (now < kickoff + MATCH_LIVE_MINUTES * 60_000) return "live";
  return "finished";
}

export function liveMinute(kickoff: number, now: number): number {
  const mins = Math.floor((now - kickoff) / 60_000);
  return Math.max(1, Math.min(mins, 90));
}
