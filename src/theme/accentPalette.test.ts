import { describe, expect, it } from "vitest";

import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  getAccentPreset,
  resolveAccentId,
  type AccentTokens,
} from "./accentPalette";

/** Относительная яркость по WCAG. */
const luminance = (hex: string): number => {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (a: string, b: string): number => {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

describe("акцентная палитра", () => {
  it("ключи уникальны", () => {
    const ids = ACCENT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("дефолтный акцент существует", () => {
    expect(ACCENT_PRESETS.some((p) => p.id === DEFAULT_ACCENT_ID)).toBe(true);
  });

  it("все токены — валидные hex", () => {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    for (const preset of ACCENT_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        for (const [key, value] of Object.entries(preset[mode] as AccentTokens)) {
          expect(value, `${preset.id}.${mode}.${key}`).toMatch(hex);
        }
      }
    }
  });

  // Три пары, которые видно в интерфейсе постоянно: акцент как текст на
  // карточке, текст чипа на своей подложке и подпись на заливке кнопки.
  it("держат контраст AA (4.5:1) в обеих темах", () => {
    for (const preset of ACCENT_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        const t = preset[mode];
        expect(contrast(t.accent, t.surface), `${preset.id}.${mode}: accent/surface`)
          .toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.accent, t.accentBg), `${preset.id}.${mode}: accent/accentBg`)
          .toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.accentFg, t.accent), `${preset.id}.${mode}: accentFg/accent`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("светлая тема светлее тёмной по поверхности", () => {
    for (const preset of ACCENT_PRESETS) {
      expect(luminance(preset.light.surface), preset.id).toBeGreaterThan(
        luminance(preset.dark.surface),
      );
    }
  });

  describe("resolveAccentId", () => {
    it("пропускает известный ключ", () => {
      expect(resolveAccentId("emerald")).toBe("emerald");
    });

    it("переводит хекс старой палитры в ближайший акцент", () => {
      // Прежний дефолт «Ирис».
      expect(resolveAccentId("#5b5bd6")).toBe("iris");
      // Нейтральные «Графит» и «Сталь» — ради них в палитре есть graphite:
      // иначе выбор «без цвета» уезжал в бирюзу.
      expect(resolveAccentId("#475569")).toBe("graphite");
      expect(resolveAccentId("#334155")).toBe("graphite");
    });

    it("отдаёт дефолт на пустом и мусорном значении", () => {
      expect(resolveAccentId(null)).toBe(DEFAULT_ACCENT_ID);
      expect(resolveAccentId("")).toBe(DEFAULT_ACCENT_ID);
      expect(resolveAccentId("не цвет")).toBe(DEFAULT_ACCENT_ID);
    });
  });

  it("getAccentPreset не возвращает undefined на неизвестном ключе", () => {
    expect(getAccentPreset("нет-такого").id).toBe(DEFAULT_ACCENT_ID);
  });
});
