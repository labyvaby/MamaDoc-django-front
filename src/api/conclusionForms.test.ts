import { describe, expect, it } from "vitest";

import {
  marginsError,
  normalizeForm,
  renderFilledForm,
  resolveFormForScope,
  resolveMargins,
  sheetSizeMm,
  suggestSlotForLabel,
  usedSlots,
  type ConclusionFormTemplate,
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

describe("resolveFormForScope", () => {
  const form = (over: Partial<ConclusionFormTemplate> & { id: number }): ConclusionFormTemplate => ({
    name: `Бланк ${over.id}`,
    pageSize: "A4",
    orientation: "portrait",
    specializationIds: [],
    serviceIds: [],
    branchIds: [],
    isDefault: false,
    title: "",
    showClinicHeader: true,
    background: { imageUrl: null, opacity: 1 },
    fields: [],
    target: "conclusion",
    isActive: true,
    createdAt: "",
    updatedAt: "",
    ...over,
  });

  const forms = [
    form({ id: 1, serviceIds: [42], branchIds: [13] }), // филиал + услуга
    form({ id: 2, serviceIds: [42] }), // все филиалы + услуга
    form({ id: 3, branchIds: [13] }), // филиал + любая услуга
    form({ id: 4 }), // все филиалы + любая услуга
    form({ id: 5, isDefault: true, branchIds: [99] }), // запасной чужого филиала
  ];

  it("самое точное совпадение — филиал и услуга", () => {
    expect(resolveFormForScope(forms, { branchId: 13, serviceId: 42 })?.id).toBe(1);
  });

  it("услуга важнее филиала: общий бланк филиала не подменяет протокол услуги", () => {
    expect(resolveFormForScope(forms, { branchId: 7, serviceId: 42 })?.id).toBe(2);
  });

  it("нет бланка по услуге — берётся общий бланк филиала", () => {
    expect(resolveFormForScope(forms, { branchId: 13, serviceId: 999 })?.id).toBe(3);
  });

  it("ни филиал, ни услуга не совпали — общий бланк организации", () => {
    expect(resolveFormForScope(forms, { branchId: 7, serviceId: 999 })?.id).toBe(4);
  });

  it("запасной бланк — только когда общего нет, и только доступный в филиале", () => {
    const scarce = [forms[4], form({ id: 6, isDefault: true })];
    expect(resolveFormForScope(scarce, { branchId: 13, serviceId: 42 })?.id).toBe(6);
    expect(resolveFormForScope([forms[4]], { branchId: 13, serviceId: 42 })).toBeNull();
    expect(resolveFormForScope([forms[4]], { branchId: 99, serviceId: 42 })?.id).toBe(5);
  });

  it("подходящего бланка нет — врач выбирает сам", () => {
    expect(
      resolveFormForScope([form({ id: 9, serviceIds: [1] })], { branchId: 13, serviceId: 42 }),
    ).toBeNull();
  });
});

describe("suggestSlotForLabel", () => {
  it("узнаёт колонку по подписи поля, как её пишут в бланках", () => {
    expect(suggestSlotForLabel("Жалобы")).toBe("complaints");
    expect(suggestSlotForLabel("Анамнез заболевания")).toBe("anamnesis");
    expect(suggestSlotForLabel("Температура, °C")).toBe("temperature");
    expect(suggestSlotForLabel("Вес, кг")).toBe("weightKg");
    expect(suggestSlotForLabel("Рост, см")).toBe("heightCm");
    expect(suggestSlotForLabel("  ЗАКЛЮЧЕНИЕ:  ")).toBe("conclusion");
  });

  it("молчит там, где совпадение слова не значит совпадение смысла", () => {
    // Соседние по названию поля — не те же колонки: подсказка тут навредила бы.
    expect(suggestSlotForLabel("Анамнез жизни")).toBeNull();
    expect(suggestSlotForLabel("Вес плода")).toBeNull();
    expect(suggestSlotForLabel("Заключение УЗИ")).toBeNull();
    expect(suggestSlotForLabel("Жалобы со слов матери")).toBeNull();
    expect(suggestSlotForLabel("")).toBeNull();
    expect(suggestSlotForLabel("Зев")).toBeNull();
  });
});

describe("resolveMargins", () => {
  it("не задано — прежняя геометрия, а не нули", () => {
    // Бланки, собранные до появления настройки, должны печататься как раньше.
    expect(resolveMargins("A4", null)).toEqual({ top: 12, right: 15, bottom: 12, left: 15 });
    expect(resolveMargins("A5", undefined)).toEqual({ top: 12, right: 10, bottom: 12, left: 10 });
  });

  it("ноль — осознанный выбор, а не пропуск", () => {
    // Печать в край нужна бумаге с картинкой на всю страницу.
    expect(resolveMargins("A4", { top: 0, right: 0, bottom: 0, left: 0 })).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it("мусор в одной стороне не роняет остальные", () => {
    // Значения приходят и из снапшота, который писала прошлая версия фронта.
    const margins = resolveMargins("A4", {
      top: 40,
      right: Number.NaN,
      bottom: -5,
      left: undefined,
    } as never);
    expect(margins).toEqual({ top: 40, right: 15, bottom: 12, left: 15 });
  });
});

describe("marginsError", () => {
  it("нормальные отступы под фирменную шапку проходят", () => {
    expect(marginsError("A4", "portrait", { top: 45, right: 15, bottom: 25, left: 15 })).toBeNull();
  });

  it("боковые отступы, съевшие лист, не сохранить", () => {
    const message = marginsError("A4", "portrait", { top: 12, right: 90, bottom: 12, left: 90 });
    expect(message).toContain("Боковые отступы");
  });

  it("вертикальные отступы, съевшие лист, не сохранить", () => {
    const message = marginsError("A4", "portrait", { top: 130, right: 15, bottom: 130, left: 15 });
    expect(message).toContain("сверху и снизу");
  });

  it("ориентация учитывается: у альбомного листа мало высоты", () => {
    const margins = { top: 90, right: 15, bottom: 90, left: 15 };
    // Портретный A4 — 297 мм высоты, влезает; альбомный — 210 мм, уже нет.
    expect(marginsError("A4", "portrait", margins)).toBeNull();
    expect(marginsError("A4", "landscape", margins)).toContain("сверху и снизу");
  });
});

describe("отступы: транспорт внутри background", () => {
  // Бэк молча отбрасывает неизвестные поля верхнего уровня, но хранит
  // `background` свободным JSON (проверено на test 08.09.2026). Компоненты про
  // это не знают — они читают `template.margins`, и вот эта распаковка обязана
  // работать, иначе настройка отступов молча теряется при перезагрузке.
  const base = {
    id: 6,
    name: "Протокол",
    pageSize: "A4",
    orientation: "portrait",
    title: "",
    showClinicHeader: true,
    fields: [{ id: "f1", label: "Поле", type: "text" }],
    target: "conclusion",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  } as unknown as ConclusionFormTemplate;

  it("читает отступы, сохранённые внутри background", () => {
    const form = normalizeForm({
      ...base,
      background: { imageUrl: null, opacity: 1, margins: { top: 44, right: 16, bottom: 21, left: 17 } },
    });
    expect(form.margins).toEqual({ top: 44, right: 16, bottom: 21, left: 17 });
  });

  it("поле верхнего уровня важнее — на случай, когда бэк его заведёт", () => {
    const form = normalizeForm({
      ...base,
      margins: { top: 30, right: 30, bottom: 30, left: 30 },
      background: { imageUrl: null, opacity: 1, margins: { top: 44, right: 16, bottom: 21, left: 17 } },
    });
    expect(form.margins).toEqual({ top: 30, right: 30, bottom: 30, left: 30 });
  });

  it("бланк без отступов открывается с прежней геометрией", () => {
    const form = normalizeForm({ ...base, background: { imageUrl: null, opacity: 1 } });
    expect(form.margins).toEqual({ top: 12, right: 15, bottom: 12, left: 15 });
  });
});
