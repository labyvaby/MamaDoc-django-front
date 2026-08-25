import React from "react";

/**
 * Перетаскивание строк вертикального списка на Pointer Events.
 *
 * Почему не нативный HTML5-драг (`draggable`), которым сделан перенос статей в
 * базе знаний: он не работает пальцем на тач-экранах и, как мы уже выясняли на
 * просмотрщике фото, конфликтует с жестами. Pointer Events дают одинаковое
 * поведение для мыши, пальца и стилуса, а `setPointerCapture` не теряет
 * события, если курсор ушёл за пределы строки.
 *
 * Позиция вставки вычисляется по серединам реальных строк, а не по
 * фиксированной высоте: строки разной высоты (у некоторых есть подпись
 * «только на Месяце»), и приближение сразу бы промахивалось.
 */
export interface RowDragState {
  /** Индекс строки, которую тащат; null — драг не идёт. */
  dragIndex: number | null;
  /** Куда встанет строка, если отпустить сейчас. */
  dropIndex: number | null;
  /** Смещение по вертикали для строки под пальцем. */
  offsetY: number;
  registerRow: (index: number) => (el: HTMLElement | null) => void;
  handleProps: (index: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
}

export function useRowDrag(
  count: number,
  onReorder: (from: number, to: number) => void,
): RowDragState {
  const rowsRef = React.useRef<(HTMLElement | null)[]>([]);
  const startRef = React.useRef<{ y: number; index: number; mids: number[] } | null>(null);
  /**
   * Позицию вставки держим и в ref: `pointerup` может прийти раньше, чем эффект
   * переподпишет слушателей на свежее замыкание, и коммит уходил со старым
   * индексом — строка вставала не туда, куда её вели. Состояние нужно только
   * для отрисовки, источник правды при отпускании — ref.
   */
  const dropRef = React.useRef<number | null>(null);

  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);
  const [offsetY, setOffsetY] = React.useState(0);

  const registerRow = React.useCallback(
    (index: number) => (el: HTMLElement | null) => {
      rowsRef.current[index] = el;
    },
    [],
  );

  const finish = React.useCallback(() => {
    const start = startRef.current;
    const target = dropRef.current;
    if (start && target != null && target !== start.index) {
      onReorder(start.index, target);
    }
    startRef.current = null;
    dropRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
    setOffsetY(0);
  }, [onReorder]);

  const handleProps = React.useCallback(
    (index: number) => ({
      onPointerDown: (e: React.PointerEvent) => {
        // Только основная кнопка мыши: правый клик и средний драг не нужны.
        if (e.button !== 0) return;
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        const mids = rowsRef.current
          .slice(0, count)
          .map((el) => (el ? el.getBoundingClientRect().top + el.offsetHeight / 2 : 0));

        startRef.current = { y: e.clientY, index, mids };
        dropRef.current = index;
        setDragIndex(index);
        setDropIndex(index);
        setOffsetY(0);
      },
      style: { touchAction: "none", cursor: "grab" } as React.CSSProperties,
    }),
    [count],
  );

  // Слушаем на окне, а не на строке: палец легко уезжает за её границы, а
  // pointercancel прилетает, например, при системном жесте — драг надо
  // корректно закрыть в обоих случаях.
  React.useEffect(() => {
    if (dragIndex == null) return;

    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dy = e.clientY - start.y;
      setOffsetY(dy);

      // Куда попадёт строка: считаем, сколько середин соседей пересёк курсор.
      let target = start.index;
      for (let i = 0; i < start.mids.length; i++) {
        if (i === start.index) continue;
        const mid = start.mids[i];
        if (i < start.index && e.clientY < mid) {
          target = Math.min(target, i);
        } else if (i > start.index && e.clientY > mid) {
          target = Math.max(target, i);
        }
      }
      dropRef.current = target;
      setDropIndex(target);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [dragIndex, finish]);

  return { dragIndex, dropIndex, offsetY, registerRow, handleProps };
}

export default useRowDrag;
