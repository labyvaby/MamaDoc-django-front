/**
 * Общий визуальный язык страниц отеля (Viva): шапка страницы, подписи секций,
 * карточки, таблицы, статус-«пилюли» и пустые состояния. Раньше каждая
 * страница собирала это заново (свой h6 с иконкой, синяя Alert-простыня с
 * пояснением, свои чипы статусов) — отсюда разнобой. Пояснения к странице —
 * не плашкой на пол-экрана, а иконкой «i» рядом с заголовком.
 */
import React from "react";
import { Box, Button, IconButton, Paper, Popover, Stack, Tooltip, Typography, type PaperProps } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** Контейнер страницы — единые поля и вертикальный ритм. */
export const HotelPage: React.FC<{ children: React.ReactNode; maxWidth?: number }> = ({ children, maxWidth }) => {
  const theme = useTheme();
  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, pt: { xs: 2, md: 3 }, pb: maxWidth ? 0 : { xs: 2, md: 3 } }}>
      <Stack gap={3} sx={maxWidth ? { maxWidth, mx: "auto" } : undefined}>
        {children}
      </Stack>
    </Box>
  );
};

export interface HotelPageHeaderProps {
  /** Перед заголовком — например, кнопка «Назад» у страниц-форм. */
  leading?: React.ReactNode;
  title: React.ReactNode;
  /** Одна короткая строка под заголовком — сводка, а не инструкция. */
  subtitle?: React.ReactNode;
  /** Длинное пояснение «как это работает» — в тултипе иконки «i». */
  info?: React.ReactNode;
  actions?: React.ReactNode;
}

export const HotelPageHeader: React.FC<HotelPageHeaderProps> = ({ leading, title, subtitle, info, actions }) => (
  <Stack direction={{ xs: "column", md: "row" }} alignItems={{ xs: "stretch", md: "flex-end" }} justifyContent="space-between" gap={2}>
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" gap={0.5}>
        {leading}
        <Typography component="h1" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.2 }}>
          {title}
        </Typography>
        {info && (
          <Tooltip
            title={<Box sx={{ fontSize: 13, lineHeight: 1.5, p: 0.5 }}>{info}</Box>}
            placement="bottom-start"
            slotProps={{ tooltip: { sx: { maxWidth: 380 } } }}
          >
            <IconButton size="small" aria-label="Как это работает" sx={{ color: "text.disabled", "&:hover": { color: "text.secondary" } }}>
              <InfoOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
    {actions && (
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ flexShrink: 0 }}>
        {actions}
      </Stack>
    )}
  </Stack>
);

/**
 * Секция формы: поверхность с заголовком. Формы номера/категории/правила
 * уже размечены «Paper → Stack → Typography subtitle2 (заголовок) → поля»;
 * FormCard подменяет Paper и делает этот первый subtitle2 настоящим
 * заголовком секции, не переписывая разметку полей внутри.
 */
export const FormCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useTheme();
  return (
    <Surface
      sx={{
        "& > .MuiStack-root > .MuiTypography-subtitle2:first-of-type, & > .MuiTypography-subtitle2:first-of-type": {
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "-0.005em",
          pb: 1.5,
          mb: 0.5,
          borderBottom: `1px solid ${subtleBorder(theme)}`,
        },
      }}
    >
      {children}
    </Surface>
  );
};

/** Нижняя панель действий формы — прилипает к низу прокрутки страницы. */
export const StickyActions: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        position: "sticky",
        bottom: 0,
        zIndex: 2,
        mx: -1,
        px: 1,
        py: 1.5,
        bgcolor: theme.palette.background.default,
        borderTop: `1px solid ${subtleBorder(theme)}`,
      }}
    >
      <Stack direction="row" gap={1} justifyContent="flex-end" alignItems="center">
        {children}
      </Stack>
    </Box>
  );
};

/** Подпись секции — мелкий капс с разрядкой. */
export const SectionLabel: React.FC<{ children: React.ReactNode; sx?: object; action?: React.ReactNode }> = ({ children, sx, action }) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1.25, ...sx }}>
    <Typography
      component="div"
      sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
    >
      {children}
    </Typography>
    {action}
  </Stack>
);

/** Карточка-поверхность: тонкая рамка, крупное скругление, без тени. */
export const Surface: React.FC<PaperProps & { padded?: boolean }> = ({ padded = true, sx, children, ...rest }) => (
  <Paper elevation={0} variant="outlined" sx={{ borderRadius: "14px", ...(padded ? { p: { xs: 2, md: 2.5 } } : {}), ...sx }} {...rest}>
    {children}
  </Paper>
);

/**
 * Стиль таблицы: шапка мелким капсом, волосяные разделители строк
 * (subtleBorder, не акцентный divider — иначе «зебра»), подсветка при наведении.
 */
export function useHotelTableSx() {
  const theme = useTheme();
  const line = `1px solid ${subtleBorder(theme)}`;
  return {
    "& .MuiTableCell-head": {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "text.secondary",
      borderBottom: line,
      py: 1.25,
      whiteSpace: "nowrap",
      bgcolor: "transparent",
    },
    "& .MuiTableCell-body": { borderBottom: line, py: 1.25 },
    "& .MuiTableBody-root .MuiTableRow-root:last-of-type .MuiTableCell-body": { borderBottom: "none" },
    "& .MuiTableBody-root .MuiTableRow-root": { transition: "background-color .12s" },
    "& .MuiTableBody-root .MuiTableRow-root:hover": { bgcolor: subtleBg(theme) },
  } as const;
}

/** Статус: цветная точка + слово на мягкой подложке. Текст — text.primary ради контраста. */
export const StatusPill: React.FC<{ color: string; label: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLElement>) => void; endIcon?: React.ReactNode }> = ({
  color,
  label,
  onClick,
  endIcon,
}) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  return (
    <Box
      component={onClick ? "button" : "span"}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        height: 26,
        px: 1.25,
        border: 0,
        borderRadius: "999px",
        bgcolor: alpha(color, dark ? 0.2 : 0.12),
        color: "text.primary",
        font: "inherit",
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
        transition: "background-color .12s",
        "&:hover": onClick ? { bgcolor: alpha(color, dark ? 0.3 : 0.2) } : undefined,
      }}
    >
      <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
      {label}
      {endIcon}
    </Box>
  );
};

/** Пустое состояние: иконка в круге, заголовок, пояснение, действие. */
export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }> = ({
  icon,
  title,
  description,
  action,
}) => {
  const theme = useTheme();
  return (
    <Stack alignItems="center" textAlign="center" gap={1} sx={{ py: 6, px: 2 }}>
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: subtleBg(theme, true),
          color: "text.secondary",
          mb: 0.5,
        }}
      >
        {icon}
      </Box>
      <Typography fontWeight={700}>{title}</Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Stack>
  );
};

/** Фильтр-«таблетка»: активный — инверсная заливка. Вместо плотной ToggleButtonGroup. */
export const FilterChip: React.FC<{ label: React.ReactNode; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => {
  const theme = useTheme();
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      sx={{
        height: 32,
        px: 1.75,
        borderRadius: "999px",
        border: `1px solid ${active ? theme.palette.text.primary : subtleBorder(theme)}`,
        bgcolor: active ? theme.palette.text.primary : "transparent",
        color: active ? theme.palette.background.paper : "text.primary",
        font: "inherit",
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: "nowrap",
        cursor: "pointer",
        transition: "background-color .12s, border-color .12s",
        "&:hover": active ? undefined : { bgcolor: subtleBg(theme, true) },
      }}
    >
      {label}
    </Box>
  );
};

/** 1 номер / 2 номера / 5 номеров. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Метрика-плитка: подпись капсом, крупное число, пояснение. Нейтральная, без заливки цветом. */
export const MetricTile: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: string }> = ({
  label,
  value,
  hint,
  accent,
}) => (
  <Surface sx={{ p: { xs: 1.75, md: 2 }, minWidth: 0 }}>
    <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
      {accent && <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: accent }} />}
      <Typography
        noWrap
        sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
      >
        {label}
      </Typography>
    </Stack>
    <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }} noWrap>
      {value}
    </Typography>
    {hint && (
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }} noWrap>
        {hint}
      </Typography>
    )}
  </Surface>
);

/** «‹ 29 сентября, пн › Сегодня» — переключатель дня для отчётов/кухни. */
export const DateStepper: React.FC<{
  value: Dayjs;
  onChange: (d: Dayjs) => void;
  disableFuture?: boolean;
}> = ({ value, onChange, disableFuture }) => {
  const theme = useTheme();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const today = dayjs().startOf("day");
  const isToday = value.isSame(today, "day");
  const canNext = !disableFuture || value.isBefore(today, "day");
  const label = isToday ? "Сегодня" : value.isSame(today.subtract(1, "day"), "day") ? "Вчера" : value.isSame(today.add(1, "day"), "day") ? "Завтра" : null;
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Stack
        direction="row"
        alignItems="center"
        sx={{ height: 40, borderRadius: "10px", border: `1px solid ${subtleBorder(theme)}`, overflow: "hidden" }}
      >
        <IconButton onClick={() => onChange(value.subtract(1, "day"))} aria-label="Предыдущий день" sx={{ borderRadius: 0, height: "100%" }}>
          <ChevronLeftOutlined fontSize="small" />
        </IconButton>
        {/* Дата — кнопкой с календарём в поповере: поле ввода MUI склоняет месяц
            по секциям («29 сентябрь»), а здесь нужна человеческая дата. */}
        <Box
          component="button"
          type="button"
          onClick={(e: React.MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
          aria-label="Выбрать дату"
          sx={{
            height: "100%",
            minWidth: 150,
            px: 1,
            border: 0,
            bgcolor: "transparent",
            color: "text.primary",
            font: "inherit",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            "&:hover": { bgcolor: subtleBg(theme, true) },
          }}
        >
          {value.date()} {MONTHS_GEN[value.month()]}, {value.format("dd")}
        </Box>
        <Popover
          open={anchor != null}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
          slotProps={{ paper: { sx: { mt: 1, borderRadius: "12px" } } }}
        >
          <DateCalendar
            value={value}
            disableFuture={disableFuture}
            onChange={(v) => {
              if (v) onChange(v);
              setAnchor(null);
            }}
          />
        </Popover>
        <IconButton
          onClick={() => onChange(value.add(1, "day"))}
          disabled={!canNext}
          aria-label="Следующий день"
          sx={{ borderRadius: 0, height: "100%" }}
        >
          <ChevronRightOutlined fontSize="small" />
        </IconButton>
      </Stack>
      {label ? (
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 64 }}>
          {label}
        </Typography>
      ) : (
        <Button onClick={() => onChange(today)} sx={{ minWidth: 64 }}>
          Сегодня
        </Button>
      )}
    </Stack>
  );
};

/** Сводка-«таблетка» с числом: «Убрано 8», используется над списками. */
export const CountChip: React.FC<{ color?: string; label: string; count: number; active?: boolean; onClick?: () => void }> = ({
  color,
  label,
  count,
  active,
  onClick,
}) => {
  const theme = useTheme();
  return (
    <Box
      component={onClick ? "button" : "span"}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        height: 32,
        px: 1.5,
        borderRadius: "999px",
        border: `1px solid ${active ? theme.palette.text.primary : subtleBorder(theme)}`,
        bgcolor: active ? subtleBg(theme, true) : "transparent",
        color: "text.primary",
        font: "inherit",
        fontSize: 13,
        fontWeight: 600,
        cursor: onClick ? "pointer" : "default",
        whiteSpace: "nowrap",
        "&:hover": onClick ? { bgcolor: subtleBg(theme, true) } : undefined,
      }}
    >
      {color && <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color }} />}
      {label}
      <Box component="span" sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
        {count}
      </Box>
    </Box>
  );
};
