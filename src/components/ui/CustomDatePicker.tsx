import * as React from "react";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

/**
 * Обертка над MUI X DatePicker с открытием по двойному клику.
 *
 * ВАЖНО: контекст локализации (LocalizationProvider + AdapterDayjs + ruRU)
 * задается ОДИНОЖДЫ на уровне `App.tsx`. Здесь мы его не создаем повторно,
 * чтобы избежать конфликтов версий/контекста и ошибок вида
 * "MUI X: Can not find the date and time pickers localization context".
 * - Открывается при двойном клике на поле ввода
 */
export type CustomDatePickerProps = React.ComponentProps<typeof DatePicker>;

export function CustomDatePicker(props: CustomDatePickerProps) {
  const { slotProps, ...rest } = props;
  const [open, setOpen] = React.useState(false);

  const handleDoubleClick = () => {
    setOpen(true);
  };

  return (
    <DatePicker
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      slotProps={{
        ...slotProps,
        textField: {
          ...slotProps?.textField,
          onDoubleClick: handleDoubleClick,
        },
      }}
      {...rest}
    />
  );
}

export default CustomDatePicker;
