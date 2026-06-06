import React from "react";
import {
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Done as DoneIcon,
  Build as BuildIcon,
  Paid as PaidIcon,
  PieChart as PieChartIcon,
  PrintOutlined as PrintIcon,
  CardGiftcard as CardGiftcardIcon,
} from "@mui/icons-material";
import type { SxProps, Theme } from "@mui/material";
import { alpha } from "@mui/material/styles";

/**
 * Константы статусов
 */
export const APPOINTMENT_STATUSES = {
  CANCELLED: "Отменено",
  PATIENT_ARRIVED: "Пациент здесь",
  EXPECTED: "Ожидаем",
  COMPLETED: "Завершено",
  IN_PROGRESS: "В работе",
  PAID: "Оплачено",
  PARTIALLY_PAID: "Частично оплачено",
  PATIENT_NOT_CAME: "Пациент не пришел",
  DISCOUNTED: "Со скидкой",
  FREE: "Бесплатно",
} as const;

/**
 * Тип для статусов приемов
 * Основан на реальных значениях из таблицы Appointments
 */
export type AppointmentStatus =
  | typeof APPOINTMENT_STATUSES.CANCELLED
  | typeof APPOINTMENT_STATUSES.PATIENT_ARRIVED
  | typeof APPOINTMENT_STATUSES.EXPECTED
  | typeof APPOINTMENT_STATUSES.COMPLETED
  | typeof APPOINTMENT_STATUSES.IN_PROGRESS
  | typeof APPOINTMENT_STATUSES.PAID
  | typeof APPOINTMENT_STATUSES.DISCOUNTED
  | string; // fallback для неизвестных статусов

/**
 * Конфигурация цветов и иконок для каждого статуса
 */
export interface StatusConfig {
  color: "error" | "success" | "info" | "warning" | "default" | "secondary" | "purple";
  icon: React.ReactElement;
  label: string;
}

/**
 * Базовая конфигурация статуса (без цветов, т.к. они зависят от темы)
 */
// Django backend status → Russian display label
export const DJANGO_STATUS_LABEL: Record<string, string> = {
  scheduled: "Ожидаем",
  waiting: "Пациент здесь",
  in_progress: "В работе",
  completed: "Завершено",
  cancelled: "Отменено",
  no_show: "Пациент не пришел",
};

// Normalize a backend (Django) status slug to the Russian label used in getStatusConfig
export function normalizeDjangoStatus(status: string): string {
  return DJANGO_STATUS_LABEL[status] ?? status;
}

export const getStatusConfig = (status: any): StatusConfig => {
  if (typeof status !== 'string') {
    return {
      color: "warning",
      icon: <HourglassEmptyIcon fontSize="small" />,
      label: status ? String(status) : "Ожидаем",
    };
  }
  // Normalise Django slugs → Russian labels so colour-matching below works
  const resolved = DJANGO_STATUS_LABEL[status.trim()] ?? status;
  const statusLower = resolved.trim().toLowerCase();

  // Отменено - красный
  if (statusLower === APPOINTMENT_STATUSES.CANCELLED.toLowerCase() || statusLower === "отменен" || statusLower === "cancelled") {
    return {
      color: "error",
      icon: <CancelIcon fontSize="small" />,
      label: status,
    };
  }

  // Пациент здесь - зеленый
  if (
    statusLower === APPOINTMENT_STATUSES.PATIENT_ARRIVED.toLowerCase() ||
    statusLower === "в очереди" ||
    statusLower === "прибыл" ||
    statusLower === "waiting"
  ) {
    return {
      color: "success",
      icon: <CheckCircleIcon fontSize="small" />,
      label: resolved,
    };
  }

  // Оплачено - темно-зеленый
  if (statusLower === APPOINTMENT_STATUSES.PAID.toLowerCase()) {
    return {
      color: "success",
      icon: <DoneIcon fontSize="small" />,
      label: resolved,
    };
  }

  // Со скидкой (100%) - фиолетовый
  if (statusLower === APPOINTMENT_STATUSES.DISCOUNTED.toLowerCase()) {
    return {
      color: "secondary",
      icon: <DoneIcon fontSize="small" />,
      label: resolved,
    };
  }

  // В работе - желтый/оранжевый
  if (statusLower === APPOINTMENT_STATUSES.IN_PROGRESS.toLowerCase() || statusLower === "в процессе" || statusLower === "in_progress") {
    return {
      color: "warning",
      icon: <BuildIcon fontSize="small" />,
      label: resolved,
    };
  }

  // Завершено - серый/спокойный синий
  if (statusLower === APPOINTMENT_STATUSES.COMPLETED.toLowerCase() || statusLower === "завершён" || statusLower === "completed") {
    return {
      color: "default",
      icon: <DoneIcon fontSize="small" />,
      label: resolved,
    };
  }

  // Пациент не пришел - серый
  if (statusLower === APPOINTMENT_STATUSES.PATIENT_NOT_CAME.toLowerCase() || statusLower === "no_show") {
    return {
      color: "default",
      icon: <CancelIcon fontSize="small" />,
      label: resolved,
    };
  }

  // Частично оплачено - фиолетовый (уникальный)
  if (statusLower === APPOINTMENT_STATUSES.PARTIALLY_PAID.toLowerCase() || statusLower === "частично") {
    return {
      color: "purple" as any,
      icon: <PieChartIcon fontSize="small" />,
      label: resolved,
    };
  }

  // Оплачено безналом - синий (info)
  if (statusLower === "оплачено безналом") {
    return {
      color: "info",
      icon: <DoneIcon fontSize="small" />,
      label: "Оплачено",
    };
  }

  // Бесплатно - зелёный с иконкой подарка
  if (statusLower === APPOINTMENT_STATUSES.FREE.toLowerCase()) {
    return {
      color: "success",
      icon: <CardGiftcardIcon fontSize="small" />,
      label: resolved,
    };
  }

  // Ожидаем (дефолт) - жёлтый
  return {
    color: "warning",
    icon: <HourglassEmptyIcon fontSize="small" />,
    label: resolved,
  };
};

/**
 * Получить цвета для статуса с учётом темы
 */
const getStatusColors = (status: string, theme: Theme): { backgroundColor: string; textColor: string } => {
  const config = getStatusConfig(status);
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
    case "purple":
      return {
        backgroundColor: isDark ? alpha("#4f46e5", 0.25) : alpha("#4f46e5", 0.15),
        textColor: isDark ? "#a5b4fc" : "#3730a3",
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
export const getStatusChipSx = (status: string): SxProps<Theme> => {
  return (theme: Theme) => {
    const { backgroundColor, textColor } = getStatusColors(status, theme);

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
export const getStatusBadgeSx = (status: string): SxProps<Theme> => {
  return (theme: Theme) => {
    const { textColor } = getStatusColors(status, theme);

    return {
      "& .MuiBadge-badge": {
        backgroundColor: textColor,
        color: theme.palette.getContrastText(textColor),
      },
    };
  };
};
