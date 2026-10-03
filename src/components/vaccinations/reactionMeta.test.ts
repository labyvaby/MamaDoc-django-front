import { describe, expect, it } from "vitest";

import type { TuberculinThresholds } from "../../api/vaccinations";
import {
  BCG_FOLLOWUP_PRESET,
  doseInput,
  doseLabel,
  followupRowsError,
  fromFollowupRows,
  isStrongReaction,
  nextFollowupKey,
  parseDoseMl,
  parseSizeMm,
  reactionSummary,
  suggestTuberculinResult,
  toFollowupRows,
} from "./reactionMeta";

const THRESHOLDS: TuberculinThresholds = {
  mantoux: { doubtfulFrom: 2, positiveFrom: 5, hyperergicFrom: 17 },
  diaskintest: { doubtfulFrom: null, positiveFrom: 1, hyperergicFrom: 15 },
};

describe("parseDoseMl", () => {
  it("принимает запятую и точку, режет лишние нули", () => {
    expect(parseDoseMl("0,5")).toEqual({ value: "0.5", error: null });
    expect(parseDoseMl(" 0.05 ")).toEqual({ value: "0.05", error: null });
    expect(parseDoseMl("1,00")).toEqual({ value: "1", error: null });
  });

  it("пусто — не указано, мусор и выход за пределы — ошибка", () => {
    expect(parseDoseMl("")).toEqual({ value: null, error: null });
    expect(parseDoseMl("0,005").error).not.toBeNull();
    expect(parseDoseMl("20").error).toBe("От 0,01 до 10 мл");
    expect(parseDoseMl("0").error).toBe("От 0,01 до 10 мл");
    expect(parseDoseMl("пол").error).not.toBeNull();
  });

  it("значение из ответа показывается с запятой", () => {
    expect(doseInput("0.50")).toBe("0,5");
    expect(doseInput(null)).toBe("");
    expect(doseLabel("0.05")).toBe("0,05 мл");
    expect(doseLabel(undefined)).toBe("");
  });
});

describe("parseSizeMm", () => {
  it("целые 0–40 мм", () => {
    expect(parseSizeMm("6")).toEqual({ value: 6, error: null });
    expect(parseSizeMm("0")).toEqual({ value: 0, error: null });
    expect(parseSizeMm("")).toEqual({ value: null, error: null });
    expect(parseSizeMm("41").error).toBe("Не больше 40 мм");
    expect(parseSizeMm("5,5").error).toBe("Целое число мм");
  });
});

describe("реакция", () => {
  it("сильная — местная или общая", () => {
    expect(isStrongReaction("strong", "")).toBe(true);
    expect(isStrongReaction("normal", "strong")).toBe(true);
    expect(isStrongReaction("normal", "moderate")).toBe(false);
  });

  it("сводка для строки истории", () => {
    expect(reactionSummary("normal", "mild")).toBe("местная обычная, общая слабая");
    expect(reactionSummary("", "strong")).toBe("общая сильная");
    expect(reactionSummary(undefined, "")).toBe("");
  });
});

describe("suggestTuberculinResult", () => {
  it("Манту по порогам клиники", () => {
    expect(suggestTuberculinResult("mantoux", 1, THRESHOLDS)).toBe("negative");
    expect(suggestTuberculinResult("mantoux", 3, THRESHOLDS)).toBe("doubtful");
    expect(suggestTuberculinResult("mantoux", 6, THRESHOLDS)).toBe("positive");
    expect(suggestTuberculinResult("mantoux", 17, THRESHOLDS)).toBe("hyperergic");
  });

  it("Диаскинтест: любой инфильтрат — положительная", () => {
    expect(suggestTuberculinResult("diaskintest", 0, THRESHOLDS)).toBe("negative");
    expect(suggestTuberculinResult("diaskintest", 2, THRESHOLDS)).toBe("positive");
  });

  it("без размера или порогов — без подсказки", () => {
    expect(suggestTuberculinResult("mantoux", null, THRESHOLDS)).toBe("");
    expect(suggestTuberculinResult("mantoux", 6, null)).toBe("");
  });
});

describe("сроки осмотра", () => {
  it("строки редактора туда и обратно", () => {
    const rows = toFollowupRows(BCG_FOLLOWUP_PRESET);
    expect(rows[1]).toEqual({ key: "m2", label: "2 мес.", fromDays: "56", toDays: "70" });
    expect(fromFollowupRows(rows)).toEqual(BCG_FOLLOWUP_PRESET);
  });

  it("код нового срока — первый свободный", () => {
    expect(nextFollowupKey([])).toBe("k1");
    expect(nextFollowupKey([{ key: "k1" }, { key: "m2" }])).toBe("k2");
  });

  it("ошибки как на бэке", () => {
    const row = { key: "k1", label: "2 нед.", fromDays: "10", toDays: "14" };
    expect(followupRowsError([row])).toBeNull();
    expect(followupRowsError([{ ...row, label: " " }])).toBe("У каждого срока нужна подпись");
    expect(followupRowsError([{ ...row, fromDays: "1,5" }])).toBe("Дни срока — целые числа");
    expect(followupRowsError([{ ...row, fromDays: "20" }])).toBe("«2 нед.»: день «с» не позже дня «по»");
    expect(followupRowsError([{ ...row, toDays: "4000" }])).toBe("Не дольше 3650 дней");
  });
});
