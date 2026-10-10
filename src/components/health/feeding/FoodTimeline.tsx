import React from "react";
import { Box, Tooltip, Typography, alpha, useTheme } from "@mui/material";

import type { FeedingPeriod } from "../../../api/health";
import { subtleBorder } from "../../../theme/uiHelpers";
import { TIMELINE, timelineData, type FeedingFacts, type TextTone } from "./feedingAdvice";
import type { FoodProduct } from "./feedingCatalog";
import { feedingTypeColor, readableOn } from "./feedingUi";

/** Ширина элемента: лента строится в настоящих пикселях — подписи не растягиваются. */
function useWidth(): [React.RefCallback<HTMLElement>, number] {
  const [width, setWidth] = React.useState(0);
  const observer = React.useRef<ResizeObserver | null>(null);
  const ref = React.useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    observer.current.observe(node);
  }, []);
  React.useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}

/**
 * Ширина текста шрифтом темы — чтобы подписи точно не налезали. Пока
 * веб-шрифт не загрузился, canvas меряет запасным — после загрузки меряем заново.
 */
function useMeasure(fontFamily: string | undefined): (text: string, size: number, bold?: boolean) => number {
  const [fontsVersion, setFontsVersion] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(() => {
        if (alive) setFontsVersion((value) => value + 1);
      });
    }
    return () => {
      alive = false;
    };
  }, []);
  return React.useMemo(() => {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const context = canvas?.getContext?.("2d") ?? null;
    const cache = new Map<string, number>();
    return (text: string, size: number, bold = false) => {
      const key = `${size}|${bold ? 1 : 0}|${text}`;
      const known = cache.get(key);
      if (known != null) return known;
      let width = text.length * size * (bold ? 0.6 : 0.56);
      if (context) {
        context.font = `${bold ? 600 : 400} ${size}px ${fontFamily ?? "sans-serif"}`;
        // Запас 6 %: синтетический полужирный и сглаживание рисуют чуть шире замера.
        width = context.measureText(text).width * 1.06 + 1;
      }
      cache.set(key, width);
      return width;
    };
    // fontsVersion — пересоздать замер после загрузки шрифтов.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily, fontsVersion]);
}

interface FoodTimelineProps {
  facts: FeedingFacts;
  start: string | null;
  feeding: ReadonlyArray<FeedingPeriod>;
  today: string;
  /** Продукт из «Сегодня». */
  main: FoodProduct | null;
}

/**
 * Лента прикорма (§3.10): строки — группы продуктов, ось — возраст; точки
 * введения, красное кольцо реакции, повторы, «сегодня» пунктиром, треугольник
 * «старт около 6 мес» и полоса вскармливания. На телефоне лента прокручивается
 * внутри блока, а названия групп остаются на месте.
 */
export const FoodTimeline: React.FC<FoodTimelineProps> = ({ facts, start, feeding, today, main }) => {
  const theme = useTheme();
  const [ref, measured] = useWidth();
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const measure = useMeasure(typeof theme.typography.fontFamily === "string" ? theme.typography.fontFamily : undefined);
  const hatchId = `feeding-doctor-${React.useId().replace(/:/g, "")}`;
  const data = React.useMemo(
    () => (measured ? timelineData({ facts, start, feeding, today, main, width: measured, measure }) : null),
    [facts, start, feeding, today, main, measured, measure],
  );

  // Узкий экран: лента шире окна — сразу показываем правый край с «сегодня».
  const hasData = data != null;
  React.useEffect(() => {
    const node = scroller.current;
    if (hasData && node && node.scrollWidth > node.clientWidth) node.scrollLeft = node.scrollWidth;
  }, [hasData]);

  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const rule = subtleBorder(theme);
  const accent = theme.palette.primary.main;
  const ok = theme.palette.success.main;
  const bad = theme.palette.error.main;
  const warn = theme.palette.warning.main;
  const surface = theme.palette.background.paper;
  const textColor = (tone: TextTone): string =>
    tone === "bad"
      ? theme.palette.error.onSurface
      : tone === "accent"
        ? theme.palette.primary.onSurface
        : tone === "warn"
          ? theme.palette.warning.onSurface
          : tone === "ink"
            ? ink
            : muted;

  return (
    <Box
      ref={scroller}
      sx={{
        overflowX: "auto",
        border: `1px solid ${rule}`,
        borderRadius: "12px",
        py: 1,
        scrollbarWidth: "thin",
        // Прокрутка ленты пальцем не листает страницу вбок.
        overscrollBehaviorX: "contain",
      }}
    >
      <Box ref={ref} sx={{ minWidth: TIMELINE.minWidth, width: "100%", display: "flex" }}>
        {data && (
          <>
            {/* Названия групп — колонка, прилипшая к левому краю: видны и при прокрутке. */}
            <Box sx={{ position: "sticky", left: 0, zIndex: 1, width: 0, flexShrink: 0 }}>
              <Box
                sx={{
                  position: "absolute",
                  left: 0,
                  top: data.top - 6,
                  width: TIMELINE.left,
                  height: data.height - data.top + 6,
                  background: `linear-gradient(90deg, ${surface} 0, ${surface} ${TIMELINE.left - 10}px, ${alpha(surface, 0)} ${TIMELINE.left}px)`,
                }}
              >
                {data.rows.map((row) => (
                  <Box key={row.group} sx={{ position: "absolute", left: 10, top: row.y - data.top + 6 - 9, lineHeight: 1 }}>
                    <Typography sx={{ fontSize: 11.5, lineHeight: "16px", color: ink, whiteSpace: "nowrap" }}>{row.label}</Typography>
                    {row.hidden.length > 0 && (
                      <Tooltip title={`Ещё в журнале: ${row.hidden.join(", ")}`} arrow enterTouchDelay={0}>
                        <Typography component="span" tabIndex={0} sx={{ fontSize: 10, lineHeight: "12px", color: muted, cursor: "help", outline: "none" }}>
                          +{row.hidden.length}
                        </Typography>
                      </Tooltip>
                    )}
                  </Box>
                ))}
                {data.band && (
                  <Typography
                    sx={{ position: "absolute", left: 10, top: data.band.y - data.top + 6 + 1, fontSize: 10.5, lineHeight: "14px", color: muted }}
                  >
                    вскармливание
                  </Typography>
                )}
              </Box>
            </Box>
            <svg
              width={data.width}
              height={data.height}
              viewBox={`0 0 ${data.width} ${data.height}`}
              role="img"
              aria-label="Лента прикорма: группы продуктов по возрасту ребёнка"
              style={{ display: "block", flexShrink: 0, fontFamily: "inherit", letterSpacing: "normal", overflow: "visible" }}
            >
              <defs>
                <pattern id={hatchId} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1={0} y1={0} x2={0} y2={7} stroke={alpha(warn, 0.45)} strokeWidth={2.2} />
                </pattern>
              </defs>

              {/* Сетка по месяцам и подписи оси сверху. */}
              {data.ticks.map((tick) => (
                <g key={tick.x}>
                  <line x1={tick.x} y1={data.top - 8} x2={tick.x} y2={data.bottom} stroke={rule} strokeWidth={1} />
                  {tick.label && (
                    <text x={tick.x} y={data.top - 14} textAnchor="middle" fontSize={10.5} fill={muted}>
                      {tick.label}
                    </text>
                  )}
                </g>
              ))}

              {/* Строки групп. */}
              {data.rows.map((row) => (
                <g key={row.group}>
                  {row.early && (
                    <rect x={row.early.x} y={row.y - 11} width={Math.max(0, row.early.w)} height={22} rx={7} fill={alpha(ink, 0.05)} />
                  )}
                  {row.doctor && (
                    <rect
                      x={row.doctor.x}
                      y={row.y - 11}
                      width={Math.max(0, row.doctor.w)}
                      height={22}
                      rx={7}
                      fill={`url(#${hatchId})`}
                      stroke={alpha(warn, 0.5)}
                      strokeWidth={1}
                    />
                  )}
                  <line x1={data.x0} y1={row.y} x2={data.x1} y2={row.y} stroke={alpha(ink, 0.22)} strokeDasharray="1 4" />
                  {row.links.map((link, index) => (
                    <line key={index} x1={link.x1} y1={row.y} x2={link.x2} y2={row.y} stroke={alpha(muted, 0.55)} strokeWidth={1.2} />
                  ))}
                  {row.next && (
                    <circle
                      cx={row.next.x}
                      cy={row.y}
                      r={6.5}
                      fill={row.next.strong ? alpha(accent, 0.14) : surface}
                      stroke={accent}
                      strokeWidth={row.next.strong ? 2 : 1.6}
                      strokeDasharray="2 2"
                    />
                  )}
                  {row.points.map((point) => (
                    <Tooltip key={point.key} title={point.title} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
                      <g tabIndex={0} role="button" aria-label={point.title} style={{ cursor: "pointer", outline: "none" }}>
                        <circle cx={point.x} cy={row.y} r={10} fill="transparent" />
                        {point.repeat ? (
                          <circle cx={point.x} cy={row.y} r={3.4} fill={point.reaction ? bad : ok} stroke={surface} strokeWidth={1} />
                        ) : point.reaction ? (
                          <circle cx={point.x} cy={row.y} r={6} fill={alpha(bad, 0.16)} stroke={bad} strokeWidth={2.4} />
                        ) : (
                          <circle cx={point.x} cy={row.y} r={6} fill={ok} stroke={surface} strokeWidth={2} />
                        )}
                      </g>
                    </Tooltip>
                  ))}
                  {row.texts.map((text, index) => (
                    <text key={index} x={text.x} y={text.y} fontSize={10.5} fontWeight={text.bold ? 600 : 400} fill={textColor(text.tone)}>
                      {text.text}
                    </text>
                  ))}
                </g>
              ))}

              <line x1={data.x0} y1={data.bottom} x2={data.x1} y2={data.bottom} stroke={rule} />

              {/* «Сегодня». */}
              <line
                x1={data.today.x}
                y1={data.top - 8}
                x2={data.today.x}
                y2={data.band ? data.band.y + data.band.h : data.bottom + 4}
                stroke={accent}
                strokeWidth={1.3}
                strokeDasharray="4 4"
              />
              <text x={data.today.x} y={data.top - 14} textAnchor="middle" fontSize={11} fontWeight={600} fill={theme.palette.primary.onSurface}>
                сегодня
              </text>

              {/* Старт: «около 6 мес» и фактический. */}
              {data.markers.map((marker) => {
                const fill = marker.tone === "bad" ? bad : marker.tone === "accent" ? accent : muted;
                return (
                  <g key={`${marker.x}-${marker.tone}`}>
                    <path d={`M${marker.x} ${data.markerY} l-5 9 h10 Z`} fill={fill} />
                    <text
                      x={marker.anchor === "start" ? marker.x + 9 : marker.x - 9}
                      y={marker.labelY}
                      textAnchor={marker.anchor}
                      fontSize={10.5}
                      fontWeight={marker.tone === "bad" ? 600 : 400}
                      fill={marker.tone === "bad" ? theme.palette.error.onSurface : muted}
                    >
                      {marker.label}
                    </text>
                  </g>
                );
              })}

              {/* Полоса вскармливания по периодам. */}
              {data.band && (
                <g>
                  {data.band.parts.map((part) => {
                    const color = feedingTypeColor(theme, part.type);
                    const band = data.band!;
                    return (
                      <g key={`${part.x}-${part.type}`}>
                        <title>{part.title}</title>
                        <rect
                          x={part.x + 0.5}
                          y={band.y}
                          width={Math.max(0, part.w - 1)}
                          height={band.h}
                          rx={5}
                          fill={alpha(color, theme.palette.mode === "dark" ? 0.26 : 0.17)}
                          stroke={alpha(color, 0.45)}
                        />
                        {part.label && (
                          <text x={part.x + 6} y={band.y + 11.5} fontSize={10} fontWeight={500} fill={readableOn(theme, color)}>
                            {part.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              )}
              {data.note && (
                <text x={data.x0} y={data.note.y} fontSize={10.5} fill={muted}>
                  {data.note.text}
                </text>
              )}
            </svg>
          </>
        )}
      </Box>
    </Box>
  );
};
