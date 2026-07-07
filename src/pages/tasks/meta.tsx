import dayjs from "dayjs";

import type {
  TaskCategory,
  TaskPriority,
  TaskSource,
  TaskStatus,
  TaskTemplate,
} from "../../api/tasks";

/** Палитра-тон MUI для статуса/приоритета (null — нейтральный). */
export type ToneName = "warning" | "info" | "success" | "error" | null;

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: ToneName }> = {
  new: { label: "Новая", color: "info" },
  in_progress: { label: "В работе", color: "warning" },
  paused: { label: "На паузе", color: null },
  awaiting_approval: { label: "На подтверждении", color: "info" },
  done: { label: "Исполнена", color: "success" },
  cancelled: { label: "Отменена", color: "error" },
};

export const TASK_STATUS_OPTIONS = (
  Object.keys(TASK_STATUS_META) as TaskStatus[]
).map((value) => ({ value, label: TASK_STATUS_META[value].label }));

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; color: ToneName; weight: number }> = {
  low: { label: "Низкий", color: null, weight: 0 },
  normal: { label: "Обычный", color: "info", weight: 1 },
  high: { label: "Высокий", color: "warning", weight: 2 },
  urgent: { label: "Срочный", color: "error", weight: 3 },
};

export const TASK_PRIORITY_OPTIONS = (
  Object.keys(TASK_PRIORITY_META) as TaskPriority[]
).map((value) => ({ value, label: TASK_PRIORITY_META[value].label }));

export const TASK_SOURCE_META: Record<TaskSource, { label: string }> = {
  manual: { label: "Вручную" },
  recurring: { label: "Автоматическая" },
  auto_stock: { label: "По остатку" },
};

// ── Человеческие сроки ─────────────────────────────────────────────────────────

export type DueInfo = { text: string; overdue: boolean; today: boolean };

/** «сегодня» / «завтра» / «до 12.08» / «просрочено на N дн». */
export function dueInfo(dueDate: string | null, status: TaskStatus): DueInfo | null {
  if (!dueDate) return null;
  const closed = status === "done" || status === "cancelled";
  const due = dayjs(dueDate);
  const today = dayjs().startOf("day");
  const diff = due.startOf("day").diff(today, "day");
  if (closed) return { text: due.format("DD.MM.YYYY"), overdue: false, today: false };
  if (diff < 0) {
    const n = Math.abs(diff);
    return { text: `просрочено на ${n} ${n === 1 ? "день" : n < 5 ? "дня" : "дней"}`, overdue: true, today: false };
  }
  if (diff === 0) return { text: "сегодня", overdue: false, today: true };
  if (diff === 1) return { text: "завтра", overdue: false, today: false };
  if (diff <= 7) return { text: `через ${diff} ${diff < 5 ? "дня" : "дней"}`, overdue: false, today: false };
  return { text: `до ${due.format("DD.MM")}`, overdue: false, today: false };
}

// ── Автокатегория по ключевым словам ───────────────────────────────────────────

/** Эвристика v1: словарь по названию категории + совпадение с шаблонами истории. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  расходники: ["шприц", "перчатк", "маск", "бахил", "вата", "бинт", "катетер", "игл", "салфетк", "антисепт"],
  хозяйственные: ["лампа", "вода", "стул", "убор", "мыло", "бумага", "туалет", "мусор", "кран", "дверь"],
  оборудование: ["тонометр", "аппарат", "кушетк", "холодильник", "повер", "ремонт", "стерилизатор", "весы"],
  "it / crm": ["принтер", "компьютер", "интернет", "crm", "программ", "монитор", "телефон", "касса", "1с"],
};

/**
 * Угадывает категорию по названию заявки: сперва точнее — по шаблонам истории,
 * затем по словарю. Возвращает id категории или null.
 */
export function guessCategoryId(
  title: string,
  categories: TaskCategory[],
  templates: TaskTemplate[],
): number | null {
  const words = title
    .toLowerCase()
    .split(/[^а-яёa-z0-9]+/i)
    .filter((w) => w.length >= 4);
  if (words.length === 0) return null;

  // 1. Совпадение со словами из шаблонов истории.
  for (const tpl of templates) {
    const tplWords = tpl.title.toLowerCase().split(/[^а-яёa-z0-9]+/i);
    if (words.some((w) => tplWords.some((tw) => tw.startsWith(w) || w.startsWith(tw)))) {
      if (categories.some((c) => c.id === tpl.categoryId && c.isActive)) return tpl.categoryId;
    }
  }

  // 2. Словарь по имени категории.
  for (const c of categories) {
    if (!c.isActive) continue;
    const keywords = CATEGORY_KEYWORDS[c.name.toLowerCase()];
    if (keywords && words.some((w) => keywords.some((k) => w.startsWith(k)))) return c.id;
  }
  return null;
}
