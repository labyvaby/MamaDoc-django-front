/**
 * Печатные документы брони — из карточки брони (вкладка «Документы» и меню
 * «Печать» в шапке):
 * - подтверждение бронирования — как письмо-подтверждение Exely: время
 *   бронирования, заезд «после 14:00» и выезд «до 12:00», тариф, условия
 *   отмены, цена по ночам, предоплата и остаток;
 * - счёт на оплату — в формате бухгалтерии отеля: реквизиты (если заведены),
 *   строки «Проживание с … по …» и допуслуги, итого, оплачено, к оплате;
 * - регистрационная карта — двуязычная (EN/RU), с правилами проживания и
 *   подписью гостя. Подписывается только офлайн: правила администратор
 *   объясняет лично;
 * - справка о проживании — для работодателя или визы: ФИО, гражданство, дата
 *   рождения, документ, даты, категория, цена за ночь и итог;
 * - анкета гостя — паспортные данные каждого гостя брони.
 *
 * Реквизиты (ИНН, ОКПО, р/с, БИК, банк, юр. название) берутся только из
 * объекта на сервере. Счёт и справка без них не печатаются вовсе
 * (requisitesGap): документ с пустым получателем или с реквизитами одного
 * компьютера хуже, чем никакого.
 *
 * Печать — через скрытый iframe: всплывающее окно браузер может
 * заблокировать, а печать всей страницы захватила бы меню и шахматку.
 * Документ А4, без цветов интерфейса — одинаково на любом принтере и в PDF.
 */
import dayjs from "dayjs";

import type { HotelCharge, HotelGuest, HotelPayment, HotelProperty, HotelReservation, HotelReservationGuest } from "../api/hotel";
import {
  HOTEL_BOARD_TYPE_LABELS,
  HOTEL_GENDER_LABELS,
  HOTEL_GUARANTEE_METHOD_LABELS,
  HOTEL_GUEST_TYPE_LABELS,
  HOTEL_VISIT_PURPOSE_LABELS,
} from "./hotelDisplay";
import { formatHotelDate, nightsBetween } from "./mockDemoData";
import { arrivalTimeOf, departureTimeOf } from "./stayTimes";

export type HotelPrintDoc = "confirmation" | "invoice" | "registrationCard" | "certificate" | "registration";

export const HOTEL_PRINT_DOC_LABELS: Record<HotelPrintDoc, string> = {
  confirmation: "Подтверждение бронирования",
  invoice: "Счёт на оплату",
  registrationCard: "Регистрационная карта",
  certificate: "Справка о проживании",
  registration: "Анкета гостя",
};

export const HOTEL_PRINT_DOC_HINTS: Record<HotelPrintDoc, string> = {
  confirmation: "Даты, номер, тариф, условия отмены и цена по ночам — гостю на почту или в руки",
  invoice: "Проживание и допуслуги с реквизитами отеля — для оплаты и бухгалтерии",
  registrationCard: "EN/RU, правила проживания и подпись гостя — подписывается при заселении",
  certificate: "Подтверждение проживания для работодателя, визы или командировки",
  registration: "Паспортные данные каждого гостя брони — для миграционного учёта",
};

/** Реквизиты для документов — поля объекта, которые бэк заведёт; все необязательные. */
export interface HotelRequisites {
  legalName?: string;
  legalAddress?: string;
  inn?: string;
  okpo?: string;
  taxAuthority?: string;
  bankName?: string;
  bankAccount?: string;
  bik?: string;
  /** Подписи в счёте и справке. */
  directorName?: string;
  accountantName?: string;
}

/** Без чего документ не печатается: счёт — получатель и банк, справка — юрлицо. */
const REQUIRED_REQUISITES: Partial<Record<HotelPrintDoc, { key: keyof HotelRequisites; label: string }[]>> = {
  invoice: [
    { key: "legalName", label: "юр. название" },
    { key: "inn", label: "ИНН" },
    { key: "bankName", label: "банк" },
    { key: "bankAccount", label: "расчётный счёт" },
    { key: "bik", label: "БИК" },
  ],
  certificate: [
    { key: "legalName", label: "юр. название" },
    { key: "inn", label: "ИНН" },
  ],
};

/**
 * Почему документ нельзя печатать: «server» — сервер ещё не хранит реквизиты
 * (в ответе объекта нет полей), «fields» — не заполнены перечисленные. null — можно.
 */
export type RequisitesGap = { kind: "server" } | { kind: "fields"; labels: string[] } | null;

export function requisitesGap(doc: HotelPrintDoc, property: (HotelProperty & HotelRequisites) | null): RequisitesGap {
  const required = REQUIRED_REQUISITES[doc];
  if (!required) return null;
  if (!property || !("legalName" in property)) return { kind: "server" };
  const labels = required.filter((f) => !String(property[f.key] ?? "").trim()).map((f) => f.label);
  return labels.length ? { kind: "fields", labels } : null;
}

/** Строка подписи «Должность ____ Фамилия И. О.». */
const signLine = (role: string, name: string | undefined) =>
  `<div style="display:flex;gap:16px;align-items:flex-end;margin-top:18px"><div style="min-width:110px">${esc(role)}</div><div style="flex:0 0 200px;border-bottom:1px solid #111;height:18px"></div><div>${esc(name ?? "")}</div></div>`;

export interface PrintInput {
  reservation: HotelReservation;
  payments: HotelPayment[];
  property: (HotelProperty & HotelRequisites) | null;
  /** Допуслуги в счёт (действующие начисления). */
  charges?: HotelCharge[];
  /** Логотип организации — в шапку документов. */
  logoUrl?: string | null;
  /** Кто печатает — «Администратор: Ф.И.О.». */
  adminName?: string;
  /** Профили гостей (дата рождения) — для справки о проживании. */
  guestProfiles?: Map<number, HotelGuest>;
}

export const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fullDate = (iso: string | null | undefined) => (iso ? `${formatHotelDate(iso)} ${dayjs(iso).year()} г.` : "—");
const docDate = (iso: string | null | undefined) => (iso ? dayjs(iso).format("DD.MM.YYYY") : "");
const weekday = (iso: string) => ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][dayjs(iso).day()];
const nightsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "ночь" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "ночи" : "ночей");

function moneyOf(currency: string, decimals = false) {
  const unit = currency === "KGS" || !currency ? "сом" : currency;
  return (v: string | number) =>
    `${Number(v).toLocaleString("ru-RU", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: 2 })} ${unit}`;
}
/** «10 500,00» — суммы в табличной части счёта, без единицы (она в шапке колонки). */
const amount2 = (v: string | number) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyCode = (c: string) => c || "KGS";

const STYLES = `
  @page { size: A4; margin: 14mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Inter", "Segoe UI", Arial, sans-serif; font-size: 12.5px; line-height: 1.5; color: #111; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 18px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .brand img { max-height: 54px; max-width: 120px; object-fit: contain; }
  .hotel { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
  .muted { color: #555; }
  .small { font-size: 11px; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin: 20px 0 8px; }
  .title { text-align: center; margin: 22px 0 18px; }
  .title h1 { font-size: 22px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; font-weight: 600; }
  .grid td, .grid th { border: 1px solid #222; }
  .grid th { text-transform: none; letter-spacing: 0; color: #111; text-align: center; font-size: 11.5px; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .center { text-align: center; }
  .kv td:first-child { width: 38%; color: #555; }
  .totals { width: 320px; margin-left: auto; margin-top: -1px; }
  .totals td { border: 1px solid #222; font-weight: 700; }
  .totals td:first-child { border-left: 0; border-top: 0; border-bottom: 0; text-align: right; }
  .total td { font-weight: 700; border-bottom: 0; }
  .due td { font-size: 15px; font-weight: 700; border-top: 2px solid #111; border-bottom: 0; }
  .sign { display: flex; gap: 40px; margin-top: 36px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; font-size: 11px; color: #555; }
  .rules { white-space: pre-wrap; font-size: 11px; color: #333; border: 1px solid #ddd; padding: 10px 12px; border-radius: 6px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .field { border-bottom: 1px solid #111; min-height: 22px; padding: 2px 4px; font-weight: 600; }
  .lbl { font-size: 10.5px; color: #555; margin-top: 3px; }
  .week td, .week th { border: 1px solid #ccc; text-align: center; padding: 4px; font-size: 11.5px; }
  .week .off { color: #bbb; }
  .page-break { page-break-before: always; }
  .foot { margin-top: 28px; font-size: 10.5px; color: #777; }
  .cert { font-size: 14px; line-height: 1.8; }
`;

function hotelName(p: PrintInput) {
  return p.property?.name ?? "Отель";
}

function header(p: PrintInput, title: string, sub: string): string {
  const pr = p.property;
  const contacts = [pr?.address, pr?.phone, pr?.email].filter(Boolean).map(esc).join(" · ");
  return `<div class="head">
    <div class="brand">
      ${p.logoUrl ? `<img src="${esc(p.logoUrl)}" alt="">` : ""}
      <div><div class="hotel">${esc(hotelName(p))}</div><div class="muted small">${contacts}</div></div>
    </div>
    <div style="text-align:right"><h1>${esc(title)}</h1><div class="muted">${esc(sub)}</div></div>
  </div>`;
}

const primaryGuest = (r: HotelReservation): HotelReservationGuest | undefined =>
  r.items[0]?.guests.find((g) => g.isPrimary) ?? r.items[0]?.guests[0];

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

/** Цена по ночам неделями (Пн…Вс), как «Детализация цены» в письме Exely. */
function weekGrid(it: HotelReservation["items"][number], currency: string): string {
  const nights = it.nights.length ? it.nights : [];
  if (nights.length === 0) return "";
  const byDate = new Map(nights.map((n) => [n.date, n.price]));
  const first = dayjs(nights[0].date);
  const start = first.subtract((first.day() + 6) % 7, "day");
  const last = dayjs(nights[nights.length - 1].date);
  const weeks: string[] = [];
  for (let w = start; !w.isAfter(last); w = w.add(7, "day")) {
    const cells: string[] = [];
    const prices: string[] = [];
    let sum = 0;
    for (let d = 0; d < 7; d++) {
      const day = w.add(d, "day");
      const iso = day.format("YYYY-MM-DD");
      const price = byDate.get(iso);
      cells.push(`<td class="${price ? "" : "off"}">${day.date()} ${esc(formatHotelDate(iso).split(" ")[1]?.slice(0, 3) ?? "")}</td>`);
      prices.push(`<td>${price ? esc(amount2(price).replace(/,00$/, "")) : ""}</td>`);
      if (price) sum += Number(price);
    }
    weeks.push(`<tr>${cells.join("")}<td rowspan="2" class="num"><b>${esc(moneyOf(currency)(sum))}</b></td></tr><tr>${prices.join("")}</tr>`);
  }
  return `<table class="week"><tr><th>Пн</th><th>Вт</th><th>Ср</th><th>Чт</th><th>Пт</th><th>Сб</th><th>Вс</th><th>Стоимость</th></tr>${weeks.join("")}</table>`;
}

function confirmation(p: PrintInput): string {
  const r = p.reservation;
  const money = moneyOf(r.currency);
  const pr = p.property;
  const guest = primaryGuest(r);
  const first = r.items[0];
  const nights = first ? nightsBetween(first.checkIn, first.checkOut) : 0;
  const guestsCount = r.items.reduce((s, it) => s + it.adults + it.children, 0);
  const created = dayjs(r.createdAt);
  // Своё время брони (ранний заезд / поздний выезд) или правило объекта.
  const inTime = arrivalTimeOf(r, pr?.checkInTime);
  const outTime = departureTimeOf(r, pr?.checkOutTime);
  return `${header(p, "Подтверждение бронирования", `Бронь №${r.number}`)}
    <div class="muted small">Дата и время бронирования: ${esc(fullDate(r.createdAt))}, ${esc(weekday(r.createdAt))} (${esc(created.format("HH:mm"))})</div>
    <h2>Детали бронирования</h2>
    <table class="kv">
      ${first ? `<tr><td>Заезд</td><td><b>${esc(fullDate(first.checkIn))}, ${esc(weekday(first.checkIn))}</b>${inTime ? ` ${r.expectedArrivalTime ? "в" : "после"} ${esc(inTime)}` : ""}</td></tr>` : ""}
      ${first ? `<tr><td>Выезд</td><td><b>${esc(fullDate(first.checkOut))}, ${esc(weekday(first.checkOut))}</b>${outTime ? ` до ${esc(outTime)}` : ""}</td></tr>` : ""}
      <tr><td>Ночей · гостей · номеров</td><td>${nights} · ${guestsCount} · ${r.items.length}</td></tr>
      <tr><td>Заказчик</td><td><b>${esc(r.customerName || guest?.fullName || "—")}</b>${guest?.phone ? `, ${esc(guest.phone)}` : ""}</td></tr>
      ${first?.ratePlanName ? `<tr><td>Тариф</td><td>${esc(first.ratePlanName)}</td></tr>` : ""}
      ${r.guaranteeMethod ? `<tr><td>Гарантия</td><td>${esc(HOTEL_GUARANTEE_METHOD_LABELS[r.guaranteeMethod] ?? r.guaranteeMethod)}</td></tr>` : ""}
      ${r.cancellationPolicy ? `<tr><td>Условия отмены</td><td>${esc(r.cancellationPolicy)}</td></tr>` : ""}
    </table>
    <h2>Проживание</h2>
    <table><tr><th>Номер</th><th>Даты</th><th class="num">Ночей</th><th>Гости</th><th>Питание</th></tr>${stayRows(p)}</table>
    ${r.items
      .map((it, i) => {
        const grid = weekGrid(it, r.currency);
        return grid ? `<h2>Детализация цены${r.items.length > 1 ? ` · номер ${i + 1}` : ""}</h2>${grid}` : "";
      })
      .join("")}
    <h2>Стоимость</h2>
    <table class="kv">
      <tr><td>Общая стоимость</td><td class="num">${money(r.totalAmount)}</td></tr>
      ${r.corporateName && Number(r.corporateDiscountPercent ?? 0) > 0 ? `<tr><td>Скидка ${esc(r.corporateName)}</td><td class="num">−${esc(Number(r.corporateDiscountPercent))}% на проживание</td></tr>` : ""}
      <tr><td>Внесена предоплата</td><td class="num">${money(r.paidAmount)}</td></tr>
      <tr class="due"><td>К оплате гостем</td><td class="num">${money(r.balanceDue)}</td></tr>
    </table>
    ${r.guestComment ? `<h2>Пожелания гостя</h2><div>${esc(r.guestComment)}</div>` : ""}
    ${pr?.houseRules ? `<h2>Правила проживания</h2><div class="rules">${esc(pr.houseRules)}</div>` : ""}
    <div class="foot">${esc(hotelName(p))}${pr?.address ? `, ${esc(pr.address)}` : ""}. Документ сформирован ${esc(dayjs().format("DD.MM.YYYY HH:mm"))}. Ждём вас!</div>`;
}

/** Таблица реквизитов, как в счёте бухгалтерии отеля; строки без данных не печатаются. */
function requisitesBlock(p: PrintInput): string {
  const q = p.property ?? ({} as HotelRequisites);
  const any = q.inn || q.okpo || q.bankAccount || q.bik || q.bankName || q.legalName;
  if (!any) return "";
  return `<table class="grid" style="margin-bottom:18px">
    <tr><td style="width:34%">ИНН ${esc(q.inn ?? "")}</td><td style="width:26%">ОКПО ${esc(q.okpo ?? "")}</td><td style="width:12%">р/с №</td><td>${esc(q.bankAccount ?? "")}</td></tr>
    ${q.taxAuthority ? `<tr><td colspan="2">ГНИ (УГНС) ${esc(q.taxAuthority)}</td><td></td><td></td></tr>` : ""}
    <tr><td colspan="2"><span class="small muted">Получатель</span><br>${esc(q.legalName ?? hotelName(p))}</td><td>БИК</td><td>${esc(q.bik ?? "")}</td></tr>
    ${q.bankName ? `<tr><td colspan="2"><span class="small muted">Банк получателя</span><br>${esc(q.bankName)}</td><td></td><td></td></tr>` : ""}
    ${q.legalAddress ? `<tr><td colspan="4"><span class="small muted">Юридический адрес</span><br>${esc(q.legalAddress)}</td></tr>` : ""}
  </table>`;
}

function invoice(p: PrintInput): string {
  const r = p.reservation;
  const cur = currencyCode(r.currency);
  const guest = primaryGuest(r);
  const lines: { name: string; unit: string; qty: string; price: number; total: number }[] = [];
  for (const it of r.items) {
    const n = Math.max(1, nightsBetween(it.checkIn, it.checkOut));
    const total = it.nights.length ? it.nights.reduce((s, x) => s + Number(x.price), 0) : Number(it.totalAmount);
    const guests = it.guests.map((g) => g.fullName).filter(Boolean).join(", ") || r.customerName;
    lines.push({
      name: `Проживание с ${formatHotelDate(it.checkIn)} ${dayjs(it.checkIn).year()} г. по ${formatHotelDate(it.checkOut)} ${dayjs(it.checkOut).year()} г.${it.roomNumber ? ` «${it.roomNumber}».` : ""} ${it.roomTypeName}.${guests ? ` Гость: ${guests}` : ""}`,
      unit: "сут.",
      qty: String(n),
      price: total / n,
      total,
    });
  }
  for (const c of (p.charges ?? []).filter((x) => !x.voidedAt)) {
    lines.push({
      name: `${c.name}${c.comment ? ` (${c.comment})` : ""}`,
      unit: "усл.",
      qty: Number(c.quantity).toLocaleString("ru-RU", { maximumFractionDigits: 3 }),
      price: Number(c.price),
      total: Number(c.totalAmount),
    });
  }
  const linesTotal = lines.reduce((s, l) => s + l.total, 0);
  const discount = Math.max(0, linesTotal - Number(r.totalAmount));
  const rows = lines
    .map(
      (l, i) => `<tr>
        <td class="center">${i + 1}</td><td>${esc(l.name)}</td><td class="center">${esc(l.unit)}</td>
        <td class="center">${esc(l.qty)}</td><td class="num">${esc(amount2(l.price))}</td><td class="num">${esc(amount2(l.total))}</td>
      </tr>`,
    )
    .join("");
  return `${header(p, "", "")}
    ${requisitesBlock(p)}
    <div class="title"><h1>Счёт № ${r.number}-01</h1><h1>от ${esc(fullDate(dayjs().format("YYYY-MM-DD")))}</h1></div>
    <table class="kv" style="width:auto;margin-bottom:12px">
      <tr><td style="width:auto;padding-right:24px"><b>ФИО:</b></td><td>${esc(r.customerName || guest?.fullName || "—")}</td></tr>
      ${r.corporateName ? `<tr><td><b>Плательщик:</b></td><td>${esc(r.corporateName)}</td></tr>` : ""}
      ${r.companyInfo ? `<tr><td><b>Реквизиты:</b></td><td style="white-space:pre-wrap">${esc(r.companyInfo)}</td></tr>` : ""}
      <tr><td><b>Бронь:</b></td><td>№${r.number}</td></tr>
    </table>
    <table class="grid">
      <tr><th style="width:36px">№</th><th>Наименование товара (работы, услуги)</th><th style="width:70px">Единица измерения</th><th style="width:70px">Количество</th><th style="width:96px">Цена, ${esc(cur)}</th><th style="width:100px">Сумма, ${esc(cur)}</th></tr>
      ${rows}
    </table>
    <table class="totals">
      <tr><td>Итого:</td><td class="num">${esc(amount2(linesTotal))}</td></tr>
      ${discount > 0.009 ? `<tr><td>Скидка${r.corporateName ? ` (${esc(r.corporateName)})` : ""}:</td><td class="num">−${esc(amount2(discount))}</td></tr>` : ""}
      <tr><td>Без налога (НДС)</td><td class="num">-</td></tr>
      <tr><td>Стоимость:</td><td class="num">${esc(amount2(r.totalAmount))}</td></tr>
      <tr><td>Оплачено:</td><td class="num">${esc(amount2(r.paidAmount))}</td></tr>
      <tr><td>Итого к оплате:</td><td class="num">${esc(amount2(r.balanceDue))}</td></tr>
    </table>
    <div style="display:flex;gap:40px;margin-top:40px;align-items:flex-end">
      <div>Администратор${p.adminName ? ` <span class="muted">${esc(p.adminName)}</span>` : ""}</div>
      <div style="flex:0 0 260px;border-bottom:1px solid #111;height:18px"></div>
    </div>
    ${p.property?.directorName ? signLine("Руководитель", p.property.directorName) : ""}
    ${p.property?.accountantName ? signLine("Бухгалтер", p.property.accountantName) : ""}`;
}

const RULES_EN = `Attention: on the territory of the hotel the Guest is fully responsible for their money, jewelry and valuables. The hotel accepts no responsibility for the loss of the Guest's personal belongings. The Guest reimburses losses for material damage caused by their fault.

I am personally responsible for all expenses incurred during my stay and will pay any fines I incur.

The hotel guarantees not to disclose information to third parties and affiliated companies.

Smoking inside the hotel is strictly prohibited.

By signing this document, I confirm that I have read the rules and fully understand and accept all of the above conditions.`;

const RULES_RU = `Внимание: на территории отеля Гость несёт полную ответственность за свои деньги, драгоценности и ценные вещи. Отель не берёт на себя ответственность за возможную потерю личных вещей Гостя. Гость обязан возместить убытки за материальный ущерб, причинённый по его вине.

Я лично несу ответственность за все понесённые мной расходы и выплачу все штрафы, понесённые мной.

Отель гарантирует не раскрывать информацию третьим лицам и аффилированным компаниям.

Курение внутри отеля строго запрещено.

Подписывая этот документ, я подтверждаю, что ознакомлен(а) с правилами и полностью понимаю и принимаю все вышеизложенные условия.`;

function registrationCardFor(p: PrintInput, it: HotelReservation["items"][number]): string {
  const r = p.reservation;
  const pr = p.property;
  const g = it.guests.find((x) => x.isPrimary) ?? it.guests[0];
  const money = moneyOf(r.currency);
  const inTime = arrivalTimeOf(r, pr?.checkInTime) || "14:00";
  const outTime = departureTimeOf(r, pr?.checkOutTime) || "12:00";
  const field = (value: string, label: string, style = "") =>
    `<div style="${style}"><div class="field">${value ? esc(value) : "&nbsp;"}</div><div class="lbl">${label}</div></div>`;
  return `<div class="head" style="align-items:center">
      <div class="brand">${p.logoUrl ? `<img src="${esc(p.logoUrl)}" alt="">` : ""}<div class="hotel">${esc(hotelName(p))}</div></div>
      <div style="text-align:right"><h1>REGISTRATION CARD</h1><div style="font-weight:700">РЕГИСТРАЦИОННАЯ КАРТА</div><div class="muted small">№ ${r.number}</div></div>
    </div>
    <div class="two">
      ${field(`${docDate(it.checkIn)} (${inTime})`, "Arrival date / Дата заезда")}
      ${field(`${docDate(it.checkOut)} (${outTime})`, "Departure date / Дата выезда")}
    </div>
    <div class="two" style="margin-top:12px">
      ${field(it.roomNumber ?? "", "Room number / Номер комнаты")}
      ${field(g?.phone ?? "", "Telephone / Телефон")}
    </div>
    <div style="margin-top:12px">${field(g?.fullName || r.customerName, "Name / Ф.И.О.")}</div>
    <div class="two" style="margin-top:12px">
      ${field(`${it.adults}${it.children ? ` + ${it.children}` : ""}`, "Guests / Гостей (взрослых + детей)")}
      ${field(`${money(r.paidAmount)} / ${money(r.totalAmount)}`, "Paid amount / Оплаченная сумма")}
    </div>
    <div class="two" style="margin-top:12px">
      <div class="small"><b>Check in time / Время заезда:</b> ${esc(inTime)}</div>
      <div class="small"><b>Check out time / Время выезда:</b> ${esc(outTime)}</div>
    </div>
    <div class="two" style="margin-top:18px">
      <div class="rules">${esc(RULES_EN)}</div>
      <div class="rules">${esc(RULES_RU)}</div>
    </div>
    ${pr?.houseRules?.trim() ? `<h2>Правила проживания отеля / Hotel rules</h2><div class="rules">${esc(pr.houseRules.trim())}</div>` : ""}
    <div class="sign" style="margin-top:48px"><div>Guest signature / Подпись гостя</div><div>Date / Дата</div><div>Administrator / Администратор</div></div>`;
}

function registrationCard(p: PrintInput): string {
  return p.reservation.items.map((it) => registrationCardFor(p, it)).join('<div class="page-break"></div>');
}

/** Справка о проживании — на каждого взрослого гостя брони (или на заказчика). */
function certificateFor(p: PrintInput, it: HotelReservation["items"][number], g: HotelReservationGuest | undefined): string {
  const r = p.reservation;
  const pr = p.property;
  const money = moneyOf(r.currency);
  const d = g?.document ?? {};
  const profile = g?.clientId != null ? p.guestProfiles?.get(g.clientId) : undefined;
  const name = g?.fullName || r.customerName;
  const gender = d.gender || profile?.gender;
  const citizen = gender === "female" ? "Гражданка" : gender === "male" ? "Гражданин" : "Гражданин(ка)";
  const citizenship = d.guestType === "foreign" ? d.citizenship || profile?.citizenship : d.guestType === "resident" ? "Кыргызская Республика" : d.citizenship || profile?.citizenship;
  const dob = profile?.dob ? `${docDate(profile.dob)} года рождения` : "";
  const docKind = d.documentType === "id_card" ? "ID-карта" : "паспорт";
  const docNumber = d.documentNumber || profile?.documentNumber;
  const nights = Math.max(1, nightsBetween(it.checkIn, it.checkOut));
  const stayTotal = it.nights.length ? it.nights.reduce((s, x) => s + Number(x.price), 0) : Number(it.totalAmount);
  const perNight = stayTotal / nights;
  const today = dayjs().format("YYYY-MM-DD");
  const verb = it.stayStatus === "checked_out" || it.checkOut <= today ? "проживал(а)" : "действительно проживает";
  const q = pr ?? ({} as HotelRequisites);
  const reqLine = [q.inn ? `ИНН: ${q.inn}` : "", q.okpo ? `ОКПО: ${q.okpo}` : ""].filter(Boolean).join("   ");
  const parts = [
    `${citizen} ${esc(name)}`,
    citizenship ? `гражданство — ${esc(citizenship)}` : "",
    dob ? esc(dob) : "",
    docNumber ? `${docKind} ${esc(docNumber)}` : "",
  ].filter(Boolean);
  return `<div style="text-align:center;margin-bottom:22px">
      ${p.logoUrl ? `<img src="${esc(p.logoUrl)}" alt="" style="max-height:60px;max-width:140px;object-fit:contain"><br>` : ""}
      <div class="hotel">Отель «${esc(hotelName(p))}»</div>
      ${q.legalName ? `<div>${esc(q.legalName)}</div>` : ""}
      ${q.legalAddress ? `<div class="small">${esc(q.legalAddress)}</div>` : ""}
      ${reqLine ? `<div class="small">${esc(reqLine)}</div>` : ""}
      <div class="small muted">${[pr?.email ? `e-mail: ${pr.email}` : "", pr?.address, pr?.phone ? `тел.: ${pr.phone}` : ""].filter(Boolean).map(esc).join(" · ")}</div>
    </div>
    <div class="title"><h1>Справка</h1><div class="muted">№ ${r.number} от ${esc(docDate(today))}</div></div>
    <div class="cert">
      <p>Отель «${esc(hotelName(p))}»${q.legalName ? ` (${esc(q.legalName)})` : ""} подтверждает, что:</p>
      <p>${parts.join(", ")},</p>
      <p>${verb} в отеле с <b>${esc(docDate(it.checkIn))}</b> по <b>${esc(docDate(it.checkOut))}</b> в номере категории «${esc(it.roomTypeName)}».</p>
      <p>Стоимость номера составляет ${esc(money(Math.round(perNight * 100) / 100))} за ночь. Общая стоимость проживания составляет ${esc(money(stayTotal))}.</p>
    </div>
    <div style="display:flex;gap:24px;margin-top:56px;align-items:flex-end">
      <div>Администратор ${esc(hotelName(p))}<br><b>${esc(p.adminName ?? "")}</b></div>
      <div style="flex:0 0 200px;border-bottom:1px solid #111;height:18px"></div>
      <div class="muted">/ м.п.</div>
    </div>
    ${q.directorName ? signLine("Руководитель", q.directorName) : ""}`;
}

function certificate(p: PrintInput): string {
  const pages: string[] = [];
  for (const it of p.reservation.items) {
    const adults = it.guests.filter((g) => !g.isChild);
    if (adults.length === 0) pages.push(certificateFor(p, it, undefined));
    else for (const g of adults) pages.push(certificateFor(p, it, g));
  }
  return pages.join('<div class="page-break"></div>');
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
    <p class="small" style="margin-top:18px">Согласен(на) на обработку персональных данных.</p>
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
  const body =
    doc === "confirmation"
      ? confirmation(input)
      : doc === "invoice"
        ? invoice(input)
        : doc === "registrationCard"
          ? registrationCard(input)
          : doc === "certificate"
            ? certificate(input)
            : registration(input);
  const title = `${HOTEL_PRINT_DOC_LABELS[doc]} — бронь №${input.reservation.number}`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLES}</style></head><body>${body}</body></html>`;
}

/** Печать без всплывающего окна: скрытый iframe → print() → убрать. */
export function printHotelDocument(doc: HotelPrintDoc, input: PrintInput): void {
  printHtmlDocument(buildHotelPrintHtml(doc, input));
}

/** Любой готовый HTML-документ (отчёт смены и т.п.) — тем же скрытым iframe. */
export function printHtmlDocument(html: string): void {
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
  idoc.write(html);
  idoc.close();
  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  win.addEventListener("afterprint", cleanup, { once: true });
  // Дать шрифтам, логотипу и разметке встать, иначе первая страница иногда пустая.
  setTimeout(() => {
    win.focus();
    win.print();
    // Safari не шлёт afterprint — убираем по таймеру.
    setTimeout(() => iframe.remove(), 60_000);
  }, 400);
}
