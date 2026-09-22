import { describe, expect, it } from "vitest";

import {
  BAR_INITIALS_MIN_PX,
  BAR_NAME_MIN_PX,
  barFillAlpha,
  barLabelMode,
  barLabelText,
  guestInitials,
} from "./roomBookingBars";

describe("barFillAlpha", () => {
  it("статус читается по плотности заливки: заехал > подтверждена > завершена, в обеих темах", () => {
    for (const dark of [false, true]) {
      const arrived = barFillAlpha("arrived", dark);
      const confirmed = barFillAlpha("confirmed", dark);
      const completed = barFillAlpha("completed", dark);
      expect(arrived).toBeGreaterThan(confirmed);
      expect(confirmed).toBeGreaterThan(completed);
      expect(completed).toBeGreaterThan(0);
    }
  });

  it("в тёмной теме заливка плотнее, чем в светлой, при том же статусе", () => {
    expect(barFillAlpha("confirmed", true)).toBeGreaterThan(barFillAlpha("confirmed", false));
  });
});

describe("guestInitials", () => {
  it("берёт первые буквы первых двух слов", () => {
    expect(guestInitials("Асанова Дана")).toBe("АД");
    expect(guestInitials("Асанова Дана Ивановна")).toBe("АД");
  });

  it("приводит к верхнему регистру и терпит лишние пробелы", () => {
    expect(guestInitials("  иванов   иван ")).toBe("ИИ");
  });

  it("пропускает слова без букв", () => {
    expect(guestInitials("ООО «Ромашка»")).toBe("ОР");
    expect(guestInitials("- Иванов")).toBe("И");
  });

  it("одно слово — одна буква, пустая строка — пусто", () => {
    expect(guestInitials("Иванов")).toBe("И");
    expect(guestInitials("")).toBe("");
    expect(guestInitials("   ")).toBe("");
  });

  it("работает и с латиницей", () => {
    expect(guestInitials("john smith")).toBe("JS");
  });
});

describe("barLabelMode", () => {
  it("широкий бар — имя целиком, уже — инициалы, совсем узкий — одна буква", () => {
    expect(barLabelMode(300)).toBe("name");
    expect(barLabelMode(BAR_NAME_MIN_PX)).toBe("name");
    expect(barLabelMode(BAR_NAME_MIN_PX - 1)).toBe("initials");
    expect(barLabelMode(BAR_INITIALS_MIN_PX)).toBe("initials");
    expect(barLabelMode(BAR_INITIALS_MIN_PX - 1)).toBe("initial");
    expect(barLabelMode(14)).toBe("initial");
  });
});

describe("barLabelText", () => {
  it("по режиму: имя, инициалы, одна буква", () => {
    expect(barLabelText("name", "Асанова Дана", 7)).toBe("Асанова Дана");
    expect(barLabelText("initials", "Асанова Дана", 7)).toBe("АД");
    expect(barLabelText("initial", "Асанова Дана", 7)).toBe("А");
  });

  it("у брони без имени — её номер", () => {
    expect(barLabelText("name", "", 7)).toBe("Бронь №7");
    expect(barLabelText("initials", "  ", 7)).toBe("№7");
    expect(barLabelText("initial", "", 7)).toBe("№");
  });
});
