/** Фикстура ответа API для тестов ОПиУ: январь–февраль 2026, все 22 строки формы. */
import type { PnlDetail, PnlLine, PnlReport } from "../../api/pnl";

const CODES: [string, string, PnlLine["kind"]][] = [
  ["010", "Выручка", "group"], ["020", "Себестоимость", "group"], ["030", "Валовая прибыль", "total"],
  ["040", "Прочие операционные доходы", "group"], ["050", "Прочие операционные расходы", "group"],
  ["060", "Итого прочие операционные доходы и расходы", "total"], ["070", "Расходы по реализации", "group"],
  ["071", "в т. ч. амортизация", "line"], ["080", "Административные расходы", "group"],
  ["081", "в т. ч. амортизация", "line"], ["090", "Итого операционные расходы", "total"],
  ["100", "Операционная прибыль", "total"], ["110", "Доход от инвестиций", "line"],
  ["120", "Расходы по процентам", "group"], ["130", "Курсовые разницы", "line"],
  ["140", "Прочие неоперационные доходы и расходы", "group"],
  ["150", "Итого неоперационные доходы и расходы", "total"], ["160", "Прибыль до налога", "total"],
  ["170", "Налог на прибыль", "group"], ["180", "Прибыль от обычной деятельности", "total"],
  ["190", "Чрезвычайные статьи", "line"], ["200", "Чистая прибыль", "total"],
];

export function detail(key: string, title: string, jan: number, feb: number, categoryKind: string | null = null): PnlDetail {
  return {
    key, title, categoryId: null, categoryKind,
    months: { "2026-01": jan.toFixed(2), "2026-02": feb.toFixed(2) },
    total: (jan + feb).toFixed(2),
  };
}

/** Выручка 1000+1200, себестоимость 100+120, ЗП 500+500, аренда 200+200, реклама 50+30,
 *  прочие доходы 10+0 → чистая прибыль 160+350 = 510. */
export function makeReport(overrides: Partial<PnlReport> = {}): PnlReport {
  const children: Record<string, PnlDetail[]> = {
    "010": [detail("revenue.services", "Услуги", 900, 1100), detail("revenue.appointment_products", "Товары и вакцины в приёмах", 100, 100)],
    "020": [detail("cost.category.1", "Расходники", 100, 120)],
    "040": [detail("other_income.category.9", "Аренда кабинета", 10, 0)],
    "070": [detail("selling.category.3", "Реклама", 50, 30)],
    "080": [
      detail("admin.category.4", "Заработная плата", 500, 500, "salary"),
      detail("admin.category.5", "Аренда", 200, 200),
    ],
  };
  const value: Record<string, [number, number]> = {
    "010": [1000, 1200], "020": [100, 120], "030": [900, 1080], "040": [10, 0], "050": [0, 0],
    "060": [10, 0], "070": [50, 30], "080": [700, 700], "090": [750, 730], "100": [160, 350],
    "150": [0, 0], "160": [160, 350], "170": [0, 0], "180": [160, 350], "200": [160, 350],
  };
  const lines: PnlLine[] = CODES.map(([code, title, kind]) => {
    const [jan, feb] = value[code] ?? [0, 0];
    return {
      code, key: code, title, kind,
      months: { "2026-01": jan.toFixed(2), "2026-02": feb.toFixed(2) },
      total: (jan + feb).toFixed(2),
      children: children[code] ?? [],
    };
  });
  return {
    dateFrom: "2026-01-01", dateTo: "2026-02-28", branchId: null,
    months: [{ key: "2026-01", open: false }, { key: "2026-02", open: false }],
    lines,
    compare: { dateFrom: "2025-01-01", dateTo: "2025-02-28", totals: { "010": "2000.00", "030": "0.00", "100": "300.00", "200": "255.00" } },
    warnings: [],
    ...overrides,
  };
}
