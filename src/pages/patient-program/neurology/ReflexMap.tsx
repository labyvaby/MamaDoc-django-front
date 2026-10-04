import React from "react";
import { Box, Typography } from "@mui/material";

import { artSvgStyle, useArtColors, type ArtStatus } from "../ortho/art/artColors";
import { reflexExams, type NeuroExam, type ReflexMark } from "./neuroData";
import { FADING_REFLEXES, REACTIONS, ageFor, reflexLevel, type AgeContext, type ReflexDef } from "./neuroNorms";

const W = 720;
const L = 206;
const R = 700;
const TOP = 36;
const ROW = 26;
const CH = 5.8;

/** Строки по умолчанию: рефлексы из макета и ТЗ; остальные — если отмечены в осмотрах. */
const DEFAULT_FADING = ["moro", "palmar_grasp", "stepping", "babkin", "atnr", "galant", "rooting"];
const DEFAULT_REACTIONS = ["landau_upper", "parachute"];

const r1 = (value: number): number => Math.round(value * 10) / 10;

interface ExamPoint {
  id: number;
  age: number;
  marks: Record<string, ReflexMark>;
}

const SIGN: Record<ReflexMark["state"], string> = { present: "+", absent: "−", asym: "±", obligatory: "+" };

export interface ReflexMapProps {
  /** Проведённые осмотры. */
  exams: ReadonlyArray<NeuroExam>;
  ages: AgeContext;
}

/**
 * Карта рефлексов первого года (ТЗ §4): у рефлексов, которые должны угаснуть,
 * — заливка «должен быть» до «нормы до» и угасающая — до «тревожно после»; у
 * реакций — нарастающая до срока и сплошная дальше. На строках — отметки
 * осмотров «+», «−», «±» цвета оценки на дату осмотра.
 */
export const ReflexMap: React.FC<ReflexMapProps> = ({ exams, ages }) => {
  const c = useArtColors();
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const points: ExamPoint[] = reflexExams(exams)
    .map((exam) => ({ id: exam.record.id, age: ageFor(ages, exam.record.occurredAt), marks: exam.reflexes }))
    .filter((item): item is ExamPoint => item.age != null && item.age <= 24)
    .sort((a, b) => a.age - b.age);
  const marked = new Set(points.flatMap((point) => Object.keys(point.marks)));
  const fading = FADING_REFLEXES.filter((def) => DEFAULT_FADING.includes(def.code) || marked.has(def.code));
  const reactions = REACTIONS.filter((def) => DEFAULT_REACTIONS.includes(def.code) || marked.has(def.code));
  // Ось 0–12 мес; осмотр позже года раздвигает её до чётного месяца (не дальше 24).
  const maxAge = points.length ? points[points.length - 1].age : 0;
  const end = Math.min(24, Math.max(12, Math.ceil(maxAge / 2) * 2));
  const x = (months: number): number => r1(L + (Math.min(Math.max(months, 0), end) * (R - L)) / end);

  const reactionsTop = TOP + fading.length * ROW + 24;
  const rowsBottom = reactionsTop + reactions.length * ROW;
  // Подписи осмотров под осью: налезающие уходят на вторую строку.
  const labelY = rowsBottom + 18;
  let lastRight = [-Infinity, -Infinity];
  const examLabels = points.map((point) => {
    const text = point.age < 1 ? `осмотр ${Math.max(1, Math.round(point.age * 4.345))} нед` : `осмотр ${Math.floor(point.age + 1e-9)} мес`;
    const half = (text.length * CH) / 2;
    const cx = Math.min(Math.max(x(point.age), L + half), W - 4 - half);
    const line = cx - half > lastRight[0] + 6 ? 0 : 1;
    lastRight = line === 0 ? [cx + half, lastRight[1]] : [lastRight[0], cx + half];
    return { key: point.id, cx, y: labelY + line * 13, text };
  });
  const twoLines = examLabels.some((item) => item.y > labelY);
  const legendY = labelY + (twoLines ? 13 : 0) + 26;
  const height = legendY + 14;

  const mark = (def: ReflexDef, y: number) =>
    points.map((point) => {
      const value = point.marks[def.code];
      if (!value) return null;
      const level = reflexLevel(def.code, value, point.age);
      const status: ArtStatus = level === "urgent" ? "bad" : level;
      const color = c.status(status);
      const cx = x(point.age);
      return (
        <g key={`${def.code}-${point.id}`}>
          <circle cx={cx} cy={y} r={7} fill={c.surface} stroke={color} strokeWidth={1.8} />
          <text x={cx} y={y + 3.6} textAnchor="middle" fill={color} fontSize={10} fontWeight={700}>
            {SIGN[value.state]}
          </text>
        </g>
      );
    });

  const ticks: React.ReactNode[] = [];
  const labelStep = end <= 12 ? 2 : end <= 18 ? 3 : 4;
  for (let m = 0; m <= end; m += 1) {
    ticks.push(<line key={`g${m}`} x1={x(m)} y1={TOP - 8} x2={x(m)} y2={rowsBottom + 4} stroke={c.rule} strokeWidth={1} />);
    if (m % labelStep === 0) {
      ticks.push(
        <text key={`t${m}`} x={x(m)} y={TOP - 15} textAnchor="middle" fill={c.muted} fontSize={10.5}>
          {m === 0 ? "0" : `${m} мес`}
        </text>,
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={artSvgStyle} role="img" aria-label="Карта рефлексов первого года">
      <defs>
        <linearGradient id={`${id}fade`} x1="0" x2="1">
          <stop offset="0" stopColor={c.accent} stopOpacity={0.34} />
          <stop offset="1" stopColor={c.accent} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}rise`} x1="0" x2="1">
          <stop offset="0" stopColor={c.accent} stopOpacity={0} />
          <stop offset="1" stopColor={c.accent} stopOpacity={0.34} />
        </linearGradient>
      </defs>
      {ticks}
      <text x={10} y={TOP - 15} fill={c.ink} fontSize={12} fontWeight={600}>
        Должны угаснуть
      </text>
      {fading.map((def, index) => {
        const y = TOP + index * ROW + 8;
        return (
          <g key={def.code}>
            <text x={10} y={y + 4} fill={c.ink} fontSize={11.5}>
              {def.short}
            </text>
            <rect x={x(0)} y={y - 4} width={r1(x(def.normUntil) - x(0))} height={8} rx={4} fill={c.accent} fillOpacity={0.34} />
            <rect x={x(def.normUntil)} y={y - 4} width={r1(x(def.alarmAfter) - x(def.normUntil))} height={8} fill={`url(#${id}fade)`} />
            {mark(def, y)}
          </g>
        );
      })}
      <text x={10} y={reactionsTop - 6} fill={c.ink} fontSize={12} fontWeight={600}>
        Должны появиться
      </text>
      {reactions.map((def, index) => {
        const y = reactionsTop + index * ROW + 10;
        const from = Math.max(0, def.due - 2);
        return (
          <g key={def.code}>
            <text x={10} y={y + 4} fill={c.ink} fontSize={11.5}>
              {def.short}
            </text>
            <rect x={x(from)} y={y - 4} width={r1(x(def.due) - x(from))} height={8} fill={`url(#${id}rise)`} />
            <rect x={x(def.due)} y={y - 4} width={r1(x(end) - x(def.due))} height={8} rx={4} fill={c.accent} fillOpacity={0.34} />
            {mark(def, y)}
          </g>
        );
      })}
      {examLabels.map((item) => (
        <text key={item.key} x={item.cx} y={item.y} textAnchor="middle" fill={c.accent} fontSize={10.5}>
          {item.text}
        </text>
      ))}
      <g fontSize={10.5} fill={c.muted}>
        <rect x={10} y={legendY - 5} width={28} height={8} rx={4} fill={c.accent} fillOpacity={0.34} />
        <text x={44} y={legendY + 3}>рефлекс должен быть</text>
        <rect x={176} y={legendY - 5} width={28} height={8} fill={`url(#${id}fade)`} />
        <text x={210} y={legendY + 3}>срок угасания</text>
        <text x={316} y={legendY + 3}>«+» есть, «−» нет, «±» асимметрия; цвет — оценка на дату осмотра</text>
      </g>
    </svg>
  );
};

/** Карта в рамке с прокруткой вбок на телефоне; без отметок — подсказка. */
export const ReflexMapCard: React.FC<ReflexMapProps> = (props) => (
  <Box>
    {reflexExams(props.exams).length === 0 && (
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        В осмотрах ещё нет отметок рефлексов — карта показывает, когда рефлексы должны угаснуть и реакции появиться.
      </Typography>
    )}
    <Box sx={{ overflowX: "auto", scrollbarWidth: "thin" }}>
      <Box sx={{ minWidth: 640, maxWidth: 900 }}>
        <ReflexMap {...props} />
      </Box>
    </Box>
  </Box>
);
