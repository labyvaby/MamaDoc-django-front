import { describe, expect, it } from "vitest";

import { moveConflict, planMove, shiftDate, type MoveInput } from "./bookingMove";

const base: MoveInput = {
  stayStatus: "expected",
  fromRoomId: 101,
  fromRoomTypeId: 1,
  toRoom: { id: 101, roomTypeId: 1 },
  checkIn: "2026-10-06",
  checkOut: "2026-10-08",
  newCheckIn: "2026-10-06",
  newCheckOut: "2026-10-08",
};

describe("planMove", () => {
  it("ничего не поменялось — переносить нечего", () => {
    expect(planMove(base)).toEqual([]);
  });

  it("только даты — одна правка позиции, номер остаётся", () => {
    expect(planMove({ ...base, newCheckIn: "2026-10-07", newCheckOut: "2026-10-09" })).toEqual([
      { kind: "update", checkIn: "2026-10-07", checkOut: "2026-10-09" },
    ]);
  });

  it("другой номер той же категории — только назначение", () => {
    expect(planMove({ ...base, toRoom: { id: 102, roomTypeId: 1 } })).toEqual([{ kind: "assign", roomId: 102 }]);
  });

  it("даты и номер — сначала снять старый номер, потом даты, потом новый номер", () => {
    expect(planMove({ ...base, toRoom: { id: 102, roomTypeId: 1 }, newCheckIn: "2026-10-07", newCheckOut: "2026-10-09" })).toEqual([
      { kind: "unassign" },
      { kind: "update", checkIn: "2026-10-07", checkOut: "2026-10-09" },
      { kind: "assign", roomId: 102 },
    ]);
  });

  it("другая категория — смена категории (номер снимет сервер) и назначение", () => {
    expect(planMove({ ...base, toRoom: { id: 201, roomTypeId: 2 } })).toEqual([
      { kind: "update", roomTypeId: 2 },
      { kind: "assign", roomId: 201 },
    ]);
  });

  it("бронь без номера — назначить, снимать нечего", () => {
    expect(planMove({ ...base, fromRoomId: null, toRoom: { id: 102, roomTypeId: 1 }, newCheckIn: "2026-10-07", newCheckOut: "2026-10-09" })).toEqual([
      { kind: "update", checkIn: "2026-10-07", checkOut: "2026-10-09" },
      { kind: "assign", roomId: 102 },
    ]);
  });

  it("заселённый гость — только переселение, даты нельзя", () => {
    expect(planMove({ ...base, stayStatus: "checked_in", toRoom: { id: 201, roomTypeId: 2 } })).toEqual([{ kind: "move", roomId: 201 }]);
    expect(planMove({ ...base, stayStatus: "checked_in", newCheckIn: "2026-10-07", newCheckOut: "2026-10-09" })).toMatch(/дату заезда/);
  });

  it("выехавшего не переносим", () => {
    expect(planMove({ ...base, stayStatus: "checked_out", toRoom: { id: 102, roomTypeId: 1 } })).toMatch(/выехал/);
  });
});

describe("moveConflict", () => {
  const target = { checkIn: "2026-10-07", checkOut: "2026-10-09" };

  it("своя же бронь не мешает, встык — не пересечение", () => {
    expect(moveConflict(target, [{ itemId: 5, checkIn: "2026-10-06", checkOut: "2026-10-08" }], [], 5)).toBeNull();
    expect(moveConflict(target, [{ itemId: 6, checkIn: "2026-10-09", checkOut: "2026-10-11" }], [], 5)).toBeNull();
  });

  it("чужая бронь или снятие с продажи — занято", () => {
    expect(moveConflict(target, [{ itemId: 6, checkIn: "2026-10-08", checkOut: "2026-10-10" }], [], 5)).toBe("booking");
    expect(moveConflict(target, [], [{ dateFrom: "2026-10-08", dateTo: "9999-12-31" }], 5)).toBe("block");
  });

  it("shiftDate", () => {
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDate("2026-10-06", -2)).toBe("2026-10-04");
  });
});
