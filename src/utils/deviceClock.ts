/**
 * Проверка часового пояса и часов компьютера.
 *
 * Фронт показывает и сохраняет время по поясу компьютера: `dayjs(x)` без
 * `.tz()` — локальное время браузера, а `dayjs.tz.setDefault` в index.tsx на
 * такие вызовы не влияет. Компьютер с чужим поясом видит записи со сдвигом, а
 * форма записи сохраняет выбранное время со сдвигом. Случай 2026-10-05
 * («Авиценна»): пояс UTC+3 (Москва), часы подведены вручную — приём в 10:30
 * показывался в 07:30. Отсюда — предупреждение в шапке (DeviceClockBanner);
 * расчёты вынесены сюда, чтобы покрыть их тестами.
 */

export const DEFAULT_CLINIC_TIME_ZONE = "Asia/Bishkek";

/** С какого расхождения часов компьютера с сервером предупреждаем. */
export const CLOCK_SKEW_THRESHOLD_MS = 5 * 60_000;

/** Смещение пояса от UTC в минутах в момент `at` (+360 для Бишкека); null — неизвестный пояс. */
export function zoneOffsetMinutes(timeZone: string, at: Date): number | null {
  if (!timeZone) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
  } catch {
    return null;
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  const atWholeSeconds = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((wallAsUtc - atWholeSeconds) / 60_000);
}

/**
 * Пояс, по которому работает клиника: активный филиал, без него («все
 * филиалы») — первый филиал организации с поясом, иначе Бишкек.
 */
export function resolveClinicTimeZone(
  activeBranchTimeZone: string | null | undefined,
  branches: ReadonlyArray<{ timezone?: string | null }> | null | undefined,
  at: Date,
): string {
  const candidates = [activeBranchTimeZone, ...(branches ?? []).map((branch) => branch.timezone)];
  return candidates.find((tz): tz is string => !!tz && zoneOffsetMinutes(tz, at) != null) ?? DEFAULT_CLINIC_TIME_ZONE;
}

export type ClockProblem =
  /** Пояс компьютера не совпадает с поясом клиники. skewMs — попутно, если часы ещё и подведены. */
  | { kind: "timezone"; deviceOffset: number; clinicOffset: number; skewMs: number | null }
  /** Пояс верный, но часы спешат или отстают от сервера. */
  | { kind: "clock"; skewMs: number };

export interface ClockCheckInput {
  /** Смещение пояса компьютера в минутах: `-new Date().getTimezoneOffset()`. */
  deviceOffset: number;
  /** Смещение пояса клиники; null — пояс неизвестен. */
  clinicOffset: number | null;
  /** Время сервера минус время компьютера (мс); null — ещё не сверяли. */
  skewMs: number | null;
}

const hasSkew = (skewMs: number | null): skewMs is number =>
  skewMs != null && Math.abs(skewMs) >= CLOCK_SKEW_THRESHOLD_MS;

export function detectClockProblem({ deviceOffset, clinicOffset, skewMs }: ClockCheckInput): ClockProblem | null {
  if (clinicOffset != null && deviceOffset !== clinicOffset) {
    return { kind: "timezone", deviceOffset, clinicOffset, skewMs };
  }
  if (hasSkew(skewMs)) return { kind: "clock", skewMs };
  return null;
}

/** 360 → «UTC+06:00», как в списке поясов Windows. */
export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

/** Величина сдвига без знака: 90 → «1 ч 30 мин», 12 → «12 мин». */
export function formatShift(minutes: number): string {
  const total = Math.max(1, Math.round(Math.abs(minutes)));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} мин`;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/** Названия поясов из списка филиала (BranchFormDrawer) — по-русски. */
const ZONE_CITIES: Record<string, string> = {
  "Asia/Bishkek": "Бишкек",
  "Asia/Almaty": "Алматы",
  "Asia/Tashkent": "Ташкент",
  "Asia/Dushanbe": "Душанбе",
  "Asia/Yekaterinburg": "Екатеринбург",
  "Europe/Moscow": "Москва",
};

const zoneCity = (timeZone: string): string =>
  ZONE_CITIES[timeZone] ?? timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;

export interface ClockProblemText {
  severity: "error" | "warning";
  title: string;
  body: string;
  howTo: string;
}

const ASK_ADMIN = "Если доступа к настройкам нет — сообщите администратору.";

export function describeClockProblem(
  problem: ClockProblem,
  { clinicTimeZone, isWindows }: { clinicTimeZone: string; isWindows: boolean },
): ClockProblemText {
  // Инструкция про Windows — для компьютера; телефон и прочее — «устройство».
  const device = isWindows ? { gen: "компьютера", prep: "компьютере" } : { gen: "устройства", prep: "устройстве" };
  if (problem.kind === "clock") {
    // skewMs = сервер − компьютер: минус — компьютер впереди сервера.
    const direction = problem.skewMs < 0 ? "спешат" : "отстают";
    return {
      severity: "warning",
      title: `Часы этого ${device.gen} ${direction} на ${formatShift(problem.skewMs / 60_000)}`,
      body: "Из-за этого отметка «Сейчас», «сегодня» и время по умолчанию в формах будут неверными.",
      howTo: isWindows
        ? `Как исправить: Параметры → Время и язык → Дата и время → включите «Установить время автоматически» и нажмите «Синхронизировать». ${ASK_ADMIN}`
        : `Как исправить: в настройках даты и времени устройства включите автоматическую установку времени. ${ASK_ADMIN}`,
    };
  }

  const { deviceOffset, clinicOffset, skewMs } = problem;
  const clinicLabel = formatUtcOffset(clinicOffset);
  const city = zoneCity(clinicTimeZone);
  const shift = formatShift(clinicOffset - deviceOffset);
  const direction = clinicOffset > deviceOffset ? "раньше" : "позже";
  const body =
    `Пояс ${device.gen} — ${formatUtcOffset(deviceOffset)}, а CRM работает по ${clinicLabel} (${city}). ` +
    `Поэтому время записей здесь показано на ${shift} ${direction}, чем на самом деле, ` +
    `а записи, созданные или перенесённые с этого ${device.gen}, сохранятся не на то время.`;

  let howTo: string;
  if (isWindows) {
    // В обновлённой Windows «Астана» — UTC+05:00 (Казахстан перешёл в 2024),
    // а Бишкек — отдельный пункт «(UTC+06:00) Бишкек».
    const zoneChoice =
      clinicTimeZone === DEFAULT_CLINIC_TIME_ZONE
        ? `Часовой пояс «(${clinicLabel}) Бишкек» («Астана» не подходит — это UTC+05:00)`
        : `Часовой пояс — пояс с «(${clinicLabel})» (${city})`;
    howTo = `Как исправить: Параметры → Время и язык → Дата и время → ${zoneChoice}, затем включите «Установить время автоматически» и нажмите «Синхронизировать».`;
  } else {
    howTo = `Как исправить: в настройках даты и времени устройства включите автоматическую установку времени и часового пояса или выберите пояс ${clinicLabel} (${city}).`;
  }
  if (hasSkew(skewMs)) {
    howTo += " Часы здесь переведены вручную — после смены пояса они покажут неверное время, синхронизация это исправит.";
  }
  return { severity: "error", title: `На этом ${device.prep} неверный часовой пояс`, body, howTo: `${howTo} ${ASK_ADMIN}` };
}

/** Ключ для «закрыть»: та же проблема после закрытия не показывается до конца сессии браузера. */
export function dismissKey(problem: ClockProblem): string {
  if (problem.kind === "timezone") return `timezone:${problem.deviceOffset}:${problem.clinicOffset}`;
  return `clock:${Math.round(problem.skewMs / (10 * 60_000))}`;
}
