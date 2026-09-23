import { describe, expect, it } from "vitest";
import { swapHomeInOperational } from "./homeBranch";

const b = (id: number) => ({ id, name: `Филиал ${id}` });

describe("swapHomeInOperational", () => {
  it("меняет старый основной филиал на новый", () => {
    expect(swapHomeInOperational([b(23)], 23, b(21)).map((x) => x.id)).toEqual([21]);
  });

  it("сохраняет остальные операционные филиалы", () => {
    expect(swapHomeInOperational([b(23), b(24)], 23, b(21)).map((x) => x.id)).toEqual([21, 24]);
  });

  it("не дублирует новый филиал, если он уже был операционным", () => {
    expect(swapHomeInOperational([b(23), b(21)], 23, b(21)).map((x) => x.id)).toEqual([21]);
  });

  it("добавляет основной, когда его не было в наборе", () => {
    expect(swapHomeInOperational([], null, b(21)).map((x) => x.id)).toEqual([21]);
  });
});
