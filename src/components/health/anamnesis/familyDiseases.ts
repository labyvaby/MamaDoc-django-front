import type { FamilyDisease, FamilyDiseaseGroup } from "../../../api/health";
import { lowerFirst } from "./russian";

/**
 * Каталог болезней родственников (ТЗ §2.4): кнопки окна родственника, краткие
 * названия для родословной, группы для направленности отягощённости.
 * Инфекций (туберкулёз, гепатиты, ВИЧ, сифилис) здесь нет: они не
 * наследственные и закрытые — для них карточка «Эпиданамнез».
 */

export interface FamilyDiseaseEntry {
  code: string;
  /** Полное название — в окне, легенде и абзаце. */
  title: string;
  /** Коротко — подпись под символом родословной. */
  short: string;
  group: FamilyDiseaseGroup;
  /** Моногенная или хромосомная по умолчанию. */
  hereditary: boolean;
}

export const FAMILY_DISEASE_GROUPS: ReadonlyArray<{ value: FamilyDiseaseGroup; label: string; direction: string }> = [
  { value: "allergic", label: "Аллергия", direction: "аллергические заболевания" },
  { value: "cardiovascular", label: "Сердце и сосуды", direction: "болезни сердца и сосудов" },
  { value: "digestive", label: "Пищеварение", direction: "болезни органов пищеварения" },
  { value: "endocrine", label: "Эндокринные и обмен", direction: "эндокринные болезни и болезни обмена" },
  { value: "renal", label: "Почки", direction: "болезни почек" },
  { value: "neuro", label: "Нервная система и психика", direction: "болезни нервной системы и психики" },
  { value: "blood", label: "Кровь", direction: "болезни крови" },
  { value: "oncology", label: "Онкология", direction: "онкологические заболевания" },
  { value: "respiratory", label: "Дыхание", direction: "болезни органов дыхания" },
  { value: "musculoskeletal", label: "Кости и суставы", direction: "болезни костей и суставов" },
  { value: "hereditary", label: "Наследственные синдромы и пороки", direction: "наследственные синдромы и пороки" },
  { value: "eye", label: "Глаза", direction: "болезни глаз" },
  { value: "hearing", label: "Слух", direction: "нарушения слуха" },
  { value: "other", label: "Другое", direction: "прочие" },
];

const entry = (code: string, title: string, short: string, group: FamilyDiseaseGroup, hereditary = false): FamilyDiseaseEntry => ({
  code,
  title,
  short,
  group,
  hereditary,
});

export const FAMILY_DISEASES: ReadonlyArray<FamilyDiseaseEntry> = [
  entry("atopic_dermatitis", "Атопический дерматит", "атоп. дерматит", "allergic"),
  entry("asthma", "Бронхиальная астма", "астма", "allergic"),
  entry("hay_fever", "Поллиноз и аллергический ринит", "поллиноз", "allergic"),
  entry("food_drug_allergy", "Пищевая и лекарственная аллергия", "аллергия", "allergic"),
  entry("urticaria", "Крапивница", "крапивница", "allergic"),
  entry("hypertension", "Гипертоническая болезнь", "гипертония", "cardiovascular"),
  entry("ihd", "ИБС и инфаркт", "ИБС", "cardiovascular"),
  entry("stroke", "Инсульт", "инсульт", "cardiovascular"),
  entry("heart_defect", "Порок сердца", "порок сердца", "cardiovascular"),
  entry("ulcer", "Язвенная болезнь", "язва", "digestive"),
  entry("gastritis", "Хронический гастрит", "гастрит", "digestive"),
  entry("cholecystitis", "Холецистит и желчнокаменная болезнь", "холецистит", "digestive"),
  entry("celiac", "Целиакия", "целиакия", "digestive"),
  entry("diabetes_1", "Сахарный диабет 1 типа", "диабет 1 типа", "endocrine"),
  entry("diabetes_2", "Сахарный диабет 2 типа", "диабет 2 типа", "endocrine"),
  entry("thyroid", "Болезни щитовидной железы", "щитовидная железа", "endocrine"),
  entry("obesity", "Ожирение", "ожирение", "endocrine"),
  entry("kidney", "Болезни почек", "почки", "renal"),
  entry("urolithiasis", "Мочекаменная болезнь", "мочекаменная", "renal"),
  entry("epilepsy", "Эпилепсия", "эпилепсия", "neuro"),
  entry("autism", "Расстройство аутистического спектра", "РАС", "neuro"),
  entry("mental", "Психическое заболевание", "психич. болезнь", "neuro"),
  entry("migraine", "Мигрень", "мигрень", "neuro"),
  entry("anemia", "Анемия", "анемия", "blood"),
  entry("hemophilia", "Гемофилия", "гемофилия", "blood", true),
  entry("oncology", "Онкологическое заболевание", "онкология", "oncology"),
  entry("copd", "Хронический бронхит и ХОБЛ", "ХОБЛ", "respiratory"),
  entry("cystic_fibrosis", "Муковисцидоз", "муковисцидоз", "respiratory", true),
  entry("hip_dysplasia", "Дисплазия тазобедренных суставов", "дисплазия ТБС", "musculoskeletal"),
  entry("scoliosis", "Сколиоз", "сколиоз", "musculoskeletal"),
  entry("arthritis", "Артрит и артроз", "артрит", "musculoskeletal"),
  entry("chromosomal", "Синдром Дауна и другие хромосомные болезни", "хромосомная", "hereditary", true),
  entry("monogenic", "Моногенная болезнь", "моногенная", "hereditary", true),
  entry("malformation", "Врождённый порок развития", "порок развития", "hereditary"),
  entry("myopia", "Близорукость", "близорукость", "eye"),
  entry("strabismus", "Косоглазие", "косоглазие", "eye"),
  entry("hearing_loss", "Тугоухость и глухота", "тугоухость", "hearing"),
];

const BY_CODE = new Map(FAMILY_DISEASES.map((item) => [item.code, item]));

export function familyDiseaseEntry(code: string): FamilyDiseaseEntry | undefined {
  return BY_CODE.get(code);
}

/** Коды каталога, дающие фактор «порок или хромосомная болезнь у родственников». */
export const MALFORMATION_CODES: ReadonlySet<string> = new Set(["chromosomal", "malformation"]);

/** Подпись под символом: краткое название каталога или своё название. */
export function diseaseShort(disease: Pick<FamilyDisease, "code" | "title">): string {
  const known = BY_CODE.get(disease.code);
  if (known) return known.short;
  const title = lowerFirst(disease.title.trim());
  return title.length > 18 ? `${title.slice(0, 17)}…` : title;
}

/** Новая болезнь из каталога для строки паспорта. */
export function diseaseFromCatalog(code: string): FamilyDisease | null {
  const known = BY_CODE.get(code);
  if (!known) return null;
  return { code: known.code, title: known.title, group: known.group, hereditary: known.hereditary, causeOfDeath: false };
}

export function directionLabel(group: FamilyDiseaseGroup): string {
  return FAMILY_DISEASE_GROUPS.find((item) => item.value === group)?.direction ?? "";
}

/** Инфекции в названии болезни — им место в закрытой карточке. */
export function isSensitiveDiseaseTitle(title: string): boolean {
  return /вич|hiv|гепатит|сифилис|туберкул/i.test(title);
}
