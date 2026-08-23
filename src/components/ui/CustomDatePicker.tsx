import * as React from "react";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

import { resolveShortYearMode, useShortYearHandlers } from "./shortYearField";
import type { ShortYearMode } from "../../utility/shortYear";

export type { ShortYearMode };

/** Год в полях даты вводится двумя цифрами — век дописывается по `shortYearMode`. */
const DEFAULT_DATE_FORMAT = "DD.MM.YY";

/**
 * Обертка над MUI X DatePicker с открытием по двойному клику.
 *
 * ВАЖНО: контекст локализации (LocalizationProvider + AdapterDayjs + ruRU)
 * задается ОДИНОЖДЫ на уровне `App.tsx`. Здесь мы его не создаем повторно,
 * чтобы избежать конфликтов версий/контекста и ошибок вида
 * "MUI X: Can not find the date and time pickers localization context".
 * - Открывается при двойном клике на поле ввода
 * - Год двузначный: «270795» → 27.07.1995, век подставляется по второй цифре
 *   (правило века — `shortYearMode`, у dayjs своя жёсткая граница 69/68 — она нам не подходит)
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
  const { slotProps, shortYearMode: _shortYearMode, format, ...rest } = props;
  const dateFormat = typeof format === "string" ? format : DEFAULT_DATE_FORMAT;
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
    format: dateFormat,
    defaultFormat: DEFAULT_DATE_FORMAT,
    mode: resolveShortYearMode(props, "past"),
    granularity: "day",
    textFieldProps,
  });

  return (
    <DatePicker
      format={dateFormat}
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
