import React from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import BalconyOutlined from "@mui/icons-material/BalconyOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import DeckOutlined from "@mui/icons-material/DeckOutlined";

import type { Project, Unit } from "../../../api/realestate";
import { subtleBg } from "../../../theme/uiHelpers";
import { floorType, sectionLabel, statsOf, type BoardModel, type BoardPaint, type BoardView, type FloorStats, type PriceScale } from "../model/board";
import { canStartBoardNavigation, moveFocus } from "../model/keyboard";
import { formatArea, formatRooms, holdLeft, millions, perSqmShort, unitStatusMeta, type HoldLeft } from "../model/units";
import { useMinuteClock } from "../model/useMinuteClock";
import { heatTone, statusTone } from "./tones";

export interface CellHandlers {
  /** Клик: открыть карточку. */
  onOpen: (unitId: string) => void;
  /** Ctrl/⌘+клик или клик в режиме выбора. */
  onToggleSelect: (unitId: string) => void;
  /** Наведение/фокус — показать предпросмотр; null — скрыть. */
  onPreview: (unit: Unit | null, anchor?: HTMLElement) => void;
}

export interface BoardProps extends CellHandlers {
  project: Project;
  board: BoardModel;
  view: BoardView;
  isVisible: (unit: Unit) => boolean;
  selectedIds: ReadonlySet<string>;
  highlightedIds: ReadonlySet<string>;
  selectMode: boolean;
  /** Красить статусом или ценой за м² (тепловая карта). */
  paint: BoardPaint;
  scale: PriceScale;
}

/**
 * Шахматка. Стрелки двигают фокус по квартирам, Enter открывает карточку, пробел — выбирает.
 */
export function Board(props: BoardProps) {
  const now = useMinuteClock();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const firstVisible = props.board.floors.flatMap((f) => props.board.unitsOnFloor(f)).find(props.isVisible);
  const tabbableId = activeId ?? firstVisible?.id ?? null;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const hoveredIdRef = React.useRef<string | null>(null);

  // Стрелки работают сразу, без клика по квартире: первое нажатие ставит фокус на
  // квартиру под курсором, иначе на последнюю активную (или первую видимую).
  // Дальше клавиши обрабатывает onKeyDown шахматки — он гасит событие раньше этого слушателя.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(document.activeElement) || !canStartBoardNavigation(event)) return;
      const cell = (id: string | null) =>
        id ? root.querySelector<HTMLElement>(`[data-unit-id="${CSS.escape(id)}"]:not([data-dimmed="true"])`) : null;
      const start = cell(hoveredIdRef.current) ?? root.querySelector<HTMLElement>('[data-unit-id][tabindex="0"]');
      if (!start) return;
      event.preventDefault();
      start.focus();
      start.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Box
      ref={rootRef}
      onMouseOver={(event: React.MouseEvent<HTMLDivElement>) => {
        hoveredIdRef.current = (event.target as HTMLElement).closest<HTMLElement>("[data-unit-id]")?.dataset.unitId ?? null;
      }}
      onMouseLeave={() => {
        hoveredIdRef.current = null;
      }}
      role="region"
      aria-label="Шахматка, этажи сверху вниз"
      aria-describedby="realestate-board-hint"
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (moveFocus(event.currentTarget, event.key)) event.preventDefault();
      }}
      onFocus={(event: React.FocusEvent<HTMLDivElement>) => {
        const id = (event.target as HTMLElement).dataset.unitId;
        if (id) setActiveId(id);
      }}
      // Шахматка прокручивается сама и не выше экрана: иначе у высокого ЖК при прокрутке
      // пропадают подписи корпусов, а при сдвиге вбок — номера этажей (они липкие).
      // Дойдя до края, колесо переходит к странице.
      sx={{ position: "relative", overflow: "auto", maxHeight: { md: "calc(100dvh - 140px)" }, pr: 1, pb: 1 }}
    >
      <Box component="p" id="realestate-board-hint" sx={visuallyHidden}>
        Стрелки — переход между квартирами, Enter — открыть карточку, пробел — выбрать для сравнения.
      </Box>
      {props.view === "compact" ? (
        <CompactBoard {...props} tabbableId={tabbableId} now={now} />
      ) : (
        <DetailedBoard {...props} tabbableId={tabbableId} now={now} />
      )}
    </Box>
  );
}

const visuallyHidden = {
  position: "absolute",
  m: 0,
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

type InnerProps = BoardProps & { tabbableId: string | null; now: number };

function cellProps(p: InnerProps, unit: Unit): UnitCellProps {
  return {
    unit,
    view: p.view,
    dimmed: !p.isVisible(unit),
    selected: p.selectedIds.has(unit.id),
    highlighted: p.highlightedIds.has(unit.id),
    selectMode: p.selectMode,
    tabbable: unit.id === p.tabbableId,
    hold: unit.hold ? holdLeft(unit.hold.endsAt, p.now) : null,
    awaitingPayment: Boolean(unit.hold?.awaitingPayment),
    priceStep: p.paint === "price" ? p.scale.stepOf(unit.pricePerSqm) : null,
    onOpen: p.onOpen,
    onToggleSelect: p.onToggleSelect,
    onPreview: p.onPreview,
  };
}

/** Полоска заполненности этажа: свободно / бронь / продано. */
function StatsBar({ stats, width = "100%", height = 4 }: { stats: FloorStats; width?: number | string; height?: number }) {
  const part = (n: number) => `${stats.total ? (n / stats.total) * 100 : 0}%`;
  return (
    <Box aria-hidden sx={{ display: "flex", width, height, overflow: "hidden", borderRadius: 99, bgcolor: "divider" }}>
      <Box sx={(t) => ({ width: part(stats.free), bgcolor: statusTone(t, "free").main })} />
      <Box sx={(t) => ({ width: part(stats.reserved), bgcolor: statusTone(t, "reserved").main })} />
      <Box sx={(t) => ({ width: part(stats.sold), bgcolor: statusTone(t, "sold").main })} />
    </Box>
  );
}

const statsTitle = (floor: number, s: FloorStats) =>
  `${floor} этаж: ${s.free} из ${s.total} свободно · бронь ${s.reserved} · продано ${s.sold}`;

/** Липкая шапка и колонка этажей — на фоне бумаги, чтобы ячейки не просвечивали. */
const stickyTopSx = { position: "sticky", top: 0, zIndex: 3, bgcolor: "background.paper" } as const;
const stickyLeftSx = { position: "sticky", left: 0, zIndex: 2, bgcolor: "background.paper" } as const;

const floorGridSx = {
  display: "grid",
  gridTemplateColumns: { xs: "70px minmax(720px, 1fr)", md: "82px minmax(760px, 1fr)" },
  gap: 1,
} as const;

/**
 * Группа колонок секции. Одинакова в шапке и в каждой строке этажа, поэтому
 * подпись корпуса стоит ровно над своими квартирами, а колонки совпадают по вертикали
 * даже там, где на этаже квартир меньше.
 */
const sectionGroupSx = (columns: number, first: boolean) => (t: Theme) => ({
  display: "grid",
  minWidth: 0,
  gap: "7px",
  flex: columns,
  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  ...(first ? null : { borderLeft: `1px dashed ${alpha(t.palette.text.secondary, 0.4)}`, pl: "7px" }),
});

/** Подробная шахматка: строка на этаж, секции — колонками, разделены пунктиром. */
function DetailedBoard(p: InnerProps) {
  const { project, board } = p;
  return (
    <Box sx={{ minWidth: 860 }}>
      <Box
        component="p"
        sx={{ m: 0, mt: 1, textAlign: "right", fontSize: "0.7rem", color: "text.secondary", display: { xs: "none", lg: "block" } }}
      >
        ← → ↑ ↓ — по квартирам · Enter — карточка · пробел или Ctrl+клик — к сравнению
      </Box>
      <Box sx={{ ...floorGridSx, ...stickyTopSx, mb: 1, pt: 1, alignItems: "end" }}>
        <Typography
          component="span"
          sx={{ ...stickyLeftSx, alignSelf: "stretch", display: "flex", alignItems: "flex-end", justifyContent: "center", fontSize: "0.7rem", fontWeight: 600, color: "text.secondary" }}
        >
          Этаж
        </Typography>
        <Box sx={{ display: "flex", gap: "7px" }}>
          {board.sections.map((s, i) => (
            <Box key={s.name} sx={sectionGroupSx(s.columns, i === 0)}>
              <Box
                component="header"
                sx={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0, pb: 0.5, fontSize: "0.75rem" }}
              >
                <Box component="span" sx={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 1 }}>
                  <b>{sectionLabel(s.name)}</b>
                  <Box component="span" sx={(t) => ({ color: statusTone(t, "free").text })}>
                    {s.freeCount} свободно
                  </Box>
                </Box>
                <StatsBar stats={statsOf(board.floors.flatMap((f) => s.unitsOnFloor(f)))} height={3} />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {board.floors.map((floor) => {
        const stats = board.floorStats(floor);
        return (
          <Box key={floor} sx={{ ...floorGridSx, mb: 1 }}>
            <Box
              title={statsTitle(floor, stats)}
              sx={(t) => ({
                ...stickyLeftSx,
                // Полупрозрачная подложка поверх бумаги: под липкой колонкой не просвечивают ячейки.
                backgroundImage: `linear-gradient(${subtleBg(t, true)}, ${subtleBg(t, true)})`,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "10px",
                p: 0.9,
                color: "text.secondary",
              })}
            >
              <Typography component="strong" sx={{ fontSize: "1.1rem", fontWeight: 700, color: "text.primary" }}>
                {floor}
              </Typography>
              <Typography component="span" sx={{ my: 0.25, textAlign: "center", fontSize: "0.7rem", lineHeight: 1.2 }}>
                {floorType(project, floor)}
              </Typography>
              <Typography component="small" sx={{ fontSize: "0.72rem" }}>
                <Box component="b" sx={(t) => ({ color: statusTone(t, "free").text })}>
                  {stats.free}
                </Box>{" "}
                из {stats.total} своб.
              </Typography>
              <Box sx={{ mt: 0.5, width: "100%", maxWidth: 56 }}>
                <StatsBar stats={stats} />
              </Box>
            </Box>
            <Box sx={{ display: "flex", gap: "7px" }}>
              {board.sections.map((section, i) => (
                <Box key={section.name} sx={sectionGroupSx(section.columns, i === 0)}>
                  {Array.from({ length: section.columns }, (_, k) => {
                    const unit = section.unitAt(floor, k + 1);
                    return unit ? <UnitCell key={unit.id} {...cellProps(p, unit)} /> : <Box key={`empty-${k}`} aria-hidden />;
                  })}
                </Box>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Компактная шахматка: секции рядом, цифра — число комнат. */
function CompactBoard(p: InnerProps) {
  const { board } = p;
  return (
    <Box
      sx={{
        display: "grid",
        width: "max-content",
        columnGap: { xs: 2, xl: 2.75 },
        rowGap: "5px",
        pr: "5px",
        pb: 1,
        gridTemplateColumns: `34px repeat(${board.sections.length}, max-content)`,
      }}
    >
      <Box sx={{ ...stickyTopSx, ...stickyLeftSx, zIndex: 4 }} />
      {board.sections.map((section) => {
        const stats = statsOf(board.floors.flatMap((f) => section.unitsOnFloor(f)));
        return (
          <Box component="header" key={section.name} sx={{ ...stickyTopSx, display: "flex", flexDirection: "column", gap: 0.5, px: 0.25, pt: 1, pb: 0.9 }}>
            <Box component="span" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
              <Typography component="span" sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>
                {sectionLabel(section.name)}
              </Typography>
              <Typography component="b" sx={{ fontSize: "0.72rem", fontWeight: 600, color: "text.secondary" }}>
                {section.freeCount} свободно
              </Typography>
            </Box>
            <StatsBar stats={stats} />
          </Box>
        );
      })}

      {board.floors.map((floor) => {
        const stats = board.floorStats(floor);
        return (
          <React.Fragment key={floor}>
            <Box title={statsTitle(floor, stats)} sx={{ ...stickyLeftSx, display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 0.25, pr: 0.5 }}>
              <Typography component="em" sx={{ fontSize: "0.66rem", fontWeight: 700, fontStyle: "normal", color: "text.secondary" }}>
                {floor}
              </Typography>
              <StatsBar stats={stats} width={22} height={3} />
            </Box>
            {board.sections.map((section) => (
              <Box key={section.name} sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
                {Array.from({ length: section.columns }, (_, k) => {
                  const unit = section.unitAt(floor, k + 1);
                  return unit ? (
                    <UnitCell key={unit.id} {...cellProps(p, unit)} />
                  ) : (
                    <Box key={`empty-${k}`} aria-hidden sx={{ flexShrink: 0, width: { xs: 32, xl: 36 } }} />
                  );
                })}
              </Box>
            ))}
          </React.Fragment>
        );
      })}
    </Box>
  );
}

interface UnitCellProps extends CellHandlers {
  unit: Unit;
  view: BoardView;
  dimmed: boolean;
  selected: boolean;
  /** Совпадает с поиском по номеру. */
  highlighted: boolean;
  selectMode: boolean;
  /** Роуминг-фокус: в Tab-порядке только одна ячейка шахматки. */
  tabbable: boolean;
  /** Сколько осталось до конца брони; null — не в брони или срок неизвестен. */
  hold: HoldLeft | null;
  awaitingPayment: boolean;
  /** Ступень тепловой карты цены за м²; null — красим статусом. */
  priceStep: number | null;
}

/**
 * Кольцо выбора и подсветки поиска — поверх статусного цвета ячейки. Выбор — тонкое
 * акцентное кольцо вплотную к рамке (без зазора): статус ячейки остаётся читаемым.
 */
const ringSx = (t: Theme, selected: boolean, highlighted: boolean) =>
  selected
    ? { boxShadow: `0 0 0 2px ${t.palette.primary.main}` }
    : highlighted
      ? { boxShadow: `0 0 0 2px ${t.palette.background.paper}, 0 0 0 5px ${t.palette.info.main}` }
      : null;

const UnitCell = React.memo(function UnitCell({
  unit,
  view,
  dimmed,
  selected,
  highlighted,
  selectMode,
  tabbable,
  hold,
  awaitingPayment,
  priceStep,
  onOpen,
  onToggleSelect,
  onPreview,
}: UnitCellProps) {
  const status = unitStatusMeta[unit.status].label;
  const holdText = hold ? (hold.expired ? "бронь истекла" : `бронь ещё ${hold.label}`) : "";
  const label = [
    `Квартира №${unit.number}`,
    formatRooms(unit.rooms),
    formatArea(unit.totalArea),
    `${unit.floor} этаж`,
    status,
    holdText,
    awaitingPayment ? "ждёт предоплату" : "",
    selected ? "выбрана" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const outdoor = unit.outdoor?.type;
  const isTerrace = outdoor === "terrace";

  const common = {
    "aria-label": label,
    "aria-pressed": selectMode ? selected : undefined,
    "data-unit-id": unit.id,
    "data-dimmed": dimmed ? "true" : undefined,
    tabIndex: tabbable ? 0 : -1,
    onClick: (event: React.MouseEvent) => {
      if (selectMode || event.ctrlKey || event.metaKey) onToggleSelect(unit.id);
      else onOpen(unit.id);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      // Enter открывает карточку, пробел — отмечает для сравнения.
      if (event.key === " ") {
        event.preventDefault();
        onToggleSelect(unit.id);
      }
    },
    onMouseEnter: (event: React.MouseEvent<HTMLButtonElement>) => onPreview(unit, event.currentTarget),
    onMouseLeave: () => onPreview(null),
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
      if (event.currentTarget.matches(":focus-visible")) onPreview(unit, event.currentTarget);
    },
    onBlur: () => onPreview(null),
  };

  // Бейдж выбора — акцентный кружок с иконкой, обводка цветом карточки отделяет его от ячейки.
  const badge = view === "compact" ? 16 : 20;
  const mark = selected && (
    <Box
      component="span"
      aria-hidden
      sx={(t) => ({
        position: "absolute",
        top: -badge / 2 + 2,
        right: -badge / 2 + 2,
        zIndex: 1,
        width: badge,
        height: badge,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        bgcolor: "primary.main",
        color: "primary.contrastText",
        border: `2px solid ${t.palette.background.paper}`,
        "& .MuiSvgIcon-root": { fontSize: badge - 6 },
      })}
    >
      <CheckOutlined />
    </Box>
  );

  const focusSx = (t: Theme) => ({
    "&.Mui-focusVisible": { outline: `2px solid ${t.palette.text.primary}`, outlineOffset: 1 },
  });
  const dimmedSx = dimmed ? { pointerEvents: "none", opacity: view === "compact" ? 0.14 : 0.18 } : null;
  // Тепловая карта красит только свободные: занятые не продать, они уходят на второй план.
  const heat = priceStep !== null && unit.status === "free" ? priceStep : null;
  const offHeatSx = priceStep !== null && unit.status !== "free" && !dimmed ? { opacity: 0.4 } : null;

  if (view === "compact") {
    return (
      <ButtonBase
        {...common}
        sx={(t) => {
          const tone = statusTone(t, unit.status);
          return {
            position: "relative",
            flexShrink: 0,
            width: { xs: 32, xl: 36 },
            height: { xs: 32, xl: 36 },
            borderRadius: "6px",
            fontSize: "0.8125rem",
            fontWeight: 700,
            bgcolor: heat === null ? tone.solid : heatTone(t, heat).bg,
            color: heat === null ? tone.solidText : heatTone(t, heat).text,
            transition: "transform .15s ease",
            "&:hover": { zIndex: 1, transform: "scale(1.12)" },
            ...focusSx(t),
            ...offHeatSx,
            ...dimmedSx,
            ...ringSx(t, selected, highlighted),
          };
        }}
      >
        {mark}
        {unit.rooms === 0 ? "С" : unit.rooms}
        <Box
          component="i"
          aria-hidden
          sx={(t) => ({
            position: "absolute",
            right: -3,
            bottom: -3,
            width: 8,
            height: 8,
            borderRadius: "50%",
            border: `2px solid ${t.palette.background.paper}`,
            bgcolor: isTerrace ? t.palette.purple.main : outdoor ? t.palette.teal.main : t.palette.divider,
          })}
        />
      </ButtonBase>
    );
  }

  // Свободных квартир большинство, поэтому свободная ячейка спокойная (карточка + точка),
  // а выделяются бронь и продажа — иначе вся шахматка залита одним цветом.
  const free = unit.status === "free";
  return (
    <ButtonBase
      {...common}
      sx={(t) => {
        const tone = statusTone(t, unit.status);
        return {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 0.5,
          minWidth: 0,
          minHeight: 79,
          px: 1,
          pt: "7px",
          pb: 1,
          textAlign: "left",
          fontSize: "0.78rem",
          borderRadius: "9px",
          border: `${unit.status === "reserved" ? 2 : 1}px solid ${heat !== null ? heatTone(t, heat).border : free ? t.palette.divider : tone.border}`,
          bgcolor: heat !== null ? heatTone(t, heat).bg : free ? "background.paper" : tone.bg,
          color: heat !== null ? heatTone(t, heat).text : free ? "text.primary" : tone.text,
          transition: "transform .15s ease, border-color .15s ease",
          "&:hover": { transform: "translateY(-2px)", borderColor: tone.main },
          ...(isTerrace ? { borderTop: `3px solid ${t.palette.purple.main}` } : null),
          ...focusSx(t),
          ...offHeatSx,
          ...dimmedSx,
          ...ringSx(t, selected, highlighted),
        };
      }}
    >
      {mark}
      <Box component="span" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 0.5, minHeight: 20, fontSize: "0.72rem" }}>
        <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.6, minWidth: 0 }}>
          {free ? (
            <Box component="i" aria-hidden sx={(t) => ({ flexShrink: 0, width: 7, height: 7, borderRadius: "50%", bgcolor: statusTone(t, "free").main })} />
          ) : (
            <Box
              component="span"
              sx={(t) => ({
                flexShrink: 0,
                px: 0.75,
                py: 0.25,
                borderRadius: "6px",
                fontSize: "0.68rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
                bgcolor: unit.status === "reserved" ? (hold?.urgent ? t.palette.error.main : statusTone(t, "reserved").solid) : "transparent",
                color:
                  unit.status === "reserved"
                    ? hold?.urgent
                      ? t.palette.error.contrastText
                      : statusTone(t, "reserved").solidText
                    : "text.secondary",
                ...(unit.status === "sold" ? { px: 0 } : null),
              })}
            >
              {unit.status === "reserved" ? (hold ? (hold.expired ? "Бронь истекла" : `Бронь · ${hold.label}`) : "Бронь") : status}
            </Box>
          )}
          <Box component="span" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            №{unit.number}
          </Box>
          {awaitingPayment && (
            <Box component="span" title="Ждёт предоплату" sx={{ display: "grid", color: "warning.onSurface", "& .MuiSvgIcon-root": { fontSize: 13 } }}>
              <PaymentsOutlined />
            </Box>
          )}
        </Box>
        {/* Иконка, а не буква «Б/Т»: буква путалась с названием секции «Б». */}
        <Box
          component="i"
          title={isTerrace ? "Терраса" : outdoor ? "Балкон / лоджия" : undefined}
          aria-label={isTerrace ? "Терраса" : outdoor ? "Балкон или лоджия" : undefined}
          aria-hidden={!isTerrace && !outdoor}
          sx={(t) => ({
            "& .MuiSvgIcon-root": { fontSize: 13 },
            width: 17,
            height: 17,
            display: "grid",
            placeItems: "center",
            borderRadius: "5px",
            fontSize: 11,
            fontWeight: 800,
            fontStyle: "normal",
            ...(isTerrace
              ? { bgcolor: alpha(t.palette.purple.main, 0.14), color: t.palette.purple.main }
              : outdoor
                ? { bgcolor: alpha(t.palette.teal.main, 0.14), color: t.palette.teal.main }
                : null),
          })}
        >
          {isTerrace ? <DeckOutlined /> : outdoor ? <BalconyOutlined /> : null}
        </Box>
      </Box>
      <Box component="b" sx={{ fontWeight: 700 }}>
        {formatRooms(unit.rooms)}
      </Box>
      <Box component="span" sx={{ fontSize: "0.72rem" }}>
        {unit.totalArea} м² · {unit.orientation}
      </Box>
      <Box component="span" sx={{ mt: "auto", display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 0.75, fontSize: "0.72rem" }}>
        <Box component="em" sx={{ fontWeight: 700, fontStyle: "normal" }}>
          {millions(unit.price)}
        </Box>
        <Box component="span" sx={{ fontSize: "0.66rem", color: "text.secondary", whiteSpace: "nowrap" }}>
          {perSqmShort(unit.pricePerSqm)}
        </Box>
      </Box>
    </ButtonBase>
  );
});

/** Легенда над компактной шахматкой. */
export function CompactNote() {
  const swatches = [
    ["Свободно", "free"],
    ["Забронировано", "reserved"],
    ["Продано", "sold"],
  ] as const;
  return (
    <Box sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.75, fontSize: "0.75rem", color: "text.secondary" }}>
      {swatches.map(([label, status]) => (
        <Box component="span" key={label} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box component="i" sx={(t) => ({ width: 12, height: 12, borderRadius: "3px", bgcolor: statusTone(t, status).solid })} />
          {label}
        </Box>
      ))}
      <Box component="small" sx={{ ml: "auto", fontSize: "0.72rem", display: { xs: "none", md: "inline" } }}>
        Цифра в ячейке — количество комнат · строка = этаж
      </Box>
    </Box>
  );
}

/** Подсказка под компактной шахматкой. */
export function FloorGuide({ board }: { board: BoardModel }) {
  return (
    <Box sx={(t) => ({ mt: 1.25, display: "flex", width: "max-content", alignItems: "center", gap: 1.5, borderRadius: "10px", bgcolor: subtleBg(t, true), px: 1.5, py: 1.25 })}>
      <Typography component="span" sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
        Этажи расположены сверху вниз
      </Typography>
      <Typography component="b" sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
        {board.floors[0]} → {board.floors[board.floors.length - 1]}
      </Typography>
    </Box>
  );
}
