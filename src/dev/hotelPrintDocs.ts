/**
 * Печатные документы брони — из карточки брони (ReservationDetailsDialog →
 * «Печать»): подтверждение бронирования, счёт на оплату и анкета гостя
 * (регистрационная карта с подписью). Собираются из данных, которые карточка
 * уже загрузила, — отдельного запроса нет.
 *
 * Печать — через скрытый iframe: всплывающее окно браузер может
 * заблокировать, а печать всей страницы захватила бы меню и шахматку.
 * Документ А4, без цветов интерфейса — чтобы одинаково выходил на любом
 * принтере и в PDF.
 */
import dayjs from "dayjs";

import type { HotelPayment, HotelProperty, HotelReservation, HotelReservationGuest } from "../api/hotel";
import {
  HOTEL_BOARD_TYPE_LABELS,
  HOTEL_GENDER_LABELS,
  HOTEL_GUARANTEE_METHOD_LABELS,
  HOTEL_GUEST_TYPE_LABELS,
  HOTEL_VISIT_PURPOSE_LABELS,
} from "./hotelDisplay";
import { formatHotelDate, nightsBetween } from "./mockDemoData";

export type HotelPrintDoc = "confirmation" | "invoice" | "registration";

export const HOTEL_PRINT_DOC_LABELS: Record<HotelPrintDoc, string> = {
  confirmation: "Подтверждение бронирования",
  invoice: "Счёт на оплату",
  registration: "Анкета гостя",
};

interface PrintInput {
  reservation: HotelReservation;
  payments: HotelPayment[];
  property: HotelProperty | null;
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fullDate = (iso: string | null | undefined) => (iso ? `${formatHotelDate(iso)} ${dayjs(iso).year()}` : "—");
const docDate = (iso: string | null | undefined) => (iso ? dayjs(iso).format("DD.MM.YYYY") : "");
const nightsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "ночь" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "ночи" : "ночей");

function moneyOf(currency: string) {
  const unit = currency === "KGS" || !currency ? "сом" : currency;
  return (v: string | number) => `${Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`;
}

const STYLES = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Inter", "Segoe UI", Arial, sans-serif; font-size: 12.5px; line-height: 1.5; color: #111; }
  .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 18px; }
  .hotel { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
  .muted { color: #555; }
  .small { font-size: 11px; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; font-weight: 600; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .kv td:first-child { width: 38%; color: #555; }
  .total td { font-weight: 700; border-bottom: 0; }
  .due td { font-size: 15px; font-weight: 700; border-top: 2px solid #111; border-bottom: 0; }
  .sign { display: flex; gap: 40px; margin-top: 36px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; font-size: 11px; color: #555; }
  .rules { white-space: pre-wrap; font-size: 11px; color: #333; border: 1px solid #ddd; padding: 10px 12px; border-radius: 6px; }
  .page-break { page-break-before: always; }
  .foot { margin-top: 28px; font-size: 10.5px; color: #777; }
`;

function header(p: PrintInput, title: string, sub: string): string {
  const pr = p.property;
  const contacts = [pr?.address, pr?.phone, pr?.email].filter(Boolean).map(esc).join(" · ");
  return `<div class="head">
    <div><div class="hotel">${esc(pr?.name ?? "Отель")}</div><div class="muted small">${contacts}</div></div>
    <div style="text-align:right"><h1>${esc(title)}</h1><div class="muted">${esc(sub)}</div></div>
  </div>`;
}

function stayRows(p: PrintInput): string {
  const r = p.reservation;
  return r.items
    .map((it) => {
      const n = nightsBetween(it.checkIn, it.checkOut);
      const guests = `${it.adults} взр.${it.children ? ` + ${it.children} дет.` : ""}`;
      return `<tr>
        <td>${esc(it.roomTypeName)}${it.roomNumber ? `, номер ${esc(it.roomNumber)}` : ""}</td>
        <td>${esc(fullDate(it.checkIn))} — ${esc(fullDate(it.checkOut))}</td>
        <td class="num">${n} ${nightsWord(n)}</td>
        <td>${esc(guests)}</td>
        <td>${esc(HOTEL_BOARD_TYPE_LABELS[it.boardType] ?? it.boardType)}</td>
      </tr>`;
    })
    .join("");
}

function confirmation(p: PrintInput): string {
  const r = p.reservation;
  const money = moneyOf(r.currency);
  const pr = p.property;
  const guest = r.items[0]?.guests.find((g) => g.isPrimary) ?? r.items[0]?.guests[0];
  return `${header(p, "Подтверждение бронирования", `№${r.number} от ${docDate(r.createdAt)}`)}
    <table class="kv">
      <tr><td>Гость</td><td><b>${esc(r.customerName || guest?.fullName || "—")}</b></td></tr>
      ${guest?.phone ? `<tr><td>Телефон</td><td>${esc(guest.phone)}</td></tr>` : ""}
      ${r.guaranteeMethod ? `<tr><td>Гарантия</td><td>${esc(HOTEL_GUARANTEE_METHOD_LABELS[r.guaranteeMethod] ?? r.guaranteeMethod)}</td></tr>` : ""}
      ${pr?.checkInTime || pr?.checkOutTime ? `<tr><td>Заезд / выезд</td><td>заезд с ${esc(pr?.checkInTime?.slice(0, 5) ?? "—")}, выезд до ${esc(pr?.checkOutTime?.slice(0, 5) ?? "—")}</td></tr>` : ""}
    </table>
    <h2>Проживание</h2>
    <table><tr><th>Номер</th><th>Даты</th><th class="num">Ночей</th><th>Гости</th><th>Питание</th></tr>${stayRows(p)}</table>
    <h2>Оплата</h2>
    <table class="kv">
      <tr><td>Стоимость проживания</td><td class="num">${money(r.totalAmount)}</td></tr>
      <tr><td>Оплачено</td><td class="num">${money(r.paidAmount)}</td></tr>
      <tr class="due"><td>Остаток к оплате</td><td class="num">${money(r.balanceDue)}</td></tr>
    </table>
    ${r.guestComment ? `<h2>Пожелания гостя</h2><div>${esc(r.guestComment)}</div>` : ""}
    ${pr?.houseRules ? `<h2>Правила проживания</h2><div class="rules">${esc(pr.houseRules)}</div>` : ""}
    <div class="foot">Документ сформирован ${esc(dayjs().format("DD.MM.YYYY HH:mm"))}. Ждём вас!</div>`;
}

function invoice(p: PrintInput): string {
  const r = p.reservation;
  const money = moneyOf(r.currency);
  const nightRows = r.items
    .flatMap((it) =>
      (it.nights.length
        ? it.nights
        : [{ date: it.checkIn, price: it.totalAmount, ratePlanName: it.ratePlanName ?? "" }]
      ).map(
        (n) => `<tr>
          <td>${esc(fullDate(n.date))}</td>
          <td>${esc(it.roomTypeName)}${it.roomNumber ? `, №${esc(it.roomNumber)}` : ""}</td>
          <td>${esc(n.ratePlanName || HOTEL_BOARD_TYPE_LABELS[it.boardType] || "")}</td>
          <td class="num">${money(n.price)}</td>
        </tr>`,
      ),
    )
    .join("");
  const paymentRows = p.payments
    .map(
      (pay) => `<tr>
        <td>${esc(docDate(pay.acceptedAt || pay.createdAt))}</td>
        <td>${esc(pay.kind === "refund" ? "Возврат" : "Оплата")} · ${esc(pay.methodLabel || pay.method)}${pay.cashlessMethodName ? ` (${esc(pay.cashlessMethodName)})` : ""}</td>
        <td>${esc(pay.acceptedByName)}</td>
        <td class="num">${pay.kind === "refund" ? "−" : ""}${money(pay.amount)}</td>
      </tr>`,
    )
    .join("");
  return `${header(p, "Счёт на оплату", `№${r.number} от ${docDate(dayjs().toISOString())}`)}
    <table class="kv">
      <tr><td>Плательщик</td><td><b>${esc(r.customerName || "—")}</b></td></tr>
      ${r.companyInfo ? `<tr><td>Реквизиты</td><td style="white-space:pre-wrap">${esc(r.companyInfo)}</td></tr>` : ""}
      <tr><td>Бронь</td><td>№${r.number}</td></tr>
    </table>
    <h2>Проживание по ночам</h2>
    <table><tr><th>Ночь</th><th>Номер</th><th>Тариф</th><th class="num">Сумма</th></tr>${nightRows}
      <tr class="total"><td colspan="3">Итого за проживание</td><td class="num">${money(r.totalAmount)}</td></tr>
    </table>
    ${paymentRows ? `<h2>Поступившие оплаты</h2><table><tr><th>Дата</th><th>Способ</th><th>Принял</th><th class="num">Сумма</th></tr>${paymentRows}</table>` : ""}
    <table style="margin-top:14px"><tr class="due"><td>К оплате</td><td class="num">${money(r.balanceDue)}</td></tr></table>
    <div class="sign"><div>Администратор</div><div>Гость</div></div>`;
}

function guestCard(p: PrintInput, g: HotelReservationGuest, stay: HotelReservation["items"][number]): string {
  const d = g.document ?? {};
  const foreign = d.guestType === "foreign";
  const rows: [string, string | null | undefined][] = [
    ["Фамилия, имя, отчество", g.fullName],
    ["Гражданство", d.guestType === "foreign" ? d.citizenship : d.guestType ? HOTEL_GUEST_TYPE_LABELS[d.guestType] : d.citizenship],
    ["Пол", d.gender ? (HOTEL_GENDER_LABELS[d.gender] ?? d.gender) : null],
    ["Место рождения", d.placeOfBirth],
    ["Документ", [d.documentType === "passport" ? "Паспорт" : d.documentType === "id_card" ? "ID-карта" : d.documentType, d.documentNumber].filter(Boolean).join(" ")],
    ["Выдан", [d.issuingAuthority, docDate(d.issueDate)].filter(Boolean).join(", ")],
    ["Действителен до", docDate(d.documentExpiry)],
    // У гражданина КР — ИНН и прописка, у иностранца — въезд и миграционная карта.
    ...(foreign
      ? ([
          ["Дата въезда", docDate(d.entryDate)],
          ["Миграционная карта", d.migrationCardNumber],
          ["Цель визита", d.visitPurpose ? (HOTEL_VISIT_PURPOSE_LABELS[d.visitPurpose] ?? d.visitPurpose) : null],
        ] as [string, string | null | undefined][])
      : ([
          ["ИНН", d.inn],
          ["Адрес регистрации", d.registrationAddress],
        ] as [string, string | null | undefined][])),
    ["Телефон", g.phone],
    ["Эл. почта", g.email],
  ];
  const filled = rows.map(([label, value]) => `<tr><td>${esc(label)}</td><td>${value ? esc(value) : "&nbsp;"}</td></tr>`).join("");
  return `${header(p, "Анкета гостя", `бронь №${p.reservation.number}`)}
    <table class="kv">${filled}</table>
    <h2>Проживание</h2>
    <table class="kv">
      <tr><td>Номер</td><td>${esc(stay.roomNumber ?? "—")} · ${esc(stay.roomTypeName)}</td></tr>
      <tr><td>Даты</td><td>${esc(fullDate(stay.checkIn))} — ${esc(fullDate(stay.checkOut))}</td></tr>
    </table>
    ${p.property?.houseRules ? `<h2>Правила проживания</h2><div class="rules">${esc(p.property.houseRules)}</div>` : ""}
    <p class="small" style="margin-top:18px">С правилами проживания ознакомлен(а). Согласен(на) на обработку персональных данных.</p>
    <div class="sign"><div>Подпись гостя</div><div>Дата</div><div>Администратор</div></div>`;
}

function registration(p: PrintInput): string {
  const cards = p.reservation.items.flatMap((it) =>
    [...it.guests].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((g) => guestCard(p, g, it)),
  );
  if (cards.length === 0) {
    const stay = p.reservation.items[0];
    const blank: HotelReservationGuest = {
      id: 0,
      clientId: null,
      fullName: p.reservation.customerName,
      phone: "",
      email: "",
      isPrimary: true,
      isChild: false,
      document: null,
      documentPhotoUrl: null,
      documentPhotoBackUrl: null,
    };
    return stay ? guestCard(p, blank, stay) : "";
  }
  return cards.join('<div class="page-break"></div>');
}

export function buildHotelPrintHtml(doc: HotelPrintDoc, input: PrintInput): string {
  const body = doc === "confirmation" ? confirmation(input) : doc === "invoice" ? invoice(input) : registration(input);
  const title = `${HOTEL_PRINT_DOC_LABELS[doc]} — бронь №${input.reservation.number}`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLES}</style></head><body>${body}</body></html>`;
}

/** Печать без всплывающего окна: скрытый iframe → print() → убрать. */
export function printHotelDocument(doc: HotelPrintDoc, input: PrintInput): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const idoc = iframe.contentDocument ?? win?.document;
  if (!win || !idoc) {
    iframe.remove();
    return;
  }
  idoc.open();
  idoc.write(buildHotelPrintHtml(doc, input));
  idoc.close();
  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  win.addEventListener("afterprint", cleanup, { once: true });
  // Дать шрифтам и разметке встать, иначе первая страница иногда пустая.
  setTimeout(() => {
    win.focus();
    win.print();
    // Safari не шлёт afterprint — убираем по таймеру.
    setTimeout(() => iframe.remove(), 60_000);
  }, 250);
}
