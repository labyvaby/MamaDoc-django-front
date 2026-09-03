import { describe, it, expect } from "vitest";

import {
  buildConclusionFormDefaultsThemeConfig,
  readConclusionFormDefaults,
  resolveDefaultFormId,
  type ConclusionFormDefaultRule,
} from "./conclusionFormDefaults";

const rule = (
  branchId: number | null,
  serviceId: number | null,
  formId: number,
): ConclusionFormDefaultRule => ({ branchId, serviceId, formId });

describe("readConclusionFormDefaults", () => {
  it("читает правила и отбрасывает мусор из чужого конфига", () => {
    const themeConfig = {
      primaryColor: "#123456",
      conclusionFormDefaults: [
        { branchId: 2, serviceId: 5, formId: 10 },
        // Без полей филиала и услуги — «любой», правило осмысленно.
        { formId: 11 },
        { branchId: 2, serviceId: 5, formId: 99 }, // дубль пары
        { branchId: "2", serviceId: 5, formId: 12 }, // не число
        { branchId: 3, serviceId: 6 }, // без бланка
        "мусор",
      ],
    };

    expect(readConclusionFormDefaults(themeConfig)).toEqual([
      rule(2, 5, 10),
      rule(null, null, 11),
    ]);
  });

  it("пустой список, когда поля нет или оно не массив", () => {
    expect(readConclusionFormDefaults(null)).toEqual([]);
    expect(readConclusionFormDefaults({})).toEqual([]);
    expect(readConclusionFormDefaults({ conclusionFormDefaults: {} })).toEqual([]);
  });
});

describe("buildConclusionFormDefaultsThemeConfig", () => {
  it("патчит поверх themeConfig, не задевая тему и лендинг", () => {
    const themeConfig = { primaryColor: "#000", landing: { slogan: "..." } };
    expect(buildConclusionFormDefaultsThemeConfig(themeConfig, [rule(null, 5, 10)])).toEqual({
      primaryColor: "#000",
      landing: { slogan: "..." },
      conclusionFormDefaults: [rule(null, 5, 10)],
    });
  });

  it("пустой список убирает ключ, а не пишет пустой массив", () => {
    const themeConfig = { primaryColor: "#000", conclusionFormDefaults: [rule(null, null, 1)] };
    expect(buildConclusionFormDefaultsThemeConfig(themeConfig, [])).toEqual({
      primaryColor: "#000",
    });
  });
});

describe("resolveDefaultFormId", () => {
  const rules = [
    rule(null, null, 1), // общий на организацию
    rule(null, 5, 2), // УЗИ ОБП во всех филиалах
    rule(7, null, 3), // филиал 7, любая услуга
    rule(7, 5, 4), // филиал 7, УЗИ ОБП
  ];

  it("точное правило филиала и услуги важнее остальных", () => {
    expect(resolveDefaultFormId(rules, { branchId: 7, serviceId: 5 })).toBe(4);
  });

  it("услуга важнее филиала: протокол исследования не подменяется общим бланком филиала", () => {
    // Филиал 7 со своим общим бланком (3), но у услуги 5 есть свой протокол (2).
    expect(resolveDefaultFormId(rules, { branchId: 8, serviceId: 5 })).toBe(2);
    expect(
      resolveDefaultFormId([rule(7, null, 3), rule(null, 5, 2)], { branchId: 7, serviceId: 5 }),
    ).toBe(2);
  });

  it("услуга без своего правила получает общий бланк филиала", () => {
    expect(resolveDefaultFormId(rules, { branchId: 7, serviceId: 9 })).toBe(3);
  });

  it("в чужом филиале и по чужой услуге остаётся общий бланк организации", () => {
    expect(resolveDefaultFormId(rules, { branchId: 8, serviceId: 9 })).toBe(1);
  });

  it("заключение без услуги и филиала получает общий бланк", () => {
    expect(resolveDefaultFormId(rules, { branchId: null, serviceId: null })).toBe(1);
  });

  it("нет подходящего правила — нет и подстановки", () => {
    expect(resolveDefaultFormId([rule(7, 5, 4)], { branchId: 8, serviceId: 5 })).toBeNull();
    expect(resolveDefaultFormId([rule(null, 5, 2)], { branchId: 7, serviceId: 9 })).toBeNull();
    expect(resolveDefaultFormId([], { branchId: 7, serviceId: 5 })).toBeNull();
  });
});
