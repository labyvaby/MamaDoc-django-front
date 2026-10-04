import { describe, expect, it } from "vitest";

import { DEMO_AT, DEMO_BIRTH, demoFamily, member } from "./anamnesisFixtures";
import { pedigreeLayout } from "./pedigreeLayout";

const child = { sex: "female" as const, birthDate: DEMO_BIRTH, consanguineous: false };

describe("pedigreeLayout", () => {
  it("демо: три поколения, линия отца слева, дедушка левее бабушки, номера и легенда", () => {
    const layout = pedigreeLayout(demoFamily(), child, DEMO_AT);
    const byRole = (role: string, line?: "paternal" | "maternal") =>
      layout.nodes.filter((node) => node.role.startsWith(role) && (line == null || node.tooltip.includes(line === "paternal" ? "по отцу" : "по матери")));
    const [father] = byRole("папа");
    const [mother] = byRole("мама");
    const [gfP] = byRole("дедушка", "paternal");
    const [gmP] = byRole("бабушка", "paternal");
    const [gfM] = byRole("дедушка", "maternal");
    const [gmM] = byRole("бабушка", "maternal");
    expect(father.x).toBeLessThan(mother.x);
    expect(gfP.x).toBeLessThan(gmP.x);
    expect(gmP.x).toBeLessThan(gfM.x);
    expect(gfM.x).toBeLessThan(gmM.x);
    expect(layout.rows.map((row) => row.roman)).toEqual(["I", "II", "III"]);
    expect(gfP.code).toBe("I-1");
    expect(mother.code).toBe("II-2");
    expect(gfP.affected && gmP.affected && mother.affected).toBe(true);
    expect(father.affected).toBe(false);
    expect(layout.nodes.filter((node) => node.placeholder)).toEqual([]);
    expect(layout.legend).toEqual(["I-1 — гипертоническая болезнь", "I-2 — сахарный диабет 2 типа", "II-2 — атопический дерматит"]);
    expect(gmP.diseases).toBe("диабет 2 типа");
    expect(mother.diseases).toBe("атоп. дерматит");
  });

  it("брат старше ребёнка — левее; ребёнок отмечен", () => {
    const layout = pedigreeLayout(demoFamily(), child, DEMO_AT);
    const kids = layout.nodes.filter((node) => node.generation === 3).sort((a, b) => a.x - b.x);
    expect(kids.map((node) => node.role)).toEqual(["брат, 5 лет", "ребёнок"]);
    expect(kids[1].proband).toBe(true);
    const younger = pedigreeLayout([...demoFamily(), member({ relation: "sibling", sex: "female", birthDate: "2026-01-10" })], child, DEMO_AT);
    expect(younger.nodes.filter((node) => node.generation === 3).sort((a, b) => a.x - b.x).map((node) => node.role)).toEqual([
      "брат, 5 лет",
      "ребёнок",
      "сестра, 8 мес",
    ]);
  });

  it("пустые места для матери, отца и бабушек с дедушками", () => {
    const layout = pedigreeLayout([member({ relation: "mother", healthStatus: "healthy" })], child, DEMO_AT);
    expect(layout.nodes.filter((node) => node.placeholder).map((node) => node.key).sort()).toEqual(
      ["add:father:", "add:grandfather:maternal", "add:grandfather:paternal", "add:grandmother:maternal", "add:grandmother:paternal"].sort(),
    );
    expect(layout.lines.find((line) => line.key === "marriage-parents")?.dashed).toBe(true);
  });

  it("кровнородственный брак — двойная линия; умерший; нет сведений; не кровные", () => {
    const family = demoFamily().map((row) =>
      row.relation === "grandfather" && row.line === "paternal" ? { ...row, vitalStatus: "deceased" as const, deathAge: 62 } : row,
    );
    family.push(member({ relation: "uncle", line: "maternal", sex: "male", healthStatus: "unknown" }));
    family.push(member({ relation: "stepfather" }));
    const layout = pedigreeLayout(family, { ...child, consanguineous: true }, DEMO_AT);
    expect(layout.lines.find((line) => line.key === "marriage-parents")?.double).toBe(true);
    const grandfather = layout.nodes.find((node) => node.code === "I-1");
    expect(grandfather?.deceased).toBe(true);
    expect(grandfather?.death).toBe("† в 62 г.");
    const uncle = layout.nodes.find((node) => node.role === "дядя");
    expect(uncle?.unknown).toBe(true);
    const mother = layout.nodes.find((node) => node.role === "мама");
    expect(uncle!.x).toBeGreaterThan(mother!.x);
    expect(layout.nonBlood).toEqual(["отчим"]);
  });
});
