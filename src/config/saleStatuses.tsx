import React from "react";
import {
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  PieChart as PieChartIcon,
} from "@mui/icons-material";
import type { SxProps, Theme } from "@mui/material";
import { alpha } from "@mui/material/styles";

/**
 * Константы статусов продаж
 */
export const SALE_STATUSES = {
  PAID: "paid",
  DISCOUNTED: "discounted",
  PARTIAL: "partial",
  OPEN: "open",
  CANCELED: "canceled",
} as const;

/**
 * Названия статусов на русском
 */
export const SALE_STATUS_LABELS = {
  [SALE_STATUSES.PAID]: "Оплачено",
  [SALE_STATUSES.DISCOUNTED]: "Оплачено со скидкой",
  [SALE_STATUSES.PARTIAL]: "Частично оплачено",
  [SALE_STATUSES.OPEN]: "Ожидает оплаты",
  [SALE_STATUSES.CANCELED]: "Отменено",
} as const;

/**
 * Тип для статусов продаж
 */
export type SaleStatus =
  | typeof SALE_STATUSES.PAID
  | typeof SALE_STATUSES.PARTIAL
  | typeof SALE_STATUSES.OPEN
  | typeof SALE_STATUSES.CANCELED
  | string; // fallback для неизвестных статусов

/**
 * Конфигурация цветов и иконок для каждого статуса
 */
export interface StatusConfig {
  color: "error" | "success" | "info" | "warning" | "secondary" | "default";
  icon: React.ReactElement;
  label: string;
}

/**
 * Базовая конфигурация статуса (без цветов, т.к. они зависят от темы)
 */
export const getSaleStatusConfig = (status: string): StatusConfig => {
  const statusLower = status.trim().toLowerCase();

  // Оплачено со скидкой - фиолетовый/secondary
  if (statusLower === SALE_STATUSES.DISCOUNTED || statusLower === "оплачено со скидкой") {
    return {
      color: "secondary" as const,
      icon: <CheckCircleIcon fontSize="small" />,
      label: SALE_STATUS_LABELS[SALE_STATUSES.DISCOUNTED],
    };
  }

  // Оплачено - зеленый
  if (statusLower === SALE_STATUSES.PAID || statusLower === "оплачено") {
    return {
      color: "success",
      icon: <CheckCircleIcon fontSize="small" />,
      label: SALE_STATUS_LABELS[SALE_STATUSES.PAID],
    };
  }

  // Частично оплачено - синий (info)
  if (statusLower === SALE_STATUSES.PARTIAL || statusLower === "частично оплачено" || statusLower === "частично") {
    return {
      color: "info",
      icon: <PieChartIcon fontSize="small" />,
      label: SALE_STATUS_LABELS[SALE_STATUSES.PARTIAL],
    };
  }

  // Отменено - красный
  if (statusLower === SALE_STATUSES.CANCELED || statusLower === "отменено" || statusLower === "отменён") {
    return {
      color: "error",
      icon: <CancelIcon fontSize="small" />,
      label: SALE_STATUS_LABELS[SALE_STATUSES.CANCELED],
    };
  }

  // Ожидает оплаты (открыто) - желтый/оранжевый
  return {
    color: "warning",
    icon: <HourglassEmptyIcon fontSize="small" />,
    label: SALE_STATUS_LABELS[SALE_STATUSES.OPEN],
  };
};

/**
 * Получить цвета для статуса с учётом темы
 */
const getSaleStatusColors = (status: string, theme: Theme): { backgroundColor: string; textColor: string } => {
  const config = getSaleStatusConfig(status);
  const isDark = theme.palette.mode === 'dark';

  switch (config.color) {
    case "error":
      return {
        backgroundColor: alpha(theme.palette.error.main, isDark ? 0.2 : 0.12),
        textColor: isDark ? theme.palette.error.light : theme.palette.error.dark,
      };
    case "success":
      return {
        backgroundColor: alpha(theme.palette.success.main, isDark ? 0.2 : 0.12),
        textColor: isDark ? theme.palette.success.light : theme.palette.success.dark,
      };
    case "warning":
      return {
        backgroundColor: alpha(theme.palette.warning.main, isDark ? 0.2 : 0.12),
        textColor: isDark ? theme.palette.warning.light : theme.palette.warning.dark,
      };
    case "info":
      return {
        backgroundColor: alpha(theme.palette.info.main, isDark ? 0.2 : 0.12),
        textColor: isDark ? theme.palette.info.light : theme.palette.info.dark,
      };
    case "secondary":
      return {
        backgroundColor: alpha(theme.palette.secondary.main, isDark ? 0.2 : 0.12),
        textColor: isDark ? theme.palette.secondary.light : theme.palette.secondary.dark,
      };
    case "default":
    default:
      return {
        backgroundColor: alpha(theme.palette.grey[500], isDark ? 0.2 : 0.12),
        textColor: isDark ? theme.palette.grey[300] : theme.palette.grey[700],
      };
  }
};

/**
 * Получить sx prop для Chip компонента с кастомными цветами
 * Использует функцию от темы для поддержки светлой/тёмной темы
 */
export const getSaleStatusChipSx = (status: string): SxProps<Theme> => {
  return (theme: Theme) => {
    const { backgroundColor, textColor } = getSaleStatusColors(status, theme);

    return {
      backgroundColor,
      color: textColor,
      fontWeight: 500,
      fontSize: "0.75rem",
      height: "22px",
      "& .MuiChip-icon": {
        color: textColor,
      },
      // Hover effect для лучшей интерактивности
      "&:hover": {
        backgroundColor,
        opacity: 0.9,
      },
    };
  };
};

/**
 * Получить sx prop для Badge компонента
 */
export const getSaleStatusBadgeSx = (status: string): SxProps<Theme> => {
  return (theme: Theme) => {
    const { textColor } = getSaleStatusColors(status, theme);

    return {
      "& .MuiBadge-badge": {
        backgroundColor: textColor,
        color: theme.palette.getContrastText(textColor),
      },
    };
  };
};
