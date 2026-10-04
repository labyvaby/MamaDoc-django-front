import dayjs, { type Dayjs } from "dayjs";

import type {
  Allergy,
  AllergyInput,
  AllergySeverity,
  Condition,
  FamilyMember,
  FamilyRelation,
  FeedingPeriod,
  FeedingType,
  FoodGroup,
  FoodIntroduction,
  FoodReaction,
  FoodReactionSeverity,
  RiskGroup,
} from "../../../api/health";
import type { Gestation } from "../../../pages/patient-program/growth/growthData";
import { pluralRu } from "../../../utility/amountInWords";
import { FEEDING_SWITCH_REASONS, FEEDING_TYPES, optionLabel } from "../healthMeta";
import {
  CONDITION_TEXT,
  FOOD_GROUPS,
  FOOD_PRODUCTS,
  FOOD_REACTIONS,
  FOOD_SEVERITIES,
  REACTION_ALLERGY_TEXT,
  groupInfo,
  isSuggestible,
  normText,
  productAllergen,
  productByCode,
  productByName,
  productShort,
  productsOfGroup,
  type FoodProduct,
} from "./feedingCatalog";
import { normAmount, normColumn, normRowOf, type NormRow } from "./feedingNorms";

/**
 * Подсказки прикорма (ТЗ 2026-10-04-book-feeding §3): возраст, статусы
 * продуктов, риск аллергии, «Сегодня», предупреждения, данные ленты и
 * заполнение окна аллергии. Только чистые функции: «сегодня» передаётся
 * параметром, тексты собираются здесь — их проверяют тесты.
 */

const ISO = "YYYY-MM-DD";
const DAYS_PER_MONTH = 30.4375;

export const formatDay = (value: string | Dayjs): string => dayjs(value).format("DD.MM.YYYY");
const formatShortDay = (value: string | Dayjs): string => dayjs(value).format("DD.MM");
export const isoDay = (value: Dayjs): string => value.format(ISO);

// ── Возраст (§3.1) ──────────────────────────────────────────────────────────

export interface AgeParts {
  /** Полных календарных месяцев. */
  months: number;
  /** Дней сверх полных месяцев. */
  days: number;
  /** Месяцы с долей месяца — для оси ленты. */
  exact: number;
}

/**
 * Календарный возраст: «7 мес 2 дн.» — как говорят родители и как считает
 * `ageLabel` медпрофиля. Делить дни на 30,4375 нельзя: в день 6-месячного
 * дня рождения ребёнок вышел бы «5 мес».
 */
export function calendarAge(from: string | Dayjs, to: string | Dayjs): AgeParts | null {
  const start = dayjs(from).startOf("day");
  const end = dayjs(to).startOf("day");
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return null;
  const months = end.diff(start, "month");
  const base = start.add(months, "month");
  const days = Math.max(0, end.diff(base, "day"));
  const span = Math.max(1, start.add(months + 1, "month").diff(base, "day"));
  return { months, days, exact: months + days / span };
}

export interface FeedingAge extends AgeParts {
  /** Скорригированный возраст недоношенного до 2 лет; иначе null. */
  corrected: AgeParts | null;
  /** На сколько недель скорригированный возраст меньше паспортного. */
  weeksShort: number | null;
}

/** Сколько дней не доношен до 40 недель; доношенный (от 37 нед.) — null. */
export function prematureDays(gestation: Gestation | null | undefined): number | null {
  if (gestation?.weeks == null || gestation.weeks >= 37) return null;
  return 280 - (gestation.weeks * 7 + (gestation.days ?? 0));
}

/** Паспортный возраст на дату и — у недоношенного до 2 лет — скорригированный. */
export function feedingAge(
  birthDate: string | null | undefined,
  on: string | Dayjs,
  gestation?: Gestation | null,
): FeedingAge | null {
  if (!birthDate) return null;
  const age = calendarAge(birthDate, on);
  if (!age) return null;
  const short = prematureDays(gestation);
  if (short == null || age.months >= 24) return { ...age, corrected: null, weeksShort: null };
  const due = dayjs(birthDate).add(short, "day");
  const corrected = calendarAge(due, on) ?? {
    months: 0,
    days: 0,
    exact: -due.diff(dayjs(on).startOf("day"), "day") / DAYS_PER_MONTH,
  };
  return { ...age, corrected, weeksShort: Math.round(short / 7) };
}

/** «7 мес 2 дн.», «6 мес», «12 дн.», «1 год 3 мес». */
export function ageText(age: Pick<AgeParts, "months" | "days">, withDays = true): string {
  const { months, days } = age;
  if (months < 12) {
    if (months <= 0) return `${Math.max(0, days)} дн.`;
    return withDays && days ? `${months} мес ${days} дн.` : `${months} мес`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearsText = `${years} ${pluralRu(years, ["год", "года", "лет"])}`;
  return rest ? `${yearsText} ${rest} мес` : yearsText;
}

/** «7 мес 2 дн. · скорр. 5 мес» — у недоношенного оба возраста. */
export function feedingAgeText(age: FeedingAge, withDays = true): string {
  const main = ageText(age, withDays);
  return age.corrected ? `${main} · скорр. ${ageText(age.corrected, false)}` : main;
}

/** «12 мес», «2 лет» — для «с …» и «до …». */
export function monthsWord(months: number): string {
  return months >= 24 && months % 12 === 0 ? `${months / 12} лет` : `${months} мес`;
}

/** Прикорм «рано» (§3.9, п. 1): до 4 мес; недоношенному — и пока скорригированный меньше 3 мес. */
export function isTooEarly(age: FeedingAge): boolean {
  return age.months < 4 || (age.corrected != null && age.corrected.exact < 3);
}

// ── Журнал ──────────────────────────────────────────────────────────────────

/** Продукт каталога отметки; свой продукт с названием из каталога — тоже он. */
export function foodProduct(food: Pick<FoodIntroduction, "productCode" | "productName">): FoodProduct | null {
  if (food.productCode) return productByCode(food.productCode);
  return productByName(food.productName);
}

/** Ключ продукта: код каталога или название своего продукта. */
export function foodKey(food: Pick<FoodIntroduction, "productCode" | "productName">): string {
  const product = foodProduct(food);
  if (product) return product.code;
  return food.productCode || `name:${normText(food.productName)}`;
}

/** Аллерген отметки: «А:» каталога или название продукта. */
export function foodAllergen(food: Pick<FoodIntroduction, "productCode" | "productName">): string {
  const product = foodProduct(food);
  return product ? productAllergen(product) : food.productName.trim();
}

const byDate = (a: FoodIntroduction, b: FoodIntroduction): number => a.givenOn.localeCompare(b.givenOn) || a.id - b.id;

export function reactionLabel(reaction: FoodReaction): string {
  return optionLabel(FOOD_REACTIONS, reaction).toLowerCase();
}

/** «сыпь, лёгкая»; без реакции — пусто. */
export function reactionText(food: Pick<FoodIntroduction, "reaction" | "reactionSeverity">): string {
  if (food.reaction === "none") return "";
  const severity = food.reactionSeverity ? optionLabel(FOOD_SEVERITIES, food.reactionSeverity).toLowerCase() : "";
  return [reactionLabel(food.reaction), severity].filter(Boolean).join(", ");
}

export interface JournalItem {
  food: FoodIntroduction;
  key: string;
  product: FoodProduct | null;
  /** Не первая отметка продукта — «повторно». */
  repeat: boolean;
  /** Последняя отметка продукта с реакцией — у неё «Дали снова». */
  canRepeat: boolean;
}

/** Строки журнала от новых к старым. */
export function journalItems(foods: ReadonlyArray<FoodIntroduction>): JournalItem[] {
  const sorted = [...foods].sort(byDate);
  const seen = new Set<string>();
  const lastOf = new Map<string, FoodIntroduction>();
  const items = sorted.map((food) => {
    const key = foodKey(food);
    const repeat = seen.has(key);
    seen.add(key);
    lastOf.set(key, food);
    return { food, key, product: foodProduct(food), repeat, canRepeat: false };
  });
  for (const item of items) item.canRepeat = lastOf.get(item.key) === item.food && item.food.reaction !== "none";
  return items.reverse();
}

/** Начало прикорма: дата профиля, иначе первая отметка обычного продукта (не «Н»). */
export function feedingStart(
  complementaryFeedingOn: string | null | undefined,
  foods: ReadonlyArray<FoodIntroduction>,
): { on: string; fromJournal: boolean } | null {
  if (complementaryFeedingOn) return { on: complementaryFeedingOn, fromJournal: false };
  const first = [...foods].sort(byDate).find((food) => !foodProduct(food)?.noSuggest);
  return first ? { on: first.givenOn, fromJournal: true } : null;
}

/** Текущий вид вскармливания — последний период. */
export function currentFeeding(feeding: ReadonlyArray<FeedingPeriod>): FeedingPeriod | null {
  return [...feeding].sort((a, b) => a.startedOn.localeCompare(b.startedOn) || a.id - b.id).at(-1) ?? null;
}

// ── Статусы (§3.6) ──────────────────────────────────────────────────────────

export type FoodStatus = "allergy" | "postponed" | "introduced" | "forbidden" | "doctor" | "allowed" | "early";

export interface ProductState {
  status: FoodStatus;
  /** Первая и последняя отметки продукта до даты. */
  first: FoodIntroduction | null;
  last: FoodIntroduction | null;
  /** Аллерген действующей аллергии, закрывшей продукт. */
  allergen: string | null;
  /** Реакция, из-за которой отложен: своя или другого продукта с тем же аллергеном. */
  reaction: FoodIntroduction | null;
  /** Порог, мес.: «с 8 мес» (рано), «до 12 мес» (не давать), «с 12 мес» (врач у цитрусовых). */
  months: number | null;
  /** Условие сверх срока: «после безглютеновой каши». */
  condition: string | null;
}

export interface FeedingFacts {
  birthDate: string | null;
  gestation: Gestation | null;
  foods: ReadonlyArray<FoodIntroduction>;
  /** Аллергии медкарты (из `health/` — действующие). */
  allergies: ReadonlyArray<Pick<Allergy, "id" | "allergen" | "status" | "category">>;
  /** Риск аллергии (§3.7). */
  risk: boolean;
}

export interface FeedingSnapshot {
  on: string;
  age: FeedingAge | null;
  facts: FeedingFacts;
  /** Отметки по продукту до даты включительно, от ранних. */
  byKey: ReadonlyMap<string, FoodIntroduction[]>;
  state: (product: FoodProduct) => ProductState;
  /** Аллерген из действующих аллергий (по названию) — или null. */
  activeAllergy: (names: ReadonlyArray<string>) => string | null;
}

const GLUTEN_FREE_CEREALS = FOOD_PRODUCTS.filter((product) => product.group === "cereals" && !product.allergen);
const GLUTEN_CEREALS = FOOD_PRODUCTS.filter(
  (product) => product.group === "cereals" && product.allergen === "Глютен" && product.after === "glutenFreeCereal",
);

/**
 * Снимок на дату: на экране — сегодня, в окне — дата отметки. Правимая
 * отметка (`excludeId`) в расчёт не входит. Статус продукта — первое
 * совпадение сверху вниз по §3.6.
 */
export function feedingSnapshot(facts: FeedingFacts, on: string, excludeId?: number | null): FeedingSnapshot {
  const age = feedingAge(facts.birthDate, on, facts.gestation);
  const day = dayjs(on).format(ISO);
  const byKey = new Map<string, FoodIntroduction[]>();
  const allByKey = new Map<string, FoodIntroduction[]>();
  for (const food of [...facts.foods].sort(byDate)) {
    if (food.id === excludeId) continue;
    const key = foodKey(food);
    allByKey.set(key, [...(allByKey.get(key) ?? []), food]);
    if (food.givenOn <= day) byKey.set(key, [...(byKey.get(key) ?? []), food]);
  }
  // Последние отметки с реакцией по аллергену: реакция на желток откладывает целое яйцо.
  const reactionsByAllergen = new Map<string, Array<{ key: string; food: FoodIntroduction }>>();
  for (const [key, list] of byKey) {
    const last = list[list.length - 1];
    if (last.reaction === "none") continue;
    const allergen = normText(foodAllergen(last));
    reactionsByAllergen.set(allergen, [...(reactionsByAllergen.get(allergen) ?? []), { key, food: last }]);
  }
  const active = facts.allergies
    .filter((allergy) => allergy.status === "active")
    .map((allergy) => ({ norm: normText(allergy.allergen), allergen: allergy.allergen }));
  const activeAllergy = (names: ReadonlyArray<string>): string | null => {
    const wanted = new Set(names.map(normText));
    return active.find((allergy) => wanted.has(allergy.norm))?.allergen ?? null;
  };

  const cache = new Map<string, ProductState>();
  const state = (product: FoodProduct): ProductState => {
    const cached = cache.get(product.code);
    if (cached) return cached;
    const entries = byKey.get(product.code) ?? [];
    const first = entries[0] ?? null;
    const last = entries[entries.length - 1] ?? null;
    const base = { first, last, allergen: null, reaction: null, months: null, condition: null };
    const result = ((): ProductState => {
      // 1. Аллергия: по названию аллергена или продукта, или по связи отметки.
      const byName = activeAllergy([productAllergen(product), product.name]);
      const linked = (allByKey.get(product.code) ?? []).find((food) => food.allergy?.status === "active")?.allergy ?? null;
      if (byName || linked) return { ...base, status: "allergy", allergen: byName ?? linked?.allergen ?? null };
      // 2. Отложен: последняя отметка с реакцией или реакция на тот же аллерген позже неё.
      if (last && last.reaction !== "none") return { ...base, status: "postponed", reaction: last };
      const shared = (reactionsByAllergen.get(normText(productAllergen(product))) ?? []).find(
        (item) => item.key !== product.code && (!last || item.food.givenOn >= last.givenOn),
      );
      if (shared) return { ...base, status: "postponed", reaction: shared.food };
      // 3. Введён.
      if (last) return { ...base, status: "introduced" };
      const months = age?.months ?? null;
      // 4. Не давать.
      if (product.forbiddenUntil != null && months != null && months < product.forbiddenUntil) {
        return { ...base, status: "forbidden", months: product.forbiddenUntil };
      }
      // 5. Врач: риск аллергии.
      if (facts.risk && (product.doctorInRisk || (product.riskFrom != null && months != null && months < product.riskFrom))) {
        return { ...base, status: "doctor", months: product.riskFrom ?? null };
      }
      // 6–7. Можно или рано.
      if (months != null && months < product.from) return { ...base, status: "early", months: product.from };
      if (product.after) {
        const pool = product.after === "glutenFreeCereal" ? GLUTEN_FREE_CEREALS : GLUTEN_CEREALS;
        if (!pool.some((item) => state(item).status === "introduced")) {
          return { ...base, status: "early", condition: CONDITION_TEXT[product.after] };
        }
      }
      return { ...base, status: "allowed" };
    })();
    cache.set(product.code, result);
    return result;
  };
  return { on: day, age, facts, byKey, state, activeAllergy };
}

/** Подпись статуса у чипа окна: «введён 12.10», «реакция», «с 8 мес», «не давать до 12 мес». */
export function stateChipLabel(state: ProductState): string {
  switch (state.status) {
    case "introduced":
      return state.first ? `введён ${formatShortDay(state.first.givenOn)}` : "введён";
    case "postponed":
      return "реакция";
    case "allergy":
      return "аллергия";
    case "forbidden":
      return `не давать до ${monthsWord(state.months ?? 12)}`;
    case "doctor":
      return "врач";
    case "early":
      return state.condition ?? `с ${monthsWord(state.months ?? 6)}`;
    default:
      return "";
  }
}

/** Слово статуса для таблицы норм и ленты. */
export const STATUS_WORD: Record<FoodStatus, string> = {
  allergy: "аллергия",
  postponed: "отложен",
  introduced: "введено",
  forbidden: "не давать",
  doctor: "врач",
  allowed: "можно",
  early: "рано",
};

/** Цвет статуса: красный, зелёный, жёлтый, синий, серый (§3.6). */
export type StatusTone = "bad" | "ok" | "warn" | "on" | "muted";

export const STATUS_TONE: Record<FoodStatus, StatusTone> = {
  allergy: "bad",
  postponed: "bad",
  introduced: "ok",
  forbidden: "bad",
  doctor: "warn",
  allowed: "on",
  early: "muted",
};

/** Строки без введённых продуктов показывают самый «открытый» статус. */
const OPENNESS: ReadonlyArray<FoodStatus> = ["introduced", "allowed", "doctor", "early", "forbidden", "postponed", "allergy"];

/** Статус строки табл. 5.1 (§3.4): «введено», если введён хоть один её продукт. */
export function normRowStatus(row: NormRow, snapshot: FeedingSnapshot): FoodStatus {
  const products = FOOD_PRODUCTS.filter((product) =>
    row.codes ? row.codes.includes(product.code) : row.groups?.includes(product.group),
  );
  if (products.some((product) => snapshot.state(product).status === "introduced")) return "introduced";
  // Цитрусовые и прочие «Н» строку не определяют: «врач» у фруктов из-за них сбивал бы с толку.
  const main = products.filter(isSuggestible);
  const statuses = (main.length ? main : products).map((product) => snapshot.state(product).status);
  if (!row.codes && row.groups) {
    // Свой продукт группы тоже «введён».
    const custom = [...snapshot.byKey.entries()].some(
      ([key, list]) => key.startsWith("name:") && row.groups?.includes(list[0].foodGroup) && list[list.length - 1].reaction === "none",
    );
    if (custom) return "introduced";
  }
  return OPENNESS.find((status) => statuses.includes(status)) ?? "early";
}

/** Введённые продукты группы на дату (каталог и свои). */
export function introducedInGroup(snapshot: FeedingSnapshot, group: FoodGroup): number {
  let count = 0;
  for (const [key, list] of snapshot.byKey) {
    const product = productByCode(key);
    const foodGroup = product?.group ?? list[0].foodGroup;
    if (foodGroup !== group) continue;
    if (product) {
      if (snapshot.state(product).status === "introduced") count += 1;
    } else if (list[list.length - 1].reaction === "none") {
      count += 1;
    }
  }
  return count;
}

// ── Риск аллергии (§3.7) ────────────────────────────────────────────────────

export interface AllergyRisk {
  atRisk: boolean;
  /** «мама: аллергия», «аллергия на куриное яйцо». */
  reasons: string[];
}

const FAMILY_RISK_RE = /аллерг|астм|атопич|экзем|поллиноз|крапивниц/i;
const RELATION_WORD: Partial<Record<FamilyRelation, string>> = { mother: "мама", father: "папа", sibling: "брат или сестра" };

const lowerFirst = (text: string): string => (text ? text[0].toLowerCase() + text.slice(1) : text);

/** «Рыба» → «рыбу»: аллергия «на» что. */
function accusative(allergen: string): string {
  const text = lowerFirst(allergen.trim());
  if (/\s/.test(text)) return text;
  if (text.endsWith("а")) return `${text.slice(0, -1)}у`;
  if (text.endsWith("я")) return `${text.slice(0, -1)}ю`;
  return text;
}

/** Атопический дерматит: МКБ L20, действующий или в ремиссии. */
function isAtopicDermatitis(condition: Pick<Condition, "diagnosisCode" | "title" | "status">): boolean {
  if (condition.status !== "active" && condition.status !== "remission") return false;
  const code = condition.diagnosisCode.trim().toUpperCase();
  return code.startsWith("L20") || /атопическ\S*\s+дерматит/i.test(condition.title);
}

export function allergyRisk(input: {
  riskGroups: ReadonlyArray<RiskGroup>;
  allergies: ReadonlyArray<Pick<Allergy, "allergen" | "status" | "category">>;
  conditions: ReadonlyArray<Pick<Condition, "diagnosisCode" | "title" | "status">>;
  family: ReadonlyArray<Pick<FamilyMember, "relation" | "conditions">>;
}): AllergyRisk {
  const reasons: string[] = [];
  if (input.riskGroups.includes("allergic")) reasons.push("группа риска «Аллергия»");
  for (const allergy of input.allergies) {
    if (allergy.status === "active" && allergy.category === "food") reasons.push(`аллергия на ${accusative(allergy.allergen)}`);
  }
  if (input.conditions.some(isAtopicDermatitis)) reasons.push("атопический дерматит");
  for (const member of input.family) {
    const word = RELATION_WORD[member.relation];
    if (!word) continue;
    const part = member.conditions
      .split(/[;,\n]/)
      .map((item) => item.trim())
      .find((item) => FAMILY_RISK_RE.test(item));
    if (part) reasons.push(`${word}: ${part.toLowerCase()}`);
  }
  return { atRisk: reasons.length > 0, reasons: [...new Set(reasons)] };
}

// ── «Сегодня» (§3.8) ────────────────────────────────────────────────────────

/** Новый продукт — раз в 3 дня, в группе риска — раз в 7. */
export const pauseDays = (risk: boolean): number => (risk ? 7 : 3);

interface Step {
  month: number;
  products: ReadonlyArray<FoodProduct>;
  /** Что должно быть введено раньше: масло — после первого овоща или каши. */
  needs?: FoodGroup;
}

const codes = (...list: string[]): FoodProduct[] =>
  list.map((code) => productByCode(code)).filter((product): product is FoodProduct => product != null);

/** Шаги по умолчанию: овощи → каша → мясо, масло; фрукты и желток; творог, рыба, хлеб; бобовые. */
const STEPS: ReadonlyArray<Step> = [
  { month: 6, products: productsOfGroup("vegetables") },
  { month: 6, products: codes("buckwheat", "rice", "corn") },
  { month: 6, products: productsOfGroup("meat") },
  { month: 6, products: codes("vegetable_oil"), needs: "vegetables" },
  { month: 6, products: codes("butter"), needs: "cereals" },
  { month: 7, products: productsOfGroup("fruits") },
  { month: 7, products: codes("egg_yolk") },
  { month: 8, products: codes("cottage_cheese", "kefir") },
  { month: 8, products: productsOfGroup("fish") },
  { month: 8, products: codes("bread") },
  { month: 9, products: codes("lentils", "mung", "chickpea", "beans") },
];

const CLOSED: ReadonlySet<FoodStatus> = new Set<FoodStatus>(["allergy", "postponed", "doctor"]);

/** Кандидат «Сегодня»: статус «можно», без (Н) и (Л). */
function isCandidate(snapshot: FeedingSnapshot, product: FoodProduct): boolean {
  return isSuggestible(product) && snapshot.state(product).status === "allowed";
}

/** Первый кандидат по порядку каталога; в группе риска — сначала (М). */
function firstCandidate(snapshot: FeedingSnapshot, products: ReadonlyArray<FoodProduct>, take = 1): FoodProduct[] {
  const list = products.filter((product) => isCandidate(snapshot, product));
  const ordered = snapshot.facts.risk ? [...list.filter((p) => p.lowAllergen), ...list.filter((p) => !p.lowAllergen)] : list;
  return ordered.slice(0, take);
}

export interface Suggestion {
  product: FoodProduct;
  /** «пшеничная каша», «хлеб». */
  name: string;
  /** «Начать с ½ ч. л., за 5–7 дней довести до 10–40 г в день». */
  dose: string;
}

export type TodayKind = "early" | "window" | "pause" | "suggest" | "none";

export interface FeedingToday {
  kind: TodayKind;
  /** Главная фраза панели. */
  text: string;
  /** Под ней: дозировка или пояснение. */
  detail: string | null;
  main: Suggestion | null;
  more: Suggestion[];
  /** Подсказки ниже: недоношенный, вес при рождении, ИМТ, гемоглобин. */
  hints: string[];
  /** Показать признаки готовности. */
  readiness: boolean;
}

export interface TodayInput {
  facts: FeedingFacts;
  start: string | null;
  birthWeightKg: number | null;
  /** ИМТ последнего замера словами (`bmiVerdict`). */
  bmiVerdict: string;
  today: string;
}

/** «пшеничная каша», «хлеб» (без «, сухари»). */
export function suggestName(product: FoodProduct): string {
  return product.name.split(",")[0].trim().toLowerCase();
}

/** Сколько давать: граммы табл. 5.1 на возраст; после года — «начать с малого». */
export function doseText(product: FoodProduct, months: number): string {
  if (months >= 12) {
    return product.group === "fish" || product.group === "egg" ? "Начать с малого, 2–3 раза в неделю (РФ)" : "Начать с малого";
  }
  const column = normColumn(months);
  const row = normRowOf(product);
  const amount = row && column && column !== "after" ? normAmount(row, column) : null;
  return amount
    ? `Начать с ½ ч. л., за 5–7 дней довести до ${amount} в день`
    : "Начать с ½ ч. л., за 5–7 дней довести до обычной порции";
}

const suggestion = (product: FoodProduct, months: number): Suggestion => ({
  product,
  name: suggestName(product),
  dose: doseText(product, months),
});

/** Подсказки под «Сегодня» (§3.8, п. 6). */
function todayHints(input: TodayInput, age: FeedingAge): string[] {
  const hints: string[] = [];
  const premature = age.corrected != null;
  const lowWeight = input.birthWeightKg != null && input.birthWeightKg < 1.5;
  if (premature && age.months < 12) {
    hints.push(
      "Недоношенный: РФ — по паспортному возрасту, не раньше 4 и не позже 6 мес; итальянские общества — 5–8 мес паспортного, если скорригированный не меньше 3 мес. Срок решает врач",
    );
  }
  if (lowWeight && age.months < 12) {
    hints.push(
      "Вес при рождении меньше 1500 г: с 4 мес — обогащённая безмолочная каша, затем масло до 5–6 мл в сутки, мясо в 6 мес; порцию делить на 2–3 раза по 20–30 мл (РФ)",
    );
  }
  if ((premature || lowWeight) && age.months >= 2 && age.months < 24) {
    hints.push("МЗ КР (2023): недоношенным и детям с весом при рождении меньше 1,5 кг — добавки железа с 2 до 23 мес, назначает врач");
  }
  if (input.bmiVerdict === "дефицит массы" || input.bmiVerdict === "выраженный дефицит массы") {
    hints.push("Плохая прибавка: первой — обогащённая безмолочная безглютеновая каша, можно раньше; творог по показаниям с 6 мес (РФ)");
  } else if (input.bmiVerdict === "избыточный вес" || input.bmiVerdict === "ожирение") {
    hints.push("Избыток массы: первыми — овощи; объёмы не выше нормы; соки только после еды; цельное молоко на первом году — нет (РФ)");
  }
  const hemoglobin = hemoglobinHint(age);
  if (hemoglobin) hints.push(hemoglobin);
  return hints;
}

/** Гемоглобин (п. 13): в 6, 12 и 24 мес; недоношенному — не позже 3 мес (МЗ КР 2023). */
export function hemoglobinHint(age: FeedingAge): string | null {
  const premature = age.corrected != null || age.weeksShort != null;
  if (premature && age.months >= 1 && age.months <= 3) return "Гемоглобин: недоношенным — проверить не позже 3 мес (МЗ КР 2023)";
  if (age.months === 6 && !premature) return "Гемоглобин: в 6 мес — проверить (МЗ КР 2023); дальше — в 12 и 24 мес";
  if (age.months === 12 || age.months === 24) return `Гемоглобин: в ${age.months} мес проверяют всем детям (МЗ КР 2023)`;
  return null;
}

/** «Сегодня»: рано, окно, пауза, что ввести дальше (§3.8). */
export function feedingToday(input: TodayInput): FeedingToday {
  const empty = { detail: null, main: null, more: [], hints: [], readiness: false };
  const snapshot = feedingSnapshot(input.facts, input.today);
  const age = snapshot.age;
  if (!age) return { ...empty, kind: "none", text: "Нет даты рождения — подсказки по возрасту недоступны" };
  const hints = todayHints(input, age);
  const target = formatDay(dayjs(input.facts.birthDate).add(6, "month"));

  // 1. До 4 мес (недоношенному — и пока скорригированный меньше 3 мес).
  if (isTooEarly(age)) {
    return {
      ...empty,
      kind: "early",
      text: `Прикорм пока рано. Цель — около 6 мес (с ${target}). До 6 мес — только грудное молоко или смесь (ВОЗ, МЗ КР)`,
      hints,
    };
  }
  // 2. С 4 мес, прикорма ещё нет.
  if (!input.start && age.months < 6) {
    return {
      ...empty,
      kind: "window",
      text: "Окно прикорма: РФ — 4–6 мес, ВОЗ и МЗ КР — с 6 мес; раньше 6 мес — решение врача",
      detail: "Первыми — кабачок, цветная капуста или брокколи либо безглютеновая безмолочная каша",
      hints,
      readiness: true,
    };
  }
  // 3. Пауза: реакция или новый продукт за последние 3 (7) дней.
  const days = pauseDays(input.facts.risk);
  const today = dayjs(input.today).startOf("day");
  const recent = (food: FoodIntroduction) => today.diff(dayjs(food.givenOn), "day") < days;
  const foods = [...input.facts.foods].filter((food) => food.givenOn <= snapshot.on).sort(byDate);
  const reaction = [...foods].reverse().find((food) => food.reaction !== "none" && recent(food));
  if (reaction) {
    return {
      ...empty,
      kind: "pause",
      text: `Пауза: реакция на «${reaction.productName}» ${formatShortDay(reaction.givenOn)}. Новое не вводить, пока реакция не прошла; показать врачу`,
      hints,
    };
  }
  const firsts = new Map<string, FoodIntroduction>();
  for (const food of foods) if (!firsts.has(foodKey(food))) firsts.set(foodKey(food), food);
  const newest = [...firsts.values()].sort(byDate).at(-1);
  if (newest && recent(newest)) {
    const until = formatShortDay(dayjs(newest.givenOn).add(days, "day"));
    return {
      ...empty,
      kind: "pause",
      text: `Пауза до ${until}: «${newest.productName}» с ${formatShortDay(newest.givenOn)} — продолжайте этот продукт, доводя до нормы`,
      hints,
    };
  }

  // 4. Что ввести: мясо при нехватке железа, шаги по умолчанию, разнообразие.
  const chosen: FoodProduct[] = [];
  const take = (product: FoodProduct | undefined) => {
    if (product && !chosen.includes(product)) chosen.push(product);
  };
  const ironGroups: FoodGroup[] = ["meat", "fish", "egg"];
  // Прикорма нет вовсе — первым остаётся овощ или каша (п. 2), мясо — следом в «Ещё можно».
  if (input.start && age.months >= 7 && ironGroups.every((group) => introducedInGroup(snapshot, group) === 0)) {
    take(firstCandidate(snapshot, productsOfGroup("meat"))[0]);
  }
  for (const step of STEPS) {
    if (chosen.length >= 3) break;
    if (step.month > age.months) continue;
    if (step.needs && introducedInGroup(snapshot, step.needs) === 0) continue;
    const done = step.products.some((product) => snapshot.state(product).status === "introduced");
    const suggestible = step.products.filter(isSuggestible);
    const allClosed = suggestible.length > 0 && suggestible.every((product) => CLOSED.has(snapshot.state(product).status));
    if (done || allClosed) continue;
    if (chosen.some((product) => step.products.includes(product))) continue;
    take(firstCandidate(snapshot, step.products)[0]);
  }
  if (chosen.length < 3) {
    // Разнообразие: группа с наименьшим числом введённых, при равенстве — по порядку групп.
    const groups = FOOD_GROUPS.map((group, index) => ({
      code: group.code,
      index,
      count: introducedInGroup(snapshot, group.code),
      candidate: firstCandidate(snapshot, productsOfGroup(group.code).filter((product) => !chosen.includes(product)))[0],
    }))
      .filter((group) => group.candidate && !chosen.some((product) => product.group === group.code))
      .sort((a, b) => a.count - b.count || a.index - b.index);
    for (const group of groups) {
      if (chosen.length >= 3) break;
      take(group.candidate);
    }
  }
  if (!chosen.length) {
    return {
      ...empty,
      kind: "none",
      text:
        age.months < 6
          ? "До 6 мес новые продукты — по решению врача; продолжайте введённые, доводя до нормы"
          : "Новых продуктов по возрасту сейчас нет — продолжайте введённые и следите за разнообразием",
      hints,
    };
  }
  const [main, ...more] = chosen.map((product) => suggestion(product, age.months));
  return {
    kind: "suggest",
    text: `Можно ввести: ${main.name}`,
    detail: main.dose,
    main,
    more,
    hints,
    readiness: false,
  };
}

// ── Баннеры (§3.9) ──────────────────────────────────────────────────────────

export type BannerTone = "error" | "warning" | "info";

export interface FeedingBanner {
  key: string;
  tone: BannerTone;
  title: string;
  text: string;
  /** Нерешённая реакция — кнопка «Записать как аллергию». */
  reaction?: FoodIntroduction;
}

/**
 * Реакции, которые не закрыты (§3.7): последняя отметка продукта с реакцией
 * и нет аллергии — ни по связи, ни среди действующих по названию.
 */
export function openReactions(facts: FeedingFacts, today: string): FoodIntroduction[] {
  const snapshot = feedingSnapshot(facts, today);
  const result: FoodIntroduction[] = [];
  for (const [, list] of snapshot.byKey) {
    const last = list[list.length - 1];
    if (last.reaction === "none") continue;
    // Связь с аллергией любого статуса — врач уже решил; по названию — только действующая.
    if (list.some((food) => food.allergy != null)) continue;
    const product = foodProduct(last);
    const names = product ? [productAllergen(product), product.name] : [last.productName];
    if (snapshot.activeAllergy(names)) continue;
    result.push(last);
  }
  return result.sort(byDate);
}

export interface BannerInput {
  facts: FeedingFacts;
  start: string | null;
  feedingType: FeedingType | null;
  riskReasons: ReadonlyArray<string>;
  today: string;
}

export function feedingBanners(input: BannerInput): FeedingBanner[] {
  const age = feedingAge(input.facts.birthDate, input.today, input.facts.gestation);
  if (!age) return [];
  const red: FeedingBanner[] = [];
  const yellow: FeedingBanner[] = [];
  const blue: FeedingBanner[] = [];
  const premature = age.corrected != null;

  // 1. Прикорм начат до 4 мес (недоношенному — и пока скорр. меньше 3 мес) — пока ребёнку меньше года.
  if (input.start && age.months < 12) {
    const startAge = feedingAge(input.facts.birthDate, input.start, input.facts.gestation);
    if (startAge && isTooEarly(startAge)) {
      red.push({
        key: "earlyStart",
        tone: "error",
        title: `Прикорм начат до 4 мес: ${formatDay(input.start)}, в ${ageText(startAge)}`,
        text:
          startAge.months >= 4
            ? "Скорригированный возраст был меньше 3 мес — для недоношенного это рано. Новое — только по решению врача"
            : "Раньше 4 мес прикорм не начинают ни по одной программе (РФ, ESPGHAN, CDC). Новое — только по решению врача",
      });
    }
  }
  // 2. Прикорма нет: в 6 мес — жёлтое, в 7 — красное (недоношенному 6 / 8). На общем столе — дата просто не отмечена.
  if (!input.start && input.feedingType !== "general" && age.months >= 6 && age.months < 24) {
    const redFrom = premature ? 8 : 7;
    (age.months >= redFrom ? red : yellow).push({
      key: "noStart",
      tone: age.months >= redFrom ? "error" : "warning",
      title: `Прикорм не отмечен — ребёнку ${ageText(age, false)}`,
      text: "ВОЗ и МЗ КР — с 6 мес; позже — риск нехватки железа и навыка жевания. Если прикорм уже начат — отметьте первый продукт или дату",
    });
  }
  // 4. Реакции, не внесённые в аллергии.
  for (const food of openReactions(input.facts, input.today)) {
    red.push({
      key: `reaction-${food.id}`,
      tone: "error",
      title: `${food.productName} ${formatDay(food.givenOn)}: ${reactionText(food)}`,
      text: "Повторно — только после осмотра. В аллергиях записи нет",
      reaction: food,
    });
  }
  // 3. С 7 мес ни мяса, ни рыбы, ни яйца — точно по журналу (журнал ведут).
  if (age.months >= 7 && age.months < 24 && input.facts.foods.length > 0) {
    const snapshot = feedingSnapshot(input.facts, input.today);
    const iron = (["meat", "fish", "egg"] as const).some((group) => introducedInGroup(snapshot, group) > 0);
    if (!iron) {
      yellow.push({
        key: "iron",
        tone: "warning",
        title: "С 7 мес не введено ни мясо, ни рыба, ни яйцо",
        text: "Это главные источники железа в прикорме — риск дефицита железа (ВОЗ, РФ, МЗ КР). Начните с мяса",
      });
    }
  }
  // 11. Риск аллергии — синий, до 2 лет.
  if (input.riskReasons.length && age.months < 24) {
    blue.push({
      key: "risk",
      tone: "info",
      title: `Риск аллергии: ${input.riskReasons.join("; ")}`,
      text: "Новый продукт — раз в 7 дней, первыми — малоаллергенные. Яйцо, рыбу, арахис и орехи вводит врач; цитрусовые, клубника, киви — с 12 мес",
    });
  }
  return [...red, ...yellow, ...blue];
}

// ── Окно отметки (§5) ───────────────────────────────────────────────────────

export type WarningTone = "error" | "warning" | "muted";

export interface DrawerWarning {
  key: string;
  tone: WarningTone;
  text: string;
}

export interface DrawerInput {
  facts: FeedingFacts;
  /** Начало прикорма — дата профиля или первая отметка. */
  start: string | null;
  product: FoodProduct | null;
  /** Свой продукт: название и группа. */
  custom: { name: string; group: FoodGroup } | null;
  givenOn: string;
  reaction: FoodReaction;
  severity: FoodReactionSeverity;
  notes: string;
  /** Правимая отметка — в расчёт не входит. */
  editingId: number | null;
  /** Отметка уже связана с аллергией. */
  allergyLinked: boolean;
}

export interface DrawerAdvice {
  warnings: DrawerWarning[];
  /** «Реакция на «Желток» — внести в аллергии?» */
  offerAllergy: boolean;
  /** Аллерген продукта — для подписи и окна аллергии. */
  allergen: string;
}

const URGENT_RE = /свистящ|отёк|отек|затрудн/i;

export const URGENT_TEXT =
  "Отёк губ, лица или языка, затруднённое дыхание, многократная рвота с бледностью и вялостью — срочно к врачу";
export const ILLNESS_TEXT = "Не вводите новое во время болезни и за 3–5 дней до и после прививки";

/** Предупреждения окна на дату отметки, сверху вниз (§5); сохранить они не мешают. */
export function drawerAdvice(input: DrawerInput): DrawerAdvice {
  const { product, custom } = input;
  const name = product?.name ?? custom?.name.trim() ?? "";
  const allergen = product ? productAllergen(product) : name;
  const warnings: DrawerWarning[] = [];
  if (!name) return { warnings: [{ key: "illness", tone: "muted", text: ILLNESS_TEXT }], offerAllergy: false, allergen };

  const snapshot = feedingSnapshot(input.facts, input.givenOn, input.editingId);
  const age = snapshot.age;
  const key = product ? product.code : `name:${normText(name)}`;
  const own = snapshot.byKey.get(key) ?? [];
  const last = own[own.length - 1] ?? null;
  const state = product ? snapshot.state(product) : null;

  // Аллергия на этот аллерген: по названию или по связи прежней отметки.
  const linked = input.facts.foods.find(
    (food) => food.id !== input.editingId && foodKey(food) === key && food.allergy?.status === "active",
  )?.allergy;
  const allergy = snapshot.activeAllergy(product ? [allergen, product.name] : [name]) ?? linked?.allergen ?? null;
  if (allergy) warnings.push({ key: "allergy", tone: "error", text: `В аллергиях: ${allergy} — давать только по решению врача` });
  // Не давать (п. 8).
  if (product?.forbiddenUntil != null && age && age.months < product.forbiddenUntil) {
    warnings.push({ key: "forbidden", tone: "error", text: `${product.name} — ${product.forbiddenText ?? `не давать до ${monthsWord(product.forbiddenUntil)}`}` });
  }
  // Повтор после реакции (п. 5): своя или у продукта с тем же аллергеном.
  if (last && last.reaction !== "none") {
    warnings.push({
      key: "repeat",
      tone: "error",
      text: `Была реакция ${formatDay(last.givenOn)} (${reactionText(last)}) — повторно только по решению врача`,
    });
  } else if (state?.status === "postponed" && state.reaction) {
    warnings.push({
      key: "repeat",
      tone: "error",
      text: `Была реакция на «${state.reaction.productName}» ${formatDay(state.reaction.givenOn)} — тот же аллерген (${allergen}); вводить только по решению врача`,
    });
  }
  // Возраст (п. 1): до 4 мес — красное; первый прикорм раньше 6 мес — решение врача.
  if (age && isTooEarly(age)) {
    warnings.push({
      key: "early",
      tone: "error",
      text:
        age.months >= 4
          ? "Скорригированный возраст меньше 3 мес — для недоношенного прикорм рано"
          : "Раньше 4 мес прикорм не вводят (РФ, ESPGHAN, CDC)",
    });
  } else if (age && age.months < 6 && (!input.start || input.start >= snapshot.on) && startsHere(input, snapshot.on)) {
    warnings.push({ key: "before6", tone: "warning", text: "Раньше 6 мес — только решением врача (ВОЗ и МЗ КР — с 6 мес, РФ — окно 4–6 мес)" });
  }
  // Группа риска — вводит врач.
  if (product && input.facts.risk && !own.length) {
    if (product.doctorInRisk) {
      warnings.push({ key: "doctor", tone: "warning", text: `Риск аллергии: ${suggestName(product)} вводит врач` });
    } else if (product.riskFrom != null && age && age.months < product.riskFrom) {
      warnings.push({
        key: "doctor",
        tone: "warning",
        text: `Риск аллергии: ${suggestName(product)} — с ${monthsWord(product.riskFrom)}, раньше — по решению врача`,
      });
    }
  }
  // Новый продукт раньше 3 (7) дней после предыдущего нового (п. 6).
  if (!own.length) {
    const days = pauseDays(input.facts.risk);
    const day = dayjs(snapshot.on);
    const firsts = new Map<string, FoodIntroduction>();
    for (const food of [...input.facts.foods].sort(byDate)) {
      if (food.id === input.editingId) continue;
      const foodKeyValue = foodKey(food);
      if (!firsts.has(foodKeyValue)) firsts.set(foodKeyValue, food);
    }
    firsts.delete(key);
    const near = [...firsts.values()]
      .map((food) => ({ food, gap: Math.abs(day.diff(dayjs(food.givenOn), "day")) }))
      .filter((item) => item.gap < days)
      .sort((a, b) => a.gap - b.gap)[0];
    if (near) {
      warnings.push({
        key: "interval",
        tone: "warning",
        text: `Новый продукт раньше чем через ${days} ${pluralRu(days, ["день", "дня", "дней"])} после «${near.food.productName}» (${formatShortDay(near.food.givenOn)})`,
      });
    }
  }
  // Срок по умолчанию ещё не наступил — серым.
  if (product && state?.status === "early") {
    warnings.push({
      key: "term",
      tone: "muted",
      text: state.condition
        ? `${product.name} — ${state.condition}`
        : `По умолчанию — с ${monthsWord(product.from)}${product.sources ? ` (${product.sources})` : ""}`,
    });
  }
  warnings.push({ key: "illness", tone: "muted", text: ILLNESS_TEXT });
  if (input.reaction !== "none" && (input.severity === "severe" || URGENT_RE.test(input.notes))) {
    warnings.push({ key: "urgent", tone: "error", text: URGENT_TEXT });
  }
  const offerAllergy = input.reaction !== "none" && !input.allergyLinked && !allergy;
  return { warnings, offerAllergy, allergen };
}

/** Отметка станет первой отметкой обычного продукта (начало прикорма). */
function startsHere(input: DrawerInput, day: string): boolean {
  return !input.facts.foods.some(
    (food) => food.id !== input.editingId && food.givenOn < day && !foodProduct(food)?.noSuggest,
  );
}

/**
 * Первый прикорм в окне (§5): даты нет — «С этой даты — первый прикорм»
 * (включено для обычных продуктов, выключено для «Н»); отметка раньше
 * записанной даты — «Поправить дату первого прикорма» (выключено).
 */
export function firstFeedingOption(input: {
  profileDate: string | null;
  foods: ReadonlyArray<FoodIntroduction>;
  givenOn: string;
  product: FoodProduct | null;
  editingId: number | null;
}): { kind: "set" | "fix"; defaultOn: boolean } | null {
  if (!input.givenOn) return null;
  if (!input.profileDate) {
    const earlier = input.foods.some(
      (food) => food.id !== input.editingId && food.givenOn < input.givenOn && !foodProduct(food)?.noSuggest,
    );
    return earlier ? null : { kind: "set", defaultOn: !input.product?.noSuggest };
  }
  return input.givenOn < input.profileDate ? { kind: "fix", defaultOn: false } : null;
}

// ── Окно аллергии по реакции (§3.7) ─────────────────────────────────────────

export function allergyFromReaction(
  food: Pick<FoodIntroduction, "productCode" | "productName" | "givenOn" | "reaction" | "reactionSeverity" | "notes">,
): Partial<AllergyInput> {
  const reaction =
    food.reaction === "none" ? "" : food.reaction === "other" ? food.notes.trim() : REACTION_ALLERGY_TEXT[food.reaction];
  const severity: AllergySeverity = food.reactionSeverity || "unknown";
  return {
    category: "food",
    allergen: foodAllergen(food),
    reaction,
    severity,
    status: "active",
    isConfirmed: false,
    notedOn: food.givenOn,
    notes: `По журналу прикорма: ${food.productName.trim().toLowerCase()}, ${formatDay(food.givenOn)}`,
  };
}

/** Быстрая фраза в заметку (§5): добавить через «; » или убрать, если уже есть. */
export function togglePhrase(notes: string, phrase: string): string {
  const parts = notes
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const index = parts.findIndex((part) => normText(part) === normText(phrase));
  if (index >= 0) parts.splice(index, 1);
  else parts.push(phrase);
  return parts.join("; ");
}

export function hasPhrase(notes: string, phrase: string): boolean {
  return notes.split(";").some((part) => normText(part) === normText(phrase));
}

// ── Шапка (§4, п. 1) ────────────────────────────────────────────────────────

export interface HeadlineParts {
  /** Дата начала прикорма (её можно поправить нажатием) и возраст на неё. */
  start: { on: string; age: string } | null;
  /** Без даты: «Прикорм ещё не начат» / «Прикорм не отмечен». */
  missing: string;
  /** «30 продуктов, групп 8 из 8», «сейчас общий стол». */
  rest: string[];
}

export function headlineParts(input: {
  birthDate: string | null;
  start: string | null;
  foods: ReadonlyArray<FoodIntroduction>;
  feeding: ReadonlyArray<FeedingPeriod>;
  today: string;
}): HeadlineParts {
  const rest: string[] = [];
  if (input.foods.length) {
    const products = new Set(input.foods.map(foodKey)).size;
    const groups = new Set(input.foods.map((food) => foodProduct(food)?.group ?? food.foodGroup)).size;
    rest.push(`${products} ${pluralRu(products, ["продукт", "продукта", "продуктов"])}, групп ${groups} из ${FOOD_GROUPS.length}`);
  }
  const current = currentFeeding(input.feeding);
  if (current) rest.push(`сейчас ${optionLabel(FEEDING_TYPES, current.feedingType).toLowerCase()}`);
  const startAge = input.start && input.birthDate ? calendarAge(input.birthDate, input.start) : null;
  const todayAge = input.birthDate ? calendarAge(input.birthDate, input.today) : null;
  return {
    start: input.start ? { on: input.start, age: startAge ? ageText(startAge, false) : "" } : null,
    missing: todayAge && todayAge.months < 6 ? "Прикорм ещё не начат" : "Прикорм не отмечен",
    rest,
  };
}

/** «Прикорм с 26.09.2025 в 6 мес · 30 продуктов, групп 8 из 8 · сейчас общий стол». */
export function feedingHeadline(input: Parameters<typeof headlineParts>[0]): string {
  const parts = headlineParts(input);
  const lead = parts.start
    ? `Прикорм с ${formatDay(parts.start.on)}${parts.start.age ? ` в ${parts.start.age}` : ""}`
    : parts.missing;
  return [lead, ...parts.rest].join(" · ");
}

// ── Лента (§3.10) ───────────────────────────────────────────────────────────

export type TextTone = "muted" | "ink" | "bad" | "accent" | "warn";

export interface TimelineText {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  tone: TextTone;
  bold?: boolean;
}

export interface TimelinePoint {
  key: string;
  x: number;
  /** Первая отметка — крупная точка, повтор — маленькая. */
  repeat: boolean;
  reaction: boolean;
  /** Подсказка по нажатию: продукт, дата, возраст, реакция. */
  title: string;
}

export interface TimelineRow {
  group: FoodGroup;
  label: string;
  y: number;
  /** Серым — время до срока группы. */
  early: { x: number; w: number } | null;
  /** Жёлтая штриховка «врач» — в группе риска у яйца и рыбы. */
  doctor: { x: number; w: number } | null;
  /** Тонкие линии от первой отметки к повторам. */
  links: Array<{ x1: number; x2: number }>;
  points: TimelinePoint[];
  texts: TimelineText[];
  /** Пунктирный кружок на линии «сегодня». */
  next: { x: number; strong: boolean } | null;
  /** Скрытые подписи: «+3», полный список — в журнале. */
  hidden: string[];
}

export interface TimelineMarker {
  x: number;
  tone: "accent" | "bad" | "muted";
  label: string;
  anchor: "start" | "end";
  /** Базовая линия подписи: не поместилась рядом — вторая строка. */
  labelY: number;
}

export interface TimelineBandPart {
  x: number;
  w: number;
  type: FeedingType;
  label: string | null;
  title: string;
}

export interface TimelineData {
  width: number;
  height: number;
  x0: number;
  x1: number;
  from: number;
  to: number;
  top: number;
  bottom: number;
  ticks: Array<{ x: number; label: string | null }>;
  today: { x: number };
  rows: TimelineRow[];
  markers: TimelineMarker[];
  markerY: number;
  band: { y: number; h: number; parts: TimelineBandPart[] } | null;
  /** «скорр. возраст на 6 нед меньше». */
  note: { text: string; y: number } | null;
}

export interface TimelineInput {
  facts: FeedingFacts;
  start: string | null;
  feeding: ReadonlyArray<FeedingPeriod>;
  today: string;
  /** Продукт из «Сегодня» — пунктирный кружок на линии «сегодня». */
  main: FoodProduct | null;
  width: number;
  /** Ширина текста в пикселях; по умолчанию — оценка по числу букв. */
  measure?: (text: string, size: number, bold?: boolean) => number;
}

export const TIMELINE = {
  /** Колонка подписей групп слева. */
  left: 92,
  right: 14,
  top: 34,
  rowH: 44,
  label: 10.5,
  minWidth: 720,
} as const;

const estimate = (text: string, size: number, bold = false): number => text.length * size * (bold ? 0.6 : 0.56);

type Lane = "above" | "line" | "below";

interface Box {
  lane: Lane;
  a: number;
  b: number;
}

const GAP = 5;

function collides(boxes: ReadonlyArray<Box>, box: Box): boolean {
  return boxes.some((other) => other.lane === box.lane && box.a < other.b + GAP && other.a < box.b + GAP);
}

/** Месяц на оси: «6 мес», «1 год», «2 года». */
function tickLabel(month: number): string {
  if (month === 12) return "1 год";
  if (month === 24) return "2 года";
  return `${month} мес`;
}

/**
 * Данные ленты: строки — 8 групп, ось — паспортный возраст от 4 мес (или от
 * первой отметки, если раньше) до «сегодня + 1 мес» (не короче 7 мес, чтобы
 * был виден старт около 6 мес); подписи чередуются над и под точкой, не
 * поместившиеся — скрываются («+N»).
 */
export function timelineData(input: TimelineInput): TimelineData | null {
  const { facts } = input;
  const measure = input.measure ?? estimate;
  const today = feedingAge(facts.birthDate, input.today, facts.gestation);
  if (!today || !facts.birthDate) return null;
  const birthDate = facts.birthDate;
  const width = Math.max(TIMELINE.minWidth, Math.round(input.width));
  const exactOf = (day: string): number => calendarAge(birthDate, day)?.exact ?? 0;

  const foods = [...facts.foods].filter((food) => food.givenOn <= input.today).sort(byDate);
  const earliest = [foods[0]?.givenOn, input.start].filter((day): day is string => Boolean(day)).map(exactOf);
  const from = Math.max(0, Math.min(4, ...earliest.map(Math.floor)));
  const to = Math.max(today.exact + 1, 7);
  const x0 = TIMELINE.left;
  const x1 = width - TIMELINE.right;
  const x = (months: number): number => x0 + ((months - from) / (to - from)) * (x1 - x0);
  const todayX = x(today.exact);
  const top = TIMELINE.top;
  const bottom = top + FOOD_GROUPS.length * TIMELINE.rowH;
  const size = TIMELINE.label;

  // Деления: каждый месяц до года, дальше — через 3 мес.; «сегодня» перекрывает соседние подписи.
  const todayBox = { a: todayX - measure("сегодня", 11, true) / 2, b: todayX + measure("сегодня", 11, true) / 2 };
  const ticks: TimelineData["ticks"] = [];
  let shownRight = -Infinity;
  for (let month = Math.ceil(from); month <= Math.floor(to); month += 1) {
    if (month > 12 && month % 3 !== 0) continue;
    const tx = x(month);
    const text = tickLabel(month);
    const half = measure(text, size) / 2;
    const crowded = tx - half < shownRight + 6;
    const overToday = tx + half > todayBox.a - 6 && tx - half < todayBox.b + 6;
    const shown = !crowded && !overToday && tx + half <= width;
    if (shown) shownRight = tx + half;
    ticks.push({ x: tx, label: shown ? text : null });
  }

  const snapshot = feedingSnapshot(facts, input.today);
  const byKey = new Map<string, FoodIntroduction[]>();
  for (const food of foods) byKey.set(foodKey(food), [...(byKey.get(foodKey(food)) ?? []), food]);

  const rows: TimelineRow[] = FOOD_GROUPS.map((group, index) => {
    const y = top + index * TIMELINE.rowH + TIMELINE.rowH / 2;
    const boxes: Box[] = [];
    const texts: TimelineText[] = [];
    const place = (text: string, cx: number, options: Lane[], tone: TextTone, bold = false, align: "middle" | "start" | "end" = "middle") => {
      const w = measure(text, size, bold);
      for (const lane of options) {
        let a = align === "middle" ? cx - w / 2 : align === "start" ? cx : cx - w;
        a = Math.min(Math.max(a, x0 - 2), width - 2 - w);
        const box = { lane, a, b: a + w };
        if (collides(boxes, box)) continue;
        boxes.push(box);
        const ty = lane === "above" ? y - 9 : lane === "below" ? y + 17 : y + 4;
        texts.push({ text, x: a, y: ty, anchor: "start", tone, bold });
        return true;
      }
      return false;
    };

    // Точки: первая отметка продукта — крупная, повторы — маленькие на той же строке.
    const points: TimelinePoint[] = [];
    const links: TimelineRow["links"] = [];
    const firsts: Array<{ food: FoodIntroduction; x: number; product: FoodProduct | null }> = [];
    for (const [key, list] of byKey) {
      const groupOf = foodProduct(list[0])?.group ?? list[0].foodGroup;
      if (groupOf !== group.code) continue;
      const product = foodProduct(list[0]);
      list.forEach((food, order) => {
        const px = x(exactOf(food.givenOn));
        const age = calendarAge(birthDate, food.givenOn);
        const reaction = reactionText(food);
        points.push({
          key: `${key}-${food.id}`,
          x: px,
          repeat: order > 0,
          reaction: food.reaction !== "none",
          title: [food.productName, formatDay(food.givenOn), age ? ageText(age) : "", reaction || "без реакции", order > 0 ? "повторно" : ""]
            .filter(Boolean)
            .join(" · "),
        });
        if (order > 0) links.push({ x1: x(exactOf(list[0].givenOn)), x2: px });
        else firsts.push({ food, x: px, product });
        boxes.push({ lane: "line", a: px - (order > 0 ? 4 : 7), b: px + (order > 0 ? 4 : 7) });
      });
    }

    // Пунктирный кружок «сегодня»: продукт из «Сегодня» и «можно с N мес» у пустых групп.
    let next: TimelineRow["next"] = null;
    const introduced = introducedInGroup(snapshot, group.code);
    const candidates = firstCandidate(snapshot, productsOfGroup(group.code), 2);
    const mainHere = input.main?.group === group.code;
    let nextText: string | null = null;
    if (introduced === 0 && group.from <= today.months && candidates.length) {
      nextText = `можно с ${group.from} мес: ${candidates.map(productShort).join(", ")}`;
    } else if (mainHere && input.main) {
      nextText = productShort(input.main);
    }
    if (nextText) {
      next = { x: todayX, strong: mainHere };
      boxes.push({ lane: "line", a: todayX - 7, b: todayX + 7 });
      const w = measure(nextText, size, mainHere);
      const right = todayX + 13 + w <= width - 2;
      place(nextText, right ? todayX + 13 : todayX - 13, ["line", "above", "below"], "accent", mainHere, right ? "start" : "end");
    }

    // Справа — «аллергия: куриное яйцо», если аллергия закрывает продукты группы.
    const allergens = [
      ...new Set(
        productsOfGroup(group.code)
          .map((product) => snapshot.state(product))
          .filter((state) => state.status === "allergy" && state.allergen)
          .map((state) => (state.allergen as string).toLowerCase()),
      ),
    ];
    if (allergens.length) place(`аллергия: ${allergens.join(", ")}`, width - 4, ["below", "above", "line"], "bad", true, "end");

    // Штриховка «врач»: риск аллергии — яйцо и рыба.
    const doctorFrom = Math.max(group.from, from);
    const doctor = facts.risk && (group.code === "egg" || group.code === "fish") && doctorFrom < to ? { x: x(doctorFrom), w: x1 - x(doctorFrom) } : null;
    if (doctor) place("врач", x1 - 2, ["above", "below"], "warn", true, "end");

    // Подписи точек: сначала с реакцией, потом по дате; чередуются над и под точкой.
    const hidden: string[] = [];
    const ordered = [...firsts].sort((a, b) => Number(b.food.reaction !== "none") - Number(a.food.reaction !== "none"));
    const turn = new Map(firsts.map((item, order) => [item, order % 2 === 0 ? "above" : "below"] as const));
    for (const item of ordered) {
      const short = item.product ? productShort(item.product) : item.food.productName.trim().toLowerCase();
      const bad = item.food.reaction !== "none";
      const text = bad ? `${short} · ${reactionLabel(item.food.reaction)}` : short;
      const first: Lane = turn.get(item) ?? "above";
      const second: Lane = first === "above" ? "below" : "above";
      if (!place(text, item.x, [first, second], bad ? "bad" : "muted", bad)) hidden.push(item.food.productName);
    }

    const early = group.from > from ? { x: x0, w: x(Math.min(group.from, to)) - x0 } : null;
    return { group: group.code, label: group.label, y, early, doctor, links, points, texts, next, hidden };
  });

  // Под осью: треугольник «старт около 6 мес» и фактический старт; подпись,
  // которой не хватило места рядом, уходит на вторую строку.
  const markerY = bottom + 4;
  const markers: TimelineMarker[] = [];
  const placed: Array<{ a: number; b: number; line: number }> = [];
  const addMarker = (mx: number, tone: TimelineMarker["tone"], label: string, prefer: "start" | "end") => {
    const w = measure(label, size, tone === "bad");
    for (const line of [0, 1]) {
      for (const anchor of prefer === "start" ? (["start", "end"] as const) : (["end", "start"] as const)) {
        const a = anchor === "start" ? mx + 9 : mx - 9 - w;
        const b = a + w;
        if (a < x0 - 2 || b > width - 2) continue;
        if (placed.some((box) => box.line === line && a < box.b + 8 && box.a < b + 8)) continue;
        placed.push({ a, b, line });
        markers.push({ x: mx, tone, label, anchor, labelY: markerY + 9 + line * 14 });
        return;
      }
    }
    markers.push({ x: mx, tone, label, anchor: prefer, labelY: markerY + 23 });
  };
  const target = x(6);
  const startAge = input.start ? feedingAge(birthDate, input.start, facts.gestation) : null;
  const startExact = input.start ? exactOf(input.start) : null;
  const targetLabel = "старт около 6 мес — ВОЗ и МЗ КР";
  if (startAge && startExact != null && Math.abs(startExact - 6) >= 0.5 && startExact >= from) {
    const before = startExact < 6;
    addMarker(target, "accent", targetLabel, before ? "start" : "end");
    addMarker(x(startExact), isTooEarly(startAge) ? "bad" : "muted", `начат в ${ageText(startAge)}`, before ? "end" : "start");
  } else {
    addMarker(target, "accent", targetLabel, "start");
  }
  const secondLine = markers.some((marker) => marker.labelY > markerY + 9);

  // Полоса вскармливания по периодам — цвета как у чипов периодов.
  const periods = [...input.feeding].sort((a, b) => a.startedOn.localeCompare(b.startedOn) || a.id - b.id);
  const parts: TimelineBandPart[] = [];
  periods.forEach((period, order) => {
    const startM = Math.max(from, exactOf(period.startedOn));
    const nextPeriod = periods[order + 1];
    const endM = Math.min(today.exact, nextPeriod ? exactOf(nextPeriod.startedOn) : today.exact);
    if (endM <= startM) return;
    const type = optionLabel(FEEDING_TYPES, period.feedingType).toLowerCase();
    const reason = period.switchReason ? optionLabel(FEEDING_SWITCH_REASONS, period.switchReason).toLowerCase() : "";
    const full = reason ? `${type} · ${reason}` : type;
    const bx = x(startM);
    const bw = x(endM) - bx;
    const fits = (text: string) => measure(text, 10) + 10 <= bw;
    parts.push({
      x: bx,
      w: bw,
      type: period.feedingType,
      label: fits(full) ? full : fits(type) ? type : null,
      title: `${optionLabel(FEEDING_TYPES, period.feedingType)}${reason ? ` (${reason})` : ""} с ${formatDay(period.startedOn)}`,
    });
  });
  const bandY = markerY + (secondLine ? 40 : 26);
  const band = parts.length ? { y: bandY, h: 16, parts } : null;
  const noteY = (band ? bandY + band.h : markerY + 14) + 16;
  const note = today.weeksShort ? { text: `скорр. возраст на ${today.weeksShort} нед меньше`, y: noteY } : null;
  const height = Math.ceil((note ? noteY + 6 : band ? bandY + band.h + 8 : markerY + (secondLine ? 36 : 22)) + 2);

  return { width, height, x0, x1, from, to, top, bottom, ticks, today: { x: todayX }, rows, markers, markerY, band, note };
}

/** Для тестов и подсказок: месяц отметки на оси. */
export function exactAgeOn(birthDate: string, day: string): number | null {
  return calendarAge(birthDate, day)?.exact ?? null;
}

/** Группа отметки: из каталога или как записана. */
export function foodGroupOf(food: Pick<FoodIntroduction, "productCode" | "productName" | "foodGroup">): FoodGroup {
  return foodProduct(food)?.group ?? food.foodGroup;
}

/** Группа словами строчными: «овощи». */
export function groupLower(group: FoodGroup): string {
  return groupInfo(group).lower;
}

/** Сегодня строкой YYYY-MM-DD. */
export function todayIso(): string {
  return dayjs().format(ISO);
}
