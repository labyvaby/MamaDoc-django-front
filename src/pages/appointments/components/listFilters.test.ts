import { describe, it, expect } from "vitest";
import dayjs from "dayjs";

import {
  appointmentPriceChangeSummary,
  employeeMoneyTotals,
  firstFreeSlotInSegment,
  firstFreeSlotInSegmentFor,
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

describe("appointmentPriceChangeSummary", () => {
  it("восстанавливает итог до последней правки с учётом количества услуги", () => {
    const target = appt({
      totalAmount: "2600.00",
      services: [
        line({
          id: 17,
          quantity: 2,
          unitPrice: "800.00",
          service: { id: 3, name: "Повторный приём" },
        }),
        line({ id: 18, unitPrice: "1000.00" }),
      ],
      priceOverrides: [
        {
          id: 2,
          serviceLineId: 17,
          oldUnitPrice: "1000.00",
          newUnitPrice: "800.00",
          changedAt: "2026-09-01T10:00:00Z",
        },
      ],
    });

    expect(appointmentPriceChangeSummary(target)).toEqual({
      previousTotal: 3000,
      currentTotal: 2600,
      serviceName: "Повторный приём",
      oldUnitPrice: 1000,
      newUnitPrice: 800,
    });
  });

  it("берёт последнюю по времени правку, а удалённые строки пропускает", () => {
    const target = appt({
      totalAmount: "900.00",
      services: [line({ id: 7, unitPrice: "900.00" })],
      priceOverrides: [
        {
          id: 3,
          serviceLineId: null,
          oldUnitPrice: "500.00",
          newUnitPrice: "100.00",
          changedAt: "2026-09-01T12:00:00Z",
        },
        {
          id: 1,
          serviceLineId: 7,
          oldUnitPrice: "1000.00",
          newUnitPrice: "900.00",
          changedAt: "2026-09-01T11:00:00Z",
        },
      ],
    });

    expect(appointmentPriceChangeSummary(target)?.previousTotal).toBe(1000);
  });

  it("не ставит метку без истории изменения цены", () => {
    expect(appointmentPriceChangeSummary(appt({ priceOverrides: [] }))).toBeNull();
  });
});

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

  // Скидка вводится на чек целиком, строки услуг приходят с бэка до скидки:
  // без её учёта сумма группы врача была больше принятой кассой.
  it("режет сумму строк на скидку приёма", () => {
    const list = [
      appt({
        services: [line({ employee: { id: 20, fullName: "А" }, lineTotal: "2700.00" })],
        totalAmount: "2700.00",
        discountAmount: "1350.00",
        payableAmount: "1350.00",
        paidTotal: "1350.00",
        paymentStatus: "paid",
      }),
    ];
    expect(employeeMoneyTotals(list, 20)).toEqual({ accrued: 1350, paid: 1350 });
  });

  // Скидка на чек с товарами разносится пропорционально: услуги 2000 из
  // общего чека 2500 со скидкой 500 → на врача приходится 2000 × 0.8.
  it("разносит скидку чека с товарами пропорционально", () => {
    const list = [
      appt({
        services: [line({ employee: { id: 20, fullName: "А" }, lineTotal: "2000.00" })],
        totalAmount: "2500.00",
        discountAmount: "500.00",
        payableAmount: "2000.00",
        paidTotal: "2000.00",
        paymentStatus: "paid",
      }),
    ];
    expect(employeeMoneyTotals(list, 20)).toEqual({ accrued: 1600, paid: 1600 });
  });

  it("чек на ноль закрыт, но денег за 100% скидкой нет", () => {
    const list = [
      appt({
        services: [line({ employee: { id: 20, fullName: "А" }, lineTotal: "1600.00" })],
        totalAmount: "1600.00",
        discountAmount: "1600.00",
        payableAmount: "0.00",
        paidTotal: "0.00",
        paymentStatus: "discounted",
      }),
    ];
    expect(employeeMoneyTotals(list, 20)).toEqual({ accrued: 0, paid: 0 });
  });

  it("группа «без специалиста» считается по строкам без исполнителя", () => {
    const list = [appt({ services: [line({ employee: null, lineTotal: "300.00" })] })];
    expect(employeeMoneyTotals(list, null).accrued).toBe(300);
    expect(employeeMoneyTotals(list, 20).accrued).toBe(0);
  });
});

describe("firstFreeSlotInSegmentFor", () => {
  // Будущий день, чтобы «сейчас» не сдвигало кандидата.
  const day = dayjs("2099-08-19T00:00:00");
  const shift = { start: "09:00", end: "17:00" };
  const ms = (hhmm: string) => dayjs(`2099-08-19T${hhmm}:00`).valueOf();

  it("сдвигает окно за занятое начало смены", () => {
    // Случай с прода: график с 09:00, приём 09:00–09:30 → окно должно быть 09:30.
    const slot = firstFreeSlotInSegmentFor(day, shift, [
      { start: ms("09:00"), end: ms("09:30") },
    ]);

    expect(slot?.format("HH:mm")).toBe("09:30");
  });

  it("перешагивает подряд занятые слоты", () => {
    const slot = firstFreeSlotInSegmentFor(day, shift, [
      { start: ms("09:00"), end: ms("09:30") },
      { start: ms("09:30"), end: ms("10:00") },
      { start: ms("10:00"), end: ms("10:30") },
    ]);

    expect(slot?.format("HH:mm")).toBe("10:30");
  });

  it("возвращает null, когда смена занята целиком", () => {
    const slot = firstFreeSlotInSegmentFor(
      day,
      { start: "09:00", end: "10:00" },
      [{ start: ms("09:00"), end: ms("10:00") }],
    );

    expect(slot).toBeNull();
  });

  it("без занятости ведёт себя как обычный поиск окна", () => {
    expect(firstFreeSlotInSegmentFor(day, shift, [])?.format("HH:mm")).toBe(
      firstFreeSlotInSegment(day, shift)?.format("HH:mm"),
    );
  });
});
