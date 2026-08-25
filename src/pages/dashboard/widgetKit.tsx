import React from "react";
import { Alert } from "@mui/material";
import type { ActiveScope } from "../../hooks/useActiveScope";
import type { PeriodKey, PeriodRange } from "./period";

/** Общий контракт всех блоков сводки: период, его ключ и скоуп пользователя. */
export type WidgetProps = {
  range: PeriodRange;
  periodKey: PeriodKey;
  scope: ActiveScope;
};

/** Ошибка одного блока не должна ронять остальные — показываем её внутри карточки. */
export const WidgetError: React.FC<{ error: unknown }> = ({ error }) => (
  <Alert severity="error" variant="outlined" sx={{ borderRadius: "10px" }}>
    {error instanceof Error ? error.message : "Не удалось загрузить данные"}
  </Alert>
);
