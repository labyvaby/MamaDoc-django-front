/**
 * Текст печатного бланка с подстановками `{child.fullName}`: заполнение,
 * проверка и образцы. Общий модуль для печати документов учёта и экрана
 * «Печатные бланки». Правило синтаксиса совпадает с бэкендом
 * (`printforms.models.PLACEHOLDER_RE`).
 */

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_.]*)\}/g;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface BlankPlaceholder {
  path: string;
  label: string;
}

/** Что можно вставить в бланк учёта — ключи контекста печати подключения. */
export const BLANK_PLACEHOLDERS: BlankPlaceholder[] = [
  { path: "child.fullName", label: "ФИО ребёнка" },
  { path: "child.birthDate", label: "Дата рождения" },
  { path: "child.age", label: "Возраст" },
  { path: "child.address", label: "Адрес" },
  { path: "child.phone", label: "Телефон ребёнка" },
  { path: "child.cardNumber", label: "Номер карты" },
  { path: "child.birthCertificateNumber", label: "Свидетельство о рождении" },
  { path: "child.birthCertificateIssuedOn", label: "Дата выдачи свидетельства" },
  { path: "representative.fullName", label: "ФИО представителя" },
  { path: "representative.relation", label: "Кем приходится" },
  { path: "representative.phone", label: "Телефон представителя" },
  { path: "enrollment.residence", label: "Проживает" },
  { path: "enrollment.arrivedFrom", label: "Откуда прибыл" },
  { path: "program.name", label: "Программа" },
  { path: "term.startsOn", label: "Срок с" },
  { path: "term.endsOn", label: "Срок по" },
  { path: "term.priceAmount", label: "Цена" },
  { path: "responsibleEmployee", label: "Врач" },
  { path: "branch.name", label: "Филиал" },
  { path: "branch.address", label: "Адрес филиала" },
  { path: "branch.phones", label: "Телефоны филиала" },
  { path: "organization.name", label: "Клиника" },
  { path: "today", label: "Сегодня" },
];

/** Образец расписки при постановке. Юридический текст правит клиника. */
export const SAMPLE_OBLIGATION_TEXT = [
  "Расписка-обязательство",
  "",
  "Я, {representative.fullName} ({representative.relation}), законный представитель ребёнка {child.fullName}, возраст {child.age}, адрес: {child.address},",
  "при постановке ребёнка на учёт в {organization.name} беру на себя обязательство:",
  "— соблюдать календарь профилактических прививок;",
  "— сообщать в клинику об изменении адреса и номера телефона;",
  "— приводить ребёнка на плановые осмотры; при непосещении клиники 6 и более месяцев без уважительной причины ребёнок может быть снят с учёта.",
  "",
  "С календарём прививок ознакомлен(а) ______________________",
  "",
  "Дата {today}                    Подпись ______________________",
].join("\n");

/** Данные для предпросмотра бланка в настройках. */
export const SAMPLE_BLANK_DATA: Record<string, unknown> = {
  today: "2026-09-26",
  child: {
    fullName: "Иванов Али",
    birthDate: "2025-06-26",
    age: "1 год 3 месяца",
    address: "Бишкек, ул. Токтогула 1",
    phone: "+996 700 000 012",
    cardNumber: "МД-7",
    birthCertificateNumber: "KR-I 123456",
    birthCertificateIssuedOn: "2025-07-01",
  },
  representative: { fullName: "Иванова Айгуль", relation: "Мать", phone: "+996 700 000 012" },
  enrollment: { residence: "Постоянно", arrivedFrom: "Роддом №2" },
  program: { name: "Наблюдение ребёнка первого года" },
  term: { startsOn: "2026-09-26", endsOn: "2027-09-25", priceAmount: "5000.00" },
  responsibleEmployee: "Асанова Нургуль",
  branch: { name: "Главный филиал", address: "Бишкек, ул. Киевская 10", phones: ["+996 312 000 000"] },
  organization: { name: "Клиника" },
};

export function lookupPath(data: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
      data,
    );
}

/** Значение для бумаги: ISO-дата → ДД.ММ.ГГГГ, список → через запятую, объект → пусто. */
export function formatBlankValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(formatBlankValue).filter(Boolean).join(", ");
  if (typeof value === "object") return "";
  const text = String(value);
  const iso = ISO_DATE.exec(text);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : text;
}

export function fillBlank(body: string, data: Record<string, unknown>): string {
  return body.replace(PLACEHOLDER, (_, path: string) => formatBlankValue(lookupPath(data, path)));
}

export function hasBrokenBraces(body: string): boolean {
  return /[{}]/.test(body.replace(PLACEHOLDER, ""));
}

export function unknownPlaceholders(body: string): string[] {
  const known = new Set(BLANK_PLACEHOLDERS.map((item) => item.path));
  const found = [...body.matchAll(PLACEHOLDER)].map((match) => match[1]);
  return [...new Set(found.filter((path) => !known.has(path)))];
}
