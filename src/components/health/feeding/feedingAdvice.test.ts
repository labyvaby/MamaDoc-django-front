import { describe, expect, it } from "vitest";

import type { Allergy, FeedingPeriod, FoodGroup, FoodIntroduction, FoodReaction, FoodReactionSeverity } from "../../../api/health";
import {
  allergyFromReaction,
  allergyRisk,
  calendarAge,
  drawerAdvice,
  feedingAge,
  feedingAgeText,
  feedingBanners,
  feedingHeadline,
  feedingSnapshot,
  feedingStart,
  feedingToday,
  firstFeedingOption,
  journalItems,
  normRowStatus,
  openReactions,
  stateChipLabel,
  timelineData,
  type FeedingFacts,
} from "./feedingAdvice";
import { productByCode } from "./feedingCatalog";
import { NORM_ROWS } from "./feedingNorms";

let nextId = 1;

function food(
  givenOn: string,
  code: string,
  name: string,
  group: FoodGroup,
  reaction: FoodReaction = "none",
  severity: FoodReactionSeverity = "",
  extra: Partial<FoodIntroduction> = {},
): FoodIntroduction {
  return {
    id: nextId++,
    productCode: code,
    productName: name,
    foodGroup: group,
    givenOn,
    reaction,
    reactionSeverity: severity,
    allergy: null,
    notes: "",
    createdBy: { id: 12, fullName: "Аббасова А. А." },
    createdAt: `${givenOn}T15:40:00+06:00`,
    updatedAt: `${givenOn}T15:40:00+06:00`,
    ...extra,
  };
}

function allergy(id: number, allergen: string, extra: Partial<Allergy> = {}): Allergy {
  return {
    id,
    category: "food",
    allergen,
    reaction: "Сыпь",
    severity: "mild",
    status: "active",
    isConfirmed: false,
    notedOn: null,
    notes: "",
    createdAt: "2026-10-04T10:00:00+06:00",
    updatedAt: "2026-10-04T10:00:00+06:00",
    createdBy: null,
    updatedBy: null,
    ...extra,
  };
}

const TODAY = "2026-10-04";

/** Девочка 7233 из §9: родилась 26.03.2025, 39 недель, 3250 г; 30 отметок, реакция на желток. */
const GIRL_BIRTH = "2025-03-26";
const YOLK = food("2025-10-28", "egg_yolk", "Желток", "egg", "rash", "mild", {
  notes: "¼ желтка. Сыпь на щеках через 2 ч, прошла за 2 дня; желток отменили",
});
const GIRL_FOODS: FoodIntroduction[] = [
  food("2025-09-26", "zucchini", "Кабачок", "vegetables"),
  food("2025-09-29", "cauliflower", "Цветная капуста", "vegetables"),
  food("2025-10-02", "broccoli", "Брокколи", "vegetables"),
  food("2025-10-05", "vegetable_oil", "Растительное масло", "other"),
  food("2025-10-08", "buckwheat", "Гречневая каша", "cereals"),
  food("2025-10-11", "rice", "Рисовая каша", "cereals"),
  food("2025-10-14", "turkey", "Индейка", "meat"),
  food("2025-10-17", "butter", "Сливочное масло", "other"),
  food("2025-10-20", "rabbit", "Кролик", "meat"),
  food("2025-10-23", "corn", "Кукурузная каша", "cereals"),
  YOLK,
  food("2025-11-04", "apple", "Яблоко", "fruits"),
  food("2025-11-08", "pumpkin", "Тыква", "vegetables"),
  food("2025-11-12", "pear", "Груша", "fruits"),
  food("2025-11-16", "beef", "Говядина", "meat"),
  food("2025-11-20", "oat", "Овсяная каша", "cereals"),
  food("2025-11-24", "carrot", "Морковь", "vegetables"),
  food("2025-11-28", "cottage_cheese", "Творог", "dairy"),
  food("2025-12-02", "kefir", "Кефир", "dairy"),
  food("2025-12-06", "cod", "Треска", "fish"),
  food("2025-12-10", "bread", "Хлеб, сухари", "other"),
  food("2025-12-30", "lentils", "Чечевица", "other"),
  food("2026-01-08", "hake", "Хек", "fish"),
  food("2026-01-20", "banana", "Банан", "fruits"),
  food("2026-02-05", "yogurt", "Йогурт без сахара", "dairy"),
  food("2026-03-03", "beetroot", "Свёкла", "vegetables"),
  food("2026-03-30", "whole_milk", "Цельное молоко напитком", "dairy"),
  food("2026-04-20", "chicken", "Курица", "meat"),
  food("2026-05-25", "mung", "Маш", "other"),
  food("2026-07-15", "apricot", "Абрикос (урюк)", "fruits"),
];

const period = (id: number, feedingType: FeedingPeriod["feedingType"], startedOn: string, switchReason: FeedingPeriod["switchReason"] = ""): FeedingPeriod => ({
  id,
  feedingType,
  startedOn,
  switchReason,
  notes: "",
  createdBy: null,
  createdAt: "",
  updatedAt: "",
});

const GIRL_FEEDING = [period(1, "breast", GIRL_BIRTH), period(2, "mixed", "2025-07-15", "hypogalactia"), period(3, "general", "2026-03-26")];

const girl = (patch: Partial<FeedingFacts> = {}): FeedingFacts => ({
  birthDate: GIRL_BIRTH,
  gestation: { weeks: 39, days: 0 },
  foods: GIRL_FOODS,
  allergies: [],
  risk: false,
  ...patch,
});

/** Второй ребёнок из §9: 8 мес, грудное, прикорм без реакций с 04.08.2026. */
const BABY_BIRTH = "2026-02-04";
const BABY_FOODS: FoodIntroduction[] = [
  food("2026-08-04", "zucchini", "Кабачок", "vegetables"),
  food("2026-08-08", "buckwheat", "Гречневая каша", "cereals"),
  food("2026-08-12", "cauliflower", "Цветная капуста", "vegetables"),
  food("2026-08-16", "turkey", "Индейка", "meat"),
  food("2026-08-20", "broccoli", "Брокколи", "vegetables"),
  food("2026-08-24", "vegetable_oil", "Растительное масло", "other"),
  food("2026-08-28", "rice", "Рисовая каша", "cereals"),
  food("2026-09-04", "egg_yolk", "Желток", "egg"),
  food("2026-09-08", "apple", "Яблоко", "fruits"),
  food("2026-09-12", "rabbit", "Кролик", "meat"),
  food("2026-09-16", "butter", "Сливочное масло", "other"),
  food("2026-09-20", "pear", "Груша", "fruits"),
  food("2026-09-28", "corn", "Кукурузная каша", "cereals"),
];
const baby = (patch: Partial<FeedingFacts> = {}): FeedingFacts => ({
  birthDate: BABY_BIRTH,
  gestation: { weeks: 40, days: 0 },
  foods: BABY_FOODS,
  allergies: [],
  risk: false,
  ...patch,
});

const today = (facts: FeedingFacts, extra: Partial<Parameters<typeof feedingToday>[0]> = {}) =>
  feedingToday({ facts, start: feedingStart(null, facts.foods)?.on ?? null, birthWeightKg: 3.2, bmiVerdict: "", today: TODAY, ...extra });

const status = (facts: FeedingFacts, code: string, on = TODAY) => feedingSnapshot(facts, on).state(productByCode(code)!).status;

describe("age", () => {
  it("counts calendar months and days", () => {
    expect(calendarAge(GIRL_BIRTH, "2025-10-28")).toMatchObject({ months: 7, days: 2 });
    expect(calendarAge("2026-02-04", "2026-08-04")).toMatchObject({ months: 6, days: 0 });
    expect(calendarAge("2026-02-04", "2026-10-04")?.months).toBe(8);
    expect(calendarAge("2026-02-04", "2026-01-04")).toBeNull();
  });

  it("shows both ages for a premature baby under 2 years", () => {
    const age = feedingAge("2026-03-01", "2026-10-04", { weeks: 34, days: 0 })!;
    expect(age.months).toBe(7);
    expect(age.weeksShort).toBe(6);
    expect(age.corrected?.months).toBe(5);
    expect(feedingAgeText(age, false)).toBe("7 мес · скорр. 5 мес");
    expect(feedingAge("2023-03-01", "2026-10-04", { weeks: 34, days: 0 })?.corrected).toBeNull();
    expect(feedingAge("2026-03-01", "2026-10-04", { weeks: 39, days: 0 })?.corrected).toBeNull();
  });
});

describe("product status", () => {
  it("marks introduced, postponed and postponed by a shared allergen", () => {
    expect(status(girl(), "zucchini")).toBe("introduced");
    expect(stateChipLabel(feedingSnapshot(girl(), TODAY).state(productByCode("zucchini")!))).toBe("введён 26.09");
    expect(status(girl(), "egg_yolk")).toBe("postponed");
    expect(status(girl(), "egg_whole")).toBe("postponed"); // реакция на желток откладывает целое яйцо
    expect(status(girl(), "quail_egg")).toBe("allowed"); // другой аллерген
    // Повтор без реакции — снова «введён».
    const again = girl({ foods: [...GIRL_FOODS, food("2026-09-01", "egg_yolk", "Желток", "egg")] });
    expect(status(again, "egg_yolk")).toBe("introduced");
  });

  it("closes products by an active allergy — by name and by link", () => {
    const byName = girl({ allergies: [allergy(57, "куриное яйцо")] });
    expect(status(byName, "egg_yolk")).toBe("allergy");
    expect(status(byName, "egg_whole")).toBe("allergy");
    const linked = girl({
      foods: GIRL_FOODS.map((item) =>
        item.productCode === "cottage_cheese" ? { ...item, allergy: { id: 61, allergen: "Творог (переписан)", status: "active" as const } } : item,
      ),
    });
    expect(status(linked, "cottage_cheese")).toBe("allergy");
    const resolved = girl({ allergies: [allergy(57, "Куриное яйцо", { status: "resolved" })] });
    expect(status(resolved, "egg_yolk")).toBe("postponed");
  });

  it("knows «не давать», «врач», «можно» and «рано»", () => {
    expect(status(baby(), "honey")).toBe("forbidden");
    expect(stateChipLabel(feedingSnapshot(baby(), TODAY).state(productByCode("honey")!))).toBe("не давать до 12 мес");
    expect(status(baby(), "kymyz")).toBe("forbidden");
    expect(status(baby({ risk: true }), "cod")).toBe("doctor");
    expect(status(baby({ risk: true }), "citrus")).toBe("doctor");
    expect(status(baby(), "cod")).toBe("allowed");
    expect(status(baby(), "lentils")).toBe("early");
    expect(stateChipLabel(feedingSnapshot(baby(), TODAY).state(productByCode("lentils")!))).toBe("с 9 мес");
    expect(status(baby(), "cod", "2026-09-10")).toBe("early"); // в 7 мес — рано
  });

  it("opens talkan only after a gluten cereal and gluten cereals after a gluten-free one", () => {
    expect(status(baby(), "talkan")).toBe("early");
    expect(stateChipLabel(feedingSnapshot(baby(), TODAY).state(productByCode("talkan")!))).toBe("после каши с глютеном");
    const withWheat = baby({ foods: [...BABY_FOODS, food("2026-10-01", "wheat", "Пшеничная каша", "cereals")] });
    expect(status(withWheat, "talkan")).toBe("allowed");
    const onlyVeg = baby({ foods: BABY_FOODS.filter((item) => item.foodGroup !== "cereals") });
    expect(status(onlyVeg, "wheat")).toBe("early");
    expect(status(baby(), "wheat")).toBe("allowed");
  });

  it("gives norm rows their status", () => {
    const snapshot = feedingSnapshot(baby(), TODAY);
    const row = (key: string) => normRowStatus(NORM_ROWS.find((item) => item.key === key)!, snapshot);
    expect(row("vegetables")).toBe("introduced");
    expect(row("cottage")).toBe("allowed");
    expect(row("fish")).toBe("allowed");
    expect(row("yolk")).toBe("introduced");
    expect(normRowStatus(NORM_ROWS.find((item) => item.key === "yolk")!, feedingSnapshot(girl(), TODAY))).toBe("postponed");
    // В группе риска «врач» у цитрусовых («Н») не делает «врачом» всё фруктовое пюре.
    const young = feedingSnapshot({ ...baby(), birthDate: "2026-05-20", foods: [], risk: true }, TODAY);
    expect(normRowStatus(NORM_ROWS.find((item) => item.key === "fruits")!, young)).toBe("early");
    expect(normRowStatus(NORM_ROWS.find((item) => item.key === "fish")!, young)).toBe("doctor");
  });
});

describe("allergy risk", () => {
  const none = { riskGroups: [], allergies: [], conditions: [], family: [] };
  it("finds the reasons of §3.7", () => {
    expect(allergyRisk(none)).toEqual({ atRisk: false, reasons: [] });
    expect(allergyRisk({ ...none, riskGroups: ["allergic"] }).reasons).toEqual(["группа риска «Аллергия»"]);
    expect(allergyRisk({ ...none, allergies: [allergy(1, "Куриное яйцо")] }).reasons).toEqual(["аллергия на куриное яйцо"]);
    expect(allergyRisk({ ...none, allergies: [allergy(1, "Рыба")] }).reasons).toEqual(["аллергия на рыбу"]);
    expect(allergyRisk({ ...none, allergies: [allergy(1, "Амоксициллин", { category: "drug" })] }).atRisk).toBe(false);
    expect(allergyRisk({ ...none, allergies: [allergy(1, "Куриное яйцо", { status: "refuted" })] }).atRisk).toBe(false);
    const dermatitis = { diagnosisCode: "L20.8", title: "Атопический дерматит", status: "remission" as const };
    expect(allergyRisk({ ...none, conditions: [dermatitis] }).reasons).toEqual(["атопический дерматит"]);
    expect(allergyRisk({ ...none, conditions: [{ ...dermatitis, status: "resolved" }] }).atRisk).toBe(false);
    expect(allergyRisk({ ...none, conditions: [{ diagnosisCode: "J06.9", title: "ОРВИ", status: "active" }] }).atRisk).toBe(false);
    const family = [
      { relation: "mother" as const, conditions: "Гипертоническая болезнь; Аллергия" },
      { relation: "father" as const, conditions: "Бронхиальная астма" },
      { relation: "other" as const, conditions: "Аллергия" },
      { relation: "sibling" as const, conditions: "Здоров(а)" },
    ];
    expect(allergyRisk({ ...none, family }).reasons).toEqual(["мама: аллергия", "папа: бронхиальная астма"]);
  });
});

describe("«Сегодня»", () => {
  it("is early before 4 months and a window at 4–5 months", () => {
    const young = { ...baby(), birthDate: "2026-07-01", foods: [] };
    const early = today(young);
    expect(early.kind).toBe("early");
    expect(early.text).toBe("Прикорм пока рано. Цель — около 6 мес (с 01.01.2027). До 6 мес — только грудное молоко или смесь (ВОЗ, МЗ КР)");
    const window = today({ ...young, birthDate: "2026-05-20" });
    expect(window.kind).toBe("window");
    expect(window.readiness).toBe(true);
  });

  it("starts at 6 months with zucchini", () => {
    const six = today({ ...baby(), birthDate: "2026-04-01", foods: [] });
    expect(six.kind).toBe("suggest");
    expect(six.main?.product.code).toBe("zucchini");
    expect(six.main?.dose).toBe("Начать с ½ ч. л., за 5–7 дней довести до 150 г в день");
    expect(six.more.map((item) => item.product.code)).toEqual(["buckwheat", "turkey"]);
  });

  it("pauses 3 days after a new product and 7 in the risk group", () => {
    const fresh = baby({ foods: [...BABY_FOODS, food("2026-10-03", "cottage_cheese", "Творог", "dairy")] });
    expect(today(fresh).text).toBe("Пауза до 06.10: «Творог» с 03.10 — продолжайте этот продукт, доводя до нормы");
    expect(today({ ...fresh, foods: [...BABY_FOODS, food("2026-10-01", "cottage_cheese", "Творог", "dairy")] }).kind).toBe("suggest");
    const risky = baby({ risk: true, foods: [...BABY_FOODS, food("2026-09-30", "horse", "Конина", "meat")] });
    expect(today(risky).text).toBe("Пауза до 07.10: «Конина» с 30.09 — продолжайте этот продукт, доводя до нормы");
  });

  it("pauses after a reaction", () => {
    const reacted = baby({ foods: [...BABY_FOODS, food("2026-10-02", "cottage_cheese", "Творог", "dairy", "rash", "mild")] });
    expect(today(reacted).text).toBe("Пауза: реакция на «Творог» 02.10. Новое не вводить, пока реакция не прошла; показать врачу");
  });

  it("suggests cottage cheese at 8 months as in the demo", () => {
    const plan = today(baby());
    expect(plan.text).toBe("Можно ввести: творог");
    expect(plan.detail).toBe("Начать с ½ ч. л., за 5–7 дней довести до 10–40 г в день");
    expect(plan.more.map((item) => item.name)).toEqual(["треска", "хлеб"]);
  });

  it("puts meat first at 7 months without meat, fish or egg", () => {
    const sevenNoMeat = baby({
      birthDate: "2026-03-01",
      foods: [
        food("2026-09-01", "zucchini", "Кабачок", "vegetables"),
        food("2026-09-05", "buckwheat", "Гречневая каша", "cereals"),
        food("2026-09-09", "cauliflower", "Цветная капуста", "vegetables"),
      ],
    });
    expect(today(sevenNoMeat).main?.product.code).toBe("turkey");
    // Прикорма нет вовсе: первым — кабачок, мясо — следом.
    const notStarted = today(baby({ birthDate: "2026-03-01", foods: [] }));
    expect(notStarted.main?.product.code).toBe("zucchini");
    expect(notStarted.more.map((item) => item.product.code)).toContain("turkey");
  });

  it("does not offer dairy with a cow's milk protein allergy", () => {
    const plan = today(baby({ allergies: [allergy(1, "Белок коровьего молока")], risk: true }));
    const suggested = [plan.main, ...plan.more].map((item) => item?.product.group);
    expect(suggested).not.toContain("dairy");
  });

  it("offers low-allergen products first in the risk group, without egg and fish", () => {
    const start = baby({ birthDate: "2026-04-01", foods: [], risk: true });
    const plan = today(start);
    expect(plan.main?.product.code).toBe("zucchini");
    const older = today(baby({ risk: true }));
    const codes = [older.main, ...older.more].map((item) => item?.product.code);
    expect(codes).not.toContain("cod");
    expect(codes).not.toContain("egg_yolk");
    // 7 мес без мяса, в группе риска: сначала мясо (М), затем фрукт (М).
    const meat = today(
      baby({
        risk: true,
        birthDate: "2026-03-01",
        foods: [food("2026-09-01", "zucchini", "Кабачок", "vegetables"), food("2026-09-10", "buckwheat", "Гречневая каша", "cereals")],
      }),
    );
    const picked = [meat.main, ...meat.more].map((item) => item?.product);
    expect(picked.map((product) => product?.code)).toEqual(["turkey", "vegetable_oil", "butter"]);
    const fruit = today(
      baby({
        risk: true,
        birthDate: "2026-03-01",
        foods: [
          food("2026-09-01", "zucchini", "Кабачок", "vegetables"),
          food("2026-09-08", "buckwheat", "Гречневая каша", "cereals"),
          food("2026-09-15", "turkey", "Индейка", "meat"),
          food("2026-09-22", "vegetable_oil", "Растительное масло", "other"),
        ],
      }),
    );
    expect([fruit.main, ...fruit.more].map((item) => item?.product.code)).toEqual(["butter", "apple", "cauliflower"]);
    expect([fruit.main, ...fruit.more].every((item) => item?.product.lowAllergen || item?.product.group === "other")).toBe(true);
  });

  it("turns to variety after all steps — the girl of §9", () => {
    const plan = today(girl());
    expect(plan.text).toBe("Можно ввести: минтай");
    expect(plan.detail).toBe("Начать с малого, 2–3 раза в неделю (РФ)");
    expect(plan.more.map((item) => item.name)).toEqual(["пшеничная каша", "конина"]);
    // После «Записать как аллергию»: риск аллергии, яйцо закрыто, рыба — врач.
    const after = today(girl({ allergies: [allergy(57, "Куриное яйцо")], risk: true }));
    expect(after.text).toBe("Можно ввести: пшеничная каша");
    expect(after.more.map((item) => item.name)).toEqual(["конина", "слива"]);
  });

  it("adds hints for premature, low birth weight, BMI and hemoglobin", () => {
    const premature = today({ ...baby(), birthDate: "2026-03-01", gestation: { weeks: 34, days: 0 }, foods: [] }, { birthWeightKg: 1.4 });
    expect(premature.hints.some((hint) => hint.startsWith("Недоношенный"))).toBe(true);
    expect(premature.hints.some((hint) => hint.includes("меньше 1500 г"))).toBe(true);
    expect(premature.hints.some((hint) => hint.startsWith("МЗ КР (2023)"))).toBe(true);
    expect(today(baby(), { bmiVerdict: "дефицит массы" }).hints[0]).toContain("Плохая прибавка");
    expect(today(baby(), { bmiVerdict: "ожирение" }).hints[0]).toContain("Избыток массы");
    expect(today({ ...baby(), birthDate: "2026-04-01", foods: [] }).hints.some((hint) => hint.startsWith("Гемоглобин"))).toBe(true);
  });
});

describe("banners", () => {
  const banners = (facts: FeedingFacts, extra: Partial<Parameters<typeof feedingBanners>[0]> = {}) =>
    feedingBanners({
      facts,
      start: feedingStart(null, facts.foods)?.on ?? null,
      feedingType: "breast",
      riskReasons: [],
      today: TODAY,
      ...extra,
    });

  it("shows the open reaction of the girl", () => {
    const list = banners(girl(), { start: "2025-09-26", feedingType: "general" });
    expect(list.map((item) => item.key)).toEqual([`reaction-${YOLK.id}`]);
    expect(list[0]).toMatchObject({
      tone: "error",
      title: "Желток 28.10.2025: сыпь, лёгкая",
      text: "Повторно — только после осмотра. В аллергиях записи нет",
    });
    const recorded = girl({ foods: GIRL_FOODS.map((item) => (item === YOLK ? { ...item, allergy: { id: 57, allergen: "Куриное яйцо", status: "active" as const } } : item)) });
    expect(openReactions(recorded, TODAY)).toHaveLength(0);
    expect(openReactions(girl({ allergies: [allergy(57, "Куриное яйцо")] }), TODAY)).toHaveLength(0);
    expect(openReactions(girl({ foods: [...GIRL_FOODS, food("2026-09-01", "egg_yolk", "Желток", "egg")] }), TODAY)).toHaveLength(0);
  });

  it("warns about an early start until 1 year (п. 1)", () => {
    const early = baby({ foods: [food("2026-05-20", "zucchini", "Кабачок", "vegetables")] });
    expect(banners(early)[0]).toMatchObject({ key: "earlyStart", tone: "error" });
    expect(banners({ ...early, birthDate: "2025-08-01", foods: [food("2025-11-20", "zucchini", "Кабачок", "vegetables")] }).map((b) => b.key)).not.toContain("earlyStart");
  });

  it("warns when there is no complementary feeding (п. 2), softer for premature", () => {
    const six = baby({ birthDate: "2026-03-20", foods: [] });
    expect(banners(six)[0]).toMatchObject({ key: "noStart", tone: "warning" });
    const seven = baby({ birthDate: "2026-03-01", foods: [] });
    expect(banners(seven)[0]).toMatchObject({ key: "noStart", tone: "error" });
    const premature7 = { ...seven, gestation: { weeks: 34, days: 0 } };
    expect(banners(premature7)[0]).toMatchObject({ key: "noStart", tone: "warning" });
    const premature8 = { ...premature7, birthDate: "2026-02-01" };
    expect(banners(premature8)[0]).toMatchObject({ key: "noStart", tone: "error" });
    expect(banners(seven, { feedingType: "general" })).toHaveLength(0);
  });

  it("warns about iron from 7 months (п. 3) and shows the risk (п. 11)", () => {
    const noIron = baby({ foods: BABY_FOODS.filter((item) => !["meat", "egg"].includes(item.foodGroup)) });
    expect(banners(noIron).map((item) => item.key)).toEqual(["iron"]);
    expect(banners(baby())).toHaveLength(0);
    const risk = banners(baby({ risk: true }), { riskReasons: ["мама: аллергия"] });
    expect(risk.at(-1)).toMatchObject({ key: "risk", tone: "info", title: "Риск аллергии: мама: аллергия" });
  });
});

describe("drawer advice", () => {
  const advise = (facts: FeedingFacts, code: string, patch: Partial<Parameters<typeof drawerAdvice>[0]> = {}) =>
    drawerAdvice({
      facts,
      start: feedingStart(null, facts.foods)?.on ?? null,
      product: productByCode(code),
      custom: null,
      givenOn: TODAY,
      reaction: "none",
      severity: "",
      notes: "",
      editingId: null,
      allergyLinked: false,
      ...patch,
    });
  const keys = (advice: ReturnType<typeof drawerAdvice>) => advice.warnings.map((item) => item.key);

  it("warns on a repeat after a reaction (п. 5) and on an allergy", () => {
    const plain = advise(girl(), "egg_yolk");
    expect(plain.warnings[0]).toMatchObject({ key: "repeat", tone: "error" });
    expect(plain.warnings[0].text).toBe("Была реакция 28.10.2025 (сыпь, лёгкая) — повторно только по решению врача");
    const recorded = advise(girl({ allergies: [allergy(57, "Куриное яйцо")], risk: true }), "egg_yolk");
    expect(keys(recorded).slice(0, 2)).toEqual(["allergy", "repeat"]);
    expect(recorded.warnings[0].text).toBe("В аллергиях: Куриное яйцо — давать только по решению врача");
  });

  it("warns about a new product too soon (п. 6)", () => {
    const facts = girl({ foods: [...GIRL_FOODS, food(TODAY, "wheat", "Пшеничная каша", "cereals")], risk: true });
    const next = advise(facts, "horse");
    expect(next.warnings.find((item) => item.key === "interval")?.text).toBe("Новый продукт раньше чем через 7 дней после «Пшеничная каша» (04.10)");
    expect(keys(advise(girl({ foods: [...GIRL_FOODS, food("2026-10-02", "wheat", "Пшеничная каша", "cereals")] }), "horse"))).toContain("interval");
    expect(keys(advise(girl({ foods: [...GIRL_FOODS, food("2026-09-30", "wheat", "Пшеничная каша", "cereals")] }), "horse"))).not.toContain("interval");
  });

  it("warns on «не давать» (п. 8) and on age", () => {
    expect(advise(baby(), "kymyz").warnings[0]).toEqual({ key: "forbidden", tone: "error", text: "Кымыз — детям раннего возраста не давать" });
    expect(keys(advise(baby(), "honey"))).toContain("forbidden");
    const young = { ...baby(), birthDate: "2026-07-01", foods: [] };
    expect(keys(advise(young, "zucchini"))).toContain("early");
    const five = { ...baby(), birthDate: "2026-05-01", foods: [] };
    expect(keys(advise(five, "zucchini"))).toContain("before6");
    expect(keys(advise(baby(), "cod", { givenOn: "2026-09-10" }))).toContain("term");
    expect(advise(baby(), "cod", { givenOn: "2026-09-10" }).warnings.find((item) => item.key === "term")?.text).toBe(
      "По умолчанию — с 8 мес (РФ; ВОЗ и NHS — с 6 мес)",
    );
  });

  it("asks to record a reaction and calls for a doctor on a severe one", () => {
    const rash = advise(baby(), "cottage_cheese", { reaction: "rash", severity: "mild" });
    expect(rash.offerAllergy).toBe(true);
    expect(rash.allergen).toBe("Белок коровьего молока");
    expect(keys(rash)).not.toContain("urgent");
    expect(keys(advise(baby(), "cottage_cheese", { reaction: "other", severity: "severe", notes: "свистящее дыхание" }))).toContain("urgent");
    expect(advise(baby(), "cottage_cheese", { reaction: "rash", severity: "mild", allergyLinked: true }).offerAllergy).toBe(false);
    expect(advise(girl({ allergies: [allergy(57, "Куриное яйцо")] }), "egg_yolk", { reaction: "rash", severity: "mild" }).offerAllergy).toBe(false);
  });

  it("offers to set or fix the first feeding date", () => {
    expect(firstFeedingOption({ profileDate: null, foods: [], givenOn: TODAY, product: productByCode("zucchini"), editingId: null })).toEqual({
      kind: "set",
      defaultOn: true,
    });
    expect(firstFeedingOption({ profileDate: null, foods: [], givenOn: TODAY, product: productByCode("milk_in_dishes"), editingId: null })).toEqual({
      kind: "set",
      defaultOn: false,
    });
    expect(firstFeedingOption({ profileDate: null, foods: BABY_FOODS, givenOn: TODAY, product: productByCode("cod"), editingId: null })).toBeNull();
    expect(firstFeedingOption({ profileDate: "2026-08-04", foods: BABY_FOODS, givenOn: "2026-08-01", product: productByCode("cod"), editingId: null })).toEqual({
      kind: "fix",
      defaultOn: false,
    });
  });
});

describe("allergy window from a reaction", () => {
  it("fills the allergy as in §3.7", () => {
    expect(allergyFromReaction(YOLK)).toEqual({
      category: "food",
      allergen: "Куриное яйцо",
      reaction: "Сыпь",
      severity: "mild",
      status: "active",
      isConfirmed: false,
      notedOn: "2025-10-28",
      notes: "По журналу прикорма: желток, 28.10.2025",
    });
    const other = food("2026-01-01", "", "Утка", "meat", "other", "severe", { notes: "свистящее дыхание" });
    expect(allergyFromReaction(other)).toMatchObject({ allergen: "Утка", reaction: "свистящее дыхание", severity: "severe" });
    expect(allergyFromReaction(food("2026-01-01", "kefir", "Кефир", "dairy", "stool", "moderate")).reaction).toBe("Нарушение стула");
  });
});

describe("headline and journal", () => {
  it("summarises the girl", () => {
    expect(feedingHeadline({ birthDate: GIRL_BIRTH, start: "2025-09-26", foods: GIRL_FOODS, feeding: GIRL_FEEDING, today: TODAY })).toBe(
      "Прикорм с 26.09.2025 в 6 мес · 30 продуктов, групп 8 из 8 · сейчас общий стол",
    );
  });

  it("orders the journal newest first and marks repeats", () => {
    const again = food("2026-09-01", "egg_yolk", "Желток", "egg");
    const items = journalItems([...GIRL_FOODS, again]);
    expect(items[0].food).toBe(again);
    expect(items[0].repeat).toBe(true);
    expect(items.find((item) => item.food === YOLK)?.canRepeat).toBe(false);
    expect(journalItems(GIRL_FOODS).find((item) => item.food === YOLK)?.canRepeat).toBe(true);
  });
});

describe("timeline data", () => {
  const data = (facts: FeedingFacts, main = null as ReturnType<typeof productByCode>, width = 900) =>
    timelineData({ facts, start: feedingStart(null, facts.foods)?.on ?? null, feeding: GIRL_FEEDING, today: TODAY, main, width })!;

  it("builds the axis from 4 months to today + 1", () => {
    const line = data(girl());
    expect(line.from).toBe(4);
    expect(line.to).toBeCloseTo(calendarAge(GIRL_BIRTH, TODAY)!.exact + 1, 5);
    const labels = line.ticks.map((tick) => tick.label).filter(Boolean);
    expect(labels).toContain("1 год");
    expect(line.ticks.some((tick) => Math.abs(tick.x - line.x0) < 1)).toBe(true);
    // После года — через 3 мес.: 15, 18.
    expect(line.ticks.length).toBe(9 + 2);
    expect(line.rows.map((row) => row.label)).toEqual(["Овощи", "Каши", "Мясо", "Фрукты", "Яйцо", "Молочные", "Рыба", "Прочее"]);
    const early = data({ ...baby(), foods: [food("2026-05-20", "zucchini", "Кабачок", "vegetables")] });
    expect(early.from).toBe(3);
    expect(early.markers.find((marker) => marker.tone === "bad")?.label).toBe("начат в 3 мес 16 дн.");
  });

  it("labels points without overlaps, red for a reaction, repeats as small dots", () => {
    const line = data(girl({ foods: [...GIRL_FOODS, food("2026-09-01", "egg_yolk", "Желток", "egg")] }), productByCode("pollock"));
    const egg = line.rows.find((row) => row.group === "egg")!;
    expect(egg.texts.find((text) => text.tone === "bad")?.text).toBe("желток · сыпь");
    expect(egg.points.filter((point) => point.repeat)).toHaveLength(1);
    expect(egg.links).toHaveLength(1);
    for (const row of line.rows) {
      const shown = row.texts.length;
      const all = row.points.filter((point) => !point.repeat).length;
      expect(shown + row.hidden.length).toBeGreaterThanOrEqual(all);
      // Подписи одного яруса не налезают друг на друга.
      const lanes = new Map<number, Array<[number, number]>>();
      for (const text of row.texts) {
        const w = text.text.length * 10.5 * (text.bold ? 0.6 : 0.56);
        const list = lanes.get(text.y) ?? [];
        for (const [a, b] of list) expect(text.x >= b || text.x + w <= a).toBe(true);
        list.push([text.x, text.x + w]);
        lanes.set(text.y, list);
      }
    }
    const fish = line.rows.find((row) => row.group === "fish")!;
    expect(fish.next).toMatchObject({ strong: true });
    expect(fish.texts.some((text) => text.text === "минтай")).toBe(true);
    expect(line.band?.parts.map((part) => part.type)).toEqual(["mixed", "general"]);
  });

  it("marks the next groups and the allergy", () => {
    const line = data(baby(), productByCode("cottage_cheese"));
    const dairy = line.rows.find((row) => row.group === "dairy")!;
    expect(dairy.next?.strong).toBe(true);
    expect(dairy.texts.some((text) => text.text === "можно с 8 мес: творог, кефир")).toBe(true);
    expect(line.rows.find((row) => row.group === "fish")!.texts.some((text) => text.text === "можно с 8 мес: треска, хек")).toBe(true);
    const allergic = data(girl({ allergies: [allergy(57, "Куриное яйцо")], risk: true }));
    const egg = allergic.rows.find((row) => row.group === "egg")!;
    expect(egg.texts.some((text) => text.text === "аллергия: куриное яйцо")).toBe(true);
    expect(egg.doctor).not.toBeNull();
    expect(allergic.rows.find((row) => row.group === "meat")!.doctor).toBeNull();
    expect(data(baby({ gestation: { weeks: 34, days: 0 } })).note?.text).toBe("скорр. возраст на 6 нед меньше");
  });
});
