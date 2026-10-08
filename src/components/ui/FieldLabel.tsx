import React from "react";
import { Stack, Typography } from "@mui/material";

export interface FieldLabelProps {
  children: React.ReactNode;
  /** Справа в строке подписи: возраст, подсказка, счётчик. */
  end?: React.ReactNode;
}

/**
 * Компактная подпись над полем формы. Мельче body2, чтобы в плотных дроверах
 * подпись не спорила со значением поля и не съедала высоту.
 */
export default function FieldLabel({ children, end }: FieldLabelProps) {
  return (
    // Фиксированная высота строки: подпись с `end` и без него в соседних
    // колонках должны стоять на одной линии.
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ minHeight: 20 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {children}
      </Typography>
      {end}
    </Stack>
  );
}
