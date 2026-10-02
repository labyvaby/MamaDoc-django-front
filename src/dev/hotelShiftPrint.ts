/**
 * Печатная форма «Отчёт администратора за смену» — в раскладке таблицы,
 * которую Viva ведёт в Google Sheets: поступления по номерам (наличка /
 * безнал / способ), расходы, выручка и касса, завтраки, звонки и сообщения,
 * подписи сдал/принял. Альбомный A4.
 */
import dayjs from "dayjs";

import { esc } from "./hotelPrintDocs";
import type { ExpenseSummary, PaymentSummary } from "./hotelReportData";

export interface ShiftPaymentLine {
  id: number;
  acceptedAt: string;
  reservationId: number;
  reservationNumber: number | null;
  room: string;
  guest: string;
  checkIn: string | null;
  checkOut: string | null;
  cash: number | null;
  cashless: number | null;
  channel: string;
  note: string;
  acceptedBy: string;
  refund: boolean;
}

export interface ShiftExpenseLine {
  id: number;
  amount: number;
  name: string;
  category: string;
  cash: boolean;
  employee: string;
}

export interface ShiftArrivalLine {
  number: number;
  externalId: string;
  room: string;
  guest: string;
  checkIn: string | null;
  checkOut: string | null;
  source: string;
  checkedInAt: string | null;
  total: number;
  paid: number;
  balance: number;
}

export interface ShiftCounters {
  megacom: string;
  o: string;
  whatsapp: string;
}

export interface ShiftPrintInput {
  propertyName: string;
  date: string;
  windowLabel: string;
  adminName: string;
  currency: string;
  lines: ShiftPaymentLine[];
  expenses: ShiftExpenseLine[];
  payments: PaymentSummary;
  expenseSummary: ExpenseSummary;
  breakfasts: number;
  counters: ShiftCounters;
  arrivals: ShiftArrivalLine[];
}

const n = (v: number | null | undefined) => (v == null || v === 0 ? "" : v.toLocaleString("ru-RU", { maximumFractionDigits: 2 }));
const d = (v: string | null) => (v ? dayjs(v).format("DD.MM") : "");

const STYLES = `
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { font: 11px/1.35 "Inter", "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; }
h1 { font-size: 18px; margin: 0; letter-spacing: -0.01em; }
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
.muted { color: #64748b; }
.meta { text-align: right; font-size: 12px; }
.meta b { font-size: 13px; }
table { width: 100%; border-collapse: collapse; }
th { background: #0f172a; color: #fff; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; padding: 5px 6px; text-align: left; }
td { border-bottom: 1px solid #e2e8f0; padding: 4px 6px; vertical-align: top; }
tr:nth-child(even) td { background: #f8fafc; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tr.total td { font-weight: 700; background: #eef2f7; border-top: 1.5px solid #0f172a; }
tr.refund td { color: #b91c1c; }
.grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; margin-top: 14px; }
.box h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 6px; }
.sum { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sum div { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; }
.sum b { display: block; font-size: 15px; font-variant-numeric: tabular-nums; }
.sum .accent { border-color: #0f172a; }
.sign { display: flex; gap: 40px; margin-top: 22px; }
.sign div { flex: 1; border-top: 1px solid #0f172a; padding-top: 4px; color: #64748b; }
.page-break { page-break-before: always; }
`;

export function buildShiftReportHtml(p: ShiftPrintInput): string {
  const money = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${p.currency === "KGS" ? "сом" : p.currency}`;
  const cashTotal = p.lines.reduce((s, l) => s + (l.cash ?? 0), 0);
  const cashlessTotal = p.lines.reduce((s, l) => s + (l.cashless ?? 0), 0);
  const kassa = p.payments.cash - p.expenseSummary.cash;
  const counter = (v: string) => (v.trim() === "" ? "—" : esc(v));
  const callsTotal = [p.counters.megacom, p.counters.o].reduce((s, v) => s + (Number(v) || 0), 0);

  const paymentRows = p.lines
    .map(
      (l) => `<tr class="${l.refund ? "refund" : ""}">
  <td><b>${esc(l.room)}</b></td>
  <td>${esc(l.guest)}${l.reservationNumber ? ` <span class="muted">№${l.reservationNumber}</span>` : ""}</td>
  <td>${d(l.checkIn)}</td><td>${d(l.checkOut)}</td>
  <td class="num">${n(l.cash)}</td><td class="num">${n(l.cashless)}</td>
  <td>${esc(l.cashless != null ? l.channel : "")}</td>
  <td class="num">${dayjs(l.acceptedAt).format("HH:mm")}</td>
  <td>${esc([l.refund ? "возврат" : "", l.note].filter(Boolean).join(" · "))}</td>
</tr>`,
    )
    .join("");

  const expenseRows = p.expenses
    .map((e) => `<tr><td class="num">${n(e.amount)}</td><td>${esc(e.name)}${e.employee ? ` <span class="muted">· ${esc(e.employee)}</span>` : ""}</td><td>${esc(e.category)}${e.cash ? "" : " (безнал)"}</td></tr>`)
    .join("");

  const channelRows = p.payments.byChannel.map((c) => `<tr><td>${esc(c.label)}</td><td class="num">${n(c.amount)}</td></tr>`).join("");

  const arrivalRows = p.arrivals
    .map(
      (a) => `<tr>
  <td>${a.externalId ? esc(a.externalId) : `№${a.number}`}</td><td><b>${esc(a.room)}</b></td><td>${esc(a.guest)}</td>
  <td>${d(a.checkIn)}</td><td>${d(a.checkOut)}</td><td>${esc(a.source)}</td>
  <td class="num">${a.checkedInAt ? dayjs(a.checkedInAt).format("HH:mm") : ""}</td>
  <td class="num">${n(a.total)}</td><td class="num">${n(a.paid)}</td><td class="num">${n(a.balance)}</td>
</tr>`,
    )
    .join("");

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт администратора — ${esc(dayjs(p.date).format("DD.MM.YYYY"))}</title><style>${STYLES}</style></head><body>
<div class="head">
  <div><h1>Отчёт администратора за смену</h1><div class="muted">${esc(p.propertyName)} · ${esc(p.windowLabel)}</div></div>
  <div class="meta">Дата: <b>${esc(dayjs(p.date).format("DD.MM.YYYY"))}</b><br>Админ: <b>${esc(p.adminName || "—")}</b></div>
</div>

<table>
  <thead><tr><th>Номер</th><th>ФИО</th><th>Заезд</th><th>Выезд</th><th class="num">Наличка</th><th class="num">Безнал</th><th>Способ</th><th class="num">Время</th><th>Комментарий</th></tr></thead>
  <tbody>${paymentRows || `<tr><td colspan="9" class="muted">Поступлений за смену нет</td></tr>`}
  <tr class="total"><td colspan="4">Всего</td><td class="num">${n(cashTotal)}</td><td class="num">${n(cashlessTotal)}</td><td colspan="3"></td></tr></tbody>
</table>

<div class="grid">
  <div class="box">
    <h2>Расходы</h2>
    <table><thead><tr><th class="num">Сумма</th><th>Комментарий</th><th>Категория</th></tr></thead>
    <tbody>${expenseRows || `<tr><td colspan="3" class="muted">Расходов нет</td></tr>`}
    <tr class="total"><td class="num">${n(p.expenseSummary.total)}</td><td colspan="2">Всего</td></tr></tbody></table>
  </div>
  <div class="box">
    <h2>Итог смены</h2>
    <div class="sum">
      <div>Наличка<b>${money(p.payments.cash)}</b></div>
      <div>Безнал<b>${money(p.payments.cashless)}</b></div>
      <div class="accent">Выручка всего<b>${money(p.payments.total)}</b></div>
      <div>Расходы (нал.)<b>${money(p.expenseSummary.cash)}</b></div>
      <div class="accent">Касса (нал.)<b>${money(kassa)}</b>${p.payments.foreignCash.length ? `<span class="muted">в т.ч. ${p.payments.foreignCash.map((f) => `${f.amount.toLocaleString("ru-RU")} ${esc(f.currency)}`).join(", ")}</span>` : ""}</div>
      <div>Завтраков<b>${p.breakfasts}</b></div>
    </div>
    ${channelRows ? `<table style="margin-top:8px"><thead><tr><th>Безнал по способам</th><th class="num">Сумма</th></tr></thead><tbody>${channelRows}</tbody></table>` : ""}
    <table style="margin-top:8px"><thead><tr><th></th><th class="num">Мегаком</th><th class="num">О!</th><th class="num">Всего</th></tr></thead>
    <tbody><tr><td>Кол-во звонков</td><td class="num">${counter(p.counters.megacom)}</td><td class="num">${counter(p.counters.o)}</td><td class="num">${callsTotal || "—"}</td></tr>
    <tr><td>Сообщений в WhatsApp</td><td class="num" colspan="3">${counter(p.counters.whatsapp)}</td></tr></tbody></table>
  </div>
</div>

${
  arrivalRows
    ? `<div class="box" style="margin-top:14px"><h2>Заезды дня</h2>
<table><thead><tr><th>Бронь</th><th>Комната</th><th>ФИО</th><th>Заезд</th><th>Выезд</th><th>Канал</th><th class="num">Время</th><th class="num">Стоимость</th><th class="num">Оплачено</th><th class="num">Долг</th></tr></thead><tbody>${arrivalRows}</tbody></table></div>`
    : ""
}

<div class="sign"><div>Сдал смену</div><div>Принял смену</div><div>Проверил</div></div>
</body></html>`;
}
