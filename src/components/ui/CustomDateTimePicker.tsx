import * as React from "react";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";

/**
 * Обертка над MUI X DateTimePicker с minutesStep=5 по умолчанию.
 *
 * ВАЖНО: контекст локализации (LocalizationProvider + AdapterDayjs + ruRU)
 * задается ОДИНОЖДЫ на уровне `App.tsx`. Здесь мы его не создаем повторно,
 * чтобы избежать конфликтов версий/контекста и ошибок вида
 * "MUI X: Can not find the date and time pickers localization context".
 * - Открывается при двойном клике на поле ввода
 */
export type CustomDateTimePickerProps = React.ComponentProps<typeof DateTimePicker>;

export function CustomDateTimePicker(props: CustomDateTimePickerProps) {
  const { minutesStep, slotProps, ...rest } = props;
  const [open, setOpen] = React.useState(false);

  const handleDoubleClick = () => {
    setOpen(true);
  };

  return (
    <DateTimePicker
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
          ...slotProps?.textField,
          onDoubleClick: handleDoubleClick,
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
