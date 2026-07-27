import React from "react";
import { Avatar, Box, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import { useT } from "../../i18n/VerticalProvider";
import { employeeInitials } from "./employeeAccent";

interface ServiceRowShellProps {
  /** Порядковый номер строки (0-based) — показывается чипом в шапке. */
  index: number;
  /** Цвет выбранного специалиста; null — специалист ещё не выбран. */
  accentColor: string | null;
  employeeName?: string | null;
  /** Тот же специалист, что в предыдущей строке — строка помечается как продолжение. */
  continuesEmployee?: boolean;
  /** Пара специалист/услуга несовместима — рамка подсвечивается ошибкой. */
  hasError?: boolean;
  /** Поле выбора специалиста. */
  employeeField: React.ReactNode;
  /** Подсказка под полем специалиста (например, чем сужен список). */
  employeeHint?: React.ReactNode;
  /** Поле выбора услуги (вместе с кнопкой удаления, если она в одной строке). */
  serviceField: React.ReactNode;
  /** Кнопка удаления строки — уходит в шапку. */
  deleteButton?: React.ReactNode;
  /** Подсказки, цена, алерты — под полями. */
  children?: React.ReactNode;
}

/**
 * Оболочка одной строки «специалист → услуга» в форме приёма. Услуга висит
 * веткой на цветной оси специалиста, а строки одного специалиста получают один
 * цвет — по форме видно, кто какие услуги выполняет, ещё до сохранения.
 * Логика полей остаётся в дроверах: сюда они приходят слотами.
 */
const ServiceRowShell: React.FC<ServiceRowShellProps> = ({
  index,
  accentColor,
  employeeName,
  continuesEmployee = false,
  hasError = false,
  employeeField,
  employeeHint,
  serviceField,
  deleteButton,
  children,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const mode = theme.palette.mode;
  const accent = accentColor ?? theme.palette.text.disabled;

  return (
    <Paper
      variant="outlined"
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "12px",
        borderColor: hasError ? "error.main" : "divider",
        bgcolor: "background.paper",
      }}
    >
      {/* Цветная ось специалиста — общая для всех его строк */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: accent,
        }}
      />

      <Stack sx={{ pl: 2, pr: 1.5, py: 1.25 }} spacing={1.25}>
        {/* Шапка строки: номер, специалист (когда выбран), удаление */}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Avatar
            sx={{
              width: 22,
              height: 22,
              fontSize: "0.6875rem",
              fontWeight: 700,
              bgcolor: accentColor ? accent : "action.selected",
              color: accentColor
                ? theme.palette.getContrastText(accent)
                : "text.secondary",
            }}
          >
            {accentColor && employeeName ? employeeInitials(employeeName) : index + 1}
          </Avatar>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
            {continuesEmployee
              ? t("serviceRow.sameSpecialist")
              : (employeeName ?? t("serviceRow.pickSpecialist"))}
          </Typography>
          {deleteButton}
        </Stack>

        <Stack spacing={0.5}>
          {employeeField}
          {employeeHint}
        </Stack>

        {/* Услуга — веткой от оси специалиста */}
        <Box
          sx={{
            position: "relative",
            pl: 2.5,
            "&::before": {
              content: '""',
              position: "absolute",
              left: 1,
              top: 0,
              height: 20,
              width: "2px",
              bgcolor: alpha(accent, mode === "dark" ? 0.6 : 0.5),
            },
            "&::after": {
              content: '""',
              position: "absolute",
              left: 1,
              top: 18,
              width: 12,
              height: "2px",
              bgcolor: alpha(accent, mode === "dark" ? 0.6 : 0.5),
            },
          }}
        >
          <Stack spacing={0.75}>
            {serviceField}
            {children}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
};

export default ServiceRowShell;
