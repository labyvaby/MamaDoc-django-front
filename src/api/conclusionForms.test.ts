import { describe, expect, it } from "vitest";

import {
  renderFilledForm,
  sheetSizeMm,
  usedSlots,
  type FormField,
} from "./conclusionForms";

const field = (over: Partial<FormField> & { id: string }): FormField => ({
  label: "",
  type: "text",
  ...over,
});

describe("sheetSizeMm", () => {
  it("отдаёт портретный лист как есть", () => {
    expect(sheetSizeMm("A4", "portrait")).toEqual({ width: 210, height: 297 });
    expect(sheetSizeMm("A5", "portrait")).toEqual({ width: 148, height: 210 });
  });

  it("меняет стороны местами в альбомной ориентации", () => {
    expect(sheetSizeMm("A4", "landscape")).toEqual({ width: 297, height: 210 });
    expect(sheetSizeMm("A5", "landscape")).toEqual({ width: 210, height: 148 });
  });
});

describe("renderFilledForm", () => {
  const template = {
    title: "Протокол УЗИ",
    footerNote: "УЗИ — метод визуализации.",
    fields: [
      field({ id: "a", label: "Положение плода" }),
      field({ id: "b", label: "КТР" }),
      field({ id: "c", label: "Заключение", type: "multiline" }),
    ],
  };

  it("собирает заголовок, поля и примечание", () => {
    const text = renderFilledForm(template, {
      a: "продольное",
      b: "42 мм",
      c: "Беременность 11 недель.",
    });

    expect(text).toBe(
      [
        "Протокол УЗИ",
        "",
        "Положение плода: продольное",
        "КТР: 42 мм",
        "Заключение:",
        "Беременность 11 недель.",
        "",
        "УЗИ — метод визуализации.",
      ].join("\n"),
    );
  });

  it("выбрасывает незаполненные поля целиком", () => {
    // Строка «Шевеление:» без значения в печатном заключении читается как
    // недоделанная работа врача, а не как «признак не оценивался».
    const text = renderFilledForm(template, { a: "продольное", b: "   ", c: "" });

    expect(text).toContain("Положение плода: продольное");
    expect(text).not.toContain("КТР");
    expect(text).not.toContain("Заключение");
  });

  it("переносит многострочное значение под подпись даже у обычного поля", () => {
    const text = renderFilledForm(
      { title: "", footerNote: "", fields: [field({ id: "a", label: "Жалобы" })] },
      { a: "кашель\nнасморк" },
    );

    expect(text).toBe("Жалобы:\nкашель\nнасморк");
  });

  it("печатает значение без двоеточия, когда у поля нет подписи", () => {
    const text = renderFilledForm(
      { title: "", footerNote: "", fields: [field({ id: "a", label: "  " })] },
      { a: "Свободный абзац" },
    );

    expect(text).toBe("Свободный абзац");
  });

  it("не оставляет пустых строк, когда заполнять нечего", () => {
    expect(renderFilledForm(template, {})).toBe(
      "Протокол УЗИ\n\nУЗИ — метод визуализации.",
    );
  });
});

describe("renderFilledForm со слотами", () => {
  it("не дублирует в тексте поля, привязанные к колонкам заключения", () => {
    // Жалобы и температура уже лежат в своих колонках: в тексте они задвоились бы.
    const text = renderFilledForm(
      {
        title: "Карта осмотра педиатра",
        footerNote: "",
        fields: [
          field({ id: "a", label: "Жалобы", slot: "complaints" }),
          field({ id: "b", label: "Температура, °C", slot: "temperature" }),
          field({ id: "c", label: "Зев" }),
        ],
      },
      { a: "кашель", b: "37.2", c: "спокоен" },
    );

    expect(text).toBe("Карта осмотра педиатра\n\nЗев: спокоен");
  });

  it("привязка null и её отсутствие равнозначны — поле идёт в текст", () => {
    const text = renderFilledForm(
      {
        title: "",
        footerNote: "",
        fields: [field({ id: "a", label: "Зев", slot: null })],
      },
      { a: "спокоен" },
    );

    expect(text).toBe("Зев: спокоен");
  });
});

describe("usedSlots", () => {
  it("считает занятые колонки — по ним конструктор запрещает вторую привязку", () => {
    const used = usedSlots([
      field({ id: "a", slot: "complaints" }),
      field({ id: "b", slot: "temperature" }),
      field({ id: "c", slot: "complaints" }),
      field({ id: "d" }),
    ]);

    expect(used.get("complaints")).toBe(2);
    expect(used.get("temperature")).toBe(1);
    expect(used.get("weightKg")).toBeUndefined();
  });
});
