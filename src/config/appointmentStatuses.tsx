import React from "react";
import {
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Done as DoneIcon,
  EventAvailable as EventAvailableIcon,
  Build as BuildIcon,
  Paid as PaidIcon,
  PieChart as PieChartIcon,
  PrintOutlined as PrintIcon,
  CardGiftcard as CardGiftcardIcon,
} from "@mui/icons-material";
import type { SxProps, Theme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { tt } from "../i18n/t";

/**
 * Константы статусов
 */
export const APPOINTMENT_STATUSES = {
  CANCELLED: "Отменено",
  PATIENT_ARRIVED: "Пациент здесь",
  CONFIRMED: "Подтверждён",
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
  | typeof APPOINTMENT_STATUSES.CONFIRMED
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
/**
 * Канонический код статуса — единственный ключ, по которому подбираются цвет
 * и иконка. Раньше цвет матчился по русской метке; теперь метка зависит от
 * вертикали бизнеса («Пациент здесь» / «Клиент здесь»), и такое сравнение
 * ломалось бы. Код — стабилен, метка — производная от него.
 */
export type StatusCode =
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "in_progress"
  | "completed"
  | "canceled"
  | "no_show"
  | "paid"
  | "partially_paid"
  | "paid_cashless"
  | "discounted"
  | "free";

/**
 * Всё, что может прийти в статусе, → канонический код.
 * Ключи в нижнем регистре: слаги Django, legacy-значения Supabase (русские
 * строки из APPOINTMENT_STATUSES) и исторические алиасы.
 */
const STATUS_CODE_BY_ALIAS: Record<string, StatusCode> = {
  // Django-слаги
  scheduled: "scheduled",
  confirmed: "confirmed",
  arrived: "arrived",
  in_progress: "in_progress",
  completed: "completed",
  canceled: "canceled",
  cancelled: "canceled",
  no_show: "no_show",
  waiting: "arrived",
  // Платёжные коды: не приходят с бэка в поле status, но передаются в
  // getStatusConfig/getStatusChipSx как код для подбора цвета чипа.
  paid: "paid",
  partially_paid: "partially_paid",
  paid_cashless: "paid_cashless",
  discounted: "discounted",
  free: "free",
  // legacy-значения Supabase (русские строки, приходят из старых данных)
  "ожидаем": "scheduled",
  "подтверждён": "confirmed",
  "подтвержден": "confirmed",
  "пациент здесь": "arrived",
  "в очереди": "arrived",
  "прибыл": "arrived",
  "на приёме": "in_progress",
  "на приеме": "in_progress",
  "в работе": "in_progress",
  "в процессе": "in_progress",
  "завершено": "completed",
  "завершён": "completed",
  "отменено": "canceled",
  "отменен": "canceled",
  "пациент не пришел": "no_show",
  "оплачено": "paid",
  "частично оплачено": "partially_paid",
  "частично": "partially_paid",
  "оплачено безналом": "paid_cashless",
  "со скидкой": "discounted",
  "бесплатно": "free",
};

/** Цвет и иконка на код статуса. */
const STATUS_VISUAL: Record<StatusCode, { color: StatusConfig["color"]; icon: React.ReactElement }> = {
  scheduled: { color: "warning", icon: <HourglassEmptyIcon fontSize="small" /> },
  confirmed: { color: "info", icon: <EventAvailableIcon fontSize="small" /> },
  arrived: { color: "success", icon: <CheckCircleIcon fontSize="small" /> },
  in_progress: { color: "warning", icon: <BuildIcon fontSize="small" /> },
  completed: { color: "default", icon: <DoneIcon fontSize="small" /> },
  canceled: { color: "error", icon: <CancelIcon fontSize="small" /> },
  no_show: { color: "default", icon: <CancelIcon fontSize="small" /> },
  paid: { color: "success", icon: <DoneIcon fontSize="small" /> },
  partially_paid: { color: "purple", icon: <PieChartIcon fontSize="small" /> },
  paid_cashless: { color: "info", icon: <DoneIcon fontSize="small" /> },
  discounted: { color: "secondary", icon: <DoneIcon fontSize="small" /> },
  free: { color: "success", icon: <CardGiftcardIcon fontSize="small" /> },
};

const ALL_STATUS_CODES = Object.keys(STATUS_VISUAL) as StatusCode[];

/**
 * Резолв произвольного значения статуса в канонический код (или null).
 *
 * Принимает слаг бэка, legacy-значение Supabase и уже отображаемую метку —
 * последнее важно, потому что по коду встречается двойное преобразование
 * `getStatusConfig(normalizeDjangoStatus(status))`. Метка терминологична
 * («Пациент здесь» / «Клиент здесь»), поэтому статичной таблицей алиасов её
 * не покрыть: сверяемся с актуальными метками текущей вертикали.
 */
export const resolveStatusCode = (status: unknown): StatusCode | null => {
  if (typeof status !== "string") return null;
  const key = status.trim().toLowerCase();
  if (!key) return null;

  const direct = STATUS_CODE_BY_ALIAS[key];
  if (direct) return direct;

  return (
    ALL_STATUS_CODES.find((code) => tt(`appointments:status.${code}`).toLowerCase() === key) ?? null
  );
};

/** Отображаемая метка статуса — из словаря, зависит от вертикали. */
export const getStatusLabel = (status: unknown): string => {
  const code = resolveStatusCode(status);
  if (code) return tt(`appointments:status.${code}`);
  // Неизвестный статус показываем как есть, чтобы не терять информацию.
  return typeof status === "string" && status.trim()
    ? status
    : tt("appointments:status.scheduled");
};

/**
 * Django-слаг → отображаемая метка.
 *
 * Ленивые геттеры: значение вычисляется в момент обращения, когда i18n уже
 * инициализирован и известна вертикаль. Обычным объектом-константой это не
 * сделать — она бы «застыла» на момент импорта модуля.
 */
export const DJANGO_STATUS_LABEL: Record<string, string> = Object.defineProperties(
  {},
  Object.fromEntries(
    (
      [
        "scheduled",
        "confirmed",
        "arrived",
        "in_progress",
        "completed",
        "canceled",
        "no_show",
        "waiting",
        "cancelled",
      ] as const
    ).map((slug) => [
      slug,
      { enumerable: true, get: () => getStatusLabel(slug) },
    ])
  )
) as Record<string, string>;

/**
 * Нормализация статуса к отображаемой метке.
 * Историческое имя сохранено: функция вызывается из полутора десятков мест.
 */
export function normalizeDjangoStatus(status: string): string {
  return getStatusLabel(status);
}

export const getStatusConfig = (status: any): StatusConfig => {
  const code = resolveStatusCode(status);
  const visual = code ? STATUS_VISUAL[code] : STATUS_VISUAL.scheduled;
  return {
    color: visual.color,
    icon: visual.icon,
    label: getStatusLabel(status),
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
        backgroundColor: alpha(theme.palette.purple.main, isDark ? 0.25 : 0.15),
        textColor: isDark ? theme.palette.purple.light : theme.palette.purple.dark,
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
