import { describe, expect, it } from "vitest";

import { createScanDetector, scanChar } from "./barcodeScanner";

const keyOf = (char: string) => {
  if (/^\d$/.test(char)) return { key: char, code: `Digit${char}` };
  if (/^[a-z]$/i.test(char)) return { key: char, code: `Key${char.toUpperCase()}`, shiftKey: char !== char.toLowerCase() };
  if (char === "-") return { key: "-", code: "Minus" };
  return { key: char, code: "" };
};

/** Печатает строку с заданным шагом; возвращает решения по каждому нажатию. */
function type(detector: ReturnType<typeof createScanDetector>, text: string, gap: number, start = 0) {
  return [...text].map((char, index) => detector.feed({ ...keyOf(char), time: start + index * gap }));
}

describe("scanChar", () => {
  it("reads letters by physical key, so a Russian layout still yields Latin", () => {
    expect(scanChar({ key: "ь", code: "KeyM", shiftKey: false })).toBe("m");
    expect(scanChar({ key: "Ь", code: "KeyM", shiftKey: true })).toBe("M");
    expect(scanChar({ key: "7", code: "Numpad7", shiftKey: false })).toBe("7");
    expect(scanChar({ key: "-", code: "Minus", shiftKey: false })).toBe("-");
  });

  it("ignores service keys", () => {
    expect(scanChar({ key: "Shift", code: "ShiftLeft", shiftKey: true })).toBeNull();
    expect(scanChar({ key: "Backspace", code: "Backspace", shiftKey: false })).toBeNull();
  });
});

describe("createScanDetector", () => {
  it("recognises a fast burst ending with Enter and swallows it from the 4th char", () => {
    const detector = createScanDetector();
    const decisions = type(detector, "2000000016009", 10);
    expect(decisions[0].started).toBe(true);
    expect(decisions.slice(0, 3).every((d) => !d.swallow)).toBe(true);
    expect(decisions[3]).toMatchObject({ swallow: true, confirmed: true });
    expect(decisions.slice(4).every((d) => d.swallow && !d.confirmed)).toBe(true);
    expect(detector.feed({ key: "Enter", code: "Enter", time: 140 })).toMatchObject({
      swallow: true,
      complete: "2000000016009",
    });
  });

  it("leaves human typing alone", () => {
    const detector = createScanDetector();
    const decisions = type(detector, "шарф", 140);
    expect(decisions.every((d) => !d.swallow)).toBe(true);
    expect(detector.feed({ key: "Enter", code: "Enter", time: 700 })).toMatchObject({ swallow: false });
    expect(detector.feed({ key: "Enter", code: "Enter", time: 700 }).complete).toBeUndefined();
  });

  it("does not treat a quick pair of human keystrokes as a scan", () => {
    const detector = createScanDetector();
    type(detector, "ab", 20);
    type(detector, "cd", 20, 200);
    expect(detector.feed({ key: "Enter", code: "Enter", time: 260 }).complete).toBeUndefined();
  });

  it("finishes a scanner without Enter after a pause and eats a late Enter", () => {
    const detector = createScanDetector();
    type(detector, "MONO-42", 8);
    expect(detector.idle(48 + 30)).toBeNull();
    expect(detector.idle(48 + 100)).toBe("MONO-42");
    expect(detector.feed({ key: "Enter", code: "Enter", time: 48 + 150 })).toMatchObject({ swallow: true });
    expect(detector.feed({ key: "Enter", code: "Enter", time: 48 + 160 })).toMatchObject({ swallow: false });
  });

  it("keeps Shift between scanner characters inside the burst", () => {
    const detector = createScanDetector();
    type(detector, "p00", 8);
    expect(detector.feed({ key: "Shift", code: "ShiftLeft", shiftKey: true, time: 26 })).toMatchObject({ started: false });
    type(detector, "0016", 8, 30);
    expect(detector.feed({ key: "Enter", code: "Enter", time: 70 }).complete).toBe("p000016");
  });

  it("resets on shortcuts so Ctrl+V is never a scan", () => {
    const detector = createScanDetector();
    type(detector, "1234", 5);
    expect(detector.feed({ key: "v", code: "KeyV", ctrlKey: true, time: 25 }).swallow).toBe(false);
    expect(detector.feed({ key: "Enter", code: "Enter", time: 30 }).complete).toBeUndefined();
  });
});
