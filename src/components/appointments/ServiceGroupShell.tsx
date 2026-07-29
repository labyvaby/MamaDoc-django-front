import React from "react";
import { Avatar, Box, Paper, Stack } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import { employeeInitials } from "./employeeAccent";

interface ServiceGroupShellProps {
  /** Порядковый номер блока (0-based) — в аватаре, пока специалист не выбран. */
  index: number;
  /** Цвет специалиста; null — специалист ещё не выбран. */
  accentColor: string | null;
  /** ФИО выбранного специалиста — только для инициалов в аватаре. */
  employeeName?: string | null;
  /** Хотя бы одна услуга блока несовместима со специалистом. */
  hasError?: boolean;
  /** Поле выбора специалиста — одно на блок. */
  employeeField: React.ReactNode;
  /** Действие в шапке блока (например, удалить блок целиком). */
  headerAction?: React.ReactNode;
  /** Услуги специалиста — ветки его оси (`ServiceBranch`). */
  children?: React.ReactNode;
  /** Действие под ветками — кнопка «добавить услугу» этому специалисту. */
  footer?: React.ReactNode;
}

/**
 * Блок «специалист → его услуги» в форме приёма: специалист выбирается один
 * раз в шапке, все его услуги висят ветками на одной цветной оси. Если две
 * услуги делает один человек, они попадают в один блок — форма выглядит так же,
 * как готовый приём (`ServiceEmployeeGroups`). Логика полей остаётся в дроверах:
 * сюда они приходят слотами.
 */
const ServiceGroupShell: React.FC<ServiceGroupShellProps> = ({
  index,
  accentColor,
  employeeName,
  hasError = false,
  employeeField,
  headerAction,
  children,
  footer,
}) => {
  const theme = useTheme();
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
      {/* Цветная ось специалиста — общая для всех его услуг */}
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
        {/* Шапка: аватар специалиста + его выбор. Имя не дублируется подписью —
            его показывает само поле. */}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Avatar
            sx={{
              width: 26,
              height: 26,
              flexShrink: 0,
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
          <Box sx={{ flex: 1, minWidth: 0 }}>{employeeField}</Box>
          {headerAction}
        </Stack>

        {children}

        {footer && <Box sx={{ pl: 2.5 }}>{footer}</Box>}
      </Stack>
    </Paper>
  );
};

interface ServiceBranchProps {
  /** Цвет оси специалиста — тот же, что у блока. */
  accentColor: string | null;
  /** Последняя услуга блока — ствол обрывается на отводе. */
  isLast?: boolean;
  /** Поле выбора услуги. */
  field: React.ReactNode;
  /** Кнопка удаления этой услуги. */
  deleteButton?: React.ReactNode;
  /** Цена, подсказки, алерты — под полем услуги. */
  children?: React.ReactNode;
}

/** Одна услуга специалиста — ветка на его оси внутри `ServiceGroupShell`. */
export const ServiceBranch: React.FC<ServiceBranchProps> = ({
  accentColor,
  isLast = false,
  field,
  deleteButton,
  children,
}) => {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const accent = accentColor ?? theme.palette.text.disabled;
  const line = alpha(accent, mode === "dark" ? 0.6 : 0.5);

  return (
    <Box
      sx={{
        position: "relative",
        pl: 2.5,
        // Ствол тянется вверх за границу ветки, чтобы стыковаться с шапкой и
        // предыдущей услугой; у последней услуги обрывается на отводе.
        "&::before": {
          content: '""',
          position: "absolute",
          left: 1,
          top: -10,
          height: isLast ? 30 : "calc(100% + 10px)",
          width: "2px",
          bgcolor: line,
        },
        "&::after": {
          content: '""',
          position: "absolute",
          left: 1,
          top: 20,
          width: 12,
          height: "2px",
          bgcolor: line,
        },
      }}
    >
      <Stack spacing={0.75}>
        <Stack direction="row" alignItems="flex-start" spacing={0.5}>
          <Box sx={{ flex: 1, minWidth: 0 }}>{field}</Box>
          {deleteButton}
        </Stack>
        {children}
      </Stack>
    </Box>
  );
};

export default ServiceGroupShell;
