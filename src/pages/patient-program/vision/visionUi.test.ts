import { describe, expect, it } from "vitest";

import { signalText, toggleIn } from "./visionUi";

const nbsp = String.fromCharCode(0xa0);

describe("vision ui helpers", () => {
  it("speaks the signals in plain words", () => {
    expect(signalText({ kind: "asymmetry", value: 0.2 })).toEqual({
      severity: "warning",
      text: "Разница между глазами 0,2 — риск амблиопии, нужен офтальмолог",
    });
    expect(signalText({ kind: "anisometropia", value: 1.5 }).text).toBe(
      `Анизометропия: разница рефракции глаз 1,50${nbsp}D`,
    );
    expect(signalText({ kind: "myopia-progression", eye: "OD", value: 0.75 })).toEqual({
      severity: "error",
      text: `Миопия прогрессирует: OD −0,75${nbsp}D за год`,
    });
  });

  it("toggles a value in a list", () => {
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });
});
