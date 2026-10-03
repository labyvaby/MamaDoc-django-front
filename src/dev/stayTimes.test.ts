import { describe, expect, it } from "vitest";

import { arrivalTimeOf, departureTimeOf, hhmm, stayTimeView } from "./stayTimes";

describe("stayTimeView", () => {
  it("своё время брони или правило объекта", () => {
    expect(stayTimeView("arrival", null, "14:00:00")).toEqual({ time: "14:00", own: false, note: null });
    expect(stayTimeView("departure", undefined, null)).toEqual({ time: null, own: false, note: null });
    expect(stayTimeView("arrival", "18:30", "14:00:00")).toEqual({ time: "18:30", own: true, note: null });
  });

  it("ранний заезд и поздний выезд — только в свою сторону", () => {
    expect(stayTimeView("arrival", "10:00", "14:00").note).toBe("ранний заезд");
    expect(stayTimeView("departure", "15:30:00", "12:00:00").note).toBe("поздний выезд");
    expect(stayTimeView("departure", "10:00", "12:00").note).toBeNull();
    expect(stayTimeView("arrival", "14:00", "14:00").note).toBeNull();
  });
});

describe("arrivalTimeOf / departureTimeOf", () => {
  it("время брони, иначе правило", () => {
    expect(arrivalTimeOf({ expectedArrivalTime: "09:15" }, "14:00:00")).toBe("09:15");
    expect(arrivalTimeOf({}, "14:00:00")).toBe("14:00");
    expect(departureTimeOf({ expectedDepartureTime: null }, "12:00")).toBe("12:00");
    expect(departureTimeOf({ expectedDepartureTime: "16:00" }, null)).toBe("16:00");
    expect(hhmm("")).toBeNull();
  });
});
