import * as React from "react";
import dayjs, { type Dayjs } from "dayjs";

import { buildIsoWithYear, expandShortYear, expandShortYearInText, type ShortYearMode } from "../../utility/shortYear";

/**
 * Дописывание века у короткого года — общая часть полей MUI X (дата и дата+время).
 *
 * Два неочевидных факта MUI X v8, из-за которых логика такая:
 * 1. Пока в секции года меньше четырёх цифр, пикер считает ввод невалидным и в `onChange`
 *    отдаёт Invalid Date — год оттуда не восстановить, поэтому читаем текст поля.
 * 2. Поле нарисовано секциями-`<span>` внутри `[role="group"]`, полный текст лежит в скрытом
 *    `<input aria-hidden>`; событие приходит от секции, поэтому поднимаемся к группе.
 *
 * Нормализовать в `onChange` нельзя: перезапись value обрывает набор (ввод «1995» превратился
 * бы в 2019 → 2009 → 2005). Только blur/Enter.
 */

export type ShortYearConstraints = {
  disableFuture?: boolean;
  disablePast?: boolean;
  minDate?: unknown;
  maxDate?: unknown;
  shortYearMode?: ShortYearMode;
};

function isDayjsValue(value: unknown): value is Dayjs {
  return !!value && typeof (value as Dayjs).year === "function" && typeof (value as Dayjs).isValid === "function";
}

/**
 * Секция года среди секций поля: у неё единственной верхняя граница 9999.
 * По индексу секции или по aria-label ориентироваться нельзя — порядок задаётся форматом,
 * а подпись переводится вместе с локалью.
 */
const YEAR_SECTION_MAX = "9999";

function isYearSection(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && target.getAttribute("aria-valuemax") === YEAR_SECTION_MAX;
}

/** Достать набранный текст поля даты из цели события (секция → группа → скрытый input). */
export function readFieldText(target: EventTarget | null): string | null {
  if (target instanceof HTMLInputElement) return target.value;
  if (!(target instanceof HTMLElement)) return null;

  const group = target.closest('[role="group"]') ?? target.closest(".MuiPickersInputBase-root");
  const input = group?.querySelector("input");
  if (input instanceof HTMLInputElement) return input.value;

  // Фолбэк: собрать из видимых секций (zero-width пробелы MUI выкидываем)
  return group?.textContent?.replace(/\u200B/g, "") ?? null;
}

/**
 * Правило века: выводится из ограничений пикера (`disableFuture`/`maxDate` → прошлое,
 * `disablePast`/`minDate` → будущее), иначе — переданный дефолт.
 */
export function resolveShortYearMode(props: ShortYearConstraints, fallback: ShortYearMode): ShortYearMode {
  if (props.shortYearMode) return props.shortYearMode;

  const today = dayjs();
  if (props.disableFuture) return "past";
  if (props.disablePast) return "future";

  const maxDate = props.maxDate;
  if (isDayjsValue(maxDate) && maxDate.isValid() && !maxDate.isAfter(today, "day")) return "past";

  const minDate = props.minDate;
  if (isDayjsValue(minDate) && minDate.isValid() && !minDate.isBefore(today, "day")) return "future";

  return fallback;
}

type ShortYearFieldOptions = {
  value: unknown;
  onChange?: (value: never, context: never) => void;
  /** Формат пикера; если не задан — формат ru-локали MUI X. */
  format?: unknown;
  defaultFormat: string;
  mode: ShortYearMode;
  /** Точность сравнения «дата не изменилась»: у даты — день, у даты со временем — минута. */
  granularity: "day" | "minute";
  /** Пользовательские обработчики textField, которые нужно вызвать после нормализации. */
  textFieldProps?: Record<string, unknown>;
};

/**
 * Обработчики `slotProps.textField`, дописывающие век сразу после второй цифры года
 * (а также по blur и Enter — на случай неполного ввода).
 */
export function useShortYearHandlers(options: ShortYearFieldOptions) {
  const { value, onChange, format, defaultFormat, mode, granularity, textFieldProps } = options;

  // Первая цифра года держится здесь: по самому полю набранное не восстановить —
  // MUI дополняет ввод нулями, и «9» от «0009» не отличить.
  const yearTyping = React.useRef<{ section: HTMLElement | null; firstDigit: number | null }>({
    section: null,
    firstDigit: null,
  });

  const normalize = (target: EventTarget | null): boolean => {
    if (mode === "off" || !onChange) return false;

    const text = readFieldText(target);
    if (!text) return false;

    const fmt = typeof format === "string" ? format : defaultFormat;
    const iso = expandShortYearInText(text, fmt, mode, dayjs().year());
    if (!iso) return false;

    const next = dayjs(iso);
    if (!next.isValid()) return false;
    if (isDayjsValue(value) && value.isValid() && value.isSame(next, granularity)) return false;

    // Второй аргумент — контекст валидации MUI X; наши обработчики его не используют.
    onChange(next as never, { validationError: null } as never);
    return true;
  };

  /** Перейти к следующей секции так же, как это делает сам MUI при заполнении секции. */
  const moveToNextSection = (section: HTMLElement) => {
    section.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  };

  return {
    onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
      yearTyping.current = { section: null, firstDigit: null };
      normalize(event.target);
      (textFieldProps?.onBlur as ((e: React.FocusEvent<HTMLDivElement>) => void) | undefined)?.(event);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Enter «продвигает вперёд»: сначала дописывает век, и только когда дописывать
      // нечего — уходит форме (её onKeyDown обычно сохраняет). Совмещать нельзя:
      // обработчик сохранения на том же событии прочитал бы ещё старую дату.
      if (event.key === "Enter" && normalize(event.target)) {
        event.preventDefault();
        return;
      }

      // Год вводится двумя цифрами: на второй фиксируем век и уходим к следующей секции,
      // так что третья цифра начинает новый год, а не продолжает старый.
      if (mode !== "off" && onChange) {
        const section = event.target;
        if (/^[0-9]$/.test(event.key) && isYearSection(section)) {
          const typing = yearTyping.current;

          if (typing.section !== section || typing.firstDigit === null) {
            yearTyping.current = { section, firstDigit: Number(event.key) };
          } else {
            yearTyping.current = { section: null, firstDigit: null };

            const shortYear = typing.firstDigit * 10 + Number(event.key);
            const fmt = typeof format === "string" ? format : defaultFormat;
            const iso = buildIsoWithYear(
              readFieldText(section) ?? "",
              fmt,
              expandShortYear(shortYear, mode, dayjs().year()),
            );
            const next = iso ? dayjs(iso) : null;

            // Год ставим сами, не дожидаясь поля: при быстром наборе следующая цифра
            // прилетает раньше, чем MUI успевает перерисовать секцию.
            if (next?.isValid()) {
              event.preventDefault();
              onChange(next as never, { validationError: null } as never);
              moveToNextSection(section);
              return;
            }
          }
        } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          // Стрелки, Backspace, Tab — набор года прерван, считаем заново.
          yearTyping.current = { section: null, firstDigit: null };
        }
      }

      (textFieldProps?.onKeyDown as ((e: React.KeyboardEvent<HTMLDivElement>) => void) | undefined)?.(event);
    },
  };
}
