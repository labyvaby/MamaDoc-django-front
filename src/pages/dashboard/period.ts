import dayjs from "dayjs";

/**
 * Период просмотра дашборда. Отделён от частоты пересчёта данных: пользователь
 * выбирает окно (день/неделя/месяц), а свежесть определяется staleTime запросов
 * и подписью «обновлено в …» в шапке.
 *
 * Модуль отдельный, а не внутри страницы: файл с компонентами, экспортирующий
 * ещё и функции, ломает fast refresh (та же причина, что у cashbox/money.ts).
 */
export type PeriodKey = "today" | "week" | "month";

export interface PeriodRange {
  /** YYYY-MM-DD, включительно. */
  dateFrom: string;
  /** YYYY-MM-DD, включительно. */
  dateTo: string;
  /** YYYY-MM для месячного отчёта. */
  month: string;
  /** Подпись периода для шапки карточек. */
  label: string;
}

export const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
];

/**
 * Границы периода. Неделя — последние 7 дней включая сегодня (а не календарная:
 * владельцу важно «как идут дела», а не «что было с понедельника»). Месяц —
 * с первого числа по сегодня, поэтому цифры сопоставимы с кассой за тот же срок.
 */
export function resolvePeriod(key: PeriodKey, now = dayjs()): PeriodRange {
  const today = now.format("YYYY-MM-DD");
  const month = now.format("YYYY-MM");

  if (key === "today") {
    return { dateFrom: today, dateTo: today, month, label: "сегодня" };
  }
  if (key === "week") {
    return {
      dateFrom: now.subtract(6, "day").format("YYYY-MM-DD"),
      dateTo: today,
      month,
      label: "за 7 дней",
    };
  }
  return {
    dateFrom: now.startOf("month").format("YYYY-MM-DD"),
    dateTo: today,
    month,
    label: "с начала месяца",
  };
}

/**
 * Предыдущий период такой же длины — база для сравнения.
 *
 * Для месяца это НЕ весь прошлый месяц, а тот же его отрезок: 1–25 августа
 * сравнивается с 1–25 июля. Иначе растущий месяц всегда проигрывал бы
 * завершённому, и дельта показывала бы падение на ровном месте.
 */
export function previousRange(range: PeriodRange, key: PeriodKey): PeriodRange {
  const from = dayjs(range.dateFrom);
  const to = dayjs(range.dateTo);

  // Для дня база — тот же день недели, а не вчера: понедельник против
  // воскресенья сравнивать бессмысленно, у клиники разный график и поток.
  if (key === "today") {
    const prev = from.subtract(7, "day");
    return {
      dateFrom: prev.format("YYYY-MM-DD"),
      dateTo: prev.format("YYYY-MM-DD"),
      month: prev.format("YYYY-MM"),
      label: "тот же день неделю назад",
    };
  }

  if (key === "month") {
    const prevFrom = from.subtract(1, "month");
    // День месяца может не существовать (31 марта → 31 февраля): dayjs сам
    // прижмёт к последнему дню, это и есть верное поведение для сравнения.
    const prevTo = prevFrom.date(Math.min(to.date(), prevFrom.daysInMonth()));
    return {
      dateFrom: prevFrom.format("YYYY-MM-DD"),
      dateTo: prevTo.format("YYYY-MM-DD"),
      month: prevFrom.format("YYYY-MM"),
      label: "тот же отрезок прошлого месяца",
    };
  }

  const days = to.diff(from, "day") + 1;
  const prevTo = from.subtract(1, "day");
  const prevFrom = prevTo.subtract(days - 1, "day");
  return {
    dateFrom: prevFrom.format("YYYY-MM-DD"),
    dateTo: prevTo.format("YYYY-MM-DD"),
    month: prevFrom.format("YYYY-MM"),
    label: "предыдущие 7 дней",
  };
}

/** Сумма значений карты «дата → количество» по всем дням периода. */
export function sumDayCounts(counts: Record<string, number> | undefined): number {
  if (!counts) return 0;
  return Object.values(counts).reduce((acc, n) => acc + (Number(n) || 0), 0);
}

/**
 * Ряд «дата → количество» в порядке дней периода, включая дни без записей:
 * пропуск пустого дня превратил бы провал в графике в ровную линию.
 */
export function toDailySeries(
  counts: Record<string, number> | undefined,
  range: PeriodRange,
): { date: string; count: number }[] {
  const out: { date: string; count: number }[] = [];
  let cursor = dayjs(range.dateFrom);
  const last = dayjs(range.dateTo);
  while (cursor.isBefore(last) || cursor.isSame(last, "day")) {
    const key = cursor.format("YYYY-MM-DD");
    out.push({ date: key, count: Number(counts?.[key] ?? 0) });
    cursor = cursor.add(1, "day");
  }
  return out;
}

/** Сколько прошлых недель берём в «обычный» уровень дня недели. */
export const BASELINE_WEEKS = 4;

/**
 * Окно истории для базовой линии: от (начало − 4 недели) до (конец − 1 неделя).
 * Одним запросом покрывает «тот же день недели» для каждого дня графика.
 */
export function baselineWindow(range: PeriodRange, weeks = BASELINE_WEEKS): PeriodRange {
  const from = dayjs(range.dateFrom).subtract(weeks * 7, "day");
  const to = dayjs(range.dateTo).subtract(7, "day");
  return {
    dateFrom: from.format("YYYY-MM-DD"),
    dateTo: to.format("YYYY-MM-DD"),
    month: from.format("YYYY-MM"),
    label: `тот же день недели, ${weeks} нед.`,
  };
}

/**
 * «Обычно в этот день недели»: среднее по тому же дню недели за прошлые
 * недели. Понедельник сравнивается с понедельниками, а не со средним по
 * неделе — у бизнеса поток сильно зависит от дня недели.
 *
 * Дни без записи в истории считаются нулём (выходной — тоже данные), но если
 * истории нет вовсе (карта не пришла), линия не рисуется: null.
 */
export function weekdayBaseline(
  history: Record<string, number> | undefined,
  date: string,
  weeks = BASELINE_WEEKS,
): number | null {
  if (!history) return null;
  let sum = 0;
  for (let w = 1; w <= weeks; w++) {
    const key = dayjs(date).subtract(w * 7, "day").format("YYYY-MM-DD");
    sum += Number(history[key] ?? 0);
  }
  return sum / weeks;
}
