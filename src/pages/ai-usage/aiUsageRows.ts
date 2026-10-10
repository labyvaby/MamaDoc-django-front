import dayjs from "dayjs";

import type { AiUsageByDay } from "../../api/aiUsage";

/** С этого дня бэк пишет учёт обращений к ИИ — раньше данных нет. */
export const AI_USAGE_TRACKING_START = "2026-10-05";

/**
 * Дни без обращений бэк в byDay не отдаёт — для графика дополняем период
 * нулями, иначе пустые дни схлопываются и столбцы стоят «встык».
 */
export function fillUsageDays(from: string, to: string, days: AiUsageByDay[]): AiUsageByDay[] {
  const start = dayjs(from);
  const end = dayjs(to);
  if (!start.isValid() || !end.isValid() || start.isAfter(end)) return [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: AiUsageByDay[] = [];
  for (let d = start; !d.isAfter(end, "day"); d = d.add(1, "day")) {
    const key = d.format("YYYY-MM-DD");
    out.push(byDate.get(key) ?? { date: key, requests: 0, totalTokens: 0 });
  }
  return out;
}

const fullFormat = new Intl.NumberFormat("ru-RU");

/** Число токенов целиком: «59 846». */
export const formatTokens = (value: number): string => fullFormat.format(value);

/** Короткая подпись оси: «950», «12,5 тыс.», «1,2 млн». */
export function formatTokensShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)} млн`;
  if (abs >= 1_000) return `${trim(value / 1_000)} тыс.`;
  return String(value);
}

const trim = (n: number) => fullFormat.format(Math.round(n * 10) / 10);

/** Доля от итога в процентах, «—» при нулевом итоге. */
export function sharePct(value: number, total: number): string {
  if (!(total > 0)) return "—";
  const pct = (value / total) * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

/** Среднее число токенов на успешное обращение (у ошибок токенов нет). */
export function avgTokensPerRequest(totalTokens: number, requests: number, errors: number): number | null {
  const ok = requests - errors;
  return ok > 0 ? Math.round(totalTokens / ok) : null;
}
