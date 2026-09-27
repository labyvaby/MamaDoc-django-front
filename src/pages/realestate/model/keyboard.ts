/**
 * Навигация стрелками по ячейкам шахматки. Ячейки ищутся по положению на экране,
 * поэтому одинаково работают и в подробном виде (строка = этаж), и в компактном (секции рядом).
 */
export const KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

/**
 * Стрелки на странице без фокуса в шахматке: разрешено, если пользователь не
 * печатает в поле, не двигает ползунок и поверх нет окна (карточка, меню, диалог).
 */
export function canStartBoardNavigation(event: KeyboardEvent): boolean {
  if (!KEYS.has(event.key) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return false;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="dialog"], [role="menu"], [role="listbox"]')) return false;
  return !document.querySelector(".MuiDialog-root, .MuiDrawer-modal, .MuiPopover-root, .MuiMenu-root");
}

interface Box {
  el: HTMLElement;
  x: number;
  y: number;
  h: number;
}

const center = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect();
  return { el, x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
};

/** Возвращает true, если фокус сдвинут (событие нужно погасить). */
export function moveFocus(root: HTMLElement, key: string): boolean {
  if (!KEYS.has(key)) return false;
  const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
    "[data-unit-id]",
  );
  if (!current || !root.contains(current)) return false;

  const from = center(current);
  // Приглушённые фильтром ячейки пропускаем — по ним нечего открывать.
  const cells = [...root.querySelectorAll<HTMLElement>("[data-unit-id]")]
    .filter((el) => el !== current && el.dataset.dimmed !== "true")
    .map(center);
  const sameRow = (b: Box) => Math.abs(b.y - from.y) < from.h / 2;

  let target: Box | undefined;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const dir = key === "ArrowRight" ? 1 : -1;
    target = cells
      .filter((b) => sameRow(b) && (b.x - from.x) * dir > 0)
      .sort((a, b) => Math.abs(a.x - from.x) - Math.abs(b.x - from.x))[0];
  } else if (key === "Home" || key === "End") {
    const row = cells.filter(sameRow).sort((a, b) => a.x - b.x);
    target = key === "Home" ? row[0] : row[row.length - 1];
    if (target && (key === "Home" ? target.x > from.x : target.x < from.x)) target = undefined;
  } else {
    const dir = key === "ArrowDown" ? 1 : -1;
    const ahead = cells.filter((b) => (b.y - from.y) * dir > from.h / 2);
    const nearestRow = Math.min(...ahead.map((b) => Math.abs(b.y - from.y)));
    target = ahead
      .filter((b) => Math.abs(Math.abs(b.y - from.y) - nearestRow) < from.h / 2)
      .sort((a, b) => Math.abs(a.x - from.x) - Math.abs(b.x - from.x))[0];
  }

  if (!target) return true;
  target.el.focus();
  target.el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return true;
}
