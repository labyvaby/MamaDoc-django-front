/**
 * usePhoneLocalInput
 * Ввод национальной части телефона с сохранением позиции курсора.
 *
 * Поле телефона контролируемое и показывает отформатированное значение
 * («702 122 762»), а в состоянии живут только цифры. Из-за этого правка в
 * середине номера выбрасывала курсор в конец: React перерисовывал value, а
 * каретку никто не возвращал — регистратура жаловалась, что ошибочную цифру
 * проще стереть весь номер и набрать заново (просьба заказчика 19.08.2026).
 *
 * Хук считает, сколько ЦИФР стоит слева от курсора, и после перерисовки ставит
 * каретку после той же по счёту цифры — разделители при этом не мешают.
 *
 * Backspace/Delete обрабатываем сами: если слева (справа) от курсора стоит
 * пробел, браузер удалил бы только его, состояние из одних цифр не изменилось
 * бы, перерисовки не случилось — и поле рассинхронизировалось бы с DOM.
 * Поэтому пропускаем разделители и удаляем именно цифру.
 */
import React from "react";

import {
  formatPhoneLocalDisplay,
  getPhoneLocalMaxLength,
  normalizePhoneLocal,
  parsePhoneInput,
  type PhoneCountryCode,
} from "../utility/phone";

const isDigit = (ch: string | undefined) => ch != null && ch >= "0" && ch <= "9";

/** Позиция в отформатированной строке сразу после `count`-й цифры. */
export function caretAfterDigits(formatted: string, count: number): number {
  let seen = 0;
  let pos = 0;
  while (pos < formatted.length && seen < count) {
    if (isDigit(formatted[pos])) seen += 1;
    pos += 1;
  }
  return pos;
}

export interface UsePhoneLocalInputResult {
  /** Прокинуть в TextField как `inputRef`. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Вешается на TextField, поэтому событие приходит от корневого элемента. */
  onKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * @param countryCode код страны — от него зависит максимальная длина номера
 * @param local       текущие цифры номера (то, что лежит в состоянии формы)
 * @param setLocal    сеттер этих цифр
 * @param setCountryCode меняет страну, когда пользователь набрал или вставил
 *                       её код прямо в поле локального номера
 */
export function usePhoneLocalInput(
  countryCode: PhoneCountryCode,
  local: string,
  setLocal: (digits: string) => void,
  setCountryCode?: (countryCode: PhoneCountryCode) => void,
): UsePhoneLocalInputResult {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  // Куда вернуть каретку после перерисовки: число цифр слева от неё.
  const caretDigitsRef = React.useRef<number | null>(null);

  /**
   * Применить новые цифры. Если они совпали с текущими (упёрлись в лимит длины
   * или удалили один разделитель), состояние не изменится и перерисовки не
   * будет — тогда возвращаем полю прежний текст и каретку руками, иначе в DOM
   * останется символ, которого нет в состоянии.
   */
  const applyDigits = React.useCallback(
    (
      el: HTMLInputElement,
      nextCountryCode: PhoneCountryCode,
      raw: string,
      caretDigits: number,
    ) => {
      const digits = normalizePhoneLocal(nextCountryCode, raw);
      const countryChanged = nextCountryCode !== countryCode;
      if (digits === local && !countryChanged) {
        const formatted = formatPhoneLocalDisplay(nextCountryCode, local);
        el.value = formatted;
        const pos = caretAfterDigits(formatted, caretDigits);
        el.setSelectionRange(pos, pos);
        return;
      }
      caretDigitsRef.current = caretDigits;
      if (countryChanged) setCountryCode?.(nextCountryCode);
      setLocal(digits);
    },
    [countryCode, local, setCountryCode, setLocal],
  );

  React.useLayoutEffect(() => {
    const digits = caretDigitsRef.current;
    if (digits == null) return;
    caretDigitsRef.current = null;

    const el = inputRef.current;
    if (!el) return;
    const pos = caretAfterDigits(el.value, digits);
    el.setSelectionRange(pos, pos);
  }, [local, countryCode]);

  const onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const el = event.target as HTMLInputElement;
      const raw = el.value;
      const caret = el.selectionStart ?? raw.length;
      const parsed = parsePhoneInput(countryCode, raw);

      applyDigits(
        el,
        parsed.countryCode,
        parsed.local,
        Math.min(
          parsed.local.length,
          raw.slice(0, caret).replace(/\D/g, "").length,
        ),
      );
    },
    [applyDigits, countryCode],
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;

      // currentTarget у TextField — корневой div, поле берём из ref.
      const el = inputRef.current;
      if (!el) return;
      const value = el.value;
      let start = el.selectionStart ?? 0;
      let end = el.selectionEnd ?? start;

      if (start === end) {
        if (event.key === "Backspace") {
          // Влево через разделители — до ближайшей цифры.
          let i = start;
          while (i > 0 && !isDigit(value[i - 1])) i -= 1;
          if (i === 0) return; // удалять нечего, поведение по умолчанию
          start = i - 1;
          end = i;
        } else {
          let i = start;
          while (i < value.length && !isDigit(value[i])) i += 1;
          if (i >= value.length) return;
          start = i;
          end = i + 1;
        }
      }

      event.preventDefault();
      applyDigits(
        el,
        countryCode,
        (value.slice(0, start) + value.slice(end))
          .replace(/\D/g, "")
          .slice(0, getPhoneLocalMaxLength(countryCode)),
        value.slice(0, start).replace(/\D/g, "").length,
      );
    },
    [applyDigits, countryCode],
  );

  return { inputRef, onChange, onKeyDown };
}
