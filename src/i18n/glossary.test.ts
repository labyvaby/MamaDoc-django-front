import { describe, expect, it } from "vitest";

import { SELECTABLE_VERTICALS, SUPPORTED_VERTICALS, VERTICAL_LABELS, getGlossary, isVertical } from "./glossary";
import { isValidTermForms } from "./glossaryOverrides";
import { TERM_KEYS } from "./types";
import settings from "../locales/ru/settings.json";

describe("профиль «Проектная компания»", () => {
  it("известен фронту и подписан", () => {
    expect(isVertical("projects")).toBe(true);
    expect(SUPPORTED_VERTICALS).toContain("projects");
    expect(VERTICAL_LABELS.projects).toBe("Проектная компания");
  });

  it("говорит «клиент, встреча, специалист, компания, запрос»", () => {
    const g = getGlossary("projects");
    expect(g.patient.nom).toBe("клиент");
    expect(g.visit.nom).toBe("встреча");
    expect(g.visit.genPl).toBe("встреч");
    expect(g.specialist.nom).toBe("специалист");
    expect(g.specialist.accPl).toBe("специалистов");
    expect(g.org.nom).toBe("компания");
    expect(g.org.gen).toBe("компании");
    expect(g.complaint.nom).toBe("запрос");
    expect(g.visit.gender).toBe("f");
    expect(g.specialist.gender).toBe("m");
    expect(g.org.gender).toBe("f");
    expect(g.complaint.gender).toBe("m");
  });

  it("остальные слова берёт у салона", () => {
    const projects = getGlossary("projects");
    const beauty = getGlossary("beauty");
    const overridden = ["visit", "specialist", "org", "complaint"];
    for (const key of TERM_KEYS) {
      if (overridden.includes(key)) continue;
      expect(projects[key], key).toEqual(beauty[key]);
    }
  });
});

describe("полнота профилей", () => {
  it.each(SUPPORTED_VERTICALS)("%s: каждый термин во всех формах", (vertical) => {
    const g = getGlossary(vertical);
    for (const key of TERM_KEYS) {
      expect(isValidTermForms(g[key]), `${vertical}.${key}`).toBe(true);
    }
  });
});

describe("подписи типов бизнеса в настройках", () => {
  it.each(SUPPORTED_VERTICALS)("%s: есть label и hint", (vertical) => {
    const entry = settings.organization.vertical[vertical];
    expect(entry, vertical).toBeDefined();
    expect(entry.label, `${vertical}.label`).toBeTruthy();
    expect(entry.hint, `${vertical}.hint`).toBeTruthy();
  });
});

describe("выбор вертикали в настройках", () => {
  it("застройщика не предлагает, пока его нет в OrganizationVertical бэка", () => {
    expect(SUPPORTED_VERTICALS).toContain("realestate");
    expect(SELECTABLE_VERTICALS).not.toContain("realestate");
    expect(SELECTABLE_VERTICALS).toEqual(expect.arrayContaining(["clinic", "beauty", "retail", "projects"]));
  });
});
