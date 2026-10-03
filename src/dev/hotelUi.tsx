/**
 * Общий визуальный язык страниц отеля (Viva): шапка страницы, подписи секций,
 * карточки, таблицы, статус-«пилюли» и пустые состояния. Раньше каждая
 * страница собирала это заново (свой h6 с иконкой, синяя Alert-простыня с
 * пояснением, свои чипы статусов) — отсюда разнобой. Пояснения к странице —
 * не плашкой на пол-экрана, а иконкой «i» рядом с заголовком.
 */
import React from "react";
import { Box, Button, Collapse, IconButton, Paper, Popover, Stack, Tooltip, Typography, type PaperProps } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
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

export const HotelPageHeader: React.FC<HotelPageHeaderProps> = ({ leading, title, subtitle, info, actions }) => {
  // Название раздела уже стоит в шапке приложения (usePageTitle) — второй раз
  // крупнее под ней не повторяем. Показываем, только если заголовок несёт
  // содержание сверх названия раздела: у форм (есть leading — «Назад») это
  // «Номер 401», «Выходные» и т.п.
  const showTitle = leading != null;
  return (
  <Stack direction={{ xs: "column", md: "row" }} alignItems={{ xs: "stretch", md: showTitle ? "flex-end" : "center" }} justifyContent="space-between" gap={2}>
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" gap={0.5}>
        {leading}
        {showTitle ? (
          <Typography component="h1" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.2 }}>
            {title}
          </Typography>
        ) : (
          <Typography component="h1" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            {title}
          </Typography>
        )}
        {!showTitle && subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
            {subtitle}
          </Typography>
        )}
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
      {showTitle && subtitle && (
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
};

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

/**
 * Необязательная секция формы, свёрнутая в одну строку: заголовок, пометка
 * «необязательно» и сводка того, что внутри («5 отмечено · +650 сом»).
 * Формы номера/категории/правила раньше показывали всё сразу — десятки
 * необязательных полей наравне с тремя обязательными, и форма выглядела
 * сложной. Теперь открыто только главное; остальное раскрывается по клику.
 *
 * forceOpen — раскрыть принудительно (при попытке сохранить с ошибкой внутри:
 * поле с ошибкой не должно прятаться). Содержимое остаётся смонтированным —
 * введённое не теряется при сворачивании.
 */
export const OptionalCard: React.FC<{
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  /** Внутри уже что-то есть — кнопка «Изменить» вместо «Заполнить». */
  filled?: boolean;
  children: React.ReactNode;
}> = ({ title, summary, defaultOpen = false, forceOpen = false, filled = false, children }) => {
  const theme = useTheme();
  const [open, setOpen] = React.useState(defaultOpen);
  React.useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <Surface padded={false} sx={{ overflow: "hidden" }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          width: "100%",
          px: { xs: 2, md: 2.5 },
          py: 1.75,
          border: 0,
          bgcolor: "transparent",
          color: "text.primary",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
          "&:hover": { bgcolor: subtleBg(theme) },
          "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
            <Typography sx={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.005em" }}>{title}</Typography>
            <Typography variant="caption" color="text.disabled">
              необязательно
            </Typography>
          </Stack>
          {summary && (
            <Typography variant="caption" color="text.secondary" component="div" noWrap>
              {summary}
            </Typography>
          )}
        </Box>
        <Typography variant="body2" color="primary" fontWeight={600} sx={{ flexShrink: 0, display: { xs: "none", sm: "block" } }}>
          {open ? "Свернуть" : filled ? "Изменить" : "Заполнить"}
        </Typography>
        <ExpandMoreOutlined sx={{ color: "text.secondary", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: { xs: 2, md: 2.5 }, pt: 2, pb: 2.5, borderTop: `1px solid ${subtleBorder(theme)}` }}>{children}</Box>
      </Collapse>
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

// ── Боковые панели-формы (Drawer): «Новая бронь», «Новый гость» ─────────────

export const DRAWER_WIDTH = { xs: "100vw", sm: 520, md: 560 } as const;

export const DrawerHeader: React.FC<{ title: string; subtitle?: React.ReactNode; onClose: () => void; actions?: React.ReactNode }> = ({
  title,
  subtitle,
  onClose,
  actions,
}) => {
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      alignItems="flex-start"
      justifyContent="space-between"
      gap={2}
      sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: `1px solid ${subtleBorder(theme)}`, flexShrink: 0 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.25 }}>{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Stack direction="row" gap={0.75} sx={{ flexShrink: 0 }}>
        {actions}
        <IconButton
          onClick={onClose}
          aria-label="Закрыть"
          sx={{ width: 34, height: 34, border: `1px solid ${subtleBorder(theme)}`, color: "text.secondary", "&:hover": { color: "text.primary" } }}
        >
          <CloseOutlined sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>
    </Stack>
  );
};

/** Секция панели: волосяная линия сверху (кроме первой), подпись капсом, поля. */
export const DrawerSection: React.FC<{ label: React.ReactNode; action?: React.ReactNode; first?: boolean; children: React.ReactNode }> = ({
  label,
  action,
  first,
  children,
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ pt: first ? 0 : 3, borderTop: first ? "none" : `1px solid ${subtleBorder(theme)}` }}>
      <SectionLabel action={action} sx={{ mb: 2 }}>
        {label}
      </SectionLabel>
      <Stack gap={2}>{children}</Stack>
    </Box>
  );
};

export const DrawerBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ px: 3, py: 3, flex: 1, overflowY: "auto" }}>
    <Stack gap={3}>{children}</Stack>
  </Box>
);

export const DrawerFooter: React.FC<{ summary?: React.ReactNode; top?: React.ReactNode; children: React.ReactNode }> = ({ summary, top, children }) => {
  const theme = useTheme();
  return (
    <Box sx={{ borderTop: `1px solid ${subtleBorder(theme)}`, bgcolor: "background.paper", flexShrink: 0 }}>
      {top}
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: 3, py: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{summary}</Box>
        {children}
      </Stack>
    </Box>
  );
};

/**
 * Счётчик «− 2 +» — для числа гостей. За пределы [min, max] не выйти ни
 * кнопками (гаснут на краях), ни вводом с клавиатуры (значение прижимается
 * к границе). max не задан — ограничения сверху нет.
 */
export const CountStepper: React.FC<{
  label: string;
  hint?: React.ReactNode;
  value: number;
  min: number;
  max?: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}> = ({ label, hint, value, min, max, onChange, disabled }) => {
  const theme = useTheme();
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(max, n) : n);
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const btnSx = {
    width: 32,
    height: 32,
    border: `1px solid ${subtleBorder(theme)}`,
    borderRadius: "8px",
    color: "text.primary",
    "&.Mui-disabled": { color: "text.disabled", borderColor: subtleBorder(theme) },
  } as const;
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.5}
      sx={{ flex: 1, minWidth: 0, px: 1.75, py: 1.25, borderRadius: "12px", border: `1px solid ${subtleBorder(theme)}` }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
            {hint}
          </Typography>
        )}
      </Box>
      <IconButton size="small" aria-label={`${label}: меньше`} onClick={() => onChange(clamp(value - 1))} disabled={disabled || value <= min} sx={btnSx}>
        <RemoveOutlined sx={{ fontSize: 16 }} />
      </IconButton>
      <Box
        component="input"
        inputMode="numeric"
        aria-label={label}
        value={draft}
        disabled={disabled}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const digits = e.target.value.replace(/\D/g, "");
          if (digits === "") {
            setDraft("");
            return;
          }
          const next = clamp(Number(digits));
          setDraft(String(next));
          onChange(next);
        }}
        onBlur={() => setDraft(String(value))}
        sx={{
          width: 28,
          border: 0,
          outline: "none",
          bgcolor: "transparent",
          color: "text.primary",
          font: "inherit",
          fontSize: 16,
          fontWeight: 700,
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
          p: 0,
        }}
      />
      <IconButton
        size="small"
        aria-label={`${label}: больше`}
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || (max != null && value >= max)}
        sx={btnSx}
      >
        <AddOutlined sx={{ fontSize: 16 }} />
      </IconButton>
    </Stack>
  );
};

/**
 * Серая кнопка без объяснения — повод звонить начальству. Оборачивает
 * disabled-элемент и показывает причину в тултипе (span нужен: отключённая
 * кнопка сама событий мыши не получает). reason = null — просто children.
 */
export const DisabledReason: React.FC<{ reason: React.ReactNode | null; children: React.ReactElement }> = ({ reason, children }) =>
  reason ? (
    <Tooltip title={reason}>
      <Box component="span" sx={{ display: "inline-flex", cursor: "not-allowed" }}>
        {children}
      </Box>
    </Tooltip>
  ) : (
    children
  );

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
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", lineHeight: 1.3 }}>
        {label}
      </Typography>
    </Stack>
    <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }} noWrap>
      {value}
    </Typography>
    {hint && (
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, lineHeight: 1.3 }}>
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
