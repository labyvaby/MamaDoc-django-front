import { describe, it, expect } from "vitest";
import dayjs from "dayjs";

import { buildListRows, type GapSlot } from "./listRows";
import type { DjangoAppointment } from "../../../api/appointments";

const DAY = "2026-09-19";

/** Локальное время дня → мс: и окна (dateIso без зоны), и «сейчас» считаем в одной шкале. */
const at = (hm: string) => dayjs(`${DAY}T${hm}`).valueOf();

/** Минимальный приём: рядам ленты нужны только id и время начала. */
const appt = (id: number, hm: string): DjangoAppointment =>
  ({
    id,
    organizationId: 1,
    branchId: null,
    patient: null,
    scheduledAt: dayjs(`${DAY}T${hm}`).toISOString(),
    endsAt: dayjs(`${DAY}T${hm}`).add(30, "minute").toISOString(),
    isNight: false,
    status: "scheduled",
    services: [],
  }) as unknown as DjangoAppointment;

const gap = (hm: string): GapSlot => ({
  isGap: true,
  id: `gap-${hm}`,
  timeStr: hm,
  dateIso: `${DAY}T${hm}`,
  employeeId: 7,
});

describe("buildListRows: линия «сейчас»", () => {
  it("встаёт над окном, если оно начинается раньше первого будущего приёма", () => {
    // Прод, 06:41: окно 09:00 стояло выше приёма 09:30, а линия рисовалась
    // между ними — под окном, хотя 09:00 ещё впереди.
    const rows = buildListRows([gap("09:00"), appt(1, "09:30"), appt(2, "10:00")], at("06:41"), false);
    expect(rows.map((r) => [r.kind, r.nowLine])).toEqual([
      ["gaps", true],
      ["appt", false],
      ["appt", false],
    ]);
  });

  it("встаёт над первым не начавшимся приёмом, прошедшие остаются выше", () => {
    const rows = buildListRows([appt(1, "09:00"), appt(2, "09:30"), gap("10:00")], at("09:10"), false);
    expect(rows.map((r) => r.nowLine)).toEqual([false, true, false]);
  });

  it("пропускает уже прошедшее окно и встаёт над следующим элементом", () => {
    // Окна строятся без учёта тикающего «сейчас»: к 09:05 окно 09:00 могло
    // остаться в ленте — линия должна быть под ним, над приёмом 09:30.
    const rows = buildListRows([gap("09:00"), appt(1, "09:30")], at("09:05"), false);
    expect(rows.map((r) => r.nowLine)).toEqual([false, true]);
  });

  it("приём ровно на текущую минуту считается ещё не начавшимся", () => {
    const rows = buildListRows([appt(1, "09:00"), appt(2, "09:30")], at("09:00"), false);
    expect(rows.map((r) => r.nowLine)).toEqual([true, false]);
  });

  it("не рисуется вне сегодняшнего дня и когда всё уже прошло", () => {
    const items = [gap("09:00"), appt(1, "09:30")];
    expect(buildListRows(items, null, false).every((r) => !r.nowLine)).toBe(true);
    expect(buildListRows(items, at("18:00"), false).every((r) => !r.nowLine)).toBe(true);
  });
});

describe("buildListRows: ряды окон", () => {
  it("на десктопе каждое окно — свой ряд", () => {
    const rows = buildListRows([gap("09:00"), gap("09:30"), appt(1, "10:00")], null, false);
    expect(rows.map((r) => r.kind)).toEqual(["gaps", "gaps", "appt"]);
  });

  it("на телефоне подряд идущие окна сливаются в один ряд", () => {
    const rows = buildListRows([gap("09:00"), gap("09:30"), appt(1, "10:00"), gap("10:30")], null, true);
    expect(rows.map((r) => (r.kind === "gaps" ? r.gaps.map((g) => g.timeStr) : r.appt.id))).toEqual([
      ["09:00", "09:30"],
      1,
      ["10:30"],
    ]);
  });

  it("на телефоне линия стоит над всем рядом окон, если первое окно ещё впереди", () => {
    const rows = buildListRows([gap("09:00"), gap("09:30"), appt(1, "10:00")], at("08:00"), true);
    expect(rows.map((r) => [r.kind, r.nowLine])).toEqual([
      ["gaps", true],
      ["appt", false],
    ]);
  });

  it("на телефоне ряд окон рвётся перед окном, над которым линия", () => {
    // Иначе линия встала бы над всем рядом — и над уже прошедшим окном 09:00.
    const rows = buildListRows([gap("09:00"), gap("09:30"), appt(1, "10:00")], at("09:10"), true);
    expect(
      rows.map((r) => [r.kind === "gaps" ? r.gaps.map((g) => g.timeStr) : r.appt.id, r.nowLine]),
    ).toEqual([
      [["09:00"], false],
      [["09:30"], true],
      [1, false],
    ]);
  });
});
