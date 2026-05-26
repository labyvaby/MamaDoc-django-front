import * as React from "react";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";

/**
 * CustomTimePicker
 * Обертка над MUI X TimePicker с minutesStep=5 по умолчанию.
 * - Полностью сохраняет типы пропсов TimePickerProps<TDate>
 * - Позволяет переопределить minutesStep при необходимости
 * - Открывается при двойном клике на поле ввода
 */
type CustomTimePickerProps = React.ComponentProps<typeof TimePicker>;

export function CustomTimePicker(props: CustomTimePickerProps) {
  const { minutesStep, slotProps, ...rest } = props;
  const [open, setOpen] = React.useState(false);

  const handleDoubleClick = () => {
    setOpen(true);
  };

  return (
    <TimePicker
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

export type { CustomTimePickerProps };

export default CustomTimePicker;
export type { TimePickerProps } from "@mui/x-date-pickers/TimePicker";
