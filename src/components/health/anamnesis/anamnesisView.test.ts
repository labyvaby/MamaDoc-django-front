import { describe, expect, it } from "vitest";

import { completeness } from "./anamnesisRules";
import { DEMO_AT, demoInput, demoLifeAnamnesis } from "./anamnesisFixtures";
import { birthSummaryLine, familyChips, headerLine, illnessFacts, newbornChips, newbornNumbers } from "./anamnesisView";

describe("тексты обзора — демо-девочка (ТЗ §4.2)", () => {
  it("шапка и строка беременности", () => {
    const input = demoInput();
    expect(headerLine(completeness(input), demoLifeAnamnesis())).toBe("Заполнено 16 из 19 пунктов · последняя правка 26.04.2025, педиатр");
    expect(birthSummaryLine(input)).toBe("2-я беременность · 2-е роды · самостоятельные, в 39 нед · безводный период 6 ч");
  });

  it("новорождённая: четыре числа и метки", () => {
    const input = demoInput();
    expect(newbornNumbers(input).map((item) => item.value)).toEqual(["3250", "50", "34", "8/9"]);
    expect(newbornChips(input).map((chip) => chip.label)).toEqual([
      "Закричала сразу",
      "К груди через 1 ч",
      "Желтуха физиологическая",
      "Выписана на 3-и сутки, 3120 г",
      "Неонатальный скрининг: норма",
      "Слух: прошла оба уха",
      "Гепатит B и БЦЖ в роддоме",
    ]);
  });

  it("семья и быт, болезни и аллергии", () => {
    const input = demoInput();
    expect(familyChips(input, DEMO_AT).map((chip) => chip.label)).toEqual([
      "Семья полная",
      "Мама 32, высшее, в декрете",
      "Папа 35, ср. проф., работает",
      "Квартира, 3 комнаты",
      "Дома не курят",
      "Кошка",
    ]);
    expect(illnessFacts(input, DEMO_AT).map((fact) => `${fact.chip.label} — ${fact.text}`)).toEqual([
      "Аллергия — белок коровьего молока — сыпь, подтверждена",
      "Болела — ОРВИ × 3, острый бронхит 12.2025, железодефицитная анемия 03.2026",
      "Нет — операций, травм, переливаний крови",
      "Нет — контакта с туберкулёзом",
    ]);
    expect(illnessFacts({ ...input, sensitive: null }, DEMO_AT).map((fact) => fact.text)).not.toContain("контакта с туберкулёзом");
  });
});
