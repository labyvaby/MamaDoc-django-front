import { describe, expect, it } from "vitest";

import { declineTerm } from "./declension";
import { getGlossary, resolveGlossary } from "./glossary";
import {
  buildGlossaryThemeConfig,
  changedTermKeys,
  isValidTermForms,
  readGlossaryOverrides,
  sanitizeGlossaryOverrides,
} from "./glossaryOverrides";
import type { TermForms } from "./types";

const clinic = getGlossary("clinic");

const pet = (): TermForms =>
  declineTerm("питомец", { gender: "m", animate: true }).forms;

describe("sanitizeGlossaryOverrides", () => {
  it("принимает термин со всеми формами", () => {
    const result = sanitizeGlossaryOverrides({ patient: pet() });
    expect(result.patient?.nom).toBe("питомец");
  });

  it("отбрасывает неизвестные ключи", () => {
    const result = sanitizeGlossaryOverrides({ unknownTerm: pet() });
    expect(result).toEqual({});
  });

  it("отбрасывает термин с пропущенной формой", () => {
    const broken = { ...pet(), genPl: "" };
    expect(sanitizeGlossaryOverrides({ patient: broken })).toEqual({});
  });

  it("отбрасывает термин с неизвестным родом", () => {
    const broken = { ...pet(), gender: "x" };
    expect(isValidTermForms(broken)).toBe(false);
  });

  it("переживает мусор вместо объекта", () => {
    expect(sanitizeGlossaryOverrides(null)).toEqual({});
    expect(sanitizeGlossaryOverrides("строка")).toEqual({});
    expect(sanitizeGlossaryOverrides({ patient: 42 })).toEqual({});
  });

  it("обрезает пробелы в формах", () => {
    const padded = { ...pet(), nom: "  питомец  " };
    expect(sanitizeGlossaryOverrides({ patient: padded }).patient?.nom).toBe(
      "питомец",
    );
  });
});

describe("readGlossaryOverrides", () => {
  it("читает терминологию из themeConfig", () => {
    const themeConfig = { primaryColor: "#123456", glossary: { patient: pet() } };
    expect(readGlossaryOverrides(themeConfig).patient?.gen).toBe("питомца");
  });

  it("пустой themeConfig даёт пустые оверрайды", () => {
    expect(readGlossaryOverrides(null)).toEqual({});
    expect(readGlossaryOverrides({ primaryColor: "#000" })).toEqual({});
  });
});

describe("resolveGlossary", () => {
  it("подменяет только переопределённые термины", () => {
    const glossary = resolveGlossary("clinic", { patient: pet() });
    expect(glossary.patient.nom).toBe("питомец");
    expect(glossary.visit.nom).toBe(clinic.visit.nom);
  });

  it("без оверрайдов возвращает профиль как есть", () => {
    expect(resolveGlossary("clinic", {})).toEqual(clinic);
    expect(resolveGlossary("clinic", null)).toEqual(clinic);
  });
});

describe("changedTermKeys", () => {
  it("считает изменённым только отличающийся термин", () => {
    expect(changedTermKeys(clinic, { patient: pet() })).toEqual(["patient"]);
  });

  it("совпадающий с профилем термин изменённым не считается", () => {
    expect(changedTermKeys(clinic, { patient: clinic.patient })).toEqual([]);
  });
});

describe("buildGlossaryThemeConfig", () => {
  it("сохраняет остальные настройки темы", () => {
    const themeConfig = {
      primaryColor: "#123456",
      landing: { tagline: "Слоган" },
    };
    const next = buildGlossaryThemeConfig(themeConfig, { patient: pet() });
    expect(next.primaryColor).toBe("#123456");
    expect(next.landing).toEqual({ tagline: "Слоган" });
    expect(next.glossary).toBeTruthy();
  });

  it("сброс всех терминов удаляет ключ, не трогая тему", () => {
    const themeConfig = { primaryColor: "#123456", glossary: { patient: pet() } };
    const next = buildGlossaryThemeConfig(themeConfig, {});
    expect(next).toEqual({ primaryColor: "#123456" });
  });

  it("работает с пустым themeConfig", () => {
    expect(buildGlossaryThemeConfig(null, {})).toEqual({});
  });
});
