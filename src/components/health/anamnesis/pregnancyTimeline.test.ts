import { describe, expect, it } from "vitest";

import { demoPerinatal, demoProfile, emptyPerinatal } from "./anamnesisFixtures";
import { pregnancyTimeline, weekX } from "./pregnancyTimeline";

describe("pregnancyTimeline", () => {
  it("демо: полосы, ромбы, роды и высота как в макете", () => {
    const layout = pregnancyTimeline(demoPerinatal(), demoProfile());
    expect(layout.marks.map((mark) => `${mark.shape}:${mark.label}:${mark.tone}:${mark.lane}`)).toEqual([
      "bar:Токсикоз:warn:0",
      "diamond:Угроза прерывания:bad:0",
      "bar:Анемия, Hb 102:warn:0",
      "diamond:ОРВИ:warn:0",
      "diamond:Скрининг:ok:1",
      "diamond:УЗИ:ok:1",
      "diamond:УЗИ:ok:1",
    ]);
    expect(layout.lanes.map((lane) => lane.y)).toEqual([53, 91]);
    expect(layout.bottom).toBe(120);
    expect(layout.height).toBe(142);
    expect(layout.birth).toEqual({ x: weekX(39), label: "Роды · 39 нед" });
    expect(layout.undated).toEqual([]);
    expect(layout.marks[5].title).toBe("УЗИ 20 нед · норма");
    expect(layout.marks[6].title).toBe("УЗИ 32 нед · норма · тазовое предлежание, к родам — головное");
  });

  it("только триместр — бледная полоса; без срока — списком; близкие подписи — во второй ряд", () => {
    const layout = pregnancyTimeline(
      {
        ...emptyPerinatal(),
        complications: [
          { code: "preeclampsia", fromWeek: null, toWeek: null, trimester: 3, severity: null, note: "" },
          { code: "toxicosis", fromWeek: null, toWeek: null, trimester: null, severity: "mild", note: "" },
          { code: "miscarriage_threat", fromWeek: 9, toWeek: null, trimester: null, severity: null, note: "" },
        ],
        infections: [{ code: "flu", week: 10, trimester: null, note: "" }],
      },
      null,
    );
    const trimester = layout.marks.find((mark) => mark.shape === "trimester");
    expect(trimester?.from).toBe(27);
    expect(trimester?.to).toBe(42);
    expect(layout.undated).toEqual(["Токсикоз"]);
    const threat = layout.marks.find((mark) => mark.label === "Угроза прерывания");
    const flu = layout.marks.find((mark) => mark.label === "Грипп");
    expect(flu!.labelY).toBeGreaterThan(threat!.labelY);
    expect(layout.birth).toBeNull();
  });

  it("пусто — пустой рисунок", () => {
    expect(pregnancyTimeline(emptyPerinatal(), null).empty).toBe(true);
  });
});
