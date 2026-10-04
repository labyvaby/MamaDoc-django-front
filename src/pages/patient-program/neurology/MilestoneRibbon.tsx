import React from "react";
import { Box, alpha } from "@mui/material";

import { artSvgStyle, useArtColors, type ArtColors, type ArtStatus } from "../ortho/art/artColors";
import type { Sex } from "./neuroCatalog";
import { WHO_MILESTONES, milestoneLabel, speechFlags, type MilestoneView, type SpeechFlag } from "./neuroMilestones";
import { ageWords, fmt, type NeuroLevel } from "./neuroNorms";

/** Ширина рисунка в единицах viewBox; столбец подписей и ось 0–24 мес. */
const W = 720;
const L = 196;
const R = 700;
const TOP = 50;
const ROW = 30;
const AXIS = 24;
/** Ширина символа подписи 10,5 px — для разведения подписей. */
const CH = 5.8;

const r1 = (value: number): number => Math.round(value * 10) / 10;
const x = (months: number): number => r1(L + (Math.min(Math.max(months, 0), AXIS) * (R - L)) / AXIS);
const art = (level: NeuroLevel): ArtStatus => (level === "urgent" ? "bad" : level);

/** Подпись у точки: справа, а у правого края — слева; ореол цвета фона — читается поверх окон и штриховки. */
function sideText(cx: number, y: number, text: string, color: string, weight: number, gap: number, halo: string): React.ReactNode {
  const width = text.length * CH;
  const right = cx + gap + width <= W - 4;
  return (
    <text
      x={right ? cx + gap : cx - gap}
      y={y}
      textAnchor={right ? "start" : "end"}
      fill={color}
      fontSize={10.5}
      fontWeight={weight}
      stroke={halo}
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {text}
    </text>
  );
}

function marker(view: MilestoneView, y: number, todayX: number, todayAge: number, c: ArtColors): React.ReactNode {
  const level = view.level;
  if (view.state === "yes") {
    const age = view.sinceAge ?? view.byAge;
    if (age == null) return null;
    const cx = x(age);
    const text = view.sinceAge != null ? fmt(Math.round(view.sinceAge * 2) / 2) : `≤ ${fmt(Math.round(age))} мес`;
    return (
      <g>
        <circle cx={cx} cy={y} r={6} fill={c.status(art(level))} stroke={c.surface} strokeWidth={2} />
        {sideText(cx, y - 8, text, c.ink, 500, 9, c.surface)}
      </g>
    );
  }
  const tone = view.state === "lost" ? c.status("bad") : view.state === "no" ? c.status(art(level)) : c.status("unknown");
  const text = view.state === "lost" ? "утрачен" : view.state === "no" ? "ещё нет" : view.state === "variant" ? "вариант нормы" : "нет отметки";
  const strong = view.state === "no" || view.state === "lost";
  // Пока окно вехи не открылось, «нет отметки» — только кружок: подпись была бы на каждой строке.
  const quiet = view.state === "none" && view.def.kind === "who" && todayAge < view.def.p1;
  return (
    <g>
      <circle cx={todayX} cy={y} r={6} fill={c.surface} stroke={tone} strokeWidth={view.state === "none" ? 1.6 : 2.4} strokeDasharray={view.state === "none" ? "2.5 2" : undefined} />
      {view.state === "lost" && (
        <path d={`M${todayX - 3} ${y - 3} L${todayX + 3} ${y + 3} M${todayX + 3} ${y - 3} L${todayX - 3} ${y + 3}`} stroke={tone} strokeWidth={1.6} />
      )}
      {!quiet && sideText(todayX, y + 4, text, strong ? tone : c.muted, strong ? 600 : 400, 12, c.surface)}
    </g>
  );
}

function diamond(flag: SpeechFlag, y: number, c: ArtColors): React.ReactNode {
  const cx = x(flag.months);
  const path = `M${cx} ${y - 7} L${cx + 7} ${y} L${cx} ${y + 7} L${cx - 7} ${y} Z`;
  const fill = flag.state === "done" ? c.statusFill("ok") : flag.state === "late" ? c.statusFill("bad") : "none";
  const stroke = flag.state === "done" ? c.status("ok") : flag.state === "late" ? c.status("bad") : c.inkSoft;
  const noteColor = flag.state === "done" ? c.status("ok") : flag.state === "late" ? c.status("bad") : c.muted;
  // Подписи не выходят за край рисунка.
  const center = (text: string) => {
    const half = (text.length * CH) / 2;
    return Math.min(Math.max(cx, L + half), W - 4 - half);
  };
  return (
    <g key={flag.months}>
      <path d={path} fill={fill} stroke={stroke} strokeWidth={1.3} strokeDasharray={flag.state === "done" || flag.state === "late" ? undefined : "3.5 3"} />
      <text x={center(flag.name)} y={y + 22} textAnchor="middle" fill={c.muted} fontSize={10.5}>
        {flag.name}
      </text>
      <text x={center(flag.note)} y={y + 35} textAnchor="middle" fill={noteColor} fontSize={10.5} fontWeight={flag.state === "late" ? 600 : 400}>
        {flag.note}
      </text>
    </g>
  );
}

export interface MilestoneRibbonProps {
  views: ReadonlyMap<string, MilestoneView>;
  /** Сегодняшний возраст для норм (скорригированный у недоношенных). */
  todayAge: number;
  corrected: boolean;
  birthDate: string | null;
  sex: Sex;
}

/**
 * Лента вех (ТЗ §4, макет проекта): ось 0–24 мес, шесть вех ВОЗ — окно
 * Ц1–Ц90 заливкой, Ц90–Ц99 штриховкой, после Ц99 — тонкая красная линия,
 * отметка медианы; точки освоения цвета оценки; ниже — речевые сроки.
 */
export const MilestoneRibbon: React.FC<MilestoneRibbonProps> = ({ views, todayAge, corrected, birthDate, sex }) => {
  const c = useArtColors();
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const win = `${id}win`;
  const hatch = `${id}hatch`;
  const todayX = x(todayAge);
  // Тонкая линия «позже 99 %»: заметная и на тёмном фоне.
  const late = alpha(c.status("bad"), 0.32);
  const onAxis = todayAge <= AXIS;
  const bottom = TOP + ROW * 6 + 24;
  const flags = speechFlags(views, todayAge, birthDate, sex);
  const legendY = bottom + 60;
  const height = legendY + 34;

  const ticks: React.ReactNode[] = [];
  for (let m = 0; m <= AXIS; m += 3) {
    const tx = x(m);
    ticks.push(<line key={`g${m}`} x1={tx} y1={TOP - 10} x2={tx} y2={bottom + 12} stroke={c.rule} strokeWidth={1} />);
    // Подпись месяца прячется под «сегодня», чтобы не налезать.
    if (!onAxis || Math.abs(tx - todayX) >= 40) {
      ticks.push(
        <text key={`t${m}`} x={tx} y={TOP - 17} textAnchor="middle" fill={c.muted} fontSize={10.5}>
          {m === 0 ? "0" : `${m} мес`}
        </text>,
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={artSvgStyle} role="img" aria-label="Лента вех развития по окнам ВОЗ">
      <defs>
        <linearGradient id={win} x1="0" x2="1">
          <stop offset="0" stopColor={c.accent} stopOpacity={0.1} />
          <stop offset="0.55" stopColor={c.accent} stopOpacity={0.32} />
          <stop offset="1" stopColor={c.accent} stopOpacity={0.32} />
        </linearGradient>
        <pattern id={hatch} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={5} height={5} fill={c.statusFill("warn")} />
          <line x1={0} y1={0} x2={0} y2={5} stroke={c.status("warn")} strokeWidth={1.4} strokeOpacity={0.55} />
        </pattern>
      </defs>
      <text x={10} y={14} fill={c.ink} fontSize={12} fontWeight={600}>
        Крупная моторика · окна ВОЗ{corrected ? " · возраст скорригирован" : ""}
      </text>
      {ticks}
      {onAxis ? (
        <text x={todayX} y={TOP - 17} textAnchor="middle" fill={c.accent} fontSize={12} fontWeight={600}>
          сегодня
        </text>
      ) : (
        <text x={W - 4} y={TOP - 30} textAnchor="end" fill={c.accent} fontSize={11} fontWeight={600}>
          сегодня — {ageWords(todayAge)} →
        </text>
      )}
      {WHO_MILESTONES.map((def, index) => {
        const y = TOP + index * ROW + 10;
        const view = views.get(def.code);
        return (
          <g key={def.code}>
            <text x={10} y={y + 4} fill={c.ink} fontSize={11.5}>
              {milestoneLabel(def, sex, true)}
            </text>
            <rect x={x(def.p1)} y={y - 5} width={r1(x(def.p90) - x(def.p1))} height={10} rx={5} fill={`url(#${win})`} />
            <rect x={x(def.p90)} y={y - 5} width={r1(x(def.p99) - x(def.p90))} height={10} fill={`url(#${hatch})`} />
            <rect x={x(def.p99)} y={y - 1.5} width={r1(x(AXIS) - x(def.p99))} height={3} fill={late} />
            <line x1={x(def.p50)} y1={y - 8} x2={x(def.p50)} y2={y + 8} stroke={c.accent} strokeWidth={1.4} />
            {view && marker(view, y, onAxis ? todayX : R, todayAge, c)}
          </g>
        );
      })}
      <text x={10} y={bottom + 4} fill={c.ink} fontSize={12} fontWeight={600}>
        Речь · тревожные сроки
      </text>
      {flags.map((flag) => diamond(flag, bottom, c))}
      {onAxis && <line x1={todayX} y1={TOP - 10} x2={todayX} y2={bottom + 12} stroke={c.accent} strokeWidth={1.3} strokeDasharray="4 4" />}
      <g fontSize={10.5} fill={c.muted}>
        <rect x={10} y={legendY - 6} width={28} height={10} rx={5} fill={`url(#${win})`} />
        <text x={44} y={legendY + 3}>окно ВОЗ: 1–90 % детей</text>
        <rect x={186} y={legendY - 6} width={28} height={10} fill={`url(#${hatch})`} />
        <text x={220} y={legendY + 3}>90–99 % — пограничное</text>
        <rect x={372} y={legendY - 1.5} width={28} height={3} fill={late} />
        <text x={406} y={legendY + 3}>позже 99 % — тревожно</text>
        <line x1={562} y1={legendY - 7} x2={562} y2={legendY + 5} stroke={c.accent} strokeWidth={1.4} />
        <text x={569} y={legendY + 3}>медиана</text>
        <circle cx={17} cy={legendY + 20} r={5} fill={c.status("ok")} stroke={c.surface} strokeWidth={1.5} />
        <text x={27} y={legendY + 24}>освоено, цвет — оценка</text>
        <circle cx={193} cy={legendY + 20} r={5} fill={c.surface} stroke={c.status("warn")} strokeWidth={2} />
        <text x={203} y={legendY + 24}>ещё нет — на линии «сегодня»</text>
        <circle cx={407} cy={legendY + 20} r={5} fill={c.surface} stroke={c.status("unknown")} strokeWidth={1.6} strokeDasharray="2.5 2" />
        <text x={417} y={legendY + 24}>нет отметки</text>
        <path d={`M527 ${legendY + 14} L533 ${legendY + 20} L527 ${legendY + 26} L521 ${legendY + 20} Z`} fill="none" stroke={c.inkSoft} strokeDasharray="3 2.5" />
        <text x={540} y={legendY + 24}>речевой срок: ждём</text>
      </g>
    </svg>
  );
};

/** Лента в рамке с прокруткой вбок на узком экране. */
export const MilestoneRibbonCard: React.FC<MilestoneRibbonProps> = (props) => (
  <Box sx={{ overflowX: "auto", scrollbarWidth: "thin", mx: { xs: -0.5, md: 0 } }}>
    <Box sx={{ minWidth: 640, maxWidth: 900 }}>
      <MilestoneRibbon {...props} />
    </Box>
  </Box>
);
