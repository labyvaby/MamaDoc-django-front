import dayjs, { type Dayjs } from "dayjs";

import { ApiError } from "../../api/client";

import type {
  TaskCategory,
  TaskPriority,
  TaskSource,
  TaskStatus,
  TaskTemplate,
} from "../../api/tasks";

/** Период фонового обновления списков задач — их разбирают параллельно. */
export const TASKS_REFRESH_MS = 60_000;

/**
 * Ввод времени в сроке задачи.
 *
 * ⚠ Выключено: бэк валидирует `dueDate` строго как дату и отклоняет datetime —
 * `Expected 'str' matching regex '^\d{4}-\d{2}-\d{2}$' at $.parsed_body.dueDate`
 * (проверено на проде 25.07.2026). Заявка при этом не создаётся вовсе.
 * Включить, когда бэк закроет тикет `MamaDoc/backend_ticket_tasks_due_time.md`.
 *
 * Показ времени от флага не зависит: как только в ответе появится datetime,
 * список и карточка начнут показывать часы сами (см. hasDueTime / dueInfo).
 */
export const TASKS_DUE_TIME_ENABLED = false;

/**
 * Удаление задачи из архива (право `tasks.manage`).
 *
 * Включено 31.08.2026: бэк реализовал `DELETE /api/tasks/{id}/` — 204 для
 * закрытых задач, 400 для открытых (проверено на тестовом контуре). Эндпоинтов
 * `archive`/`restore` и флага `isArchived` в модели по-прежнему нет — «Архив»
 * на фронте собран из закрытых статусов (done + cancelled), закрытые задачи
 * лежат в нём до удаления руками.
 *
 * ⚠ На проде проверить не удалось: у учётки нет прав `tasks.*` (нужен
 * sync_permissions + выдача прав ролям). DELETE отвечает 403 `tasks.manage`,
 * а не 405, — то есть маршрут на проде уже есть.
 */
export const TASKS_DELETE_ENABLED = true;

/**
 * Человеческий текст ошибки действия над задачей.
 *
 * В 400 бэк присылает готовое объяснение («Удалять можно только выполненные или
 * отменённые задачи», «Завершить можно только задачу в работе») — его и
 * показываем. 403/404/405 переводим сами: технический текст пользователю
 * ничего не говорит.
 */
export function taskErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "Недостаточно прав для этого действия";
    if (e.status === 404) return "Задача не найдена — возможно, её уже удалили";
    if (e.status === 405) return "Сервер пока не поддерживает это действие";
    if (e.status === 400 && e.message) return e.message;
  }
  return (e instanceof Error && e.message) || fallback;
}

/** Статусы, попадающие в «Архив»: задача закрыта и в работу не вернётся. */
export const TASK_ARCHIVE_STATUSES = ["done", "cancelled"] as const satisfies readonly TaskStatus[];

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

/** Русское склонение числительного: plural(5, "день", "дня", "дней"). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Срок приходит либо как `YYYY-MM-DD` (дата), либо как ISO-datetime (дата+время).
 * Обе формы поддерживаются: время показываем только когда бэк его прислал.
 */
export function hasDueTime(dueDate: string | null | undefined): boolean {
  return dueDate != null && dueDate.length > 10;
}

/** Полный срок для тултипа: «12.08.2026» / «12.08.2026 15:00». */
export function formatDue(dueDate: string | null | undefined): string {
  if (!dueDate) return "—";
  const d = dayjs(dueDate);
  return hasDueTime(dueDate) ? d.format("DD.MM.YYYY HH:mm") : d.format("DD.MM.YYYY");
}

export type DueInfo = {
  text: string;
  /** Срок прошёл (только для открытых задач). */
  overdue: boolean;
  /** Срок сегодня. */
  today: boolean;
  /** До срока меньше 3 часов (только когда задано время) — «горит». */
  soon: boolean;
  /** Полная дата-время для тултипа. */
  exact: string;
};

/**
 * «сегодня 15:00» / «через 40 мин» / «завтра» / «до 12.08» /
 * «просрочено на 3 ч». Часы показываются, только если срок задан с временем.
 */
export function dueInfo(dueDate: string | null, status: TaskStatus): DueInfo | null {
  if (!dueDate) return null;
  const withTime = hasDueTime(dueDate);
  const due = dayjs(dueDate);
  const exact = formatDue(dueDate);
  const base = { overdue: false, today: false, soon: false, exact };

  const closed = status === "done" || status === "cancelled";
  if (closed) return { ...base, text: exact };

  const now = dayjs();
  const dayDiff = due.startOf("day").diff(now.startOf("day"), "day");
  const timeLabel = withTime ? ` ${due.format("HH:mm")}` : "";

  // Просрочка: с временем считаем в минутах/часах, без времени — в днях.
  if (withTime ? due.isBefore(now) : dayDiff < 0) {
    if (withTime) {
      const mins = now.diff(due, "minute");
      if (mins < 60) return { ...base, text: `просрочено на ${mins} мин`, overdue: true };
      const hours = now.diff(due, "hour");
      if (hours < 24) return { ...base, text: `просрочено на ${hours} ч`, overdue: true };
    }
    const days = Math.max(1, now.startOf("day").diff(due.startOf("day"), "day"));
    return { ...base, text: `просрочено на ${days} ${plural(days, "день", "дня", "дней")}`, overdue: true };
  }

  if (dayDiff === 0) {
    if (withTime) {
      const mins = due.diff(now, "minute");
      if (mins < 60) return { ...base, text: `через ${mins} мин`, today: true, soon: true };
      if (mins < 180) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return {
          ...base,
          text: m === 0 ? `через ${h} ч` : `через ${h} ч ${m} мин`,
          today: true,
          soon: true,
        };
      }
    }
    return { ...base, text: `сегодня${timeLabel}`, today: true };
  }
  if (dayDiff === 1) return { ...base, text: `завтра${timeLabel}` };
  if (dayDiff <= 7)
    return { ...base, text: `через ${dayDiff} ${plural(dayDiff, "день", "дня", "дней")}${timeLabel}` };
  return { ...base, text: `до ${due.format("DD.MM")}${timeLabel}` };
}

/**
 * Собирает значение срока для API из полей формы: без времени — `YYYY-MM-DD`,
 * со временем — ISO со смещением, чтобы бэк не гадал с таймзоной.
 * Пока `TASKS_DUE_TIME_ENABLED` выключен, время не отправляется (бэк отвечает
 * 422 на datetime — см. флаг).
 */
export function serializeDue(date: Dayjs | null, time: Dayjs | null): string | null {
  if (!date) return null;
  if (!time || !TASKS_DUE_TIME_ENABLED) return date.format("YYYY-MM-DD");
  return date.hour(time.hour()).minute(time.minute()).second(0).millisecond(0).format("YYYY-MM-DDTHH:mm:ssZ");
}

/** Раскладывает срок из API на поля формы «дата» + «время» (время может быть null). */
export function parseDue(dueDate: string | null | undefined): { date: Dayjs | null; time: Dayjs | null } {
  if (!dueDate) return { date: null, time: null };
  const d = dayjs(dueDate);
  return { date: d.startOf("day"), time: hasDueTime(dueDate) ? d : null };
}

// ── Время создания / изменения ─────────────────────────────────────────────────

/** «5 мин назад» / «3 ч назад» / «вчера 14:20» / «12.08 09:15». */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = dayjs(iso);
  const now = dayjs();
  const mins = now.diff(d, "minute");
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = now.diff(d, "hour");
  if (hours < 12) return `${hours} ${plural(hours, "час", "часа", "часов")} назад`;
  if (d.isSame(now, "day")) return `сегодня ${d.format("HH:mm")}`;
  if (d.isSame(now.subtract(1, "day"), "day")) return `вчера ${d.format("HH:mm")}`;
  if (d.isSame(now, "year")) return d.format("DD.MM HH:mm");
  return d.format("DD.MM.YYYY HH:mm");
}

/** Точная метка времени для тултипов. */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dayjs(iso).format("DD.MM.YYYY HH:mm") : "—";
}

/** Длительность между двумя моментами: «3 ч 20 мин», «2 дня». */
export function formatDuration(fromIso: string, toIso?: string): string {
  const from = dayjs(fromIso);
  const to = toIso ? dayjs(toIso) : dayjs();
  const mins = Math.max(0, to.diff(from, "minute"));
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rest = mins % 60;
    return rest === 0 ? `${hours} ${plural(hours, "час", "часа", "часов")}` : `${hours} ч ${rest} мин`;
  }
  const days = Math.floor(hours / 24);
  const restH = hours % 24;
  return restH === 0
    ? `${days} ${plural(days, "день", "дня", "дней")}`
    : `${days} ${plural(days, "день", "дня", "дней")} ${restH} ч`;
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
