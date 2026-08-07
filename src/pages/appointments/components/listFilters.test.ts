import { describe, it, expect } from "vitest";
import dayjs from "dayjs";

import {
  employeeMoneyTotals,
  firstFreeSlotInSegment,
  matchesAppointmentSearch,
} from "./listFilters";
import type { DjangoAppointment } from "../../../api/appointments";

/**
 * Минимальный приём: тестам важны только строки услуг и платёжные поля,
 * остальное добивается пустышками (сигнатура DjangoAppointment широкая).
 */
const appt = (over: Partial<DjangoAppointment>): DjangoAppointment =>
  ({
    id: 1,
    organizationId: 1,
    branchId: null,
    patient: null,
    scheduledAt: "2026-08-07T10:00:00Z",
    endsAt: "2026-08-07T10:30:00Z",
    isNight: false,
    status: "scheduled",
    complaints: null,
    doctorComplaints: null,
    adminComment: null,
    services: [],
    productLines: [],
    totalAmount: "0.00",
    createdAt: "",
    updatedAt: "",
    consumptionWarnings: [],
    ...over,
  }) as DjangoAppointment;

const line = (over: Record<string, unknown>) =>
  ({
    id: 1,
    service: null,
    employee: null,
    price: "",
    durationMinutes: 30,
    quantity: 1,
    unitPrice: "0.00",
    discountAmount: "0.00",
    consumptions: [],
    ...over,
  }) as DjangoAppointment["services"][number];

describe("matchesAppointmentSearch", () => {
  const target = appt({
    patient: { id: 1, fullName: "Медетбеков Марсель", phone: "+996500009100" } as never,
    services: [
      line({
        service: { id: 19, name: "Первичный приём" },
        employee: { id: 20, fullName: "Исаева Айсулуу" },
      }),
    ],
  });

  it("находит по части ФИО пациента без учёта регистра", () => {
    expect(matchesAppointmentSearch(target, "медетб")).toBe(true);
  });

  it("находит по услуге и по исполнителю", () => {
    expect(matchesAppointmentSearch(target, "первичный")).toBe(true);
    expect(matchesAppointmentSearch(target, "исаева")).toBe(true);
  });

  // Регистратор набирает номер так, как слышит; в базе он лежит с кодом страны.
  it("находит по телефону, записанному в другом формате", () => {
    expect(matchesAppointmentSearch(target, "500 009 100")).toBe(true);
    expect(matchesAppointmentSearch(target, "9100")).toBe(true);
  });

  it("не считает совпадением чужой номер и пустой запрос пропускает всех", () => {
    expect(matchesAppointmentSearch(target, "777123456")).toBe(false);
    expect(matchesAppointmentSearch(target, "   ")).toBe(true);
  });
});

describe("firstFreeSlotInSegment", () => {
  const day = dayjs("2026-08-07");
  const shift = { start: "10:00", end: "16:30" };

  it("до начала смены предлагает её начало", () => {
    const slot = firstFreeSlotInSegment(day, shift, dayjs("2026-08-07T08:15"));
    expect(slot?.format("HH:mm")).toBe("10:00");
  });

  // Предлагать 14:07 бессмысленно — регистратор мыслит сеткой получасов.
  it("посреди смены округляет текущее время вверх до получаса", () => {
    expect(firstFreeSlotInSegment(day, shift, dayjs("2026-08-07T14:07"))?.format("HH:mm")).toBe("14:30");
    expect(firstFreeSlotInSegment(day, shift, dayjs("2026-08-07T14:30"))?.format("HH:mm")).toBe("14:30");
    expect(firstFreeSlotInSegment(day, shift, dayjs("2026-08-07T14:31"))?.format("HH:mm")).toBe("15:00");
  });

  it("не предлагает окно, когда смена уже кончилась", () => {
    expect(firstFreeSlotInSegment(day, shift, dayjs("2026-08-07T16:30"))).toBeNull();
    expect(firstFreeSlotInSegment(day, shift, dayjs("2026-08-07T18:00"))).toBeNull();
  });

  // Прошедший день: записать туда нельзя, группа свободной смены не появится.
  it("для прошедшей даты окна нет", () => {
    expect(firstFreeSlotInSegment(dayjs("2026-08-01"), shift, dayjs("2026-08-07T09:00"))).toBeNull();
  });

  it("для будущей даты берёт начало смены независимо от времени суток", () => {
    const slot = firstFreeSlotInSegment(dayjs("2026-08-20"), shift, dayjs("2026-08-07T23:50"));
    expect(slot?.format("YYYY-MM-DD HH:mm")).toBe("2026-08-20 10:00");
  });

  it("отбрасывает некорректный отрезок", () => {
    expect(firstFreeSlotInSegment(day, { start: "16:00", end: "16:00" }, dayjs("2026-08-07T09:00"))).toBeNull();
    expect(firstFreeSlotInSegment(day, { start: "оk", end: "16:00" }, dayjs("2026-08-07T09:00"))).toBeNull();
  });
});

describe("employeeMoneyTotals", () => {
  it("считает по lineTotal бэка (поля price в живом ответе нет)", () => {
    const list = [
      appt({
        services: [line({ employee: { id: 20, fullName: "А" }, lineTotal: "1600.00" })],
        payableAmount: "1600.00",
        paidTotal: "0.00",
      }),
    ];
    expect(employeeMoneyTotals(list, 20)).toEqual({ accrued: 1600, paid: 0 });
  });

  it("падает на unitPrice × quantity − скидка, когда lineTotal не пришёл", () => {
    const list = [
      appt({
        services: [
          line({ employee: { id: 20, fullName: "А" }, unitPrice: "500.00", quantity: 3, discountAmount: "200.00" }),
        ],
        payableAmount: "1300.00",
        paidTotal: "1300.00",
      }),
    ];
    expect(employeeMoneyTotals(list, 20)).toEqual({ accrued: 1300, paid: 1300 });
  });

  // Ради этого расчёт и идёт по строкам: чек совместного приёма иначе попал бы
  // в обе группы целиком, и день «заработал» бы вдвое больше.
  it("делит совместный приём между исполнителями, а не дублирует чек", () => {
    const list = [
      appt({
        services: [
          line({ employee: { id: 20, fullName: "Врач" }, lineTotal: "1600.00" }),
          line({ id: 2, employee: { id: 31, fullName: "Медсестра" }, lineTotal: "400.00" }),
        ],
        payableAmount: "2000.00",
        paidTotal: "2000.00",
      }),
    ];
    expect(employeeMoneyTotals(list, 20).accrued).toBe(1600);
    expect(employeeMoneyTotals(list, 31).accrued).toBe(400);
  });

  it("разносит частичную оплату пропорционально суммам строк", () => {
    const list = [
      appt({
        services: [line({ employee: { id: 20, fullName: "А" }, lineTotal: "1000.00" })],
        payableAmount: "1000.00",
        paidTotal: "250.00",
        paymentStatus: "partial",
      }),
    ];
    expect(employeeMoneyTotals(list, 20)).toEqual({ accrued: 1000, paid: 250 });
  });

  it("не считает деньги за отменёнными приёмами и неявками", () => {
    const list = [
      appt({
        status: "canceled",
        services: [line({ employee: { id: 20, fullName: "А" }, lineTotal: "1600.00" })],
      }),
      appt({
        status: "no_show",
        services: [line({ employee: { id: 20, fullName: "А" }, lineTotal: "1600.00" })],
      }),
    ];
    expect(employeeMoneyTotals(list, 20)).toEqual({ accrued: 0, paid: 0 });
  });

  it("считает чек на ноль закрытым: скидка 100% — это не «не оплачено»", () => {
    const list = [
      appt({
        services: [line({ employee: { id: 20, fullName: "А" }, lineTotal: "1600.00" })],
        payableAmount: "0.00",
        paidTotal: "0.00",
        paymentStatus: "discounted",
      }),
    ];
    expect(employeeMoneyTotals(list, 20)).toEqual({ accrued: 1600, paid: 1600 });
  });

  it("группа «без специалиста» считается по строкам без исполнителя", () => {
    const list = [appt({ services: [line({ employee: null, lineTotal: "300.00" })] })];
    expect(employeeMoneyTotals(list, null).accrued).toBe(300);
    expect(employeeMoneyTotals(list, 20).accrued).toBe(0);
  });
});
