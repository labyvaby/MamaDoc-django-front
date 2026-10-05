import { describe, expect, it } from "vitest";

import { groupByStage, leadsStats, type Lead } from "./realtyLeads";

const lead = (patch: Partial<Lead>): Lead => ({
  id: 1,
  client: "",
  phone: "",
  project: "",
  location: "",
  projectId: null,
  projectName: null,
  unitId: null,
  unitNumber: null,
  budget: 0,
  stage: "new",
  stageName: "",
  source: "",
  managerId: null,
  manager: null,
  temp: "warm",
  task: "",
  overdue: false,
  position: 0,
  created: "",
  comments: [],
  ...patch,
});

describe("groupByStage", () => {
  it("раскладывает по 6 этапам в порядке position, неизвестный этап — в «Новая заявка»", () => {
    const columns = groupByStage([
      lead({ id: 1, stage: "contact", position: 2 }),
      lead({ id: 2, stage: "contact", position: 0 }),
      lead({ id: 3, stage: "lost" }),
      lead({ id: 4, stage: "build" }),
    ]);
    expect(Object.keys(columns)).toEqual(["new", "contact", "measure", "estimate", "contract", "build"]);
    expect(columns.contact.map((l) => l.id)).toEqual([2, 1]);
    expect(columns.new.map((l) => l.id)).toEqual([3]);
    expect(columns.build.map((l) => l.id)).toEqual([4]);
  });
});

describe("leadsStats", () => {
  it("KPI и счётчики чипов: сумма бюджетов, горячие, без дела, просроченные", () => {
    expect(
      leadsStats([
        lead({ budget: 6_850_000, temp: "hot", task: "Позвонить до 10:00", overdue: true }),
        lead({ budget: 4_000_000, temp: "cold", task: "  " }),
        lead({ budget: 0, temp: "hot", task: "Показ" }),
      ]),
    ).toEqual({ count: 3, budget: 10_850_000, hot: 2, notask: 1, overdue: 1 });
  });
});
