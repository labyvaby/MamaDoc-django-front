import * as React from "react";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";

import { resolveShortYearMode, useShortYearHandlers } from "./shortYearField";
import type { ShortYearMode } from "../../utility/shortYear";

/** Год в полях даты вводится двумя цифрами — век дописывается по `shortYearMode`. */
const DEFAULT_DATE_TIME_FORMAT = "DD.MM.YY HH:mm";

/**
 * Обертка над MUI X DateTimePicker с minutesStep=5 по умолчанию.
 *
 * ВАЖНО: контекст локализации (LocalizationProvider + AdapterDayjs + ruRU)
 * задается ОДИНОЖДЫ на уровне `App.tsx`. Здесь мы его не создаем повторно,
 * чтобы избежать конфликтов версий/контекста и ошибок вида
 * "MUI X: Can not find the date and time pickers localization context".
 * - Открывается при двойном клике на поле ввода
 * - Год двузначный: «27.07.95 10:00» → 1995, век берётся по правилу `shortYearMode`
 *   (по умолчанию — ближайший год)
 */
export type CustomDateTimePickerProps = React.ComponentProps<typeof DateTimePicker> & {
  /**
   * Правило дописывания века у короткого года.
   * По умолчанию выводится из ограничений пикера, иначе — ближайший год в любую сторону:
   * дату со временем ставят и вперёд (запись), и назад (задним числом).
   */
  shortYearMode?: ShortYearMode;
};

export function CustomDateTimePicker(props: CustomDateTimePickerProps) {
  const { minutesStep, slotProps, shortYearMode: _shortYearMode, format, ...rest } = props;
  const dateTimeFormat = typeof format === "string" ? format : DEFAULT_DATE_TIME_FORMAT;
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
    format: dateTimeFormat,
    defaultFormat: DEFAULT_DATE_TIME_FORMAT,
    mode: resolveShortYearMode(props, "nearest"),
    granularity: "minute",
    textFieldProps,
  });

  return (
    <DateTimePicker
      format={dateTimeFormat}
      minutesStep={minutesStep ?? 15}
      shouldDisableTime={(value, view) => view === "minutes" && value.minute() % (minutesStep ?? 15) !== 0}
      // @ts-ignore
      skipDisabled={true}
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
        // @ts-ignore
        digitalClock: {
          skipDisabled: true,
        },
        // @ts-ignore
        multiSectionDigitalClock: {
          skipDisabled: true,
        },
      }}
      {...rest}
    />
  );
}

export default CustomDateTimePicker;
