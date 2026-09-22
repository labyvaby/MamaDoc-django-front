import { describe, expect, it } from "vitest";

import { formatGuestMatchedBy } from "./hotelDisplay";

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
