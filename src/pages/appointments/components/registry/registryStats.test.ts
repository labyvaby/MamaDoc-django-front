import { describe, it, expect } from "vitest";
import dayjs from "dayjs";

import {
  consumedUnits,
  groupByDay,
  groupByPatient,
  isDebtBearing,
  uniquePatients,
  moneyOf,
  pulseByDay,
  pulseByMonth,
  sliceRegistry,
  summarize,
  type LinesOf,
} from "./registryStats";
import type { DjangoAppointment } from "../../../../api/appointments";

/** Минимальный приём: журналу важны строки услуг, статус и платёжные поля. */
const appt = (over: Partial<DjangoAppointment>): DjangoAppointment =>
  ({
    id: 1,
    organizationId: 1,
    branchId: null,
    branchName: null,
    patient: null,
    scheduledAt: "2026-08-07T10:00:00",
    endsAt: "2026-08-07T10:30:00",
    isNight: false,
    status: "completed",
    complaints: null,
    doctorComplaints: null,
    adminComment: null,
    services: [],
    productLines: [],
    priceOverrides: [],
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

const allLines: LinesOf = (a) => a.services.filter((sl) => sl.employee);

const DOCTOR = { id: 10, fullName: "Исаева Айсулуу" };
const NURSE = { id: 20, fullName: "Садыкова Гульмира" };

/** Совместный приём: строка врача 1000 + строка медсестры 250. */
const joint = (over: Partial<DjangoAppointment> = {}) =>
  appt({
    totalAmount: "1250.00",
    payableAmount: "1250.00",
    paidTotal: "1250.00",
    paymentStatus: "paid",
    services: [
      line({ id: 1, service: { id: 1, name: "Приём терапевта" }, employee: DOCTOR, lineTotal: "1000.00" }),
      line({ id: 2, service: { id: 2, name: "Инъекция" }, employee: NURSE, lineTotal: "250.00" }),
    ],
    ...over,
  });

describe("moneyOf", () => {
  it("считает только строки среза — журнал процедур не забирает деньги врача", () => {
    const a = joint();
    const nurseOnly: LinesOf = (x) => x.services.filter((sl) => sl.employee?.id === NURSE.id);

    expect(moneyOf(a, allLines(a)).accrued).toBe(1250);
    expect(moneyOf(a, nurseOnly(a)).accrued).toBe(250);
  });

  it("разносит скидку чека по строкам пропорционально", () => {
    const a = joint({
      discountAmount: "250.00",
      payableAmount: "1000.00",
      paidTotal: "1000.00",
      paymentStatus: "discounted",
    });
    // Скидка 20% от 1250 → строка врача даёт 800, а не 1000.
    const doctorOnly: LinesOf = (x) => x.services.filter((sl) => sl.employee?.id === DOCTOR.id);
    expect(moneyOf(a, doctorOnly(a)).accrued).toBe(800);
  });

  it("отменённый приём в деньги не идёт", () => {
    const a = joint({ status: "canceled", paymentStatus: "unpaid", paidTotal: "0.00" });
    expect(moneyOf(a, allLines(a))).toEqual({ accrued: 0, paid: 0, debt: 0 });
  });

  it("частичная оплата даёт остаток в долг", () => {
    const a = joint({ paymentStatus: "partial", paidTotal: "250.00" });
    const money = moneyOf(a, allLines(a));
    expect(money.paid).toBe(250);
    expect(money.debt).toBe(1000);
  });
});

describe("isDebtBearing", () => {
  const now = dayjs("2026-08-24T12:00:00");

  it("будущий неоплаченный визит долгом не считается", () => {
    const future = appt({
      status: "scheduled",
      paymentStatus: "unpaid",
      scheduledAt: "2026-08-30T10:00:00",
      endsAt: "2026-08-30T10:30:00",
    });
    expect(isDebtBearing(future, now)).toBe(false);
  });

  // Бэк приёмы не закрывает: на проде прошедший визит остаётся scheduled.
  it("прошедший неоплаченный визит — долг даже без статуса «завершён»", () => {
    expect(isDebtBearing(appt({ status: "scheduled", paymentStatus: "unpaid" }), now)).toBe(true);
  });

  it("состоявшийся неоплаченный визит — долг", () => {
    expect(isDebtBearing(appt({ status: "completed", paymentStatus: "unpaid" }), now)).toBe(true);
    expect(isDebtBearing(appt({ status: "arrived", paymentStatus: "unpaid" }), now)).toBe(true);
  });

  it("неявка и возврат долгом не считаются", () => {
    expect(isDebtBearing(appt({ status: "no_show", paymentStatus: "unpaid" }), now)).toBe(false);
    expect(isDebtBearing(appt({ status: "completed", paymentStatus: "refunded" }), now)).toBe(false);
  });
});

describe("summarize", () => {
  const items = [
    joint({ id: 1 }),
    joint({ id: 2, paymentStatus: "partial", paidTotal: "250.00" }),
    joint({ id: 3, status: "canceled", paymentStatus: "unpaid", paidTotal: "0.00" }),
  ];

  it("считает выручку, долг и незакрытые счета", () => {
    const summary = summarize(items, allLines);
    expect(summary.visits).toBe(3);
    expect(summary.paid).toBe(1500); // 1250 + 250
    expect(summary.debt).toBe(1000);
    expect(summary.debtors).toBe(1);
    expect(summary.closed).toBe(1);
  });

  it("средний чек считает по записям, где деньги приняли", () => {
    // 1500 принято за две записи с оплатой → 750.
    expect(summarize(items, allLines).averageCheck).toBe(750);
  });
});

describe("pulseByDay / pulseByMonth", () => {
  it("отдаёт все дни месяца, включая пустые", () => {
    const pulse = pulseByDay([joint()], allLines, dayjs("2026-08-01"));
    expect(pulse).toHaveLength(31);
    expect(pulse[6].key).toBe("2026-08-07");
    expect(pulse[6].visits).toBe(1);
    expect(pulse[0].visits).toBe(0);
  });

  it("в режиме года складывает записи по месяцам", () => {
    const pulse = pulseByMonth(
      [joint(), joint({ id: 2, scheduledAt: "2026-03-02T09:00:00" })],
      allLines,
      2026,
    );
    expect(pulse).toHaveLength(12);
    expect(pulse[2].key).toBe("2026-03");
    expect(pulse[2].visits).toBe(1);
    expect(pulse[7].visits).toBe(1);
  });
});

describe("groupByDay", () => {
  it("новые дни сверху, внутри дня — по времени", () => {
    const groups = groupByDay(
      [
        joint({ id: 1, scheduledAt: "2026-08-07T15:00:00" }),
        joint({ id: 2, scheduledAt: "2026-08-09T09:00:00" }),
        joint({ id: 3, scheduledAt: "2026-08-07T08:00:00" }),
      ],
      allLines,
    );

    expect(groups.map((g) => g.iso)).toEqual(["2026-08-09", "2026-08-07"]);
    expect(groups[1].items.map((a) => a.id)).toEqual([3, 1]);
    expect(groups[1].money.paid).toBe(2500);
  });
});

describe("groupByPatient", () => {
  const patient = { id: 7, fullName: "Кубатбекова Анеля" };
  const drip = (id: number, day: string) =>
    appt({
      id,
      patient: patient as never,
      scheduledAt: `2026-08-${day}T10:00:00`,
      endsAt: `2026-08-${day}T10:30:00`,
      totalAmount: "350.00",
      payableAmount: "350.00",
      paidTotal: "350.00",
      paymentStatus: "paid",
      services: [
        line({ id: id * 10, service: { id: 3, name: "Капельница" }, employee: NURSE, lineTotal: "350.00" }),
      ],
    });

  it("собирает повторы одной услуги в курс с диапазоном дат", () => {
    const groups = groupByPatient([drip(1, "12"), drip(2, "14"), drip(3, "16")], allLines);

    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.visits).toBe(3);
    expect(group.money.paid).toBe(1050);
    expect(group.courses).toHaveLength(1);
    expect(group.courses[0]).toMatchObject({
      serviceName: "Капельница",
      count: 3,
      firstIso: "2026-08-12",
      lastIso: "2026-08-16",
    });
  });

  it("разные услуги одного пациента — разные курсы, свежие пациенты сверху", () => {
    const other = appt({
      id: 9,
      patient: { id: 8, fullName: "Исаев Иса" } as never,
      scheduledAt: "2026-08-20T09:00:00",
      endsAt: "2026-08-20T09:15:00",
      services: [
        line({ id: 90, service: { id: 4, name: "Перевязка" }, employee: NURSE, lineTotal: "300.00" }),
      ],
    });
    const mixed = appt({
      id: 10,
      patient: patient as never,
      scheduledAt: "2026-08-13T11:00:00",
      endsAt: "2026-08-13T11:20:00",
      services: [
        line({ id: 100, service: { id: 5, name: "Забор крови" }, employee: NURSE, lineTotal: "180.00" }),
      ],
    });

    const groups = groupByPatient([drip(1, "12"), mixed, other], allLines);

    expect(groups.map((g) => g.patientId)).toEqual([8, 7]);
    expect(groups[1].courses.map((c) => c.serviceName).sort()).toEqual(["Забор крови", "Капельница"]);
  });
});

describe("consumedUnits / uniquePatients", () => {
  it("считает списанные единицы и охват пациентов", () => {
    const withConsumption = appt({
      id: 1,
      patient: { id: 3, fullName: "Иванова Мария" } as never,
      services: [
        line({
          id: 1,
          service: { id: 2, name: "Инъекция" },
          employee: NURSE,
          lineTotal: "250.00",
          consumptions: [
            { id: 1, productId: 5, name: "Шприц", unit: "шт", quantity: "2.000", autoWriteOff: true },
          ],
        }),
      ],
    });
    const second = appt({ id: 2, patient: { id: 3, fullName: "Иванова Мария" } as never });

    expect(consumedUnits([withConsumption, second], allLines)).toBe(2);
    expect(uniquePatients([withConsumption, second])).toBe(1);
  });
});

describe("sliceRegistry", () => {
  it("разрез по исполнителям берёт строки, а не чек целиком", () => {
    const slices = sliceRegistry([joint()], allLines);
    const doctor = slices.employees.find((e) => e.id === DOCTOR.id);
    const nurse = slices.employees.find((e) => e.id === NURSE.id);

    expect(doctor?.accrued).toBe(1000);
    expect(nurse?.accrued).toBe(250);
  });

  it("часы пик считают записи по дню недели и часу", () => {
    const slices = sliceRegistry([joint(), joint({ id: 2 })], allLines);
    const cell = slices.heat.find((c) => c.hour === 10);
    expect(cell?.count).toBe(2);
    expect(slices.heatMax).toBe(2);
  });

  it("складывает списанные расходники по названию", () => {
    const withConsumptions = joint({
      services: [
        line({
          id: 1,
          service: { id: 2, name: "Инъекция" },
          employee: NURSE,
          lineTotal: "250.00",
          consumptions: [
            { id: 1, productId: 5, name: "Шприц 5 мл", unit: "шт", quantity: "2.000", autoWriteOff: true },
          ],
        }),
        line({
          id: 2,
          service: { id: 2, name: "Инъекция" },
          employee: NURSE,
          lineTotal: "250.00",
          consumptions: [
            { id: 2, productId: 5, name: "Шприц 5 мл", unit: "шт", quantity: "1.000", autoWriteOff: true },
          ],
        }),
      ],
    });

    const slices = sliceRegistry([withConsumptions], allLines);
    expect(slices.consumptions).toEqual([{ name: "Шприц 5 мл", unit: "шт", quantity: 3 }]);
  });
});
