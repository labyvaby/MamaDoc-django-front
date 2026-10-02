/**
 * Excel для списков отеля: «Все брони» на ресепшене и «Касса» за день.
 * Оформление — общее (hotelXlsx.ts).
 */
import dayjs from "dayjs";

import type { HotelPayment, HotelPaymentRegisterTotal, HotelReservation } from "../api/hotel";
import {
  HOTEL_BOARD_TYPE_LABELS,
  HOTEL_BOOKING_SOURCE_LABELS,
  HOTEL_RESERVATION_STATUS_LABELS,
  HOTEL_STAY_STATUS_LABELS,
  mapStayDisplayStatus,
} from "./hotelDisplay";
import { reservationCheckIn, reservationCheckOut } from "./hotelReportData";
import { downloadXlsx } from "./hotelXlsx";

export async function exportReservationsXlsx(reservations: HotelReservation[], filterLabel: string): Promise<void> {
  const currency = reservations[0]?.currency ?? "KGS";
  const rows = reservations.map((r) => {
    const items = r.items.filter((i) => i.isActive !== false);
    const first = items[0];
    const guest = first?.guests.find((g) => g.isPrimary) ?? first?.guests[0];
    const stay = first && r.status === "confirmed" ? HOTEL_STAY_STATUS_LABELS[mapStayDisplayStatus(first.stayStatus)] : "";
    return [
      r.number,
      r.externalId,
      r.createdAt,
      HOTEL_RESERVATION_STATUS_LABELS[r.status] ?? r.status,
      stay,
      r.customerName || guest?.fullName || "",
      guest?.phone ?? "",
      items.map((i) => i.roomNumber ?? "—").join(", "),
      [...new Set(items.map((i) => i.roomTypeName))].join(", "),
      reservationCheckIn(r),
      reservationCheckOut(r),
      items.reduce((s, i) => s + (i.nightsCount ?? 0), 0),
      items.reduce((s, i) => s + i.adults, 0),
      items.reduce((s, i) => s + i.children, 0),
      [...new Set(items.map((i) => HOTEL_BOARD_TYPE_LABELS[i.boardType] ?? i.boardType))].join(", "),
      HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source,
      r.corporateName ?? "",
      Number(r.totalAmount),
      Number(r.paidAmount),
      Number(r.balanceDue),
      r.internalNote,
    ];
  });
  const sum = (i: number) => rows.reduce((s, r) => s + (Number(r[i]) || 0), 0);
  await downloadXlsx(`Брони ${dayjs().format("DD.MM.YYYY")}.xlsx`, [
    {
      name: "Брони",
      title: "Брони",
      meta: [filterLabel, `Валюта: ${currency}`],
      tables: [
        {
          columns: [
            { header: "№", kind: "int" },
            { header: "Внешний №" },
            { header: "Создана", kind: "datetime" },
            { header: "Статус" },
            { header: "Проживание" },
            { header: "Заказчик", width: 28 },
            { header: "Телефон", width: 16 },
            { header: "Номер" },
            { header: "Категория" },
            { header: "Заезд", kind: "date" },
            { header: "Выезд", kind: "date" },
            { header: "Ночей", kind: "int" },
            { header: "Взрослых", kind: "int" },
            { header: "Детей", kind: "int" },
            { header: "Питание" },
            { header: "Источник" },
            { header: "Юрлицо" },
            { header: `Сумма (${currency})`, kind: "money" },
            { header: `Оплачено (${currency})`, kind: "money" },
            { header: `Баланс (${currency})`, kind: "money" },
            { header: "Заметка", width: 30 },
          ],
          rows,
          totals: ["Итого", null, null, null, null, `${rows.length} броней`, null, null, null, null, null, sum(11), sum(12), sum(13), null, null, null, sum(17), sum(18), sum(19), null],
        },
      ],
    },
  ]);
}

export async function exportPaymentsXlsx(opts: {
  date: string;
  propertyName: string;
  accepterLabel: string;
  payments: HotelPayment[];
  totals: HotelPaymentRegisterTotal[];
}): Promise<void> {
  const { date, payments, totals } = opts;
  await downloadXlsx(`Касса ${dayjs(date).format("DD.MM.YYYY")}.xlsx`, [
    {
      name: "Касса",
      title: `Касса за ${dayjs(date).format("DD.MM.YYYY")}`,
      meta: [opts.propertyName, `Принял: ${opts.accepterLabel}`],
      tables: [
        {
          title: "Итоги по способам",
          columns: [{ header: "Способ" }, { header: "Терминал / банк" }, { header: "Валюта" }, { header: "Принято", kind: "money" }, { header: "Возвраты", kind: "money" }, { header: "Итого", kind: "money" }],
          rows: totals.map((t) => [t.methodLabel, t.cashlessMethodName ?? "", t.currency, Number(t.payments), Number(t.refunds), Number(t.net)]),
        },
        {
          title: "Операции",
          columns: [
            { header: "Время", kind: "datetime" },
            { header: "Бронь (id)", kind: "int" },
            { header: "Операция" },
            { header: "Способ" },
            { header: "Терминал / банк" },
            { header: "Сумма", kind: "money" },
            { header: "Валюта" },
            { header: "Комментарий", width: 30 },
            { header: "Принял" },
          ],
          rows: payments.map((p) => [
            p.acceptedAt,
            p.reservationId,
            p.kind === "refund" ? "Возврат" : "Оплата",
            p.methodLabel,
            p.cashlessMethodName,
            p.kind === "refund" ? -Number(p.amount) : Number(p.amount),
            p.currency,
            p.note,
            p.acceptedByName,
          ]),
        },
      ],
    },
  ]);
}
