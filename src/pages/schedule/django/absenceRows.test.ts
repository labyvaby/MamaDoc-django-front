import { describe, expect, it } from "vitest";

import { absenceCountLabel, buildAbsenceIndex } from "./absenceRows";
import type { ScheduleException } from "../../../api/scheduling";

const exc = (over: Partial<ScheduleException>): ScheduleException => ({
  id: 1,
  employeeId: 7,
  employeeName: "Мамытова Г.",
  branchId: 1,
  branchName: "Центр",
  date: "2026-09-10",
  kind: "day_off",
  startTime: null,
  endTime: null,
  comment: "",
  ...over,
});

describe("buildAbsenceIndex", () => {
  it("даёт строку и подпись отсутствия по дате сетки", () => {
    const index = buildAbsenceIndex(
      [exc({}), exc({ id: 2, employeeId: 8, kind: "vacation", employeeName: "Асанова А." })],
      new Map([
        [
          "2026-09-10",
          [
            { employeeId: 7, count: 3 },
            { employeeId: 8, count: 1 },
          ],
        ],
      ]),
      ["2026-09-10"],
    );

    expect(index.employeeIds).toEqual(new Set([7, 8]));
    expect(index.cells.get("2026-09-10_7")).toMatchObject({ label: "Выходной", count: 3 });
    expect(index.cells.get("2026-09-10_8")).toMatchObject({ label: "Отпуск", count: 1 });
    expect(index.names.get(7)).toBe("Мамытова Г.");
  });

  it("берёт только даты сетки", () => {
    const index = buildAbsenceIndex(
      [exc({}), exc({ id: 3, date: "2026-09-11" })],
      new Map([
        ["2026-09-10", [{ employeeId: 7, count: 2 }]],
        ["2026-09-11", [{ employeeId: 7, count: 5 }]],
      ]),
      ["2026-09-11"],
    );

    expect(index.cells.size).toBe(1);
    expect(index.cells.get("2026-09-11_7")?.count).toBe(5);
  });

  it("показывает отсутствие даже без строки исключения под рукой", () => {
    const index = buildAbsenceIndex(
      [],
      new Map([["2026-09-10", [{ employeeId: 7, count: 2 }]]]),
      ["2026-09-10"],
    );

    expect(index.cells.get("2026-09-10_7")).toMatchObject({ label: "Отсутствие", count: 2 });
    expect(index.employeeIds.has(7)).toBe(true);
  });

  it("пустой счётчик строки не создаёт", () => {
    const index = buildAbsenceIndex(
      [exc({})],
      new Map([["2026-09-10", [{ employeeId: 7, count: 0 }]]]),
      ["2026-09-10"],
    );

    expect(index.employeeIds.size).toBe(0);
    expect(index.cells.size).toBe(0);
  });

  it("без данных о конфликтах индекс пуст", () => {
    expect(buildAbsenceIndex([exc({})], undefined, ["2026-09-10"]).cells.size).toBe(0);
  });
});

describe("absenceCountLabel", () => {
  it("склоняет число записей", () => {
    expect(absenceCountLabel(1)).toBe("1 запись");
    expect(absenceCountLabel(3)).toBe("3 записи");
    expect(absenceCountLabel(5)).toBe("5 записей");
    expect(absenceCountLabel(11)).toBe("11 записей");
    expect(absenceCountLabel(21)).toBe("21 запись");
    expect(absenceCountLabel(112)).toBe("112 записей");
  });
});
