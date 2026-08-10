import React from "react";
import {
  CancelOutlined as CancelIcon,
  PersonOffOutlined as PersonOffIcon,
  HowToRegOutlined as HowToRegIcon,
  HourglassEmptyOutlined as HourglassEmptyIcon,
  FlagOutlined as FlagIcon,
  EventAvailableOutlined as EventAvailableIcon,
  PlayCircleOutlined as PlayCircleIcon,
  PaymentsOutlined as PaymentsIcon,
  CreditCardOutlined as CreditCardIcon,
  PercentOutlined as PercentIcon,
  WarningAmberOutlined as WarningAmberIcon,
  HealthAndSafetyOutlined as HealthAndSafetyIcon,
  PieChartOutlined as PieChartIcon,
  CardGiftcardOutlined as CardGiftcardIcon,
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
  color: "error" | "success" | "info" | "warning" | "default" | "secondary" | "purple" | "teal";
  icon: React.ReactElement;
  label: string;
  /** Смысловая дорожка статуса — определяет стиль чипа (см. StatusTrack). */
  track: StatusTrack;
}

/**
 * Две смысловые дорожки чипов.
 *
 * В строке регистратуры рядом стоят метки о совершенно разном: как далеко
 * продвинулся визит («Подтверждён», «Пациент здесь») и что с деньгами
 * («Оплачено», «Долг 500 сом»). Раньше обе дорожки делили одну палитру, и
 * пары совпадали цвет в цвет: подтверждён = оплачено картой (синий), пациент
 * здесь = оплачено наличными (зелёный). Теперь дорожки различаются не только
 * оттенком, но и формой чипа — визит рисуется контуром, деньги заливкой. Форма
 * читается даже при близких оттенках и при дальтонизме, где цвет не помогает.
 */
export type StatusTrack = "visit" | "money";

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
  | "free"
  /** Остаток к оплате — чип «Долг N из M». */
  | "debt"
  /** Визит (со)оплачен страховой компанией. */
  | "insurance";

/**
 * Всё, что может прийти в статусе, → канонический код.
 * Ключи в нижнем регистре: слаги Django и значения из старых записей (русские
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
  debt: "debt",
  insurance: "insurance",
  // Старые русские значения, которые могут приходить из исторических данных.
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
  "долг": "debt",
  "страховка": "insurance",
};

/**
 * Цвет, иконка и дорожка на код статуса.
 *
 * Внутри дорожки цвета не повторяются — иначе два разных состояния снова
 * станут неразличимы (тест `appointmentStatuses.test.ts` это фиксирует).
 * Дорожка «визит» идёт шкалой прогресса: ничего не произошло (серый) →
 * подтверждён (синий) → человек в холле (бирюзовый) → идёт приём (янтарный) →
 * закрыт (серый), плюс два негативных исхода красным. В дорожке «деньги»
 * зелёный — оплата наличными, бирюзовый — безналом (карта).
 *
 * Иконки у всех разные: раньше «Завершено», «Оплачено», «Оплачено картой» и
 * «Со скидкой» несли одну галочку, и иконка не добавляла информации к цвету.
 */
const STATUS_VISUAL: Record<
  StatusCode,
  { color: StatusConfig["color"]; icon: React.ReactElement; track: StatusTrack }
> = {
  // ── Дорожка «ход визита» (контурные чипы) ──
  scheduled: { color: "default", icon: <HourglassEmptyIcon fontSize="small" />, track: "visit" },
  confirmed: { color: "info", icon: <EventAvailableIcon fontSize="small" />, track: "visit" },
  arrived: { color: "teal", icon: <HowToRegIcon fontSize="small" />, track: "visit" },
  in_progress: { color: "warning", icon: <PlayCircleIcon fontSize="small" />, track: "visit" },
  completed: { color: "default", icon: <FlagIcon fontSize="small" />, track: "visit" },
  canceled: { color: "error", icon: <CancelIcon fontSize="small" />, track: "visit" },
  // Неявка — тоже неудачный исход, а не нейтральный: серым она не отличалась
  // от «Завершено». Отличаем от отмены иконкой (человек, который не пришёл).
  no_show: { color: "error", icon: <PersonOffIcon fontSize="small" />, track: "visit" },

  // ── Дорожка «деньги» (чипы с заливкой) ──
  // Нал и безнал различаются цветом: регистратуре нужно видеть способ оплаты
  // при скане списка, а иконки 16px внутри чипа для этого мало — прежде оба
  // способа были зелёными и отличались только ею.
  //
  // Безналу отдан teal, а не синий: синий в дорожке денег занят страховкой и
  // именно он раньше сходился с контурным «Подтверждён». С «Пациент здесь»
  // (тоже teal) пара в одной строке не встречается — платёжный чип рисуется
  // только по закрытому чеку, а тогда статус визита скрыт (statusChipState.ts);
  // в соседних строках их различает форма чипа (заливка против контура).
  paid: { color: "success", icon: <PaymentsIcon fontSize="small" />, track: "money" },
  paid_cashless: { color: "teal", icon: <CreditCardIcon fontSize="small" />, track: "money" },
  partially_paid: { color: "purple", icon: <PieChartIcon fontSize="small" />, track: "money" },
  // Долг — не «предупреждение», а недостача денег: красный, как и было бы у
  // кассира в голове. Янтарный он делил с «На приёме».
  debt: { color: "error", icon: <WarningAmberIcon fontSize="small" />, track: "money" },
  // Чек закрыт без денег — скидка 100% и «бесплатно» об одном и том же.
  discounted: { color: "secondary", icon: <PercentIcon fontSize="small" />, track: "money" },
  free: { color: "secondary", icon: <CardGiftcardIcon fontSize="small" />, track: "money" },
  // Платит страховая: синий свободен в дорожке денег (у визита он контурный).
  insurance: { color: "info", icon: <HealthAndSafetyIcon fontSize="small" />, track: "money" },
};

const ALL_STATUS_CODES = Object.keys(STATUS_VISUAL) as StatusCode[];

/**
 * Резолв произвольного значения статуса в канонический код (или null).
 *
 * Принимает слаг бэка, старое значение и уже отображаемую метку —
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

export const getStatusConfig = (status: unknown): StatusConfig => {
  const code = resolveStatusCode(status);
  const visual = code ? STATUS_VISUAL[code] : STATUS_VISUAL.scheduled;
  return {
    color: visual.color,
    icon: visual.icon,
    label: getStatusLabel(status),
    track: visual.track,
  };
};

/** Дорожка статуса. Неизвестный статус с бэка — про ход визита, не про деньги. */
export const getStatusTrack = (status: unknown): StatusTrack => getStatusConfig(status).track;

/**
 * Базовый тон статуса в палитре темы.
 * `onSurface` — контраст-безопасный вариант цвета как текста на поверхности
 * (см. theme.ts). У secondary и grey его нет, поэтому фолбэк на light/dark.
 */
const getStatusPalette = (
  color: StatusConfig["color"],
  theme: Theme,
): { main: string; text: string } => {
  const isDark = theme.palette.mode === "dark";
  const from = (p: { main: string; light: string; dark: string; onSurface?: string }) => ({
    main: p.main,
    text: p.onSurface ?? (isDark ? p.light : p.dark),
  });

  switch (color) {
    case "error":
      return from(theme.palette.error);
    case "success":
      return from(theme.palette.success);
    case "warning":
      return from(theme.palette.warning);
    case "info":
      return from(theme.palette.info);
    case "secondary":
      return from(theme.palette.secondary);
    case "purple":
      return from(theme.palette.purple);
    case "teal":
      return from(theme.palette.teal);
    case "default":
    default:
      return {
        main: theme.palette.grey[500],
        text: isDark ? theme.palette.grey[300] : theme.palette.grey[700],
      };
  }
};

/**
 * Акцент статуса для нестандартных элементов (кликабельные чипы-фильтры,
 * подсветка строк) — там нужен сам цвет, а не готовый sx чипа.
 *
 * Экспортируется, чтобы фильтры и строки списка не расходились: фильтр «Со
 * скидкой» был синим, пока чип в строке — фиолетовым, и клик по фильтру
 * приводил к списку другого цвета.
 */
export const getStatusAccent = (
  status: unknown,
  theme: Theme,
): { main: string; text: string } => getStatusPalette(getStatusConfig(status).color, theme);

/**
 * Получить цвета для статуса с учётом темы
 */
const getStatusColors = (
  status: string,
  theme: Theme,
): { backgroundColor: string; textColor: string; borderColor: string } => {
  const config = getStatusConfig(status);
  const isDark = theme.palette.mode === "dark";
  const { main, text } = getStatusPalette(config.color, theme);

  return {
    backgroundColor: alpha(main, isDark ? 0.2 : 0.12),
    textColor: text,
    borderColor: alpha(main, isDark ? 0.5 : 0.4),
  };
};

/**
 * Получить sx prop для Chip компонента с кастомными цветами
 * Использует функцию от темы для поддержки светлой/тёмной темы
 *
 * Стиль зависит от дорожки статуса (StatusTrack): ход визита — контур на
 * прозрачном фоне, деньги — заливка. Так «Подтверждён» и «Оплачено картой»
 * различаются, даже если однажды снова сойдутся в оттенке.
 */
export const getStatusChipSx = (status: string): SxProps<Theme> => {
  return (theme: Theme) => {
    const { backgroundColor, textColor, borderColor } = getStatusColors(status, theme);
    const isVisit = getStatusTrack(status) === "visit";

    return {
      backgroundColor: isVisit ? "transparent" : backgroundColor,
      border: isVisit ? `1px solid ${borderColor}` : "1px solid transparent",
      color: textColor,
      fontWeight: 500,
      fontSize: "0.75rem",
      height: "22px",
      "& .MuiChip-icon": {
        color: textColor,
      },
      // Hover effect для лучшей интерактивности
      "&:hover": {
        backgroundColor: isVisit ? alpha(borderColor, 0.12) : backgroundColor,
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
