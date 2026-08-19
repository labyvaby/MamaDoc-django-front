import dayjs from "dayjs";

import type {
  DjangoAppointment,
  AppointmentServiceLine,
  AppointmentConsumption,
} from "../../api/appointments";
import { consumptionLineTotal } from "../../api/appointments";
import type { PaymentSummary } from "../../api/payments";
import type { DjangoPatient } from "../../api/patients";
import { paymentMethodLabel } from "../../utility/paymentMethodLabel";
import { amountInWordsKgs } from "../../utility/amountInWords";
import { barcode128Svg } from "../../utility/barcode128";
import { tt } from "../../i18n/t";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

function num(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Денежная сумма в формате бланка: 1 500,00 */
function money(value: number): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Сумма строки услуги. `lineTotal` считает бэк, но список приёмов его не всегда
 * отдаёт (как и `price`), поэтому есть запасной расчёт из цены и количества —
 * см. `src/api/appointments.ts`.
 */
function serviceLineTotal(line: AppointmentServiceLine): number {
  const lineTotal = num(line.lineTotal);
  if (lineTotal > 0) return lineTotal;
  const unit = num(line.unitPrice) || num(line.price) || num(line.service?.basePrice);
  return unit * (line.quantity || 1) - num(line.discountAmount);
}

function serviceUnitPrice(line: AppointmentServiceLine): number {
  const unit = num(line.unitPrice) || num(line.price) || num(line.service?.basePrice);
  if (unit > 0) return unit;
  const quantity = line.quantity || 1;
  return quantity > 0 ? serviceLineTotal(line) / quantity : 0;
}

type InvoiceRow = {
  name: string;
  performer: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  total: number;
  date: string;
};

export type AppointmentInvoiceData = {
  appointment: DjangoAppointment;
  /** Сохранённая сводка оплат — источник итогов счёта (не форма на экране). */
  summary: PaymentSummary | null;
  /** Карточка пациента: адрес и дата рождения приходят только оттуда. */
  patient: DjangoPatient | null;
  organizationName: string;
  branchName?: string | null;
  /** Кто создал приём (подпись «Регистратор»). */
  registrarName?: string | null;
  /** Кто печатает счёт — текущий пользователь. */
  createdByName?: string | null;
};

/** Строки счёта: услуги, их платные расходники и товары визита. */
function buildRows(appointment: DjangoAppointment): InvoiceRow[] {
  const visitDate = appointment.scheduledAt
    ? dayjs(appointment.scheduledAt).format("DD.MM.YYYY HH:mm")
    : "";
  const rows: InvoiceRow[] = [];

  for (const line of appointment.services ?? []) {
    rows.push({
      name: line.service?.name ?? "—",
      performer: line.employee?.fullName ?? "—",
      unitPrice: serviceUnitPrice(line),
      quantity: line.quantity || 1,
      discount: num(line.discountAmount),
      total: serviceLineTotal(line),
      date: visitDate,
    });

    // Платные расходники входят в сумму приёма — в счёте они должны быть
    // видны отдельной строкой, иначе итог не сойдётся со списком услуг.
    for (const consumption of line.consumptions ?? []) {
      const total = consumptionLineTotal(consumption as AppointmentConsumption);
      if (total <= 0) continue;
      const quantity = num(consumption.quantity) || 1;
      rows.push({
        name: `${consumption.name || "—"} (${tt("appointments:invoice.consumable")})`,
        performer: line.employee?.fullName ?? "—",
        unitPrice: quantity > 0 ? total / quantity : total,
        quantity,
        discount: 0,
        total,
        date: visitDate,
      });
    }
  }

  for (const product of appointment.productLines ?? []) {
    if (product.status === "canceled") continue;
    rows.push({
      name: product.product?.name ?? "—",
      performer: "—",
      unitPrice: num(product.unitPrice),
      quantity: product.quantity || 1,
      discount: num(product.discountAmount),
      total: num(product.lineTotal),
      date: visitDate,
    });
  }

  return rows;
}

/** Самодостаточный HTML чека (A5) — используется и печатью, и тестами. */
export function buildAppointmentInvoiceHtml(data: AppointmentInvoiceData): string {
  const { appointment, summary, patient, organizationName, branchName } = data;

  const rows = buildRows(appointment);
  const total = num(summary?.totalAmount ?? appointment.totalAmount);
  const discount = num(summary?.discountAmount ?? appointment.discountAmount);
  const payable = num(summary?.payableAmount ?? appointment.payableAmount) || Math.max(0, total - discount);
  const paid = num(summary?.paidNet ?? summary?.paidTotal ?? appointment.paidTotal);
  const due = summary ? num(summary.debt) : Math.max(0, payable - paid);

  const invoiceNumber = String(appointment.id);
  const barcode = barcode128Svg(invoiceNumber, { moduleWidth: 1, height: 28 });
  const docTitle = tt("appointments:invoice.receiptTitle");

  const dob = patient?.birthDate ? dayjs(patient.birthDate).format("DD.MM.YYYY") : "—";
  const patientName = patient?.fullName ?? appointment.patient?.fullName ?? "—";
  const phone = patient?.phone ?? appointment.patient?.phone ?? "—";
  const address = patient?.address || "—";
  const patientId = patient?.id ?? appointment.patient?.id ?? null;

  const rowsHtml = rows.length
    ? rows
        .map(
          (r) => `<tr>
            <td>${esc(r.name)}</td>
            <td>${esc(r.performer)}</td>
            <td class="num">${money(r.unitPrice)}</td>
            <td class="num">${r.quantity}</td>
            <td class="num">${money(r.discount)}</td>
            <td class="num">${money(r.total)}</td>
            <td class="nowrap">${esc(r.date)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="7" class="empty">${esc(tt("appointments:invoice.noServices"))}</td></tr>`;

  const paymentsHtml = (summary?.payments ?? [])
    .map(
      (p) => `<div class="pay-row"><span>${esc(
        paymentMethodLabel(p.method, p.cashlessMethodName) +
          (p.method === "insurance" && p.insurerName ? ` · ${p.insurerName}` : ""),
      )}</span><span>${money(num(p.amount))}</span></div>`,
    )
    .join("");

  const orgLine = branchName
    ? `${organizationName} · ${branchName}`
    : organizationName;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
    <title>${esc(docTitle)} № ${esc(invoiceNumber)}</title>
    <style>
      * { box-sizing: border-box; }
      /* Формат листа задаём явно: иначе браузер печатает на A4 и документ
         уезжает в верхнюю четверть страницы.
         Поля страницы нулевые, отступ даёт padding у body: именно в поля
         @page браузер печатает свои колонтитулы (адрес «about:blank» и
         номер страницы), при margin:0 им негде разместиться. */
      @page { size: A5 portrait; margin: 0; }
      /* Ширина A5 за вычетом полей — чтобы предпросмотр в окне печати
         выглядел так же, как выйдет на бумаге, а не растягивался по экрану. */
      body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#111; margin:24px auto; max-width:132mm; font-size:9.5px; }
      .top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
      .org { font-size:14px; font-weight:600; }
      h1 { font-size:13px; text-align:center; margin:8px 0 10px; }
      .meta { display:flex; justify-content:space-between; gap:12px; margin-bottom:10px; }
      .meta-col { flex:1; }
      .meta-row { display:flex; gap:8px; margin-bottom:3px; }
      .meta-row b { min-width:110px; color:#444; font-weight:600; }
      table { width:100%; border-collapse:collapse; margin-top:6px; }
      th, td { border:1px solid #999; padding:3px 4px; text-align:left; vertical-align:top; }
      th { background:#f2f2f2; font-weight:600; font-size:9px; }
      td.num, th.num { text-align:right; white-space:nowrap; }
      .nowrap { white-space:nowrap; }
      .empty { text-align:center; color:#777; }
      .totals { margin-top:10px; display:flex; justify-content:space-between; gap:12px; }
      .words { flex:1; font-style:italic; }
      .sums { min-width:200px; }
      .sum-row { display:flex; justify-content:space-between; gap:16px; padding:2px 0; }
      .sum-row.due { border-top:1px solid #999; margin-top:4px; padding-top:5px; font-weight:700; font-size:14px; }
      .pays { margin-top:10px; }
      .pays h2 { font-size:9px; text-transform:uppercase; letter-spacing:.4px; color:#555; margin:0 0 4px; }
      .pay-row { display:flex; justify-content:space-between; gap:16px; max-width:200px; padding:1px 0; }
      .foot { margin-top:16px; display:flex; justify-content:space-between; gap:12px; font-size:9px; color:#333; }
      .sign { min-width:160px; }
      .sign .line { margin-top:14px; border-top:1px solid #999; padding-top:3px; color:#777; }
      /* На бумаге ширину ограничивает сам лист, поэтому max-width снимаем:
         иначе к 8mm полей добавился бы ещё и отступ от auto-центрирования. */
      @media print { body { margin:0; max-width:none; padding:8mm; } }
    </style></head><body>
    <div class="top">
      <div class="org">${esc(orgLine)}</div>
      <div>${barcode}</div>
    </div>
    <h1>${esc(docTitle)}</h1>
    <div class="meta">
      <div class="meta-col">
        <div class="meta-row"><b>${esc(tt("appointments:invoice.number"))}</b><span>${esc(invoiceNumber)}</span></div>
        <div class="meta-row"><b>${esc(tt("appointments:invoice.patient"))}</b><span>${esc(patientName)}</span></div>
        <div class="meta-row"><b>${esc(tt("appointments:invoice.birthDate"))}</b><span>${esc(dob)}</span></div>
        <div class="meta-row"><b>${esc(tt("appointments:invoice.phone"))}</b><span>${esc(phone)}</span></div>
        <div class="meta-row"><b>${esc(tt("appointments:invoice.address"))}</b><span>${esc(address)}</span></div>
      </div>
      <div class="meta-col">
        <div class="meta-row"><b>${esc(tt("appointments:invoice.date"))}</b><span>${dayjs().format("DD.MM.YYYY HH:mm")}</span></div>
        <div class="meta-row"><b>${esc(tt("appointments:invoice.patientId"))}</b><span>${patientId ?? "—"}</span></div>
        <div class="meta-row"><b>${esc(tt("appointments:invoice.visitDate"))}</b><span>${
          appointment.scheduledAt ? dayjs(appointment.scheduledAt).format("DD.MM.YYYY HH:mm") : "—"
        }</span></div>
        <div class="meta-row"><b>${esc(tt("appointments:invoice.registrar"))}</b><span>${esc(
          data.registrarName || "—",
        )}</span></div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>${esc(tt("appointments:invoice.colService"))}</th>
        <th>${esc(tt("appointments:invoice.colSpecialist"))}</th>
        <th class="num">${esc(tt("appointments:invoice.colPrice"))}</th>
        <th class="num">${esc(tt("appointments:invoice.colQuantity"))}</th>
        <th class="num">${esc(tt("appointments:invoice.colDiscount"))}</th>
        <th class="num">${esc(tt("appointments:invoice.colTotal"))}</th>
        <th>${esc(tt("appointments:invoice.colDate"))}</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="totals">
      <div class="words">${esc(amountInWordsKgs(due))}</div>
      <div class="sums">
        <div class="sum-row"><span>${esc(tt("appointments:invoice.total"))}</span><span>${money(total)}</span></div>
        <div class="sum-row"><span>${esc(tt("appointments:invoice.discount"))}</span><span>${money(discount)}</span></div>
        <div class="sum-row"><span>${esc(tt("appointments:invoice.withDiscount"))}</span><span>${money(payable)}</span></div>
        <div class="sum-row"><span>${esc(tt("appointments:invoice.paid"))}</span><span>${money(paid)}</span></div>
        <div class="sum-row due"><span>${esc(tt("appointments:invoice.due"))}</span><span>${money(due)}</span></div>
      </div>
    </div>
    ${
      paymentsHtml
        ? `<div class="pays"><h2>${esc(tt("appointments:invoice.payments"))}</h2>${paymentsHtml}</div>`
        : ""
    }
    <div class="foot">
      <div class="sign">
        <div>${esc(tt("appointments:invoice.createdBy"))}: ${esc(data.createdByName || "—")}</div>
      </div>
      <div class="sign">
        <div class="line">${esc(tt("appointments:invoice.signature"))}</div>
      </div>
    </div>
  </body></html>`;
}

/**
 * Печать чека: отдельное окно с самодостаточным HTML, лист A5.
 * Возвращает `false`, если окно заблокировал браузер — вызывающий код
 * показывает подсказку про всплывающие окна.
 */
export function printAppointmentInvoice(data: AppointmentInvoiceData): boolean {
  const win = window.open("", "_blank", "width=680,height=760");
  if (!win) return false;
  win.document.write(buildAppointmentInvoiceHtml(data));
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 250);
  return true;
}
