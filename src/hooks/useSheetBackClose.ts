import * as React from "react";

/**
 * Аппаратная кнопка «назад» (и свайп от края на iOS) закрывает открытый лист,
 * а не уводит со страницы.
 *
 * На телефоне карточка приёма и заключение живут в bottom-sheet поверх списка.
 * Без этого первый же «назад» уносил врача со страницы целиком — вместо того
 * чтобы закрыть верхний лист.
 *
 * Пока лист открыт, в историю добавлена одна запись; «назад» её снимает и
 * закрывает ЛИШЬ ВЕРХНИЙ лист — для этого открытые листы держатся общим
 * стеком: слушателей popstate иначе срабатывает несколько сразу, и один
 * «назад» схлопывал бы всю стопку. Закрытие крестиком снимает свою запись
 * самостоятельно, иначе следующий «назад» был бы холостым.
 */

type SheetEntry = { close: () => void };

/** Открытые листы, снизу вверх. Верхний закрывается первым. */
const sheetStack: SheetEntry[] = [];
/** Сколько history.back() мы вызвали сами — их popstate игнорирует. */
let programmaticBacks = 0;
let popListener: (() => void) | null = null;

const ensurePopListener = () => {
  if (popListener) return;
  popListener = () => {
    // Наш собственный back() (лист закрыли крестиком) листы не трогает.
    if (programmaticBacks > 0) {
      programmaticBacks -= 1;
      return;
    }
    sheetStack.pop()?.close();
  };
  window.addEventListener("popstate", popListener);
};

/**
 * @param open лист открыт
 * @param onClose закрыть лист
 * @param enabled включать только там, где это уместно (мобильные листы)
 */
export function useSheetBackClose(
  open: boolean,
  onClose: () => void,
  enabled = true,
): void {
  // Колбэк держим в ref: иначе новая ссылка на каждый рендер пересоздавала бы
  // запись в истории.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!enabled || !open || typeof window === "undefined") return;

    const entry: SheetEntry = { close: () => onCloseRef.current() };
    sheetStack.push(entry);
    ensurePopListener();
    window.history.pushState({ mamadocSheet: true }, "");
    // Адрес на момент открытия: если он сменился, лист закрылся из-за ухода со
    // страницы — своя запись уже не верхняя, и back() увёл бы обратно.
    const openedAt = window.location.href;

    return () => {
      const index = sheetStack.indexOf(entry);
      const stillOurs = index >= 0;
      if (stillOurs) sheetStack.splice(index, 1);
      // Запись снял сам браузер по «назад» — в стеке нас уже нет.
      if (!stillOurs) return;
      if (window.location.href !== openedAt) return;
      programmaticBacks += 1;
      window.history.back();
    };
  }, [open, enabled]);
}

export default useSheetBackClose;

