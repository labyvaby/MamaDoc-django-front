import React from "react";
import { IconButton, Stack, Typography } from "@mui/material";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";

import { canGoForward, periodLabel, shiftPeriod, type PeriodMode } from "./periodStep";

type Props = {
  /** Выбранный период, «YYYY-MM». */
  value: string;
  onChange: (month: string) => void;
  mode?: PeriodMode;
};

/** Переключатель периода стрелками: ‹ Сентябрь 2026 ›. */
const PeriodStepper: React.FC<Props> = ({ value, onChange, mode = "month" }) => (
  <Stack
    direction="row"
    alignItems="center"
    sx={{ border: 1, borderColor: "divider", borderRadius: "10px", height: 40, px: 0.25 }}
  >
    <IconButton
      size="small"
      aria-label={mode === "year" ? "Предыдущий год" : "Предыдущий месяц"}
      onClick={() => onChange(shiftPeriod(value, mode, -1))}
    >
      <ChevronLeftRounded />
    </IconButton>
    <Typography variant="body2" fontWeight={600} sx={{ minWidth: 124, textAlign: "center", userSelect: "none" }}>
      {periodLabel(value, mode)}
    </Typography>
    <IconButton
      size="small"
      aria-label={mode === "year" ? "Следующий год" : "Следующий месяц"}
      disabled={!canGoForward(value, mode)}
      onClick={() => onChange(shiftPeriod(value, mode, 1))}
    >
      <ChevronRightRounded />
    </IconButton>
  </Stack>
);

export default PeriodStepper;
