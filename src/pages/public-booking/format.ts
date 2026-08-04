/**
 * Форматы публичной витрины `/book/*`.
 *
 * Здесь свои функции, а не общие из `utility/format`: тексты витрины читает
 * пациент, а не сотрудник. Общий `formatKGS` печатает Intl-код валюты
 * («1 000 KGS») — внутри CRM это привычно, но гостю выглядит как недоделка.
 * Менять его во всём продукте (283 использования) — отдельная задача.
 */

/** Цена гостю: «1 000 сом». Бэк отдаёт decimal строкой. */
export function formatSom(value: string | number | null | undefined): string {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? Math.round(num) : 0;
  return `${safe.toLocaleString("ru-RU")} сом`;
}

/** Длительность: «30 мин», «1 ч», «1 ч 30 мин». */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} мин`;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/** Телефон в `tel:`-ссылку: «+996 (555) 12-34-56» → «tel:+996555123456». */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * Телефон для показа: «+996508766555» → «+996 508 766 555». Бэк хранит номер
 * слитно, и такой номер в шапке читается как строка из базы, а не как контакт.
 * Незнакомый формат оставляем как есть — лучше сырой номер, чем неверные группы.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("996")) {
    const n = digits.slice(3);
    return `+996 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const n = digits.slice(1);
    return `+7 ${n.slice(0, 3)} ${n.slice(3, 6)}-${n.slice(6, 8)}-${n.slice(8)}`;
  }
  return phone;
}

const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/**
 * Дата гостю: «2026-03-13» → «13 марта». Считаем по частям строки, а не через
 * `new Date()`: бэк присылает календарную дату без времени, и разбор её как UTC
 * в отрицательных таймзонах сдвигает день на сутки назад.
 */
export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  const monthName = MONTHS_GEN[Number(month) - 1];
  if (!monthName || !day) return isoDate;
  return `${Number(day)} ${monthName}`;
}

/** Сегодняшняя дата в формате бэка (YYYY-MM-DD) по локальному времени гостя. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Дата через `days` дней от сегодня в формате бэка. */
export function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Монограмма клиники для шапки: «Мама Доктор» → «МД». */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "•";
  const letters = words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("");
}
