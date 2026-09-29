import React from "react";
import { Box, ButtonBase, InputBase, Slider, Typography } from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import CheckBoxOutlineBlankOutlined from "@mui/icons-material/CheckBoxOutlineBlankOutlined";
import CheckBoxOutlined from "@mui/icons-material/CheckBoxOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import type { Project } from "../../../api/realestate";
import { pillSx } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import type { BoardView, RangeBounds } from "../model/board";
import { formatRange, PRICE_SCALE, type ChessboardPatch } from "../model/useChessboardParams";
import {
  featureOptions,
  roomsOptions,
  statusOptions,
  unitStatusMeta,
  type NumberRange,
  type StatusFilter,
  type UnitFilters,
} from "../model/units";
import { statusTone } from "./tones";

/** Переключатель-фильтр: пилюля ряда фильтров ErkinAI, состояние — через aria-pressed. */
export function Pill({
  active,
  onClick,
  children,
  title,
  startIcon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  startIcon?: React.ReactNode;
}) {
  return (
    <ButtonBase
      focusRipple
      aria-pressed={active}
      title={title}
      onClick={onClick}
      sx={(t) => ({ ...pillSx(t, active), gap: 0.75, whiteSpace: "nowrap", "& .MuiSvgIcon-root": { fontSize: 16 } })}
    >
      {startIcon}
      {children}
    </ButtonBase>
  );
}

const groupLabelSx = { fontSize: "0.75rem", color: "text.secondary", mr: 0.5 } as const;

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box role="group" aria-label={label} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
      <Typography component="span" sx={groupLabelSx}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

// ─── KPI ───────────────────────────────────────────────────────────────────

/**
 * Демо-тренды за 8 недель (0…1), как в прототипе.
 * Реальная динамика придёт с бэкенда, когда появится история статусов.
 */
const trends: Record<StatusFilter, number[]> = {
  all: [1, 0.73, 0.45, 0.19, 0.16, 0, 0, 0.79],
  free: [0.06, 0, 0.05, 0.34, 0.58, 0.86, 0.79, 1],
  reserved: [1, 0.7, 0.51, 0.22, 0.07, 0, 0.02, 0.91],
  sold: [0, 0.28, 0.09, 0.64, 0.53, 1, 0.9, 0.78],
};

function Sparkline({ values }: { values: number[] }) {
  const theme = useTheme();
  const step = 120 / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(32 - v * 28).toFixed(1)}`);
  const color = theme.palette.primary.main;
  return (
    <Box
      component="svg"
      aria-hidden
      viewBox="0 0 120 36"
      preserveAspectRatio="none"
      sx={{ position: "absolute", top: 12, right: 14, height: { xs: 26, lg: 32 }, width: { xs: 74, lg: 104 } }}
    >
      <polygon points={`0,36 ${points.join(" ")} 120,36`} fill={color} opacity=".12" />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </Box>
  );
}

export function KpiRow({ counts }: { counts: Record<StatusFilter, number> }) {
  const items: { key: StatusFilter; label: string; color?: (t: Theme) => string }[] = [
    { key: "all", label: "Квартир в корпусе" },
    { key: "free", label: "Свободно", color: (t) => statusTone(t, "free").text },
    { key: "reserved", label: "Забронировано", color: (t) => statusTone(t, "reserved").text },
    { key: "sold", label: "Продано" },
  ];
  return (
    <Box
      component="dl"
      sx={{ m: 0, mb: 2.25, display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: { xs: 1, md: 1.5 } }}
    >
      {items.map((item) => (
        <Box
          key={item.key}
          sx={{
            position: "relative",
            minWidth: 0,
            overflow: "hidden",
            border: 1,
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "background.paper",
            p: 2,
            pr: { xs: 11, lg: 16 },
          }}
        >
          <Typography component="dt" noWrap title={item.label} sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" }}>
            {item.label}
          </Typography>
          <Typography
            component="dd"
            sx={(t) => ({
              m: 0,
              mt: 0.6,
              fontSize: "1.7rem",
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: "-0.8px",
              fontVariantNumeric: "tabular-nums",
              color: item.color ? item.color(t) : "text.primary",
            })}
          >
            {counts[item.key]}
          </Typography>
          <Sparkline values={trends[item.key]} />
        </Box>
      ))}
    </Box>
  );
}

// ─── ЖК ────────────────────────────────────────────────────────────────────

export function ProjectTabs({
  projects,
  activeId,
  onSelect,
  onExport,
}: {
  projects: Project[];
  activeId: string;
  onSelect: (projectId: string) => void;
  onExport: () => void;
}) {
  return (
    <Box sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
      <Box role="group" aria-label="Жилой комплекс" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {projects.map((project) => (
          <Pill key={project.id} active={project.id === activeId} onClick={() => onSelect(project.id)}>
            ЖК «{project.name}»
          </Pill>
        ))}
      </Box>
      <ButtonBase
        onClick={onExport}
        sx={(t) => ({ ...pillSx(t, false), ml: "auto", gap: 0.75, "& .MuiSvgIcon-root": { fontSize: 16 } })}
      >
        <FileDownloadOutlined />
        Выгрузить цены
      </ButtonBase>
    </Box>
  );
}

// ─── Легенда-фильтр по статусу ─────────────────────────────────────────────

export function StatusLegend({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (patch: ChessboardPatch) => void;
}) {
  return (
    <Box role="group" aria-label="Статус" sx={{ ml: { md: "auto" }, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {statusOptions.map((status) => (
        <Pill
          key={status}
          active={value === status}
          onClick={() => onChange({ status })}
          startIcon={
            <Box
              component="i"
              sx={(t) => ({
                width: 8,
                height: 8,
                borderRadius: "2px",
                bgcolor: status === "all" ? t.palette.text.disabled : statusTone(t, status).main,
              })}
            />
          }
        >
          {status === "all" ? "Все" : unitStatusMeta[status].short} {counts[status]}
        </Pill>
      ))}
    </Box>
  );
}

export function FilterBar({
  filters,
  foundCount,
  onChange,
}: {
  filters: UnitFilters;
  foundCount: number;
  onChange: (patch: ChessboardPatch) => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: { xs: "flex-start", md: "flex-end" },
        flexDirection: { xs: "column", md: "row" },
        gap: 2.5,
        borderTop: 1,
        borderColor: "divider",
        pt: 1.5,
        pb: 2,
      }}
    >
      <FilterGroup label="Комнаты">
        {roomsOptions.map(([value, label]) => (
          <Pill key={value} active={filters.rooms === value} onClick={() => onChange({ rooms: value })}>
            {label}
          </Pill>
        ))}
      </FilterGroup>
      <FilterGroup label="Особенности">
        {featureOptions.map(([value, label]) => (
          <Pill key={value} active={filters.feature === value} onClick={() => onChange({ feature: value })}>
            {label}
          </Pill>
        ))}
      </FilterGroup>
      <Typography aria-live="polite" sx={{ ml: { md: "auto" }, fontSize: "0.75rem", fontWeight: 600, color: "text.secondary" }}>
        Найдено: {foundCount}
      </Typography>
    </Box>
  );
}

// ─── Диапазоны, поиск, вид ─────────────────────────────────────────────────

/**
 * Двойной ползунок «от — до». Пока бегунок тянут, значение живёт локально,
 * наружу уходит при отпускании — шахматка не перерисовывается на каждый пиксель.
 */
function RangeSlider({
  label,
  bounds,
  value,
  step,
  format,
  onChange,
  width,
}: {
  label: string;
  bounds: NumberRange;
  value: NumberRange | null;
  step: number;
  format: (value: number) => string;
  onChange: (value: NumberRange | null) => void;
  width: number;
}) {
  const [min, max] = bounds;
  const [draft, setDraft] = React.useState<NumberRange>(value ?? bounds);
  // Значение сменилось снаружи (сброс фильтров, «назад» в браузере) — подтягиваем бегунки.
  const [synced, setSynced] = React.useState({ value, min, max });
  if (synced.value !== value || synced.min !== min || synced.max !== max) {
    setSynced({ value, min, max });
    setDraft(value ?? bounds);
  }
  const active = draft[0] > min || draft[1] < max;

  return (
    <Box role="group" aria-label={label} sx={{ width, minWidth: 160, display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
        <Typography component="span" sx={groupLabelSx}>
          {label}
        </Typography>
        <Typography
          component="b"
          sx={{ fontSize: "0.75rem", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: active ? "text.primary" : "text.secondary" }}
        >
          {format(draft[0])} — {format(draft[1])}
        </Typography>
      </Box>
      <Slider
        size="small"
        min={min}
        max={max}
        step={step}
        value={[draft[0], draft[1]]}
        disableSwap
        getAriaLabel={(i) => `${label}: ${i === 0 ? "от" : "до"}`}
        getAriaValueText={format}
        onChange={(_, next) => {
          const [from, to] = next as number[];
          setDraft([from!, to!]);
        }}
        onChangeCommitted={(_, next) => {
          const [from, to] = next as number[];
          onChange(from! <= min && to! >= max ? null : [from!, to!]);
        }}
        sx={{ py: 1.25 }}
      />
    </Box>
  );
}

const millionsLabel = (v: number) => `${+(v / PRICE_SCALE).toFixed(1)}`;

export function BoardToolbar({
  filters,
  bounds,
  view,
  canReset,
  search,
  searchMatches,
  selectMode,
  onChange,
  onReset,
  onSearch,
  onSearchSubmit,
  onToggleSelectMode,
}: {
  filters: UnitFilters;
  bounds: RangeBounds;
  view: BoardView;
  canReset: boolean;
  search: string;
  searchMatches: number;
  selectMode: boolean;
  onChange: (patch: ChessboardPatch) => void;
  onReset: () => void;
  onSearch: (query: string) => void;
  onSearchSubmit: () => void;
  onToggleSelectMode: () => void;
}) {
  const searchRef = React.useRef<HTMLInputElement>(null);

  // «/» — быстрый переход к поиску по номеру, как в большинстве таблиц.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || target.closest('input, textarea, select, [role="dialog"]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        columnGap: 3,
        rowGap: 1.5,
        borderTop: 1,
        borderColor: "divider",
        pt: 1.5,
        pb: 2,
      }}
    >
      <RangeSlider
        label="Цена, млн"
        bounds={bounds.price}
        value={filters.price}
        step={100_000}
        format={millionsLabel}
        onChange={(v) => onChange({ price: v && formatRange(v, PRICE_SCALE) })}
        width={200}
      />
      <RangeSlider
        label="Площадь, м²"
        bounds={bounds.area}
        value={filters.area}
        step={1}
        format={(v) => String(Math.round(v))}
        onChange={(v) => onChange({ area: v && formatRange(v) })}
        width={200}
      />
      <RangeSlider
        label="Этаж"
        bounds={bounds.floor}
        value={filters.floor}
        step={1}
        format={String}
        onChange={(v) => onChange({ floor: v && formatRange(v) })}
        width={170}
      />

      <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Typography component="span" sx={groupLabelSx}>
          № квартиры
        </Typography>
        <Box
          sx={(t) => ({
            height: 32,
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.25,
            borderRadius: "9px",
            border: 1,
            borderColor: "divider",
            bgcolor: subtleBg(t),
            "&:focus-within": { borderColor: alpha(t.palette.primary.main, 0.6) },
          })}
        >
          <SearchOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
          <InputBase
            inputRef={searchRef}
            type="search"
            inputProps={{ inputMode: "numeric", "aria-label": "Найти квартиру по номеру" }}
            placeholder="Например, 1142"
            value={search}
            onChange={(e) => onSearch(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearchSubmit();
              if (e.key === "Escape") onSearch("");
            }}
            sx={{ width: 120, fontSize: "0.8125rem" }}
          />
          {search && (
            <Typography
              component="small"
              aria-live="polite"
              sx={{ fontSize: "0.7rem", whiteSpace: "nowrap", color: searchMatches ? "text.secondary" : "error.main" }}
            >
              {searchMatches ? `${searchMatches} найдено` : "нет"}
            </Typography>
          )}
        </Box>
      </Box>

      <FilterGroup label="Вид">
        <Pill active={view === "detailed"} onClick={() => onChange({ view: "detailed" })}>
          Подробно
        </Pill>
        <Pill active={view === "compact"} onClick={() => onChange({ view: "compact" })}>
          Компактно
        </Pill>
      </FilterGroup>

      <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1 }}>
        <Pill
          active={selectMode}
          onClick={onToggleSelectMode}
          title="Выбор нескольких квартир для сравнения. Также работает Ctrl+клик."
          startIcon={selectMode ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />}
        >
          Выбрать несколько
        </Pill>
        {canReset && (
          <ButtonBase
            onClick={onReset}
            sx={(t) => ({
              ...pillSx(t, false),
              border: 0,
              gap: 0.5,
              "& .MuiSvgIcon-root": { fontSize: 16 },
            })}
          >
            <CloseOutlined />
            Сбросить фильтры
          </ButtonBase>
        )}
      </Box>
    </Box>
  );
}
