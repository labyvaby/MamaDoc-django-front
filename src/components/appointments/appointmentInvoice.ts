import dayjs from "dayjs";

import type {
  DjangoAppointment,
  AppointmentServiceLine,
  AppointmentConsumption,
} from "../../api/appointments";
import { consumptionLineTotal } from "../../api/appointments";
import type { PaymentStatus, PaymentSummary } from "../../api/payments";
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
 * Чек печатаем только по факту принятых денег: до оплаты бланк с нулями на
 * руках у пациента читается как уже оплаченный документ. Смотрим на деньги, а
 * не на статус приёма — бэк оставляет его `scheduled`/`confirmed` и после
 * оплаты; `discounted` без внесённых сумм — скидка 100 %, расчёт закрыт.
 *
 * Принимает и приём (`paidTotal`/`paymentStatus` есть и в списке, и в детали),
 * и сводку оплат — что под рукой на экране.
 */
export function hasAcceptedPayment(
  source:
    | {
        paymentStatus?: PaymentStatus | null;
        paidTotal?: string | null;
        payments?: { amount: string }[];
      }
    | null
    | undefined,
): boolean {
  if (!source) return false;
  if (num(source.paidTotal) > 0) return true;
  if ((source.payments ?? []).some((p) => num(p.amount) > 0)) return true;
  return source.paymentStatus === "paid" || source.paymentStatus === "discounted";
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

/** Формат листа: A5 — чек кассы, A4 — счёт на обычной бумаге. */
export type InvoicePageSize = "A5" | "A4";

const PAGE_SIZE_STORAGE_KEY = "mamadoc:invoicePageSize";
export const DEFAULT_INVOICE_PAGE_SIZE: InvoicePageSize = "A5";

/** Последний выбранный формат — им открывается диалог печати в следующий раз. */
export function readInvoicePageSize(): InvoicePageSize {
  try {
    const saved = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
    return saved === "A4" || saved === "A5" ? saved : DEFAULT_INVOICE_PAGE_SIZE;
  } catch {
    return DEFAULT_INVOICE_PAGE_SIZE;
  }
}

export function saveInvoicePageSize(size: InvoicePageSize): void {
  try {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, size);
  } catch {
    /* приватный режим — формат просто не запомнится */
  }
}

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
  /** Формат листа; по умолчанию A5 — так печатали до появления выбора. */
  pageSize?: InvoicePageSize;
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

/**
 * Параметры листа. Размеры шрифтов задаются одним множителем от бланка A5:
 * на A4 та же вёрстка иначе осталась бы мелкой строчкой вверху листа.
 */
function sheetMetrics(pageSize: InvoicePageSize) {
  const isA4 = pageSize === "A4";
  return {
    css: isA4 ? "A4 portrait" : "A5 portrait",
    /** Поля листа — их задаёт padding у body, см. комментарий к @page. */
    padMm: isA4 ? 12 : 8,
    /** Ширина бланка на экране: ширина листа минус поля. */
    widthMm: isA4 ? 186 : 132,
    scale: isA4 ? 1.35 : 1,
    barcode: isA4 ? { moduleWidth: 1.4, height: 40 } : { moduleWidth: 1, height: 28 },
  };
}

/** Самодостаточный HTML чека (A5 или A4) — используется и печатью, и тестами. */
export function buildAppointmentInvoiceHtml(data: AppointmentInvoiceData): string {
  const { appointment, summary, patient, organizationName, branchName } = data;
  const sheet = sheetMetrics(data.pageSize ?? DEFAULT_INVOICE_PAGE_SIZE);
  /** Размер в пикселях бланка A5, пересчитанный под выбранный лист. */
  const px = (value: number) => `${Number((value * sheet.scale).toFixed(2))}px`;

  const rows = buildRows(appointment);
  const total = num(summary?.totalAmount ?? appointment.totalAmount);
  const discount = num(summary?.discountAmount ?? appointment.discountAmount);
  const payable = num(summary?.payableAmount ?? appointment.payableAmount) || Math.max(0, total - discount);
  const paid = num(summary?.paidNet ?? summary?.paidTotal ?? appointment.paidTotal);
  const due = summary ? num(summary.debt) : Math.max(0, payable - paid);

  const invoiceNumber = String(appointment.id);
  const barcode = barcode128Svg(invoiceNumber, sheet.barcode);
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
      @page { size: ${sheet.css}; margin: 0; }
      /* Ширина листа за вычетом полей — чтобы предпросмотр в окне печати
         выглядел так же, как выйдет на бумаге, а не растягивался по экрану. */
      body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#111; margin:24px auto; max-width:${sheet.widthMm}mm; font-size:${px(9.5)}; }
      .top { display:flex; justify-content:space-between; align-items:flex-start; gap:${px(16)}; }
      .org { font-size:${px(14)}; font-weight:600; }
      h1 { font-size:${px(13)}; text-align:center; margin:${px(8)} 0 ${px(10)}; }
      .meta { display:flex; justify-content:space-between; gap:${px(12)}; margin-bottom:${px(10)}; }
      .meta-col { flex:1; }
      .meta-row { display:flex; gap:${px(8)}; margin-bottom:${px(3)}; }
      .meta-row b { min-width:${px(110)}; color:#444; font-weight:600; }
      table { width:100%; border-collapse:collapse; margin-top:${px(6)}; }
      th, td { border:1px solid #999; padding:${px(3)} ${px(4)}; text-align:left; vertical-align:top; }
      th { background:#f2f2f2; font-weight:600; font-size:${px(9)}; }
      td.num, th.num { text-align:right; white-space:nowrap; }
      .nowrap { white-space:nowrap; }
      .empty { text-align:center; color:#777; }
      .totals { margin-top:${px(10)}; display:flex; justify-content:space-between; gap:${px(12)}; }
      .words { flex:1; font-style:italic; }
      .sums { min-width:${px(200)}; }
      .sum-row { display:flex; justify-content:space-between; gap:${px(16)}; padding:${px(2)} 0; }
      .sum-row.due { border-top:1px solid #999; margin-top:${px(4)}; padding-top:${px(5)}; font-weight:700; font-size:${px(14)}; }
      .pays { margin-top:${px(10)}; }
      .pays h2 { font-size:${px(9)}; text-transform:uppercase; letter-spacing:.4px; color:#555; margin:0 0 ${px(4)}; }
      .pay-row { display:flex; justify-content:space-between; gap:${px(16)}; max-width:${px(200)}; padding:${px(1)} 0; }
      .foot { margin-top:${px(16)}; display:flex; justify-content:space-between; gap:${px(12)}; font-size:${px(9)}; color:#333; }
      .sign { min-width:${px(160)}; }
      .sign .line { margin-top:${px(14)}; border-top:1px solid #999; padding-top:${px(3)}; color:#777; }
      /* На бумаге ширину ограничивает сам лист, поэтому max-width снимаем:
         иначе к полям добавился бы ещё и отступ от auto-центрирования. */
      @media print { body { margin:0; max-width:none; padding:${sheet.padMm}mm; } }
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
  const width = (data.pageSize ?? DEFAULT_INVOICE_PAGE_SIZE) === "A4" ? 900 : 680;
  const win = window.open("", "_blank", `width=${width},height=760`);
  if (!win) return false;
  win.document.write(buildAppointmentInvoiceHtml(data));
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 250);
  return true;
}
