/**
 * Печать X-отчёта. Та же матрица, что на экране, но лист выбирает кассир:
 * на ленту 80 мм отчёт подшивают в журнал смены, на A4/A5 — сдают бухгалтеру.
 * Выбор запоминается, как у счёта к оплате (`appointmentInvoice.ts`).
 */
import dayjs from "dayjs";

import type { CashboxShiftSummary } from "../../../../api/cashboxShifts";
import { buildXReport, formatAmount, formatCell, isEmptyRow } from "./xReport";

export type XReportPageSize = "80mm" | "A5" | "A4";

const PAGE_SIZE_STORAGE_KEY = "mamadoc:xReportPageSize";
export const DEFAULT_X_REPORT_PAGE_SIZE: XReportPageSize = "80mm";

export const X_REPORT_PAGE_SIZES: { value: XReportPageSize; label: string; hint: string }[] = [
  { value: "80mm", label: "Лента 80 мм", hint: "Чековый принтер — подшить в журнал смены" },
  { value: "A5", label: "A5", hint: "Половина листа" },
  { value: "A4", label: "A4", hint: "Обычный лист — сдать бухгалтеру" },
];

export function readXReportPageSize(): XReportPageSize {
  try {
    const saved = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
    return saved === "80mm" || saved === "A5" || saved === "A4" ? saved : DEFAULT_X_REPORT_PAGE_SIZE;
  } catch {
    return DEFAULT_X_REPORT_PAGE_SIZE;
  }
}

export function saveXReportPageSize(size: XReportPageSize): void {
  try {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, size);
  } catch {
    /* приватный режим — печатаем, но выбор не запомним */
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

/**
 * Параметры листа. На ленте колонок быть не может — 80 мм не хватит даже на
 * три суммы, поэтому там отчёт печатается в строчку, «подпись: сумма».
 */
function sheetMetrics(pageSize: XReportPageSize) {
  if (pageSize === "80mm") {
    return { css: "80mm auto", padMm: 3, widthMm: 74, fontPx: 11, narrow: true };
  }
  const isA4 = pageSize === "A4";
  return {
    css: isA4 ? "A4 portrait" : "A5 portrait",
    padMm: isA4 ? 12 : 8,
    widthMm: isA4 ? 186 : 132,
    fontPx: isA4 ? 13 : 11,
    narrow: false,
  };
}

export interface XReportPrintData {
  summary: CashboxShiftSummary;
  organizationName?: string;
  pageSize?: XReportPageSize;
  /** Момент снятия отчёта; по умолчанию — сейчас. */
  takenAt?: string;
}

/** Самодостаточный HTML отчёта — используется и печатью, и тестами. */
export function buildXReportHtml(data: XReportPrintData): string {
  const { summary } = data;
  const sheet = sheetMetrics(data.pageSize ?? DEFAULT_X_REPORT_PAGE_SIZE);
  const report = buildXReport(summary);
  const shift = summary.shift;
  const takenAt = dayjs(data.takenAt ?? undefined).format("DD.MM.YYYY HH:mm");
  const isOpen = shift.status === "open";

  const meta: [string, string][] = [
    ["Организация", data.organizationName ?? "—"],
    ["Филиал", shift.branchName ?? "—"],
    ["Смена", `#${shift.id}`],
    ["Открыл", shift.openedByName ?? "—"],
    ["Открыта", dayjs(shift.openedAt).format("DD.MM.YYYY HH:mm")],
    ...(shift.closedAt
      ? ([["Закрыта", dayjs(shift.closedAt).format("DD.MM.YYYY HH:mm")]] as [string, string][])
      : []),
    ["Отчёт снят", takenAt],
  ];

  const metaHtml = meta
    .map(([label, value]) => `<div class="meta-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`)
    .join("");

  const rows = report.rows.filter((r) => !isEmptyRow(r));

  const wideRows = [...rows, report.movement]
    .map((r) => {
      const isTotal = r.key === "movement";
      const methods = r.methods
        .map(
          (m) =>
            `<tr class="method"><td>${esc(m.name)}</td><td class="num"></td><td class="num">${esc(
              formatAmount(m.amount),
            )}</td><td class="num"></td><td class="num"></td><td class="num"></td></tr>`,
        )
        .join("");
      return (
        `<tr class="${isTotal ? "total" : ""}">
          <td>${esc(r.label)}</td>
          <td class="num">${esc(formatCell(r.cash))}</td>
          <td class="num">${esc(formatCell(r.cashless))}</td>
          <td class="num">${esc(formatCell(r.balance))}</td>
          <td class="num">${esc(formatCell(r.total))}</td>
          <td class="num">${r.count ?? ""}</td>
        </tr>` + methods
      );
    })
    .join("");

  const narrowRows = [...rows, report.movement]
    .map((r) => {
      const parts = [
        r.cash !== 0 ? `нал ${formatAmount(r.cash)}` : "",
        r.cashless !== 0 ? `безнал ${formatAmount(r.cashless)}` : "",
        r.balance !== 0 ? `баланс ${formatAmount(r.balance)}` : "",
      ].filter(Boolean);
      const methods = r.methods
        .map((m) => `<div class="method">${esc(m.name)}: ${esc(formatAmount(m.amount))}</div>`)
        .join("");
      return `<div class="line ${r.key === "movement" ? "total" : ""}">
          <div class="line-head"><span>${esc(r.label)}</span><b>${esc(formatAmount(r.total))}</b></div>
          ${parts.length ? `<div class="line-sub">${esc(parts.join(" · "))}</div>` : ""}
          ${methods}
        </div>`;
    })
    .join("");

  const cashBlock = `
    <div class="cash">
      <div class="meta-row"><span>Остаток на начало</span><b>${esc(formatAmount(report.opening))}</b></div>
      <div class="meta-row"><span>Движение наличных</span><b>${esc(formatAmount(report.movement.cash))}</b></div>
      <div class="meta-row big"><span>Должно быть в кассе</span><b>${esc(formatAmount(report.expectedCash))}</b></div>
      ${
        report.mismatch !== 0
          ? `<div class="warn">Не раскладывается по строкам: ${esc(formatAmount(report.mismatch))} — проверьте внесения и изъятия</div>`
          : ""
      }
    </div>`;

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8" />
<title>X-отчёт · смена #${shift.id}</title>
<style>
  /* Поля задаёт padding у body: @page margin:0 убирает колонтитулы браузера. */
  @page { size: ${sheet.css}; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: ${sheet.padMm}mm; width: ${sheet.widthMm}mm;
    font: ${sheet.fontPx}px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #111; background: #fff;
  }
  h1 { font-size: ${sheet.fontPx + 3}px; margin: 0 0 2px; letter-spacing: .2px; }
  .sub { color: #555; font-size: ${sheet.fontPx - 1}px; margin-bottom: 8px; }
  .open { display: inline-block; border: 1px solid #111; border-radius: 3px; padding: 0 4px; font-size: ${sheet.fontPx - 2}px; }
  .meta { border-top: 1px solid #ddd; padding-top: 6px; margin-bottom: 8px; }
  .meta-row { display: flex; justify-content: space-between; gap: 8px; }
  .meta-row span { color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { padding: 3px 4px; border-bottom: 1px solid #eee; text-align: left; }
  th { font-size: ${sheet.fontPx - 2}px; color: #555; text-transform: uppercase; letter-spacing: .3px; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.total td { border-top: 1px solid #111; border-bottom: none; font-weight: 700; }
  tr.method td { color: #666; font-size: ${sheet.fontPx - 2}px; border-bottom: none; padding-top: 0; padding-bottom: 0; }
  tr.method td:first-child { padding-left: 14px; }
  .line { border-bottom: 1px solid #eee; padding: 3px 0; }
  .line-head { display: flex; justify-content: space-between; gap: 8px; }
  .line-sub { color: #555; font-size: ${sheet.fontPx - 2}px; }
  .line.total { border-top: 1px solid #111; border-bottom: none; font-weight: 700; }
  .method { color: #666; font-size: ${sheet.fontPx - 2}px; padding-left: 10px; }
  .cash { border-top: 1px solid #111; padding-top: 6px; }
  .cash .big { font-size: ${sheet.fontPx + 2}px; font-weight: 700; margin-top: 2px; }
  .warn { margin-top: 4px; font-size: ${sheet.fontPx - 2}px; border: 1px solid #111; padding: 3px 4px; }
  .sign { margin-top: 14px; display: flex; justify-content: space-between; gap: 12px; font-size: ${sheet.fontPx - 1}px; }
  .sign div { border-top: 1px solid #111; padding-top: 3px; flex: 1; color: #555; }
</style></head>
<body>
  <h1>X-отчёт</h1>
  <div class="sub">
    Промежуточный отчёт по смене${isOpen ? " · " : ""}${isOpen ? '<span class="open">смена не закрыта</span>' : ""}
  </div>
  <div class="meta">${metaHtml}</div>
  ${
    sheet.narrow
      ? narrowRows
      : `<table>
          <thead><tr>
            <th>Операция</th><th class="num">Наличные</th><th class="num">Безнал</th>
            <th class="num">Баланс</th><th class="num">Всего</th><th class="num">Кол-во</th>
          </tr></thead>
          <tbody>${wideRows}</tbody>
        </table>`
  }
  ${cashBlock}
  ${sheet.narrow ? "" : '<div class="sign"><div>Кассир</div><div>Проверил</div></div>'}
</body></html>`;
}

export function printXReport(data: XReportPrintData): boolean {
  const size = data.pageSize ?? DEFAULT_X_REPORT_PAGE_SIZE;
  const win = window.open("", "_blank", `width=${size === "A4" ? 900 : size === "A5" ? 680 : 420},height=760`);
  if (!win) return false;
  win.document.write(buildXReportHtml(data));
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 250);
  return true;
}
