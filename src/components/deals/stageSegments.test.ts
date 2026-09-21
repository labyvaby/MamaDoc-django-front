import { describe, expect, it } from "vitest";

import type { DealStage, DealStageLogEntry } from "../../api/deals";
import {
  buildStageSegments,
  formatSeconds,
  MIN_SHARE,
  normalizeShares,
} from "./stageSegments";

const stages: DealStage[] = [
  {
    id: 1,
    pipelineId: 1,
    name: "Новое",
    code: "new",
    color: "#111",
    order: 0,
    kind: "open",
    slaDays: null,
    isActive: true,
  },
  {
    id: 2,
    pipelineId: 1,
    name: "Дозвонились",
    code: "contacted",
    color: "#222",
    order: 1,
    kind: "open",
    slaDays: null,
    isActive: true,
  },
  {
    id: 5,
    pipelineId: 1,
    name: "Выиграна",
    code: "won",
    color: "#555",
    order: 4,
    kind: "won",
    slaDays: null,
    isActive: true,
  },
];

function entry(
  id: number,
  toStageId: number,
  enteredAt: string,
  over: Partial<DealStageLogEntry> = {}
): DealStageLogEntry {
  return {
    id,
    dealId: 1,
    actorId: null,
    actorName: "Бот",
    actorKind: "bot",
    actorColor: "#6366F1",
    fromStageId: null,
    fromStageName: null,
    toStageId,
    toStageName: `stage ${toStageId}`,
    enteredAt,
    note: "",
    durationHours: null,
    ...over,
  };
}

describe("buildStageSegments", () => {
  it("делит полосу пропорционально времени, последний — до «сейчас»", () => {
    const log = [
      entry(1, 1, "2026-09-18T10:00:00Z"),
      entry(2, 2, "2026-09-18T11:00:00Z"),
      entry(3, 5, "2026-09-18T14:00:00Z"),
    ];
    const now = new Date("2026-09-18T15:00:00Z");
    const segments = buildStageSegments(log, stages, now, false);
    expect(segments.map((s) => s.name)).toEqual([
      "Новое",
      "Дозвонились",
      "Выиграна",
    ]);
    expect(segments.map((s) => Math.round(s.share * 100))).toEqual([
      20, 60, 20,
    ]);
    expect(segments[2].open).toBe(true);
    expect(segments[0].color).toBe("#111");
    expect(segments[0].actorKind).toBe("bot");
  });

  it("закрытая сделка не «идёт»", () => {
    const log = [
      entry(1, 1, "2026-09-18T10:00:00Z"),
      entry(2, 5, "2026-09-18T11:00:00Z"),
    ];
    const segments = buildStageSegments(
      log,
      stages,
      new Date("2026-09-19T11:00:00Z"),
      true
    );
    expect(segments[1].open).toBe(false);
  });

  it("короткий этап не исчезает: минимум 4 %", () => {
    const log = [
      entry(1, 1, "2026-09-18T10:00:00Z"),
      entry(2, 2, "2026-09-18T10:01:00Z"),
    ];
    const segments = buildStageSegments(
      log,
      stages,
      new Date("2026-09-28T10:00:00Z"),
      false
    );
    expect(segments[0].share).toBeCloseTo(MIN_SHARE, 5);
    expect(segments[0].share + segments[1].share).toBeCloseTo(1, 5);
  });

  it("этап, которого нет в настройках, берёт имя из лога и серый цвет", () => {
    const log = [
      entry(1, 99, "2026-09-18T10:00:00Z", { toStageName: "Старый" }),
    ];
    const [seg] = buildStageSegments(
      log,
      stages,
      new Date("2026-09-18T11:00:00Z"),
      false
    );
    expect(seg.name).toBe("Старый");
    expect(seg.color).toBe("#94A3B8");
    expect(seg.share).toBe(1);
  });

  it("пустой лог — пусто", () => {
    expect(buildStageSegments([], stages, new Date(), false)).toEqual([]);
  });
});

describe("normalizeShares", () => {
  it("сумма остаётся единицей после поднятия мелких долей", () => {
    const out = normalizeShares([0.01, 0.01, 0.98]);
    expect(out[0]).toBeCloseTo(MIN_SHARE);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it("слишком много сегментов — поровну", () => {
    const out = normalizeShares(new Array(30).fill(1 / 30));
    expect(out.every((s) => Math.abs(s - 1 / 30) < 1e-9)).toBe(true);
  });
});

describe("formatSeconds", () => {
  it("человеческие длительности", () => {
    expect(formatSeconds(30)).toBe("меньше минуты");
    expect(formatSeconds(35 * 60)).toBe("35 мин");
    expect(formatSeconds(2 * 3600 + 5 * 60)).toBe("2 ч 5 мин");
    expect(formatSeconds(2 * 86400 + 4 * 3600)).toBe("2 д 4 ч");
    expect(formatSeconds(3 * 86400)).toBe("3 д");
  });
});
