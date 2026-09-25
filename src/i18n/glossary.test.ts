import { describe, expect, it } from "vitest";

import { SUPPORTED_VERTICALS, VERTICAL_LABELS, getGlossary, isVertical } from "./glossary";
import { TERM_KEYS } from "./types";

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
  });

  it("остальные слова берёт у салона", () => {
    const projects = getGlossary("projects");
    const beauty = getGlossary("beauty");
    expect(projects.room).toEqual(beauty.room);
    expect(projects.service).toEqual(beauty.service);
    expect(projects.employee).toEqual(beauty.employee);
  });
});

describe("полнота профилей", () => {
  it.each(SUPPORTED_VERTICALS)("%s: каждый термин во всех формах", (vertical) => {
    const g = getGlossary(vertical);
    for (const key of TERM_KEYS) {
      const forms = g[key];
      expect(forms, `${vertical}.${key}`).toBeDefined();
      for (const [form, value] of Object.entries(forms)) {
        expect(value, `${vertical}.${key}.${form}`).not.toBe("");
      }
    }
  });
});
