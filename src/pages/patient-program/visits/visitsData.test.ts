import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import type { AppointmentServiceLine, DjangoAppointment } from "../../../api/appointments";
import type { PatientConclusionRow } from "../../../api/medical";
import {
  buildVisits,
  conclusionsByAppointment,
  doctorOptions,
  filterVisits,
  monthShort,
  monthYearGenitive,
  railSegments,
  relativeDay,
  timelineItems,
  visitCounts,
  visitPhase,
  visitSummary,
} from "./visitsData";

const NOW = dayjs("2026-10-04T12:00:00");

const line = (overrides: Partial<AppointmentServiceLine> = {}): AppointmentServiceLine =>
  ({
    id: 1,
    service: { id: 1, name: "Осмотр педиатра", basePrice: "1200", durationMinutes: 30, imageUrl: null },
    employee: { id: 7, fullName: "Аббасова Айгерим Аббасовна", photoUrl: null, nickname: null },
    conclusionState: "not_created",
    conclusionId: null,
    ...overrides,
  }) as AppointmentServiceLine;

const appt = (
  id: number,
  scheduledAt: string,
  status: DjangoAppointment["status"] = "scheduled",
  services: AppointmentServiceLine[] = [line()],
): DjangoAppointment =>
  ({
    id,
    organizationId: 1,
    branchId: 1,
    branchName: "Центр",
    patient: null,
    scheduledAt: dayjs(scheduledAt).toISOString(),
    endsAt: dayjs(scheduledAt).add(30, "minute").toISOString(),
    isNight: false,
    status,
    services,
    productLines: [],
    totalAmount: "1200.00",
  }) as unknown as DjangoAppointment;

const conclusion = (appointmentId: number, overrides: Partial<PatientConclusionRow> = {}): PatientConclusionRow => ({
  id: appointmentId * 10,
  appointmentId,
  serviceLineId: 1,
  occurredAt: "2026-09-18T10:00:00Z",
  doctor: { id: 7, fullName: "Аббасова Айгерим Аббасовна" },
  serviceName: "Осмотр педиатра",
  diagnosisData: [],
  status: "completed",
  ...overrides,
});

describe("visitPhase", () => {
  it("отмена и неявка — отменён при любой дате", () => {
    expect(visitPhase(appt(1, "2027-01-10T10:00", "canceled"), NOW)).toBe("cancelled");
    expect(visitPhase(appt(2, "2026-01-10T10:00", "no_show"), NOW)).toBe("cancelled");
  });

  it("будущий «Ожидаем» — впереди, прошедший — был (бэк приёмы не закрывает)", () => {
    expect(visitPhase(appt(1, "2026-10-04T16:00"), NOW)).toBe("upcoming");
    expect(visitPhase(appt(2, "2026-10-04T09:00"), NOW)).toBe("past");
  });

  it("пришёл или на приёме — был, даже если время ещё впереди", () => {
    expect(visitPhase(appt(1, "2026-10-04T12:30", "arrived"), NOW)).toBe("past");
  });
});

describe("conclusionsByAppointment", () => {
  it("собирает диагнозы без повторов из живых и перенесённых записей", () => {
    const map = conclusionsByAppointment([
      conclusion(5, { diagnosisData: [{ diagnosisCode: "J06.9", title: "ОРВИ" }] }),
      conclusion(5, { id: 51, diagnosisData: [{ diagnosisCode: "J06.9", title: "ОРВИ" }, { diagnosis_code: "H66.9", title: "Отит" }] }),
      conclusion(6, { status: "draft", diagnosisData: [{ title: "" }] }),
    ]);
    expect(map.get(5)).toEqual({
      mark: "done",
      diagnoses: [
        { code: "J06.9", title: "ОРВИ" },
        { code: "H66.9", title: "Отит" },
      ],
    });
    expect(map.get(6)).toEqual({ mark: "draft", diagnoses: [] });
  });
});

describe("buildVisits", () => {
  const birthDate = "2026-06-19";

  it("от поздних к ранним, с возрастом ребёнка и диагнозами из заключений", () => {
    const visits = buildVisits([appt(1, "2026-07-01T10:00"), appt(2, "2026-09-18T16:00")], {
      birthDate,
      conclusions: [conclusion(2, { diagnosisData: [{ diagnosisCode: "J06.9", title: "ОРВИ" }] })],
      now: NOW,
    });
    expect(visits.map((visit) => visit.id)).toEqual([2, 1]);
    expect(visits[0]).toMatchObject({ age: "2 мес.", conclusion: "done", diagnoses: [{ code: "J06.9", title: "ОРВИ" }] });
    expect(visits[1]).toMatchObject({ age: "12 дн.", conclusion: "none" });
  });

  it("черновик по строке услуги, врачи и услуги без повторов", () => {
    const second = line({ id: 2, service: { id: 2, name: "Осмотр педиатра", basePrice: "0", durationMinutes: 10, imageUrl: null }, conclusionState: "draft" });
    const [visit] = buildVisits([appt(1, "2026-09-01T10:00", "scheduled", [line(), second])], { birthDate: null, now: NOW });
    expect(visit.doctors).toHaveLength(1);
    expect(visit.services).toEqual(["Осмотр педиатра"]);
    expect(visit.conclusion).toBe("draft");
    expect(visit.age).toBe("");
  });
});

describe("фильтры", () => {
  const nurse = { id: 9, fullName: "Тестова Медсестра", photoUrl: null, nickname: null };
  const visits = buildVisits(
    [
      appt(1, "2027-01-10T10:00"),
      appt(2, "2026-09-18T10:00"),
      appt(3, "2026-09-01T10:00", "canceled"),
      appt(4, "2026-08-01T10:00", "no_show", [line({ employee: nurse })]),
    ],
    { birthDate: null, now: NOW },
  );

  it("считает приёмы по фазам", () => {
    expect(visitCounts(visits)).toEqual({ all: 4, upcoming: 1, past: 1, cancelled: 2 });
  });

  it("фильтрует по фазе и врачу", () => {
    expect(filterVisits(visits, "cancelled", null).map((visit) => visit.id)).toEqual([3, 4]);
    expect(filterVisits(visits, "all", 9).map((visit) => visit.id)).toEqual([4]);
  });

  it("врачи для фильтра — частые выше", () => {
    expect(doctorOptions(visits)).toEqual([
      { id: 7, name: "Аббасова Айгерим Аббасовна", count: 3 },
      { id: 9, name: "Тестова Медсестра", count: 1 },
    ]);
  });
});

describe("timelineItems", () => {
  const kinds = (items: ReturnType<typeof timelineItems>) =>
    items.map((item) => (item.kind === "visit" ? item.visit.id : item.kind === "year" ? `${item.year}:${item.count}` : "сегодня"));

  it("ставит «сегодня» между будущими и прошедшими и не повторяет год", () => {
    const visits = buildVisits(
      [appt(1, "2027-08-05T10:00"), appt(2, "2026-12-01T10:00"), appt(3, "2026-09-18T10:00"), appt(4, "2025-12-01T10:00")],
      { birthDate: null, now: NOW },
    );
    expect(kinds(timelineItems(visits, NOW))).toEqual(["2027:1", 1, "2026:2", 2, "сегодня", 3, "2025:1", 4]);
  });

  it("заголовок текущего года встаёт перед «сегодня», если будущие — в другом году", () => {
    const visits = buildVisits([appt(1, "2027-08-05T10:00"), appt(2, "2026-09-18T10:00")], { birthDate: null, now: NOW });
    expect(kinds(timelineItems(visits, NOW))).toEqual(["2027:1", 1, "2026:1", "сегодня", 2]);
  });

  it("без пустого заголовка года, когда в текущем году приёмов нет", () => {
    const visits = buildVisits([appt(1, "2027-08-05T10:00"), appt(2, "2025-09-18T10:00")], { birthDate: null, now: NOW });
    expect(kinds(timelineItems(visits, NOW))).toEqual(["2027:1", 1, "сегодня", "2025:1", 2]);
  });

  it("без «сегодня», если все приёмы по одну сторону", () => {
    const visits = buildVisits([appt(1, "2026-09-18T10:00"), appt(2, "2026-09-01T10:00")], { birthDate: null, now: NOW });
    expect(kinds(timelineItems(visits, NOW))).toEqual(["2026:2", 1, 2]);
  });
});

describe("railSegments", () => {
  it("пунктир до «сегодня», сплошная после, края без линии", () => {
    const visits = buildVisits([appt(1, "2027-08-05T10:00"), appt(2, "2026-09-18T10:00")], { birthDate: null, now: NOW });
    const segments = railSegments(timelineItems(visits, NOW), NOW);
    // 2027 · приём 1 · 2026 · сегодня · приём 2
    expect(segments).toEqual([
      { top: "none", bottom: "dashed" },
      { top: "dashed", bottom: "dashed" },
      { top: "dashed", bottom: "dashed" },
      { top: "dashed", bottom: "solid" },
      { top: "solid", bottom: "none" },
    ]);
  });
});

describe("месяцы", () => {
  it("три буквы в колонке даты и родительный падеж для «с апреля 2025»", () => {
    expect(monthShort("2026-09-18T10:00")).toBe("сен");
    expect(monthShort("2026-06-10T10:00")).toBe("июн");
    expect(monthYearGenitive("2025-04-26T10:00")).toBe("апреля 2025");
  });
});

describe("relativeDay", () => {
  it("дни, недели, месяцы и годы по-русски", () => {
    expect(relativeDay("2026-10-04T18:00", NOW)).toBe("сегодня");
    expect(relativeDay("2026-10-05T09:00", NOW)).toBe("завтра");
    expect(relativeDay("2026-10-07T09:00", NOW)).toBe("через 3 дня");
    expect(relativeDay("2026-09-18T09:00", NOW)).toBe("2 недели назад");
    expect(relativeDay("2027-09-01T09:00", NOW)).toBe("через 11 месяцев");
    expect(relativeDay("2024-09-01T09:00", NOW)).toBe("2 года назад");
    expect(relativeDay("2025-09-01T09:00", NOW)).toBe("год назад");
  });
});

describe("visitSummary", () => {
  it("ближайший — самый ранний из будущих, итоги только по состоявшимся", () => {
    const visits = buildVisits(
      [
        appt(1, "2027-08-05T10:00"),
        appt(2, "2026-11-01T10:00"),
        appt(3, "2026-09-18T10:00"),
        appt(4, "2026-03-01T10:00"),
        appt(5, "2026-09-01T10:00", "canceled"),
        appt(6, "2026-08-01T10:00", "no_show"),
      ],
      { birthDate: null, conclusions: [conclusion(3)], now: NOW },
    );
    const summary = visitSummary(visits, NOW);
    expect(summary.next?.id).toBe(2);
    expect(summary.last?.id).toBe(3);
    expect(summary).toMatchObject({ pastCount: 2, cancelledCount: 1, noShowCount: 1, doctorsCount: 1, withConclusion: 1 });
    expect(summary.firstAt).toBe(visits.find((visit) => visit.id === 4)?.at);
    expect(summary.months).toHaveLength(12);
    expect(summary.months.at(-1)).toMatchObject({ key: "2026-10", label: "О", count: 0 });
    expect(summary.months.find((month) => month.key === "2026-09")?.count).toBe(1);
    expect(summary.months.find((month) => month.key === "2026-03")?.count).toBe(1);
  });
});
