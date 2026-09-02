import { describe, expect, it } from "vitest";

import {
  ACCENT_PRESETS,
  CALM_PRESETS,
  TINTED_PRESETS,
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

/** CIELAB — в нём «похожесть» цветов меряется ближе к человеческому глазу. */
const lab = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
};

/**
 * Статусные цвета приложения: Refine-палитра плюс кастомные purple и teal из
 * theme.ts. Держим их здесь копией, а не через getAppTheme — тот тянет
 * @refinedev/mui, который не резолвится в node-окружении тестов.
 */
const STATUS_COLORS = {
  light: {
    error: "#fa541c",
    warning: "#fa8c16",
    success: "#67be23",
    info: "#0b82f0",
    purple: "#6366f1",
    teal: "#0d9488",
  },
  dark: {
    error: "#ee2a1e",
    warning: "#fa8c16",
    success: "#67be23",
    info: "#1890ff",
    purple: "#6366f1",
    teal: "#0d9488",
  },
} as const;

describe("акцентная палитра", () => {
  it("24 цветных темы и 12 спокойных", () => {
    expect(TINTED_PRESETS).toHaveLength(24);
    expect(CALM_PRESETS).toHaveLength(12);
    expect(ACCENT_PRESETS).toHaveLength(36);
  });

  // Спокойные темы — замена прежнему отдельному выбору фона: их смысл в том,
  // что страница и карточки остаются нейтральными, а цвет живёт только в
  // акценте. Тонированный page здесь означал бы, что нейтрального фона в
  // приложении больше нет вовсе.
  it("у спокойных тем фон нейтральный", () => {
    const spread = (hex: string): number => {
      const h = hex.replace("#", "");
      const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      return Math.max(...channels) - Math.min(...channels);
    };
    for (const preset of CALM_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        expect(spread(preset[mode].page), `${preset.id}.${mode}.page`).toBeLessThanOrEqual(16);
        expect(spread(preset[mode].surface), `${preset.id}.${mode}.surface`).toBeLessThanOrEqual(16);
      }
    }
  });

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

  // Акцент, совпадающий со статусным цветом, делает чипы статусов неотличимыми
  // от кнопок — такие оттенки в палитру не берём.
  it("не подходят близко к статусным цветам", () => {
    for (const preset of ACCENT_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        for (const [status, hex] of Object.entries(STATUS_COLORS[mode])) {
          expect(
            deltaE(preset[mode].accent, hex),
            `${preset.id}.${mode} слишком близок к статусу ${status}`,
          ).toBeGreaterThanOrEqual(20);
        }
      }
    }
  });

  // Порог мягкий: в наборе есть намеренно соседние оттенки (коралловый и
  // оранжевый), задача проверки — поймать полные клоны.
  it("акценты различимы между собой", () => {
    for (let i = 0; i < ACCENT_PRESETS.length; i += 1) {
      for (let j = i + 1; j < ACCENT_PRESETS.length; j += 1) {
        const a = ACCENT_PRESETS[i];
        const b = ACCENT_PRESETS[j];
        expect(
          deltaE(a.light.accent, b.light.accent),
          `${a.id} и ${b.id} почти одинаковы в светлой теме`,
        ).toBeGreaterThanOrEqual(6);
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
      // Нейтральные «Графит» и «Сталь» прежней палитры — оба уходят в
      // спокойные сине-серые темы, а не в цветные.
      expect(resolveAccentId("#475569")).toBe("graphite");
      expect(resolveAccentId("#334155")).toBe("steel");
    });

    it("убранные из палитры ключи переводит в ближайший оставшийся", () => {
      // iris и royal ушли как двойники статусов purple и info.
      const iris = resolveAccentId("iris");
      const royal = resolveAccentId("royal");
      expect(ACCENT_PRESETS.some((p) => p.id === iris)).toBe(true);
      expect(ACCENT_PRESETS.some((p) => p.id === royal)).toBe(true);
      expect(iris).not.toBe(DEFAULT_ACCENT_ID === iris ? "" : DEFAULT_ACCENT_ID);
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
