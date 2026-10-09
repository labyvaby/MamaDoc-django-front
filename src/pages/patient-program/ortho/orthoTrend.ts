import dayjs from "dayjs";

import type { OrthoExam } from "./orthoData";

/** Точка динамики: ротация, угол Кобба и углы α по Графу на дату осмотра. */
export interface OrthoTrendPoint {
  /** Дата осмотра — чтобы свернуть график, если все точки старые. */
  at: string;
  label: string;
  atr: number | null;
  cobb: number | null;
  alphaL: number | null;
  alphaR: number | null;
}

export type TrendMetric = "atr" | "cobb" | "alpha";

export interface OrthoTrend {
  points: OrthoTrendPoint[];
  /** Показатели, у которых есть хотя бы две точки, — по ним есть смысл рисовать линию. */
  metrics: TrendMetric[];
}

/** Динамика по осмотрам от старых к новым (ТЗ §4.5). */
export function orthoTrend(exams: ReadonlyArray<OrthoExam>): OrthoTrend {
  const points = [...exams]
    .sort((a, b) => dayjs(a.record.occurredAt).valueOf() - dayjs(b.record.occurredAt).valueOf())
    .map((exam) => ({
      at: exam.record.occurredAt,
      label: dayjs(exam.record.occurredAt).format("MM.YYYY"),
      atr: exam.spine?.adams?.atr ?? null,
      cobb: exam.spine?.cobb ?? null,
      alphaL: exam.hips?.us?.left.alpha ?? null,
      alphaR: exam.hips?.us?.right.alpha ?? null,
    }));
  const count = (pick: (point: OrthoTrendPoint) => number | null) => points.filter((point) => pick(point) != null).length;
  const metrics: TrendMetric[] = [];
  if (count((point) => point.atr) >= 2) metrics.push("atr");
  if (count((point) => point.cobb) >= 2) metrics.push("cobb");
  if (count((point) => point.alphaL ?? point.alphaR) >= 2) metrics.push("alpha");
  return {
    points: points.filter((point) => point.atr != null || point.cobb != null || point.alphaL != null || point.alphaR != null),
    metrics,
  };
}
