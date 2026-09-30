import React from "react";
import { Box, ButtonBase, InputBase, Slider, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckBoxOutlineBlankOutlined from "@mui/icons-material/CheckBoxOutlineBlankOutlined";
import CheckBoxOutlined from "@mui/icons-material/CheckBoxOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import type { Project } from "../../../api/realestate";
import { pillSx } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { factsLine, type BoardPaint, type BoardView, type PriceScale, type ProjectFacts, type RangeBounds } from "../model/board";
import { formatRange, PRICE_SCALE, type ChessboardPatch } from "../model/useChessboardParams";
import {
  featureOptions,
  roomsOptions,
  statusOptions,
  unitStatusMeta,
  type HoldFilter,
  type NumberRange,
  type StatusFilter,
  type UnitFilters,
} from "../model/units";
import { heatTone, statusTone } from "./tones";

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

// ─── Шапка ЖК ──────────────────────────────────────────────────────────────

/**
 * Шапка шахматки: название ЖК, факты, которых не видно в сетке, и одна полоса
 * продаж. Счётчики статусов живут только в легенде-фильтре — раньше они
 * повторялись трижды (плитки, легенда, полоски этажей).
 */
export function ProjectSummary({
  project,
  facts,
  sectionNames,
  counts,
  status,
  onChange,
}: {
  project: Project;
  facts: ProjectFacts;
  sectionNames: string[];
  counts: Record<StatusFilter, number>;
  status: StatusFilter;
  onChange: (patch: ChessboardPatch) => void;
}) {
  const share = (n: number) => (counts.all ? Math.round((n / counts.all) * 100) : 0);
  const part = (n: number) => `${counts.all ? (n / counts.all) * 100 : 0}%`;
  return (
    <Box sx={{ mb: 1.75 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 2.25, rowGap: 1.25 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: "1.05rem", fontWeight: 700, letterSpacing: "-0.2px" }}>
            ЖК «{project.name}»
          </Typography>
          <Typography sx={{ mt: 0.4, fontSize: "0.8125rem", color: "text.secondary" }}>{factsLine(facts, sectionNames)}</Typography>
        </Box>
        <StatusLegend value={status} counts={counts} onChange={onChange} />
      </Box>
      <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          role="img"
          aria-label={`Продано ${share(counts.sold)}%, в брони ${share(counts.reserved)}%, свободно ${share(counts.free)}%`}
          sx={{ flex: 1, display: "flex", height: 6, overflow: "hidden", borderRadius: 99, bgcolor: "divider" }}
        >
          <Box sx={(t) => ({ width: part(counts.sold), bgcolor: statusTone(t, "sold").main })} />
          <Box sx={(t) => ({ width: part(counts.reserved), bgcolor: statusTone(t, "reserved").main })} />
          <Box sx={(t) => ({ width: part(counts.free), bgcolor: alpha(statusTone(t, "free").main, 0.35) })} />
        </Box>
        <Typography component="span" sx={{ fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          Продано {share(counts.sold)}%
          <Box component="span" sx={{ fontWeight: 400, color: "text.secondary" }}>
            {" "}
            · в брони {share(counts.reserved)}%
          </Box>
        </Typography>
      </Box>
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
  /** Нет квартир — нечего выгружать, кнопку не показываем. */
  onExport?: () => void;
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
      {onExport && (
        <ButtonBase
          onClick={onExport}
          sx={(t) => ({ ...pillSx(t, false), ml: "auto", gap: 0.75, "& .MuiSvgIcon-root": { fontSize: 16 } })}
        >
          <FileDownloadOutlined />
          Выгрузить цены
        </ButtonBase>
      )}
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

const holdPills: [Exclude<HoldFilter, "all">, string, string][] = [
  ["today", "Истекают сегодня", "Брони, срок которых кончается до полуночи, и уже истёкшие — продлить или снять"],
  ["unpaid", "Ждут предоплату", "Брони с невнесённой предоплатой"],
];

export function FilterBar({
  filters,
  foundCount,
  holdCounts,
  onChange,
}: {
  filters: UnitFilters;
  foundCount: number;
  holdCounts: Record<Exclude<HoldFilter, "all">, number>;
  onChange: (patch: ChessboardPatch) => void;
}) {
  const hasHolds = holdCounts.today + holdCounts.unpaid > 0 || filters.hold !== "all";
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
      {hasHolds && (
        <FilterGroup label="Брони">
          {holdPills.map(([value, label, title]) => (
            <Pill
              key={value}
              active={filters.hold === value}
              title={title}
              onClick={() => onChange({ hold: filters.hold === value ? null : value })}
            >
              {label} {holdCounts[value]}
            </Pill>
          ))}
        </FilterGroup>
      )}
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
  paint,
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
  paint: BoardPaint;
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

      {/* На телефоне шахматка — список по этажам: вид сетки и выбор нескольких там не работают. */}
      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <FilterGroup label="Вид">
          <Pill active={view === "detailed"} onClick={() => onChange({ view: "detailed" })}>
            Подробно
          </Pill>
          <Pill active={view === "compact"} onClick={() => onChange({ view: "compact" })}>
            Компактно
          </Pill>
        </FilterGroup>
      </Box>

      <FilterGroup label="Цвет">
        <Pill active={paint === "status"} onClick={() => onChange({ paint: "status" })}>
          Статус
        </Pill>
        <Pill active={paint === "price"} onClick={() => onChange({ paint: "price" })} title="Свободные квартиры окрашены по цене за м²: светлее — дешевле">
          Цена за м²
        </Pill>
      </FilterGroup>

      <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ display: { xs: "none", md: "block" } }}>
          <Pill
            active={selectMode}
            onClick={onToggleSelectMode}
            title="Выбор нескольких квартир для сравнения. Также работает Ctrl+клик."
            startIcon={selectMode ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />}
          >
            Выбрать несколько
          </Pill>
        </Box>
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

/** Легенда тепловой карты: ступени цены за м², от дешёвых к дорогим. */
export function PriceLegend({ scale }: { scale: PriceScale }) {
  if (!scale.ranges.length) return null;
  const k = (v: number) => Math.round(v / 1000);
  return (
    <Box sx={{ mb: 1.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, fontSize: "0.72rem", color: "text.secondary" }}>
      <span>Цена за м², тыс. сом:</span>
      {scale.ranges.map(([lo, hi], step) => (
        <Box component="span" key={step} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box component="i" sx={(t) => ({ width: 14, height: 14, borderRadius: "4px", border: 1, borderColor: heatTone(t, step).border, bgcolor: heatTone(t, step).bg })} />
          {k(lo) === k(hi) ? k(lo) : `${k(lo)}–${k(hi)}`}
        </Box>
      ))}
      <Box component="span" sx={{ ml: { md: "auto" } }}>
        Занятые квартиры приглушены
      </Box>
    </Box>
  );
}
