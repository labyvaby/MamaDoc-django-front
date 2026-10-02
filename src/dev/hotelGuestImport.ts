/**
 * Импорт гостей из Excel/CSV: разбор файла, угадывание колонок по заголовкам
 * («ФИО», «Телефон», «Паспорт», «Дата рождения»…), приведение значений к
 * формату бэкенда и проверка строк. Без React — чтобы проверить тестами
 * (hotelGuestImport.test.ts); диалог — GuestImportDialog.tsx.
 */
import type { HotelGuestCreateData } from "../api/hotel";
import { capitalizeFullName } from "../utility/name";
import { DEFAULT_PHONE_COUNTRY_CODE, parsePastedPhone } from "../utility/phone";

export type GuestImportField =
  | "skip"
  | "fullName"
  | "lastName"
  | "firstName"
  | "middleName"
  | "phone"
  | "email"
  | "dob"
  | "gender"
  | "citizenship"
  | "documentType"
  | "documentNumber"
  | "inn"
  | "documentExpiry"
  | "registrationAddress"
  | "placeOfBirth"
  | "preferences";

export const GUEST_IMPORT_FIELDS: { key: GuestImportField; label: string }[] = [
  { key: "skip", label: "Не загружать" },
  { key: "fullName", label: "ФИО целиком" },
  { key: "lastName", label: "Фамилия" },
  { key: "firstName", label: "Имя" },
  { key: "middleName", label: "Отчество" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "dob", label: "Дата рождения" },
  { key: "gender", label: "Пол" },
  { key: "citizenship", label: "Гражданство" },
  { key: "documentType", label: "Тип документа" },
  { key: "documentNumber", label: "Номер документа / паспорта" },
  { key: "inn", label: "ИНН / ПИН" },
  { key: "documentExpiry", label: "Срок действия документа" },
  { key: "registrationAddress", label: "Адрес прописки" },
  { key: "placeOfBirth", label: "Место рождения" },
  { key: "preferences", label: "Примечание" },
];

const SYNONYMS: [GuestImportField, string[]][] = [
  ["fullName", ["фио", "ф.и.о", "ф и о", "гость", "клиент", "full name", "fullname", "guest", "имя и фамилия", "фамилия имя", "фамилия имя отчество", "заказчик", "фио организатора"]],
  ["lastName", ["фамилия", "last name", "surname", "lastname"]],
  ["firstName", ["имя", "first name", "firstname", "name"]],
  ["middleName", ["отчество", "middle name", "patronymic"]],
  ["phone", ["телефон", "тел", "тел.", "phone", "mobile", "моб", "мобильный", "номер телефона", "whatsapp", "контакт"]],
  ["email", ["email", "e-mail", "почта", "эл. почта", "электронная почта", "mail"]],
  ["dob", ["дата рождения", "д.р.", "др", "день рождения", "birth", "birthday", "date of birth", "dob"]],
  ["gender", ["пол", "gender", "sex"]],
  ["citizenship", ["гражданство", "citizenship", "nationality", "страна", "country"]],
  ["documentType", ["тип документа", "вид документа", "document type"]],
  ["documentNumber", ["паспорт", "номер паспорта", "№ паспорта", "серия и номер", "номер документа", "документ", "passport", "passport no", "document", "id"]],
  ["inn", ["инн", "пин", "inn", "pin", "персональный номер"]],
  ["documentExpiry", ["срок действия", "действителен до", "годен до", "expiry", "expiration", "valid until"]],
  ["registrationAddress", ["адрес", "адрес прописки", "прописка", "address", "адрес регистрации"]],
  ["placeOfBirth", ["место рождения", "place of birth"]],
  ["preferences", ["примечание", "комментарий", "заметки", "notes", "comment", "предпочтения"]],
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[_:*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Поле по заголовку колонки: сначала точное совпадение, потом «начинается с». */
export function guessField(header: string): GuestImportField {
  const h = norm(header);
  if (!h) return "skip";
  for (const [field, words] of SYNONYMS) if (words.some((w) => norm(w) === h)) return field;
  for (const [field, words] of SYNONYMS) if (words.some((w) => w.length >= 3 && h.startsWith(norm(w)))) return field;
  return "skip";
}

/** Одно поле на колонку: повторное угадывание того же поля — «Не загружать». */
export function guessMapping(headers: string[]): GuestImportField[] {
  const used = new Set<GuestImportField>();
  return headers.map((h) => {
    const f = guessField(h);
    if (f === "skip" || used.has(f)) return "skip";
    used.add(f);
    return f;
  });
}

/** CSV из Excel/Google: разделитель «;», «,» или табуляция, кавычки по RFC 4180. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportCell = string | number | Date | null;

/** Собрать дату и проверить, что такой день есть (31.02 — нет). */
function isoDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Дата из ячейки: Date, серийный номер Excel или строка в привычных форматах → "YYYY-MM-DD". */
export function normalizeDate(value: ImportCell): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    if (value < 1 || value > 80000) return null;
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return normalizeDate(new Date(ms));
  }
  const s = value.trim();
  // Строгий разбор без плагина dayjs: 01.02.1990, 1.2.90, 01/02/1990, 01-02-1990, 1990-02-01.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (!dmy) return null;
  let year = Number(dmy[3]);
  if (dmy[3].length === 2) year += year > (new Date().getFullYear() % 100) ? 1900 : 2000;
  return isoDate(year, Number(dmy[2]), Number(dmy[1]));
}

export function normalizeGender(value: ImportCell): "male" | "female" | "" {
  const s = norm(String(value ?? ""));
  if (!s) return "";
  if (["м", "муж", "мужской", "male", "m", "man", "эркек"].includes(s)) return "male";
  if (["ж", "жен", "женский", "female", "f", "woman", "аял"].includes(s)) return "female";
  return "";
}

/** Телефон в международном виде (+996…), местные «0700…» — с кодом Кыргызстана. */
export function normalizeImportPhone(value: ImportCell): string {
  const raw = String(value ?? "").trim();
  if (!raw.replace(/\D/g, "")) return "";
  const parsed = parsePastedPhone(DEFAULT_PHONE_COUNTRY_CODE, raw);
  return parsed.local ? `${parsed.countryCode}${parsed.local}` : "";
}

const text = (v: ImportCell): string => (v == null ? "" : v instanceof Date ? (normalizeDate(v) ?? "") : String(v)).trim();

const RESIDENT_CITIZENSHIP = new Set(["кр", "kg", "kgz", "кыргызстан", "киргизия", "kyrgyzstan", "кыргызская республика"]);

export interface GuestImportRow {
  /** Номер строки в файле (с учётом шапки) — для отчёта об ошибках. */
  line: number;
  data: HotelGuestCreateData | null;
  errors: string[];
  warnings: string[];
  /** Ключ поиска дублей: телефон, иначе номер документа, иначе ФИО. */
  key: string;
  /** Для показа в проверке — даже у строк с ошибкой. */
  name: string;
  phone: string;
  documentNumber: string;
}

export function buildGuestRow(cells: ImportCell[], mapping: GuestImportField[], line: number): GuestImportRow {
  const get = (f: GuestImportField): ImportCell => {
    const i = mapping.indexOf(f);
    return i >= 0 ? (cells[i] ?? null) : null;
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const nameParts = [text(get("lastName")), text(get("firstName")), text(get("middleName"))].filter(Boolean);
  const fullName = capitalizeFullName(text(get("fullName")) || nameParts.join(" "));
  if (!fullName) errors.push("Нет ФИО");
  else if (fullName.length > 200) errors.push("ФИО длиннее 200 символов");

  const phoneRaw = text(get("phone"));
  const phone = normalizeImportPhone(phoneRaw);
  if (phoneRaw && !phone) warnings.push(`Телефон «${phoneRaw}» не распознан — не загрузим`);

  const email = text(get("email"));
  const emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) warnings.push(`Email «${email}» с ошибкой — не загрузим`);

  const dobCell = get("dob");
  const dob = normalizeDate(dobCell);
  if (text(dobCell) && !dob) warnings.push(`Дата рождения «${text(dobCell)}» не распознана`);

  const expiryCell = get("documentExpiry");
  const documentExpiry = normalizeDate(expiryCell);
  if (text(expiryCell) && !documentExpiry) warnings.push(`Срок действия «${text(expiryCell)}» не распознан`);

  const documentNumber = text(get("documentNumber")).replace(/\s+/g, "").toUpperCase();
  const citizenship = text(get("citizenship"));
  const inn = text(get("inn")).replace(/\s+/g, "");
  const resident = RESIDENT_CITIZENSHIP.has(norm(citizenship)) || /^(ID|AN|AC)\d{7}$/.test(documentNumber) || /^\d{14}$/.test(inn);
  const docTypeRaw = norm(text(get("documentType")));
  const documentType = docTypeRaw.includes("id") || docTypeRaw.includes("карт")
    ? "id_card"
    : docTypeRaw.includes("пасп") || docTypeRaw.includes("pass")
      ? "passport"
      : documentNumber
        ? resident
          ? "id_card"
          : "passport"
        : undefined;
  if (!documentNumber) warnings.push("Без документа — паспорт попросим при заселении");

  const data: HotelGuestCreateData | null = errors.length
    ? null
    : {
        fullName,
        phone: phone || undefined,
        email: emailOk && email ? email : undefined,
        dob: dob ?? undefined,
        gender: normalizeGender(get("gender")) || undefined,
        guestType: documentNumber || citizenship || inn ? (resident ? "resident" : "foreign") : undefined,
        citizenship: !resident && citizenship ? citizenship.slice(0, 120) : undefined,
        documentType,
        documentNumber: documentNumber || undefined,
        inn: inn || undefined,
        documentExpiry: documentExpiry ?? undefined,
        registrationAddress: text(get("registrationAddress")) || undefined,
        placeOfBirth: text(get("placeOfBirth")) || undefined,
        preferences: text(get("preferences")) || undefined,
      };
  const key = phone ? `p:${phone}` : documentNumber ? `d:${documentNumber}` : `n:${fullName.toLowerCase()}`;
  return { line, data, errors, warnings, key, name: fullName, phone, documentNumber };
}

/** Помечает повторы внутри файла: первая строка остаётся, следующие — с ошибкой. */
export function markFileDuplicates(rows: GuestImportRow[]): GuestImportRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (!r.data) return r;
    const first = seen.get(r.key);
    if (first != null) return { ...r, data: null, errors: [...r.errors, `Повтор строки ${first}`] };
    seen.set(r.key, r.line);
    return r;
  });
}

export interface RawLine {
  /** Номер строки в листе/файле, 1-based. */
  line: number;
  cells: ImportCell[];
}

export interface ImportTable {
  headers: string[];
  rows: RawLine[];
}

const filled = (c: ImportCell) => c != null && String(c instanceof Date ? "d" : c).trim() !== "";

/**
 * Шапка таблицы — первая из первых 15 строк, где хотя бы две ячейки и
 * узнаётся хоть одна колонка (над шапкой бывают заголовок и пояснения, как
 * в нашем же шаблоне). Не нашли — берём первую непустую строку.
 */
export function extractTable(lines: RawLine[]): ImportTable {
  const nonEmpty = lines.filter((l) => l.cells.some(filled));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const candidates = nonEmpty.slice(0, 15);
  const headerIndex = Math.max(
    0,
    candidates.findIndex((l) => l.cells.filter(filled).length >= 2 && l.cells.some((c) => typeof c === "string" && guessField(c) !== "skip")),
  );
  const header = nonEmpty[headerIndex];
  const width = Math.max(...nonEmpty.slice(headerIndex).map((l) => l.cells.length));
  const headers = Array.from({ length: width }, (_, i) => String(header.cells[i] ?? "").trim());
  return { headers, rows: nonEmpty.slice(headerIndex + 1) };
}
