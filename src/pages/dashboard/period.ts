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

/** Окно графика на «Сегодня»: один столбик ничего не говорит, нужен фон. */
export const TODAY_CHART_DAYS = 14;

/**
 * Окно графика записей. На «Неделе» и «Месяце» совпадает с периодом, на
 * «Сегодня» — последние 14 дней с сегодняшним в конце.
 */
export function chartRangeFor(range: PeriodRange, key: PeriodKey): PeriodRange {
  if (key !== "today") return range;
  return {
    ...range,
    dateFrom: dayjs(range.dateTo)
      .subtract(TODAY_CHART_DAYS - 1, "day")
      .format("YYYY-MM-DD"),
  };
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
