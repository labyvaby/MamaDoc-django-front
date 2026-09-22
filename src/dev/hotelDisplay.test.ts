import { describe, expect, it } from "vitest";

import { formatGuestMatchedBy, formatHotelTime } from "./hotelDisplay";

describe("formatGuestMatchedBy", () => {
  it("превращает matchedBy строки поиска в текст для «совпадение по …»", () => {
    expect(formatGuestMatchedBy(["phone"])).toBe("телефону");
    expect(formatGuestMatchedBy(["document"])).toBe("номеру документа");
    expect(formatGuestMatchedBy(["inn"])).toBe("ИНН");
    expect(formatGuestMatchedBy(["phone", "inn"])).toBe("телефону и ИНН");
  });

  it("незнакомое значение показывает как есть, а отсутствие причины — пустой строкой", () => {
    expect(formatGuestMatchedBy(["passport"])).toBe("passport");
    expect(formatGuestMatchedBy([])).toBe("");
    expect(formatGuestMatchedBy(undefined)).toBe("");
  });
});

describe("formatHotelTime", () => {
  it("обрезает секунды", () => {
    expect(formatHotelTime("14:00:00")).toBe("14:00");
  });

  it("уже HH:mm — не трогает", () => {
    expect(formatHotelTime("09:05")).toBe("09:05");
  });

  it("дополняет час до двух цифр", () => {
    expect(formatHotelTime("9:05:00")).toBe("09:05");
  });

  it("неожиданный формат — как есть", () => {
    expect(formatHotelTime("")).toBe("");
    expect(formatHotelTime("noon")).toBe("noon");
  });
});
