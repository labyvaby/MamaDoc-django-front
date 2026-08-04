import * as React from "react";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";

import { expandShortYearInText, type ShortYearMode } from "../../utility/shortYear";

export type { ShortYearMode };

/** Формат ru-локали MUI X: используется, когда пикеру не передали свой `format`. */
const DEFAULT_DATE_FORMAT = "DD.MM.YYYY";

/**
 * Обертка над MUI X DatePicker с открытием по двойному клику.
 *
 * ВАЖНО: контекст локализации (LocalizationProvider + AdapterDayjs + ruRU)
 * задается ОДИНОЖДЫ на уровне `App.tsx`. Здесь мы его не создаем повторно,
 * чтобы избежать конфликтов версий/контекста и ошибок вида
 * "MUI X: Can not find the date and time pickers localization context".
 * - Открывается при двойном клике на поле ввода
 * - Короткий год дописывается сам: «27.07.95» + Enter/уход из поля → 27.07.1995
 *   (MUI X сам по себе оставляет 0095 и подсвечивает поле ошибкой)
 */
export type CustomDatePickerProps = React.ComponentProps<typeof DatePicker> & {
  /**
   * Правило дописывания века у короткого года.
   * По умолчанию выводится из ограничений пикера (`disableFuture`/`maxDate` → прошлое,
   * `disablePast`/`minDate` → будущее), иначе — прошлое (самый частый ручной ввод — дата рождения).
   */
  shortYearMode?: ShortYearMode;
};

function isDayjsValue(value: unknown): value is Dayjs {
  return !!value && typeof (value as Dayjs).year === "function" && typeof (value as Dayjs).isValid === "function";
}

/** Достать набранный текст поля даты из цели события (секция → группа → скрытый input). */
function readFieldText(target: EventTarget | null): string | null {
  if (target instanceof HTMLInputElement) return target.value;
  if (!(target instanceof HTMLElement)) return null;

  const group = target.closest('[role="group"]') ?? target.closest(".MuiPickersInputBase-root");
  const input = group?.querySelector("input");
  if (input instanceof HTMLInputElement) return input.value;

  // Фолбэк: собрать из видимых секций (zero-width пробелы MUI выкидываем)
  return group?.textContent?.replace(/\u200B/g, "") ?? null;
}

function resolveShortYearMode(props: CustomDatePickerProps): ShortYearMode {
  if (props.shortYearMode) return props.shortYearMode;

  const today = dayjs();
  if (props.disableFuture) return "past";
  if (props.disablePast) return "future";

  const maxDate = props.maxDate;
  if (isDayjsValue(maxDate) && maxDate.isValid() && !maxDate.isAfter(today, "day")) return "past";

  const minDate = props.minDate;
  if (isDayjsValue(minDate) && minDate.isValid() && !minDate.isBefore(today, "day")) return "future";

  return "past";
}

export function CustomDatePicker(props: CustomDatePickerProps) {
  const { slotProps, shortYearMode: _shortYearMode, ...rest } = props;
  const [open, setOpen] = React.useState(false);

  const handleDoubleClick = () => {
    setOpen(true);
  };

  const mode = resolveShortYearMode(props);
  const { value, onChange } = props;

  /**
   * Дописать век по тому, что набрано в поле.
   *
   * Читаем именно текст: пока в секции года меньше четырёх цифр, MUI X считает ввод
   * невалидным и отдаёт наружу Invalid Date — из него год уже не восстановить.
   */
  const normalizeShortYear = (target: EventTarget | null): boolean => {
    if (mode === "off" || !onChange) return false;

    // MUI X v8 рисует поле секциями-span внутри role="group", а полный текст держит
    // в скрытом input — событие приходит от секции, поэтому поднимаемся к группе.
    const text = readFieldText(target);
    if (!text) return false;

    const format = typeof rest.format === "string" ? rest.format : DEFAULT_DATE_FORMAT;
    const iso = expandShortYearInText(text, format, mode, dayjs().year());
    if (!iso) return false;

    const next = dayjs(iso);
    if (!next.isValid()) return false;
    if (isDayjsValue(value) && value.isValid() && value.isSame(next, "day")) return false;

    // Второй аргумент — контекст валидации MUI X; наши обработчики его не используют.
    onChange(next as never, { validationError: null } as never);
    return true;
  };

  const textFieldProps = (typeof slotProps?.textField === "function" ? undefined : slotProps?.textField) as
    | Record<string, unknown>
    | undefined;

  return (
    <DatePicker
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      slotProps={{
        ...slotProps,
        textField: {
          ...textFieldProps,
          onDoubleClick: handleDoubleClick,
          onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
            normalizeShortYear(event.target);
            (textFieldProps?.onBlur as ((e: React.FocusEvent<HTMLDivElement>) => void) | undefined)?.(event);
          },
          onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
            // Enter «продвигает вперёд»: сначала дописывает век, и только когда дописывать
            // нечего — уходит форме (её onKeyDown обычно сохраняет). Совмещать нельзя:
            // обработчик сохранения на том же событии прочитал бы ещё старую дату.
            if (event.key === "Enter" && normalizeShortYear(event.target)) {
              event.preventDefault();
              return;
            }
            (textFieldProps?.onKeyDown as ((e: React.KeyboardEvent<HTMLDivElement>) => void) | undefined)?.(event);
          },
        },
      }}
      {...rest}
    />
  );
}

export default CustomDatePicker;
