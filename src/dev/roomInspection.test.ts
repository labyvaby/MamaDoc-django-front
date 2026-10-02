import { describe, expect, it } from "vitest";

import type { HotelHousekeepingTask } from "../api/hotel";
import {
  appendInspectionResult,
  buildInspectionNote,
  inspectionState,
  isCheckoutInspection,
  isInspectionFor,
  parseInspectionResult,
} from "./roomInspection";

const task = (over: Partial<HotelHousekeepingTask> = {}): HotelHousekeepingTask => ({
  id: 1,
  propertyId: 7,
  roomId: 3,
  roomNumber: "203",
  roomHousekeepingState: "clean",
  reservationItemId: null,
  kind: "inspection",
  status: "open",
  assignedToId: null,
  assignedToName: "",
  dueAt: null,
  note: buildInspectionNote(17, "Иванов Иван"),
  completedAt: null,
  createdAt: "2026-10-02T10:00:00+06:00",
  ...over,
});

describe("roomInspection", () => {
  it("узнаёт задачу проверки перед выездом и её бронь", () => {
    const t = task();
    expect(isCheckoutInspection(t)).toBe(true);
    expect(isInspectionFor(t, 17)).toBe(true);
    expect(isInspectionFor(t, 1)).toBe(false);
    expect(isInspectionFor(task({ note: buildInspectionNote(170, "") }), 17)).toBe(false);
    expect(isCheckoutInspection(task({ kind: "checkout" }))).toBe(false);
    expect(isCheckoutInspection(task({ note: "Проверить кондиционер" }))).toBe(false);
  });

  it("результат «всё в порядке» и замечания дописываются и читаются", () => {
    const at = new Date(2026, 9, 2, 11, 42);
    const ok = appendInspectionResult(task().note, true, "", "Мунара", at);
    expect(parseInspectionResult(ok)).toEqual({ ok: true, text: "", signature: "Мунара, 11:42 02.10" });
    const bad = appendInspectionResult(task().note, false, "фен — не работает\nнет полотенца", "Айзат", at);
    expect(parseInspectionResult(bad)).toEqual({ ok: false, text: "фен — не работает; нет полотенца", signature: "Айзат, 11:42 02.10" });
  });

  it("состояние по задаче", () => {
    expect(inspectionState(undefined)).toBe("none");
    expect(inspectionState(task())).toBe("requested");
    expect(inspectionState(task({ status: "in_progress" }))).toBe("checking");
    expect(inspectionState(task({ status: "in_progress", note: appendInspectionResult(task().note, true, "", "М") }))).toBe("ok");
    expect(inspectionState(task({ status: "in_progress", note: appendInspectionResult(task().note, false, "пятно", "М") }))).toBe("issues");
  });
});
