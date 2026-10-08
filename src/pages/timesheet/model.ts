import type {
  TimesheetCell,
  TimesheetCode,
  TimesheetMarkItem,
  TimesheetRow,
} from "../../api/timesheet";

/**
 * Чистая логика страницы «Табель»: адреса ячеек, выделение прямоугольником,
 * горячие клавиши, снимки для отмены и поиск изменившихся ячеек для
 * подсветки. Без React — чтобы покрыть vitest'ом (render-библиотек в проекте
 * нет).
 */

/** Адрес ячейки внутри месяца: `<employeeId>:<day>`. */
export type CellKey = `${number}:${number}`;

export const cellKey = (employeeId: number, day: number): CellKey =>
  `${employeeId}:${day}` as CellKey;

export function parseCellKey(key: CellKey): { employeeId: number; day: number } {
  const [employeeId, day] = key.split(":").map(Number);
  return { employeeId, day };
}

/** YYYY-MM-DD дня месяца `month` (YYYY-MM). */
export const dayDate = (month: string, day: number): string =>
  `${month}-${String(day).padStart(2, "0")}`;

export const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const;

export const MONTH_NAMES_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const WEEKDAY_FULL = [
  "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье",
] as const;

/** «Вторник, 1 сентября» для YYYY-MM-DD. */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const weekday = WEEKDAY_FULL[(date.getDay() + 6) % 7];
  return `${weekday}, ${date.getDate()} ${MONTH_NAMES_GENITIVE[date.getMonth()]}`;
}

/** «Сентябрь 2026». */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[(m || 1) - 1]} ${year}`;
}

/** Сдвиг месяца YYYY-MM на `delta` (может быть отрицательным). */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

/** Текущий месяц по локальным часам браузера. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Часы для тесной ячейки: один знак после запятой («8,33» → «8,3»). */
export function compactHours(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "";
  return String(Math.round(num * 10) / 10).replace(".", ",");
}

/** «8.00» → «8», «7.50» → «7.5», пусто → «». */
export function formatHours(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "";
  return String(Math.round(num * 100) / 100).replace(".", ",");
}

export const toNumber = (value?: string | null): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

/** Минуты → «1 ч 30 мин». */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

// ── Codes ───────────────────────────────────────────────────────────────────

export function codesByKey(codes: TimesheetCode[]): Map<string, TimesheetCode> {
  return new Map(codes.map((code) => [code.key, code]));
}

/** Коды, которые можно поставить вручную, в порядке легенды. */
export const markableCodes = (codes: TimesheetCode[]): TimesheetCode[] =>
  codes.filter((code) => code.markable && code.isActive);

/**
 * Физические клавиши раскладки ЙЦУКЕН. Горячие клавиши табеля привязаны к
 * позиции клавиши (`KeyboardEvent.code`), а не к символу — «Я» срабатывает
 * и при включённой латинице (это та же клавиша Z), не нужно переключать
 * раскладку посреди работы.
 */
const CYRILLIC_KEY_CODES: Record<string, string> = {
  Й: "KeyQ", Ц: "KeyW", У: "KeyE", К: "KeyR", Е: "KeyT", Н: "KeyY", Г: "KeyU",
  Ш: "KeyI", Щ: "KeyO", З: "KeyP", Х: "BracketLeft", Ъ: "BracketRight",
  Ф: "KeyA", Ы: "KeyS", В: "KeyD", А: "KeyF", П: "KeyG", Р: "KeyH", О: "KeyJ",
  Л: "KeyK", Д: "KeyL", Ж: "Semicolon", Э: "Quote", Я: "KeyZ", Ч: "KeyX",
  С: "KeyC", М: "KeyV", И: "KeyB", Т: "KeyN", Ь: "KeyM", Б: "Comma", Ю: "Period",
};

/**
 * Клавиша → код отметки. Свои отметки получают клавишу своей первой буквы,
 * если она не занята встроенной или другой своей отметкой.
 */
export function hotkeyMap(codes: TimesheetCode[]): Map<string, string> {
  const map = new Map<string, string>();
  const ordered = [
    ...markableCodes(codes).filter((code) => code.isSystem),
    ...markableCodes(codes).filter((code) => !code.isSystem),
  ];
  for (const code of ordered) {
    const physical = CYRILLIC_KEY_CODES[code.letter.trim().charAt(0).toUpperCase()];
    if (physical && !map.has(physical)) map.set(physical, code.key);
  }
  return map;
}

/** Подпись клавиши для подсказки: «Я», «В», … */
export function hotkeyLabel(codes: TimesheetCode[], key: string): string | null {
  for (const [physical, codeKey] of hotkeyMap(codes)) {
    if (codeKey !== key) continue;
    const letter = Object.entries(CYRILLIC_KEY_CODES).find(([, code]) => code === physical);
    return letter ? letter[0] : null;
  }
  return null;
}

// ── Selection ───────────────────────────────────────────────────────────────

export interface GridPoint {
  /** Индекс строки в видимом списке. */
  row: number;
  /** День месяца (1…31). */
  day: number;
}

/** Ячейки прямоугольника между `anchor` и `focus` включительно. */
export function rectKeys(
  anchor: GridPoint,
  focus: GridPoint,
  employeeIds: number[],
): Set<CellKey> {
  const keys = new Set<CellKey>();
  const [rowFrom, rowTo] = [Math.min(anchor.row, focus.row), Math.max(anchor.row, focus.row)];
  const [dayFrom, dayTo] = [Math.min(anchor.day, focus.day), Math.max(anchor.day, focus.day)];
  for (let row = rowFrom; row <= rowTo; row += 1) {
    const employeeId = employeeIds[row];
    if (employeeId === undefined) continue;
    for (let day = dayFrom; day <= dayTo; day += 1) keys.add(cellKey(employeeId, day));
  }
  return keys;
}

/** Сдвиг активной ячейки стрелками в пределах сетки. */
export function movePoint(
  point: GridPoint,
  key: string,
  rowCount: number,
  dayCount: number,
): GridPoint | null {
  switch (key) {
    case "ArrowUp":
      return { ...point, row: Math.max(0, point.row - 1) };
    case "ArrowDown":
      return { ...point, row: Math.min(rowCount - 1, point.row + 1) };
    case "ArrowLeft":
      return { ...point, day: Math.max(1, point.day - 1) };
    case "ArrowRight":
      return { ...point, day: Math.min(dayCount, point.day + 1) };
    case "Home":
      return { ...point, day: 1 };
    case "End":
      return { ...point, day: dayCount };
    default:
      return null;
  }
}

/** «12 ячеек · 3 сотрудника · 1–4 сен». */
export function describeSelection(keys: Set<CellKey>, month: string): string {
  if (keys.size === 0) return "";
  const employees = new Set<number>();
  let minDay = 99;
  let maxDay = 0;
  for (const key of keys) {
    const { employeeId, day } = parseCellKey(key);
    employees.add(employeeId);
    minDay = Math.min(minDay, day);
    maxDay = Math.max(maxDay, day);
  }
  const monthIndex = Number(month.split("-")[1]) - 1;
  const monthShort = MONTH_NAMES_GENITIVE[monthIndex]?.slice(0, 3) ?? "";
  const days = minDay === maxDay ? `${minDay} ${monthShort}` : `${minDay}–${maxDay} ${monthShort}`;
  return `${plural(keys.size, "ячейка", "ячейки", "ячеек")} · ${plural(
    employees.size,
    "сотрудник",
    "сотрудника",
    "сотрудников",
  )} · ${days}`;
}

/** «3 сотрудника» — русские формы множественного числа. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = many;
  if (mod10 === 1 && mod100 !== 11) word = one;
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = few;
  return `${count} ${word}`;
}

// ── Cells ───────────────────────────────────────────────────────────────────

export function cellIndex(rows: TimesheetRow[]): Map<CellKey, TimesheetCell> {
  const map = new Map<CellKey, TimesheetCell>();
  for (const row of rows) {
    for (const cell of row.cells) map.set(cellKey(row.employee.id, cell.day), cell);
  }
  return map;
}

/** Что видит человек в ячейке — по этой подписи ищем изменения. */
export function cellSignature(cell?: TimesheetCell): string {
  if (!cell) return "";
  return [
    cell.code ?? "",
    cell.state ?? "",
    cell.hours ?? "",
    cell.nightHours ?? "",
    (cell.flags ?? []).join(","),
  ].join("|");
}

/** Ячейки, которые выглядят иначе в новой выдаче (для «вспышки» realtime). */
export function changedCells(prev: TimesheetRow[], next: TimesheetRow[]): Set<CellKey> {
  const before = cellIndex(prev);
  const changed = new Set<CellKey>();
  for (const row of next) {
    for (const cell of row.cells) {
      const key = cellKey(row.employee.id, cell.day);
      const old = before.get(key);
      if (old && cellSignature(old) !== cellSignature(cell)) changed.add(key);
    }
  }
  return changed;
}

/** Строки ответа записи заменяют свои строки в сетке; остальные не трогаем. */
export function mergeRows(rows: TimesheetRow[], updated: TimesheetRow[]): TimesheetRow[] {
  if (!updated.length) return rows;
  const byId = new Map(updated.map((row) => [row.employee.id, row]));
  return rows.map((row) => byId.get(row.employee.id) ?? row);
}

/** Мгновенный вид ячеек до ответа сервера: код ставится сразу. */
export function optimisticRows(
  rows: TimesheetRow[],
  keys: Set<CellKey>,
  patch: (cell: TimesheetCell) => TimesheetCell,
): TimesheetRow[] {
  return rows.map((row) => {
    let touched = false;
    const cells = row.cells.map((cell) => {
      if (!keys.has(cellKey(row.employee.id, cell.day))) return cell;
      touched = true;
      return patch(cell);
    });
    return touched ? { ...row, cells } : row;
  });
}

// ── Undo ────────────────────────────────────────────────────────────────────

/**
 * Состояние ячейки до действия: ручная отметка (код и часы) или «считалась
 * сама» (`null`). Отмена возвращает именно его — ставит прежние отметки и
 * снимает те, которых не было.
 */
export type CellSnapshot = {
  key: CellKey;
  mark: { code: string; dayHours: number; nightHours: number } | null;
};

export function snapshotCells(rows: TimesheetRow[], keys: Iterable<CellKey>): CellSnapshot[] {
  const index = cellIndex(rows);
  const result: CellSnapshot[] = [];
  for (const key of keys) {
    const cell = index.get(key);
    if (!cell) continue;
    if (cell.source === "manual" && cell.code) {
      const total = toNumber(cell.hours);
      const night = toNumber(cell.nightHours);
      result.push({
        key,
        mark: {
          code: cell.code,
          dayHours: Math.round((total - night) * 100) / 100,
          nightHours: night,
        },
      });
    } else {
      result.push({ key, mark: null });
    }
  }
  return result;
}

/** Запросы, которые вернут ячейки к снимку. */
export function restoreRequests(
  snapshots: CellSnapshot[],
  month: string,
): { set: TimesheetMarkItem[]; clear: { employeeId: number; date: string }[] } {
  const set: TimesheetMarkItem[] = [];
  const clear: { employeeId: number; date: string }[] = [];
  for (const snapshot of snapshots) {
    const { employeeId, day } = parseCellKey(snapshot.key);
    const date = dayDate(month, day);
    if (snapshot.mark) {
      set.push({
        employeeId,
        date,
        code: snapshot.mark.code,
        dayHours: snapshot.mark.dayHours,
        nightHours: snapshot.mark.nightHours,
      });
    } else {
      clear.push({ employeeId, date });
    }
  }
  return { set, clear };
}

// ── Heat map ────────────────────────────────────────────────────────────────

/** Насыщенность ячейки тепловой карты: 0…1 от отработанных часов. */
export function heatLevel(hours?: string | null, max = 12): number {
  const value = toNumber(hours);
  if (value <= 0) return 0;
  return Math.min(1, 0.18 + (value / max) * 0.82);
}

/** Контрастный цвет текста для фона `hex`. */
export function readableOn(hex: string): "#ffffff" | "#0b0d0f" {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0b0d0f" : "#ffffff";
}
