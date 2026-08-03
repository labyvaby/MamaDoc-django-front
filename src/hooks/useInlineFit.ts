/**
 * useInlineFit — сколько первых элементов ряда действий влезает в контейнер.
 *
 * Панели приёма/карточек живут в узких колонках (на ноутбуке 1280 шапка приёма
 * получает ~360px), и фиксированный лимит «показываем N кнопок» там не работает:
 * при трёх кнопках плюс «Отменить» ряд переносился на вторую строку и толкал
 * содержимое вниз. Хук меряет фактическое переполнение и отдаёт число кнопок,
 * которые реально помещаются — остальные вызывающий прячет в меню «⋯».
 *
 * Контейнер (ref) должен быть flex-рядом с `flexWrap: "nowrap"`,
 * `overflow: "hidden"` и `flexGrow: 1`: тогда его clientWidth — это доступное
 * место (не зависит от контента), а scrollWidth — фактическая ширина кнопок,
 * и сравнение двух величин не осциллирует.
 */
import * as React from "react";

export function useInlineFit(count: number) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(count);
  // Счётчик изменений ширины. Без него сброс setVisible(count) при уже
  // равном значении React гасит как no-op, ререндера нет — и подрезающий
  // эффект ниже не запускается, кнопки остаются торчать за краем.
  const [resizeTick, setResizeTick] = React.useState(0);

  // Новый набор действий — меряем заново с максимума.
  React.useEffect(() => setVisible(count), [count]);

  // Ширина колонки изменилась (окно, сворачивание сайдбара, смена вида) —
  // сбрасываем на максимум, следующий проход ужмёт до нужного.
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setVisible(count);
      setResizeTick((n) => n + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);

  // Ужимаем по одному, пока ряд не перестанет переполняться. Каждый шаг —
  // отдельный кадр, так что перебор сходится за (count − visible) проходов.
  // Зависимость от resizeTick — чтобы проход шёл и после смены ширины.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (visible > 0 && el.scrollWidth > el.clientWidth + 1) {
      setVisible((v) => Math.max(0, v - 1));
    }
  }, [visible, resizeTick]);

  return { ref, visible };
}
