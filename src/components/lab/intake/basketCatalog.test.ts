import { describe, it, expect } from "vitest";

import {
  isTestVisibleForGender,
  filterAvailableTests,
  groupCatalog,
  resolveSelectedLines,
  stepCount,
  type BasketLine,
} from "./basketCatalog";
import type { LabTest } from "../../../api/lab";

const labTest = (over: Partial<LabTest> = {}): LabTest => ({
  id: 1,
  lisId: 100,
  parentId: null,
  title: "Общий анализ крови",
  biomaterial: "Кровь",
  requiredDay: 1,
  priceStandard: "250.00",
  priceExpress: "0",
  lisGender: "",
  requiresDoctor: false,
  hasQuestions: false,
  hasPreparation: false,
  ...over,
});

const line = (over: Partial<BasketLine> = {}): BasketLine => ({
  testId: 1,
  count: 1,
  express: false,
  ...over,
});

describe("isTestVisibleForGender", () => {
  it("мужской анализ скрыт от пациентки", () => {
    expect(isTestVisibleForGender("1", "female")).toBe(false);
  });

  it("мужской анализ виден пациенту", () => {
    expect(isTestVisibleForGender("1", "male")).toBe(true);
  });

  it("женский анализ скрыт от пациента", () => {
    expect(isTestVisibleForGender("2", "male")).toBe(false);
  });

  it("женский анализ виден пациентке", () => {
    expect(isTestVisibleForGender("2", "female")).toBe(true);
  });

  it("пустой код — ограничения нет", () => {
    expect(isTestVisibleForGender("", "female")).toBe(true);
    expect(isTestVisibleForGender("", "male")).toBe(true);
  });

  it("неизвестный код трактуется как «ограничения нет»", () => {
    // Соответствие '1'/'2' полу не подтверждено ExpressLab (см. блокеры в
    // lab-intake-design.md) — спрятать доступный анализ хуже, чем показать
    // лишний. Так же поступает бэкенд в lab/validators.py.
    expect(isTestVisibleForGender("3", "female")).toBe(true);
    expect(isTestVisibleForGender("3", "male")).toBe(true);
  });

  it("пол пациента ещё не определён — ограничения нет", () => {
    // Пол дозаполняется в PatientSection и до этого момента равен "unknown".
    // Прятать половину каталога, пока карта не дозаполнена, хуже, чем
    // показать анализ, который потом окажется не по адресу.
    expect(isTestVisibleForGender("1", "unknown")).toBe(true);
    expect(isTestVisibleForGender("2", "unknown")).toBe(true);
  });
});

describe("filterAvailableTests", () => {
  it("прячет анализ не того пола", () => {
    const tests = [labTest({ id: 1, lisGender: "1", title: "ПСА" })];
    expect(filterAvailableTests(tests, [], "female", "")).toEqual([]);
  });

  it("фильтрует по названию без учёта регистра", () => {
    const tests = [
      labTest({ id: 1, title: "Общий анализ крови" }),
      labTest({ id: 2, title: "Глюкоза" }),
    ];
    expect(filterAvailableTests(tests, [], "female", "глюк")).toEqual([tests[1]]);
  });

  it("исключает уже выбранные анализы", () => {
    const tests = [labTest({ id: 1 }), labTest({ id: 2 })];
    expect(filterAvailableTests(tests, [line({ testId: 1 })], "female", "")).toEqual([tests[1]]);
  });

  it("дубль testId в selected не ломает исключение", () => {
    // Задвоение не должно возникать (см. BasketSection — «добавить» скрыт
    // для уже выбранного теста), но исключение не должно падать, если оно
    // всё же случилось, например из-за старого черновика formDraft.
    const tests = [labTest({ id: 1 }), labTest({ id: 2 })];
    const selected = [line({ testId: 1 }), line({ testId: 1, count: 2 })];
    expect(filterAvailableTests(tests, selected, "female", "")).toEqual([tests[1]]);
  });

  it("пустой запрос не фильтрует по названию", () => {
    const tests = [labTest({ id: 1 }), labTest({ id: 2, title: "Другое" })];
    expect(filterAvailableTests(tests, [], "female", "")).toEqual(tests);
  });

  it("пустой каталог даёт пустой список, а не падает", () => {
    expect(filterAvailableTests([], [], "female", "кровь")).toEqual([]);
  });
});

describe("resolveSelectedLines", () => {
  it("подставляет данные теста по testId", () => {
    const tests = [labTest({ id: 5, title: "Ферритин" })];
    const got = resolveSelectedLines(tests, [line({ testId: 5, count: 2, express: true })]);
    expect(got).toEqual([{ testId: 5, count: 2, express: true, test: tests[0] }]);
  });

  it("тест не найден в каталоге — test: null, а не падение", () => {
    // Каталог ещё не загрузился, либо строка восстановлена из черновика
    // (formDraft) для теста, которого сейчас нет в ответе API.
    const got = resolveSelectedLines([], [line({ testId: 9 })]);
    expect(got).toEqual([{ testId: 9, count: 1, express: false, test: null }]);
  });

  it("сохраняет порядок selected", () => {
    const tests = [labTest({ id: 1 }), labTest({ id: 2 })];
    const got = resolveSelectedLines(tests, [line({ testId: 2 }), line({ testId: 1 })]);
    expect(got.map((l) => l.testId)).toEqual([2, 1]);
  });
});

describe("порядок выдачи поиска", () => {
  const drugs = labTest({
    id: 1,
    title: "Т06.1 Выявление психоактивных веществ в волосах",
  });
  const cbcShort = labTest({ id: 2, title: "ОАК без лейкоформулы и СОЭ" });
  const cbcFull = labTest({ id: 3, title: "Расширенный ОАК с тромбоцитами" });

  it("совпадение в начале названия идёт раньше совпадения в середине слова", () => {
    // «психоАКтивных» содержит «оак» внутри слова — по подстроке это
    // совпадение, но пользователь, набравший «оак», ищет не его. Такая
    // строка первой в выдаче выглядит как поломанный поиск.
    const found = filterAvailableTests(
      [drugs, cbcShort, cbcFull],
      [],
      "",
      "оак",
    );

    expect(found.map((test) => test.id)).toEqual([2, 3, 1]);
  });

  it("совпадение в начале слова идёт раньше совпадения внутри слова", () => {
    const found = filterAvailableTests([drugs, cbcFull], [], "", "оак");

    expect(found[0].id).toBe(3);
  });

  it("без запроса порядок каталога не трогается", () => {
    const found = filterAvailableTests([drugs, cbcShort], [], "", "");

    expect(found.map((test) => test.id)).toEqual([1, 2]);
  });
});

describe("stepCount", () => {
  it("плюс увеличивает, минус уменьшает", () => {
    expect(stepCount(2, +1)).toBe(3);
    expect(stepCount(2, -1)).toBe(1);
  });

  it("ниже одного не опускается", () => {
    // Ноль пробирок и ноль денег за строку — это не заказ, а мусор в ЛИС;
    // убрать позицию можно только корзиной, а не досчётом до нуля.
    expect(stepCount(1, -1)).toBe(1);
  });

  it("испорченное значение из поля ввода даёт единицу", () => {
    expect(stepCount(Number.NaN, +1)).toBe(1);
    expect(stepCount(0, -1)).toBe(1);
  });
});

describe("groupCatalog", () => {
  const allergy = labTest({ id: 100, parentId: null, title: "Аллергологические исследования" });
  const ige = labTest({ id: 101, parentId: 100, title: "ИФА IgE Общий (кровь)" });
  const cat = labTest({ id: 102, parentId: 100, title: "ИФА Спец. IgE эпидермис кошки" });
  const hema = labTest({ id: 200, parentId: null, title: "Гематология" });
  const sub = labTest({ id: 201, parentId: 200, title: "Общий анализ" });
  const cbc = labTest({ id: 202, parentId: 201, title: "ОАК + тромбоцит" });
  const orphan = labTest({ id: 300, parentId: null, title: "Консультация" });

  it("узлы с детьми становятся группами, а не позициями", () => {
    // В дереве ЛИС «Аллергологические исследования» — такая же строка
    // каталога, как и анализ под ней. В плоском списке она выглядела как
    // анализ за ноль сомов, и её можно было положить в корзину.
    const groups = groupCatalog([allergy, ige, cat], "", "");

    expect(groups.map((g) => g.title)).toEqual(["Аллергологические исследования"]);
    expect(groups[0].tests.map((t) => t.id)).toEqual([101, 102]);
  });

  it("вложенные категории дают путь через разделитель", () => {
    const groups = groupCatalog([hema, sub, cbc], "", "");

    expect(groups[0].title).toBe("Гематология › Общий анализ");
    expect(groups[0].tests.map((t) => t.id)).toEqual([202]);
  });

  it("позиция без категории попадает в «Прочее»", () => {
    const groups = groupCatalog([orphan], "", "");

    expect(groups[0].title).toBe("Прочее");
    expect(groups[0].tests.map((t) => t.id)).toEqual([300]);
  });

  it("поиск оставляет только группы с совпадениями", () => {
    const groups = groupCatalog([allergy, ige, cat, hema, sub, cbc], "", "кошк");

    expect(groups.map((g) => g.title)).toEqual(["Аллергологические исследования"]);
    expect(groups[0].tests.map((t) => t.id)).toEqual([102]);
  });

  it("поиск по названию категории раскрывает всю группу", () => {
    // Регистратор ищет «аллерг» и ждёт весь раздел, а не пустоту: в
    // названиях самих анализов слова «аллергологические» нет.
    const groups = groupCatalog([allergy, ige, cat], "", "аллерг");

    expect(groups[0].tests.map((t) => t.id)).toEqual([101, 102]);
  });

  it("ветеринарный раздел помечается флагом по корню дерева", () => {
    // В каталоге ЛИС вся ветеринария живёт под одним корнем
    // «ВЕТЕРИНАРНЫЕ ИССЛЕДОВАНИЯ» (проверено по зеркалу: 79 позиций, все
    // там). Отделяем по категории, а не по словам в названии: «/кошка» и
    // «/собака» есть не у всех.
    const vetRoot = labTest({ id: 400, parentId: null, title: "ВЕТЕРИНАРНЫЕ ИССЛЕДОВАНИЯ" });
    const vetSub = labTest({ id: 401, parentId: 400, title: "ВЕТ КЛИНИКА" });
    const vetCbc = labTest({ id: 402, parentId: 401, title: "Общий анализ крови /кошка" });
    const groups = groupCatalog([allergy, ige, vetRoot, vetSub, vetCbc], "", "");

    expect(groups.find((g) => g.tests.some((t) => t.id === 402))?.veterinary).toBe(true);
    expect(groups.find((g) => g.tests.some((t) => t.id === 101))?.veterinary).toBe(false);
  });

  it("пол пациента отсекает позиции внутри групп", () => {
    const male = labTest({ id: 103, parentId: 100, title: "ПСА", lisGender: "1" });
    const groups = groupCatalog([allergy, ige, male], "female", "");

    expect(groups[0].tests.map((t) => t.id)).toEqual([101]);
  });
});
