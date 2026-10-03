import { describe, expect, it } from "vitest";

import { initialPublicHotelLang, PUBLIC_HOTEL_TEXT } from "./publicHotelText";

describe("initialPublicHotelLang", () => {
  it("?lang= в ссылке важнее языка браузера", () => {
    expect(initialPublicHotelLang("?lang=en", "ru-RU")).toBe("en");
    expect(initialPublicHotelLang("?lang=ru", "en-US")).toBe("ru");
  });

  it("без параметра: русский и кыргызский браузер — русский, остальные — английский", () => {
    expect(initialPublicHotelLang("", "ru")).toBe("ru");
    expect(initialPublicHotelLang("", "ky-KG")).toBe("ru");
    expect(initialPublicHotelLang("", "de-DE")).toBe("en");
    expect(initialPublicHotelLang("?lang=fr", undefined)).toBe("ru");
  });
});

describe("PUBLIC_HOTEL_TEXT", () => {
  it("ночи по-русски и по-английски", () => {
    expect(PUBLIC_HOTEL_TEXT.ru.nights(1)).toBe("1 ночь");
    expect(PUBLIC_HOTEL_TEXT.ru.nights(3)).toBe("3 ночи");
    expect(PUBLIC_HOTEL_TEXT.ru.nights(11)).toBe("11 ночей");
    expect(PUBLIC_HOTEL_TEXT.en.nights(1)).toBe("1 night");
    expect(PUBLIC_HOTEL_TEXT.en.nights(2)).toBe("2 nights");
  });

  it("в английском есть все ключи русского", () => {
    expect(Object.keys(PUBLIC_HOTEL_TEXT.en).sort()).toEqual(Object.keys(PUBLIC_HOTEL_TEXT.ru).sort());
  });
});
