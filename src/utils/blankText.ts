/**
 * Текст печатного бланка с подстановками `{child.fullName}`: заполнение,
 * проверка и образцы. Общий модуль для печати документов учёта и экрана
 * «Печатные бланки». Правило синтаксиса совпадает с бэкендом
 * (`printforms.models.PLACEHOLDER_RE`).
 */

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_.]*)\}/g;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Суммы приходят строкой «24000.00» — на бумаге «24 000».
const MONEY = /^(\d+)\.(\d{2})$/;

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
  { path: "package.name", label: "Пакет" },
  { path: "package.priceAmount", label: "Цена пакета" },
  { path: "package.listPriceAmount", label: "Официальная цена" },
  { path: "package.description", label: "Что входит" },
  { path: "term.startsOn", label: "Срок с" },
  { path: "term.endsOn", label: "Срок по" },
  { path: "term.priceAmount", label: "Цена" },
  { path: "term.discountAmount", label: "Скидка" },
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

/**
 * Образец договора при постановке. Реквизиты клиники, подписанта и паспорт
 * представителя система не хранит — клиника вписывает их в бланк один раз,
 * паспорт заполняется от руки. Юридический текст проверяет юрист клиники.
 */
export const SAMPLE_CONTRACT_TEXT = [
  "ДОГОВОР № {child.cardNumber}",
  "на медицинское наблюдение ребёнка",
  "",
  "г. Бишкек                                                                              {today}",
  "",
  "{organization.name} (далее — Клиника) в лице ______________________________, действующего на основании ____________, с одной стороны, и {representative.fullName}, {representative.relation} ребёнка (далее — Заказчик), с другой стороны, заключили настоящий договор.",
  "",
  "1. ПРЕДМЕТ ДОГОВОРА",
  "1.1. Клиника ведёт медицинское наблюдение ребёнка {child.fullName}, дата рождения {child.birthDate} (далее — Пациент), по программе «{program.name}», пакет «{package.name}», а Заказчик оплачивает услуги.",
  "1.2. В пакет входит: {package.description}",
  "1.3. Срок наблюдения: с {term.startsOn} по {term.endsOn}.",
  "1.4. Номер медицинской карты Пациента: {child.cardNumber}. Закреплённый врач: {responsibleEmployee}.",
  "",
  "2. СТОИМОСТЬ И ОПЛАТА",
  "2.1. Цена пакета по прейскуранту — {package.priceAmount} сом.",
  "2.2. Стоимость услуг по договору за срок наблюдения с учётом скидок — {term.priceAmount} сом.",
  "2.3. Оплата вносится в кассу Клиники наличными или безналичным способом. Услуги, не входящие в пакет, оплачиваются по прейскуранту Клиники.",
  "",
  "3. ОБЯЗАННОСТИ КЛИНИКИ",
  "3.1. Оказывать услуги, входящие в пакет, силами квалифицированных специалистов.",
  "3.2. Вести медицинскую карту Пациента и хранить врачебную тайну.",
  "3.3. Напоминать Заказчику о плановых осмотрах и прививках по национальному календарю.",
  "",
  "4. ОБЯЗАННОСТИ ЗАКАЗЧИКА",
  "4.1. Сообщать достоверные сведения о здоровье Пациента.",
  "4.2. Приводить Пациента на плановые осмотры, соблюдать календарь профилактических прививок и рекомендации врача.",
  "4.3. Сообщать Клинике об изменении адреса и номера телефона.",
  "4.4. Своевременно оплачивать услуги.",
  "",
  "5. СРОК ДЕЙСТВИЯ И РАСТОРЖЕНИЕ",
  "5.1. Договор вступает в силу с момента подписания и действует до {term.endsOn}.",
  "5.2. Если Пациент не посещает Клинику 6 месяцев и более без уважительной причины, он может быть снят с учёта.",
  "5.3. Договор расторгается по соглашению сторон или по заявлению Заказчика. Деньги за неоказанные услуги возвращаются в порядке, установленном законодательством Кыргызской Республики.",
  "",
  "6. ПРОЧИЕ УСЛОВИЯ",
  "6.1. Заказчик согласен на обработку своих персональных данных и данных Пациента для исполнения договора.",
  "6.2. Споры решаются переговорами, а если согласия нет — в порядке, установленном законодательством Кыргызской Республики.",
  "6.3. Договор составлен в двух экземплярах, по одному для каждой стороны.",
  "",
  "7. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН",
  "Клиника: {organization.name}",
  "Адрес: {branch.address}, тел.: {branch.phones}",
  "ИНН ______________   Р/с ______________________   Банк ______________________",
  "______________________ / ______________________ /          М. П.",
  "",
  "Заказчик: {representative.fullName}",
  "Паспорт: серия ______ № ______________, выдан ______________________________________",
  "Адрес: {child.address}",
  "Телефон: {representative.phone}",
  "______________________ / {representative.fullName} /",
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
  package: {
    name: "Карта здоровья ребёнка",
    priceAmount: "24000.00",
    listPriceAmount: "30000.00",
    description: "Личный кабинет, карта здоровья, 4 профилактических осмотра в год",
  },
  term: { startsOn: "2026-09-26", endsOn: "2027-09-25", priceAmount: "18000.00", discountAmount: "0.00" },
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

/**
 * Значение для бумаги: ISO-дата → ДД.ММ.ГГГГ, сумма «24000.00» → «24 000»
 * (копейки — через запятую), список → через запятую, объект → пусто.
 */
export function formatBlankValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(formatBlankValue).filter(Boolean).join(", ");
  if (typeof value === "object") return "";
  const text = String(value);
  const iso = ISO_DATE.exec(text);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const money = MONEY.exec(text);
  if (!money) return text;
  const whole = money[1].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return money[2] === "00" ? whole : `${whole},${money[2]}`;
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
