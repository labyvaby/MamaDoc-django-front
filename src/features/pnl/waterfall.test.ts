import { describe, expect, it } from "vitest";

import { detail, makeReport } from "./fixture";
import { buildWaterfall } from "./model";

describe("buildWaterfall", () => {
  it("выручка → себестоимость → зарплата → крупные статьи → прочие → чистая прибыль", () => {
    const bars = buildWaterfall(makeReport());
    expect(bars.map((b) => [b.key, b.value])).toEqual([
      ["revenue", 2200],
      ["cost", -220],
      ["salary", -1000],
      ["admin.category.5", -400],
      ["selling.category.3", -80],
      ["rest", 10],
      ["net", 510],
    ]);
    expect(bars.find((b) => b.key === "rest")).toMatchObject({ kind: "up", label: "Прочие" });
    expect(bars[1]).toMatchObject({ kind: "down", low: 1980, high: 2200 });
    expect(bars[2].sharePct).toBeCloseTo(45.45, 1);
    expect(bars.at(-1)).toMatchObject({ kind: "net", low: 0, high: 510 });
  });

  it("без лишних столбиков: нулевые шаги и «прочие» пропускаются", () => {
    const report = makeReport();
    report.lines.find((l) => l.code === "200")!.total = "500.00";
    expect(buildWaterfall(report).some((b) => b.key === "rest")).toBe(false);
  });

  it("берёт не больше topCount статей и убыток уходит ниже нуля", () => {
    const report = makeReport();
    report.lines.find((l) => l.code === "080")!.children.push(detail("admin.category.6", "Связь", 1, 1));
    report.lines.find((l) => l.code === "200")!.total = "-100.00";
    const bars = buildWaterfall(report, 1);
    expect(bars.map((b) => b.key)).toEqual(["revenue", "cost", "salary", "admin.category.5", "rest", "net"]);
    expect(bars.at(-1)).toMatchObject({ low: -100, high: 0 });
  });

  it("пустой отчёт — только выручка и чистая прибыль без долей", () => {
    const report = makeReport();
    for (const line of report.lines) {
      line.total = "0.00";
      line.children = [];
    }
    const bars = buildWaterfall(report);
    expect(bars.map((b) => b.key)).toEqual(["revenue", "net"]);
    expect(bars[0].sharePct).toBeNull();
    expect(bars[1].sharePct).toBeNull();
  });
});
