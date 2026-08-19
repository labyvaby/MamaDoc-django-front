import * as React from "react";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

import { resolveShortYearMode, useShortYearHandlers } from "./shortYearField";
import type { ShortYearMode } from "../../utility/shortYear";

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

export function CustomDatePicker(props: CustomDatePickerProps) {
  const { slotProps, shortYearMode: _shortYearMode, ...rest } = props;
  const [open, setOpen] = React.useState(false);

  const handleDoubleClick = () => {
    setOpen(true);
  };

  const textFieldProps = (typeof slotProps?.textField === "function" ? undefined : slotProps?.textField) as
    | Record<string, unknown>
    | undefined;

  const shortYear = useShortYearHandlers({
    value: props.value,
    onChange: props.onChange as ((value: never, context: never) => void) | undefined,
    format: rest.format,
    defaultFormat: DEFAULT_DATE_FORMAT,
    mode: resolveShortYearMode(props, "past"),
    granularity: "day",
    textFieldProps,
  });

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
          onBlur: shortYear.onBlur,
          onKeyDown: shortYear.onKeyDown,
        },
      }}
      {...rest}
    />
  );
}

export default CustomDatePicker;
