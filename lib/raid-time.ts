import type {
  City,
  CityWindow,
  GoEvent,
  GymObservation,
} from "./pokedoko-types";

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
const localInstants = new Map<string, number>();
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const koreanWeekdays = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (value: number) => String(value).padStart(2, "0");

function formatter(zone: string): Intl.DateTimeFormat {
  let result = formatters.get(zone);
  if (!result) {
    result = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formatters.set(zone, result);
  }
  return result;
}

/** Gregorian local clock parts. weekday is 0 (Sunday) through 6 (Saturday). */
export function localParts(date: Date, zone: string): LocalParts {
  if (!Number.isFinite(date.getTime()))
    throw new RangeError("유효하지 않은 날짜예요.");
  const parts = Object.fromEntries(
    formatter(zone)
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdays.indexOf(parts.weekday),
  };
}

function utcValue(
  parts: Omit<LocalParts, "weekday">,
  milliseconds = 0,
): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, milliseconds);
  return date.getTime();
}

function sameClock(
  a: Omit<LocalParts, "weekday">,
  b: Omit<LocalParts, "weekday">,
): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

function offsetAt(instant: number, zone: string): number {
  return (
    utcValue(localParts(new Date(instant), zone)) -
    Math.floor(instant / 1000) * 1000
  );
}

/**
 * Convert a source's unzoned local ISO date into an instant in an IANA zone.
 * DST overlaps choose the earlier occurrence. Nonexistent DST gap times are rejected.
 * A global event with Z/offset must be parsed as an instant instead.
 */
export function localToInstant(value: string, zone: string): Date {
  const cacheKey = `${zone}|${value}`;
  const cached = localInstants.get(cacheKey);
  if (cached !== undefined) return new Date(cached);
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      value,
    );
  if (!match)
    throw new RangeError("현지 날짜는 시간대 없는 ISO 형식이어야 해요.");
  const clock = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
  const milliseconds = Number((match[7] || "").padEnd(3, "0"));
  const naive = utcValue(clock, milliseconds);
  const canonical = new Date(naive);
  if (
    clock.month < 1 ||
    clock.month > 12 ||
    clock.day < 1 ||
    clock.day > 31 ||
    clock.hour > 23 ||
    clock.minute > 59 ||
    clock.second > 59 ||
    canonical.getUTCFullYear() !== clock.year ||
    canonical.getUTCMonth() + 1 !== clock.month ||
    canonical.getUTCDate() !== clock.day
  )
    throw new RangeError("유효하지 않은 현지 날짜예요.");

  // Probe both sides of a transition, including non-hour changes such as Lord Howe.
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6)
    offsets.add(offsetAt(naive + hours * 3_600_000, zone));
  const candidates = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => sameClock(localParts(new Date(instant), zone), clock));
  if (!candidates.length)
    throw new RangeError(
      "일광 절약 시간 전환으로 존재하지 않는 현지 시각이에요.",
    );
  const instant = Math.min(...candidates);
  if (localInstants.size > 5000) localInstants.clear();
  localInstants.set(cacheKey, instant);
  return new Date(instant);
}

function parseEventTime(time: GoEvent["start"], zone: string): Date {
  if (!time || typeof time.value !== "string" || !time.value)
    throw new RangeError("일정 날짜가 없어요.");
  if (time.kind === "local") return localToInstant(time.value, zone);
  if (time.kind !== "instant" || !/(Z|[+-]\d{2}:?\d{2})$/i.test(time.value)) {
    throw new RangeError("전 세계 공통 일정에는 시간대가 필요해요.");
  }
  const date = new Date(time.value);
  if (!Number.isFinite(date.getTime()))
    throw new RangeError("유효하지 않은 일정 날짜예요.");
  return date;
}

/** Invalid/missing/reversed source dates are omitted safely, never made into schedules. */
export function eventWindow(
  event: GoEvent,
  city: City,
): { start: Date; end: Date } | null {
  try {
    const start = parseEventTime(event.start, city.zone);
    const end = parseEventTime(event.end, city.zone);
    return end.getTime() > start.getTime() ? { start, end } : null;
  } catch {
    return null;
  }
}

/** Only explicit source Raid Hour/Day events; never invent a recurring weekly raid. */
export function getCityWindows(
  city: City,
  events: GoEvent[],
  now: Date,
): CityWindow[] {
  const instant = now.getTime();
  if (!Number.isFinite(instant)) return [];
  return events
    .flatMap((event) => {
      if (event.kind !== "raid-hour" && event.kind !== "raid-day") return [];
      const window = eventWindow(event, city);
      if (!window || window.end.getTime() <= instant) return [];
      return [
        {
          ...window,
          event,
          active:
            window.start.getTime() <= instant && instant < window.end.getTime(),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() ||
        a.end.getTime() - b.end.getTime(),
    );
}

export function formatKst(date: Date, withDate = true): string {
  const parts = localParts(date, "Asia/Seoul");
  const clock = `${pad(parts.hour)}:${pad(parts.minute)}`;
  return withDate
    ? `${parts.month}월 ${parts.day}일 (${koreanWeekdays[parts.weekday]}) ${clock}`
    : clock;
}

export function formatLocal(date: Date, zone: string): string {
  const parts = localParts(date, zone);
  return `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

export function countdown(milliseconds: number): string {
  const seconds = Math.max(
    0,
    Math.ceil(Number.isFinite(milliseconds) ? milliseconds / 1000 : 0),
  );
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return days > 0
    ? `${days}일 ${pad(hours)}:${pad(minutes)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(remainder)}`;
}

/** City local time relative to Korea, calculated for this instant (DST included). */
export function describeOffset(city: City, date = new Date()): string {
  const minutes =
    (offsetAt(date.getTime(), city.zone) -
      offsetAt(date.getTime(), "Asia/Seoul")) /
    60_000;
  if (!minutes) return "한국과 같은 시간";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  const amount =
    `${hours ? `${hours}시간` : ""}${remainder ? ` ${remainder}분` : ""}`.trim();
  return `한국보다 ${amount} ${minutes > 0 ? "빠름" : "느림"}`;
}

function observedInstant(value: string | null): number | null {
  if (!value || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const instant = new Date(value).getTime();
  return Number.isFinite(instant) ? instant : null;
}

export type GymState = "waiting" | "active" | "ended" | "unknownend";

/** User observations only. An unrecorded end never implies a standard raid duration. */
export function getGymState(observation: GymObservation, now: Date): GymState {
  const start = observedInstant(observation.startsAt);
  const end = observedInstant(observation.endsAt);
  const instant = now.getTime();
  if (
    start === null ||
    !Number.isFinite(instant) ||
    (end !== null && end <= start)
  )
    return "unknownend";
  if (instant < start) return "waiting";
  if (end === null) return "unknownend";
  return instant < end ? "active" : "ended";
}

export function getNextGymStart(
  observations: GymObservation[],
  now: Date,
  cityId?: string,
): Date | null {
  const instant = now.getTime();
  if (!Number.isFinite(instant)) return null;
  const future = observations
    .filter((item) => !cityId || item.cityId === cityId)
    .map((item) => observedInstant(item.startsAt))
    .filter((value): value is number => value !== null && value > instant);
  return future.length ? new Date(Math.min(...future)) : null;
}
