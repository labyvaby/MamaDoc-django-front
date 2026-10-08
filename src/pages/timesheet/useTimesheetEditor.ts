import React from "react";

import {
  clearTimesheetMarks,
  setTimesheetMarks,
  type TimesheetAccess,
  type TimesheetCellRef,
  type TimesheetCode,
  type TimesheetMarkItem,
  type TimesheetMarksResult,
  type TimesheetRow,
} from "../../api/timesheet";
import { getErrorCode } from "../../api/client";
import {
  cellIndex,
  cellKey,
  changedCells,
  dayDate,
  hotkeyMap,
  mergeRows,
  movePoint,
  optimisticRows,
  parseCellKey,
  plural,
  rectKeys,
  restoreRequests,
  snapshotCells,
  type CellKey,
  type CellSnapshot,
  type GridPoint,
} from "./model";

const CHUNK = 1000;
const DIGIT_BUFFER_MS = 700;
const FLASH_MS = 1300;
const UNDO_LIMIT = 50;

type Notify = (args: { type: "success" | "error" | "progress"; message: string; description?: string }) => void;

interface UndoEntry {
  label: string;
  before: CellSnapshot[];
  after: CellSnapshot[];
}

export interface TimesheetEditorOptions {
  month: string;
  rows: TimesheetRow[];
  codes: TimesheetCode[];
  access: TimesheetAccess | null;
  organizationId?: number | null;
  /** Заменить строки сетки в кэше запроса. */
  updateRows: (updater: (rows: TimesheetRow[]) => TimesheetRow[]) => void;
  notify?: Notify;
  onOpenCell: (point: GridPoint) => void;
  /** Ячейки, где отметка закрыла запись клиентов. */
  onBookingClosed?: (cells: TimesheetCellRef[]) => void;
}

export function useTimesheetEditor({
  month,
  rows,
  codes,
  access,
  organizationId,
  updateRows,
  notify,
  onOpenCell,
  onBookingClosed,
}: TimesheetEditorOptions) {
  const [selection, setSelection] = React.useState<Set<CellKey>>(() => new Set());
  const [active, setActive] = React.useState<GridPoint | null>(null);
  const [pending, setPending] = React.useState<Set<CellKey>>(() => new Set());
  const [flashing, setFlashing] = React.useState<Set<CellKey>>(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const [undoStack, setUndoStack] = React.useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = React.useState<UndoEntry[]>([]);

  const anchor = React.useRef<GridPoint | null>(null);
  const dragging = React.useRef(false);
  const dragBase = React.useRef<Set<CellKey>>(new Set());
  const digits = React.useRef<{ value: string; timer?: number }>({ value: "" });
  const flashTimer = React.useRef<number | undefined>(undefined);
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;

  const employeeIds = React.useMemo(() => rows.map((row) => row.employee.id), [rows]);
  const dayCount = rows[0]?.cells.length ?? 0;
  const hotkeys = React.useMemo(() => hotkeyMap(codes), [codes]);
  const lockedEmployees = React.useMemo(
    () => new Set(rows.filter((row) => row.employee.locked).map((row) => row.employee.id)),
    [rows],
  );

  // A new month or filter set starts with a clean slate.
  React.useEffect(() => {
    setSelection(new Set());
    setActive(null);
    setUndoStack([]);
    setRedoStack([]);
    anchor.current = null;
  }, [month]);

  React.useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  const flash = React.useCallback((keys: Set<CellKey>) => {
    if (!keys.size) return;
    setFlashing(new Set(keys));
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashing(new Set()), FLASH_MS);
  }, []);

  // ── Selection ─────────────────────────────────────────────────────────────

  const onCellPointerDown = React.useCallback(
    (point: GridPoint, event: React.MouseEvent) => {
      const key = employeeIds[point.row] !== undefined ? cellKey(employeeIds[point.row], point.day) : null;
      if (!key) return;
      setActive(point);
      if (event.shiftKey && anchor.current) {
        setSelection(rectKeys(anchor.current, point, employeeIds));
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          dragBase.current = next;
          return next;
        });
        anchor.current = point;
        dragging.current = true;
        return;
      }
      anchor.current = point;
      dragBase.current = new Set();
      dragging.current = true;
      setSelection(new Set([key]));
    },
    [employeeIds],
  );

  const onCellPointerEnter = React.useCallback(
    (point: GridPoint) => {
      if (!dragging.current || !anchor.current) return;
      const rect = rectKeys(anchor.current, point, employeeIds);
      for (const key of dragBase.current) rect.add(key);
      setSelection(rect);
      setActive(point);
    },
    [employeeIds],
  );

  const onRowSelect = React.useCallback(
    (rowIndex: number, event: React.MouseEvent) => {
      const from: GridPoint =
        event.shiftKey && anchor.current ? { row: anchor.current.row, day: 1 } : { row: rowIndex, day: 1 };
      if (!event.shiftKey) anchor.current = { row: rowIndex, day: 1 };
      setSelection(rectKeys(from, { row: rowIndex, day: dayCount }, employeeIds));
      setActive({ row: rowIndex, day: 1 });
    },
    [dayCount, employeeIds],
  );

  const onDaySelect = React.useCallback(
    (day: number, event: React.MouseEvent) => {
      const fromDay = event.shiftKey && anchor.current ? anchor.current.day : day;
      if (!event.shiftKey) anchor.current = { row: 0, day };
      setSelection(rectKeys({ row: 0, day: fromDay }, { row: employeeIds.length - 1, day }, employeeIds));
      setActive({ row: 0, day });
    },
    [employeeIds],
  );

  const clearSelection = React.useCallback(() => {
    setSelection(new Set());
  }, []);

  const targetKeys = React.useCallback((): Set<CellKey> => {
    if (selection.size) return selection;
    if (active && employeeIds[active.row] !== undefined) {
      return new Set([cellKey(employeeIds[active.row], active.day)]);
    }
    return new Set();
  }, [selection, active, employeeIds]);

  // ── Writes ────────────────────────────────────────────────────────────────

  const reportError = React.useCallback(
    (error: unknown) => {
      const code = getErrorCode(error);
      const message =
        code === "TIMESHEET_CLOSED"
          ? "Месяц закрыт — изменения только после переоткрытия"
          : code === "FORBIDDEN"
            ? "Недостаточно прав для этого действия"
            : error instanceof Error
              ? error.message
              : "Не удалось сохранить";
      notify?.({ type: "error", message });
    },
    [notify],
  );

  /** Отправить пачки и вернуть объединённый результат. */
  const sendMarks = React.useCallback(
    async (items: TimesheetMarkItem[], clear: TimesheetCellRef[]): Promise<TimesheetMarksResult> => {
      const merged: TimesheetMarksResult = {
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        skippedClosed: 0,
        bookingClosed: [],
        rows: [],
      };
      // A later chunk recomputes the same employee again — its row wins.
      const rowsById = new Map<number, TimesheetRow>();
      const absorb = (result: TimesheetMarksResult) => {
        merged.created += result.created;
        merged.updated += result.updated;
        merged.deleted += result.deleted;
        merged.unchanged += result.unchanged;
        merged.skippedClosed += result.skippedClosed;
        merged.bookingClosed.push(...result.bookingClosed);
        for (const row of result.rows) rowsById.set(row.employee.id, row);
      };
      for (let i = 0; i < items.length; i += CHUNK) {
        absorb(await setTimesheetMarks(items.slice(i, i + CHUNK), organizationId));
      }
      for (let i = 0; i < clear.length; i += CHUNK) {
        absorb(await clearTimesheetMarks(clear.slice(i, i + CHUNK), organizationId));
      }
      merged.rows = [...rowsById.values()];
      return merged;
    },
    [organizationId],
  );

  const commit = React.useCallback(
    async (
      label: string,
      keys: Set<CellKey>,
      run: () => Promise<TimesheetMarksResult>,
      optimistic?: (rows: TimesheetRow[]) => TimesheetRow[],
      recordUndo = true,
    ) => {
      if (!keys.size) return;
      const before = snapshotCells(rowsRef.current, keys);
      const previousRows = rowsRef.current;
      setBusy(true);
      setPending(new Set(keys));
      if (optimistic) updateRows(optimistic);
      try {
        const result = await run();
        updateRows((current) => mergeRows(current, result.rows));
        const nextRows = mergeRows(previousRows, result.rows);
        flash(changedCells(previousRows, nextRows));
        if (recordUndo) {
          const after = snapshotCells(nextRows, keys);
          setUndoStack((stack) => [...stack.slice(-UNDO_LIMIT + 1), { label, before, after }]);
          setRedoStack([]);
        }
        if (result.skippedClosed) {
          notify?.({ type: "error", message: `Пропущено в закрытом месяце: ${result.skippedClosed}` });
        }
        if (result.bookingClosed.length) onBookingClosed?.(result.bookingClosed);
        return result;
      } catch (error) {
        updateRows(() => previousRows);
        reportError(error);
        return null;
      } finally {
        setBusy(false);
        setPending(new Set());
      }
    },
    [flash, notify, onBookingClosed, reportError, updateRows],
  );

  /** Ячейки, которые этот пользователь может менять, и почему остальные нет. */
  const writable = React.useCallback(
    (keys: Set<CellKey>, mode: "set" | "clear") => {
      const index = cellIndex(rowsRef.current);
      const allowed = new Set<CellKey>();
      let locked = 0;
      let denied = 0;
      for (const key of keys) {
        const { employeeId } = parseCellKey(key);
        if (lockedEmployees.has(employeeId)) {
          locked += 1;
          continue;
        }
        const manual = index.get(key)?.source === "manual";
        const ok =
          mode === "clear" ? manual && Boolean(access?.delete) : manual ? Boolean(access?.update) : Boolean(access?.create);
        if (ok) allowed.add(key);
        else if (mode === "set" || manual) denied += 1;
      }
      if (locked) notify?.({ type: "error", message: `Месяц закрыт: пропущено ${plural(locked, "ячейка", "ячейки", "ячеек")}` });
      if (denied) {
        notify?.({
          type: "error",
          message:
            mode === "clear"
              ? "Нет права снимать отметки"
              : access?.create
                ? `Нет права менять готовые отметки — пропущено ${denied}`
                : `Нет права ставить отметки — пропущено ${denied}`,
        });
      }
      return allowed;
    },
    [access, lockedEmployees, notify],
  );

  const applyCode = React.useCallback(
    async (code: string, hours?: { day: number; night: number }) => {
      const keys = writable(targetKeys(), "set");
      if (!keys.size) return;
      const info = codes.find((c) => c.key === code);
      const items: TimesheetMarkItem[] = [...keys].map((key) => {
        const { employeeId, day } = parseCellKey(key);
        return {
          employeeId,
          date: dayDate(month, day),
          code,
          ...(hours ? { dayHours: hours.day, nightHours: hours.night } : {}),
        };
      });
      await commit(
        info ? `«${info.letter}» — ${plural(keys.size, "ячейка", "ячейки", "ячеек")}` : "Отметка",
        keys,
        () => sendMarks(items, []),
        (current) =>
          optimisticRows(current, keys, (cell) => ({
            ...cell,
            code,
            source: "manual",
            state: null,
            ...(hours
              ? {
                  hours: String(hours.day + hours.night),
                  nightHours: hours.night ? String(hours.night) : null,
                }
              : {}),
          })),
      );
    },
    [codes, commit, month, sendMarks, targetKeys, writable],
  );

  const clearMarks = React.useCallback(async () => {
    const keys = writable(targetKeys(), "clear");
    if (!keys.size) return;
    const refs = [...keys].map((key) => {
      const { employeeId, day } = parseCellKey(key);
      return { employeeId, date: dayDate(month, day) };
    });
    await commit(`Снято отметок: ${keys.size}`, keys, () => sendMarks([], refs));
  }, [commit, month, sendMarks, targetKeys, writable]);

  const replay = React.useCallback(
    async (entry: UndoEntry, direction: "undo" | "redo") => {
      const snapshots = direction === "undo" ? entry.before : entry.after;
      const keys = new Set(snapshots.map((s) => s.key));
      const { set, clear } = restoreRequests(snapshots, month);
      const result = await commit(entry.label, keys, () => sendMarks(set, clear), undefined, false);
      if (!result) return;
      if (direction === "undo") {
        setUndoStack((stack) => stack.slice(0, -1));
        setRedoStack((stack) => [...stack, entry]);
        notify?.({ type: "success", message: `Отменено: ${entry.label}` });
      } else {
        setRedoStack((stack) => stack.slice(0, -1));
        setUndoStack((stack) => [...stack, entry]);
        notify?.({ type: "success", message: `Повторено: ${entry.label}` });
      }
    },
    [commit, month, notify, sendMarks],
  );

  const undo = React.useCallback(() => {
    const entry = undoStack[undoStack.length - 1];
    if (entry && !busy) void replay(entry, "undo");
  }, [busy, replay, undoStack]);

  const redo = React.useCallback(() => {
    const entry = redoStack[redoStack.length - 1];
    if (entry && !busy) void replay(entry, "redo");
  }, [busy, redoStack, replay]);

  /** Внешняя операция (заполнение по графику) тоже попадает в историю. */
  const recordExternal = React.useCallback(
    (label: string, previousRows: TimesheetRow[], result: TimesheetMarksResult) => {
      const nextRows = mergeRows(previousRows, result.rows);
      const changed = changedCells(previousRows, nextRows);
      flash(changed);
      if (!changed.size) return;
      setUndoStack((stack) => [
        ...stack.slice(-UNDO_LIMIT + 1),
        { label, before: snapshotCells(previousRows, changed), after: snapshotCells(nextRows, changed) },
      ]);
      setRedoStack([]);
    },
    [flash],
  );

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]")) return;
      const mod = event.ctrlKey || event.metaKey;

      if (mod && (event.code === "KeyZ" || event.key.toLowerCase() === "z")) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (event.code === "KeyY" || event.key.toLowerCase() === "y")) {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && (event.code === "KeyA" || event.key.toLowerCase() === "a")) {
        event.preventDefault();
        setSelection(rectKeys({ row: 0, day: 1 }, { row: employeeIds.length - 1, day: dayCount }, employeeIds));
        return;
      }
      if (mod) return;

      const moved = active ? movePoint(active, event.key, employeeIds.length, dayCount) : null;
      if (moved) {
        event.preventDefault();
        setActive(moved);
        if (event.shiftKey) {
          if (!anchor.current) anchor.current = active;
          setSelection(rectKeys(anchor.current ?? moved, moved, employeeIds));
        } else {
          anchor.current = moved;
          setSelection(new Set([cellKey(employeeIds[moved.row], moved.day)]));
        }
        return;
      }
      if (!active && event.key.startsWith("Arrow") && employeeIds.length) {
        event.preventDefault();
        const start = { row: 0, day: 1 };
        setActive(start);
        anchor.current = start;
        setSelection(new Set([cellKey(employeeIds[0], 1)]));
        return;
      }
      if (event.key === "Escape") {
        setSelection(new Set());
        return;
      }
      if (event.key === "Enter" && active) {
        event.preventDefault();
        onOpenCell(active);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void clearMarks();
        return;
      }
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        window.clearTimeout(digits.current.timer);
        digits.current.value = (digits.current.value + event.key).slice(-2);
        digits.current.timer = window.setTimeout(() => {
          const hours = Math.min(24, Number(digits.current.value));
          digits.current.value = "";
          if (hours > 0) void applyCode("presence", { day: hours, night: 0 });
        }, DIGIT_BUFFER_MS);
        return;
      }
      const code = hotkeys.get(event.code);
      if (code) {
        event.preventDefault();
        void applyCode(code);
      }
    },
    [active, applyCode, clearMarks, dayCount, employeeIds, hotkeys, onOpenCell, redo, undo],
  );

  return {
    selection,
    setSelection,
    active,
    setActive,
    pending,
    flashing,
    flash,
    busy,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoLabel: undoStack[undoStack.length - 1]?.label ?? null,
    onCellPointerDown,
    onCellPointerEnter,
    onRowSelect,
    onDaySelect,
    onKeyDown,
    clearSelection,
    applyCode,
    clearMarks,
    undo,
    redo,
    recordExternal,
  };
}

export type TimesheetEditor = ReturnType<typeof useTimesheetEditor>;
