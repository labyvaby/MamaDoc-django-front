/**
 * Правила полей форм отеля: очистка ввода по типу поля и проверка значения.
 * Компонент поля — FormField (formField.tsx); формы зовут fieldError /
 * hasFieldErrors для кнопки «Сохранить», чтобы проверка была одна и та же.
 */
export type FieldKind = "text" | "int" | "decimal" | "phone" | "email";

export interface FieldRules {
  kind?: FieldKind;
  required?: boolean;
  /** Для int/decimal — границы значения. */
  min?: number;
  max?: number;
  /** Для decimal — знаков после запятой (по умолчанию 2). */
  maxDecimals?: number;
  /** Длина строки (для text/int). */
  maxLength?: number;
  /** Своя проверка поверх стандартной — вернуть текст ошибки или null. */
  validate?: (value: string) => string | null;
}

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** Очистить ввод по типу поля: лишние символы просто не попадают в значение. */
export function sanitizeFieldInput(raw: string, rules: FieldRules = {}): string {
  const { kind = "text", min, maxDecimals = 2, maxLength } = rules;
  const allowMinus = min != null && min < 0;
  if (kind === "int") {
    const minus = allowMinus && raw.trimStart().startsWith("-") ? "-" : "";
    return minus + raw.replace(/\D/g, "").slice(0, maxLength ?? 7);
  }
  if (kind === "decimal") {
    const minus = allowMinus && raw.trimStart().startsWith("-") ? "-" : "";
    const cleaned = raw.replace(",", ".").replace(/[^\d.]/g, "");
    const [intPart, ...rest] = cleaned.split(".");
    const frac = rest.join("").slice(0, maxDecimals);
    return minus + (rest.length > 0 ? `${intPart.slice(0, 9)}.${frac}` : intPart.slice(0, 9));
  }
  if (kind === "phone") {
    // Цифры, «+» только в начале, пробелы/скобки/дефисы для удобства набора.
    const plus = raw.trimStart().startsWith("+") ? "+" : "";
    return plus + raw.replace(/[^\d\s()-]/g, "").slice(0, 20);
  }
  if (kind === "email") return raw.replace(/\s/g, "").slice(0, maxLength ?? 254);
  return maxLength != null ? raw.slice(0, maxLength) : raw;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Текст ошибки поля или null. Пустое необязательное поле — не ошибка. */
export function fieldError(value: string | number | null | undefined, rules: FieldRules = {}): string | null {
  const { kind = "text", required, min, max, maxLength } = rules;
  const v = value == null ? "" : String(value).trim();
  if (v === "") return required ? "Обязательное поле" : null;
  if (kind === "int" || kind === "decimal") {
    if (v === "-" || v === "." || v.endsWith(".")) return "Введите число";
    const n = Number(v);
    if (!Number.isFinite(n)) return "Введите число";
    if (kind === "int" && !Number.isInteger(n)) return "Только целое число";
    if (min != null && n < min) return `Не меньше ${fmt(min)}`;
    if (max != null && n > max) return `Не больше ${fmt(max)}`;
  }
  if (kind === "phone") {
    const digits = v.replace(/\D/g, "").length;
    if (digits < 9 || digits > 15) return "Телефон: от 9 до 15 цифр";
  }
  if (kind === "email" && !EMAIL_RE.test(v)) return "Проверьте email: имя@почта.kg";
  if (kind === "text" && maxLength != null && v.length > maxLength) return `Не длиннее ${maxLength} символов`;
  return rules.validate ? rules.validate(v) : null;
}

/** Есть ли ошибка хоть в одном поле — для disabled у «Сохранить». */
export function hasFieldErrors(fields: Array<[value: string | number | null | undefined, rules: FieldRules]>): boolean {
  return fields.some(([value, rules]) => fieldError(value, rules) != null);
}

/**
 * Правила полей гостя и документа — общие для «Новой брони» и «Нового гостя».
 * Документы проверяем мягко: формат номера — подсказкой, чтобы опечатку было
 * видно сразу, а не после отказа при регистрации гостя.
 */
export const GUEST_RULES = {
  phone: { kind: "phone" },
  email: { kind: "email" },
  short: { maxLength: 100 },
  long: { maxLength: 200 },
  comment: { maxLength: 1000 },
  // ID-карта/паспорт КР: 2 буквы и 7 цифр (ID1234567, AN1234567).
  idNumber: {
    maxLength: 12,
    validate: (v: string) => (/^[A-Za-zА-Яа-я]{2}d{7}$/.test(v) ? null : "Формат: 2 буквы и 7 цифр, например ID1234567"),
  },
  // ИНН физлица КР — 14 цифр.
  inn: { kind: "int", maxLength: 14, validate: (v: string) => (v.length === 14 ? null : "ИНН — 14 цифр") },
  docNumber: {
    maxLength: 20,
    validate: (v: string) => (/^[A-Za-zА-Яа-я0-9-]{5,20}$/.test(v) ? null : "От 5 до 20 букв и цифр, без пробелов"),
  },
} satisfies Record<string, FieldRules>;

/**
 * После неудачной попытки сохранить — прокрутить к первому полю с ошибкой и
 * поставить в него курсор (тот же приём, что useFormValidation). Ошибки
 * появляются в DOM на следующем кадре, поэтому ждём два кадра.
 */
export function focusFirstFieldError(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const control = document.querySelector(".MuiFormHelperText-root.Mui-error")?.closest(".MuiFormControl-root");
      const input = control?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, [role=combobox]");
      control?.scrollIntoView({ block: "center", behavior: "smooth" });
      input?.focus({ preventScroll: true });
    }),
  );
}
