/**
 * Форматы публичной витрины `/book/*`.
 *
 * Здесь свои функции, а не общие из `utility/format`: тексты витрины читает
 * пациент, а не сотрудник. Общий `formatKGS` печатает Intl-код валюты
 * («1 000 KGS») — внутри CRM это привычно, но гостю выглядит как недоделка.
 * Менять его во всём продукте (283 использования) — отдельная задача.
 */

/**
 * Цена гостю: «1 500 сом». Эталон пишет короткое «с», но заказчик оставил
 * привычное для пациентов «сом».
 */
export function formatPrice(value: string | number | null | undefined): string {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? Math.round(num) : 0;
  return `${safe.toLocaleString("ru-RU")} сом`;
}

/** Русская плюрализация: 1 окно / 2 окна / 5 окон. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Подпись чипа на плитке дня: «нет окон», «3 окна». */
export function formatSlotsCount(count: number): string {
  if (!count) return "нет окон";
  return `${count} ${plural(count, "окно", "окна", "окон")}`;
}

/** «3 услуги» — счётчик в шапке списка и в итоге. */
export function formatServicesCount(count: number): string {
  return `${count} ${plural(count, "услуга", "услуги", "услуг")}`;
}

/** «12 отзывов» — рядом с рейтингом врача. */
export function formatReviewsCount(count: number): string {
  return `${count} ${plural(count, "отзыв", "отзыва", "отзывов")}`;
}

/** «Стаж 13 лет» — без слова «стаж», его добавляет вызывающий. */
export function formatYears(count: number): string {
  return `${count} ${plural(count, "год", "года", "лет")}`;
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

/** Алиас  — читается уместнее рядом с блоком времени. */
export const formatDayLong = formatDayMonth;
