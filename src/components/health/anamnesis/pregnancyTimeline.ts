import type { PerinatalHistory, PregnancyComplication, PregnancyInfection } from "../../../api/health";
import { termWeeks } from "./anamnesisFactors";
import { COMPLICATIONS, INFECTIONS, PRENATAL_TEST_KINDS, type AnamnesisProfile, type Tone } from "./anamnesisTypes";
import { gestationText } from "./russian";

/**
 * Ось беременности по неделям (ТЗ §4.2, рисунок `pregnancy()` макета):
 * 0–42 нед, полосы триместров, дорожки «Мама» и «Плод». Длительное — полоса,
 * разовое — ромб, только триместр — бледная полоса на весь триместр, без срока
 * — списком под осью. Здесь только координаты; рисует `PregnancyTimeline.tsx`.
 */

export const TIMELINE = {
  width: 720,
  x0: 74,
  x1: 704,
  weeks: 42,
  top: 28,
  barHeight: 14,
  rowHeight: 12,
  /** Ширина знака подписи (шрифт 11 px), для раскладки подписей по рядам. */
  charWidth: 6.2,
} as const;

export type MarkShape = "bar" | "diamond" | "trimester";

export interface TimelineMark {
  key: string;
  lane: 0 | 1;
  shape: MarkShape;
  /** Недели: начало и конец (у ромба равны). */
  from: number;
  to: number;
  label: string;
  /** Полная подпись — подсказка при наведении. */
  title: string;
  tone: Tone;
  x: number;
  x2: number;
  y: number;
  labelX: number;
  labelY: number;
  labelAnchor: "start" | "middle" | "end";
}

export interface PregnancyTimelineLayout {
  width: number;
  height: number;
  top: number;
  bottom: number;
  lanes: Array<{ y: number; label: string }>;
  trimesters: Array<{ x: number; width: number; label: string; labelX: number; shaded: boolean }>;
  ticks: Array<{ x: number; week: number }>;
  marks: TimelineMark[];
  birth: { x: number; label: string } | null;
  /** «Без срока: …». */
  undated: string[];
  empty: boolean;
}

const TRIMESTERS: ReadonlyArray<[number, number, string, number]> = [
  [0, 13, "I триместр", 6.5],
  [13, 27, "II триместр", 20],
  [27, 42, "III триместр", 32],
];

const ROMAN = ["", "I", "II", "III"];

export function weekX(week: number): number {
  const clamped = Math.max(0, Math.min(TIMELINE.weeks, week));
  return Math.round((TIMELINE.x0 + ((TIMELINE.x1 - TIMELINE.x0) * clamped) / TIMELINE.weeks) * 10) / 10;
}

interface Draft {
  key: string;
  lane: 0 | 1;
  shape: MarkShape;
  from: number;
  to: number;
  label: string;
  title: string;
  tone: Tone;
}

function complicationLabel(item: PregnancyComplication): string {
  const meta = COMPLICATIONS[item.code];
  if (item.code === "other") return item.note || meta.short;
  return item.note ? `${meta.short}, ${item.note}` : meta.short;
}

function draftOf(
  key: string,
  lane: 0 | 1,
  item: Pick<PregnancyComplication, "fromWeek" | "toWeek" | "trimester"> | Pick<PregnancyInfection, "week" | "trimester">,
  label: string,
  title: string,
  tone: Tone,
): Draft | null {
  const weeks = termWeeks(item);
  if (weeks) {
    return { key, lane, shape: weeks.to > weeks.from ? "bar" : "diamond", from: weeks.from, to: weeks.to, label, title, tone };
  }
  if (item.trimester) {
    const [from, to] = TRIMESTERS[item.trimester - 1];
    return { key, lane, shape: "trimester", from, to, label, title: `${title} (${ROMAN[item.trimester]} триместр)`, tone };
  }
  return null;
}

/** Подписи одной стороны дорожки — по рядам, чтобы не налезали. */
function assignRows(items: Array<{ center: number; width: number }>): number[] {
  const rows: Array<Array<[number, number]>> = [];
  return items.map((item) => {
    const start = item.center - item.width / 2;
    const end = item.center + item.width / 2;
    let row = 0;
    for (;;) {
      const taken = rows[row] ?? [];
      if (!taken.some(([a, b]) => start < b + 6 && end > a - 6)) {
        rows[row] = [...taken, [start, end]];
        return row;
      }
      row += 1;
    }
  });
}

export function pregnancyTimeline(perinatal: PerinatalHistory | null, profile: Pick<AnamnesisProfile, "gestationalAgeWeeks" | "gestationalAgeDays"> | null): PregnancyTimelineLayout {
  const drafts: Draft[] = [];
  const undated: string[] = [];
  (perinatal?.complications ?? []).forEach((item, index) => {
    const meta = COMPLICATIONS[item.code];
    const label = complicationLabel(item);
    const draft = draftOf(`c${index}`, meta.lane === "mother" ? 0 : 1, item, label, item.code === "other" ? label : meta.label, meta.tone);
    if (draft) drafts.push(draft);
    else undated.push(label);
  });
  (perinatal?.infections ?? []).forEach((item, index) => {
    const meta = INFECTIONS[item.code];
    const label = item.code === "other" ? item.note || meta.short : meta.short;
    const draft = draftOf(`i${index}`, 0, item, label, item.code === "other" ? label : meta.label, "warn");
    if (draft) drafts.push(draft);
    else undated.push(label);
  });
  (perinatal?.prenatalTests ?? []).forEach((test, index) => {
    const kind = PRENATAL_TEST_KINDS.find((option) => option.value === test.kind)?.label ?? "Обследование";
    const result = test.result === "normal" ? "норма" : test.result === "abnormal" ? "отклонение" : "";
    const title = [`${kind}${test.week != null ? ` ${test.week} нед` : ""}`, result, test.note].filter(Boolean).join(" · ");
    const tone: Tone = test.result === "normal" ? "ok" : test.result === "abnormal" ? "bad" : "muted";
    if (test.week == null) {
      undated.push(kind.toLowerCase());
      return;
    }
    drafts.push({ key: `t${index}`, lane: 1, shape: "diamond", from: test.week, to: test.week, label: kind, title, tone });
  });

  // Ряды подписей: у полос — сверху, у ромбов — снизу; отдельно по дорожкам.
  const width = (label: string) => label.length * TIMELINE.charWidth + 6;
  const rowsOf = new Map<string, number>();
  for (const lane of [0, 1] as const) {
    for (const side of ["above", "below"] as const) {
      const group = drafts
        .filter((draft) => draft.lane === lane && (side === "below" ? draft.shape === "diamond" : draft.shape !== "diamond"))
        .sort((a, b) => a.from - b.from);
      const rows = assignRows(group.map((draft) => ({ center: (weekX(draft.from) + weekX(draft.to)) / 2, width: width(draft.label) })));
      group.forEach((draft, index) => rowsOf.set(draft.key, rows[index]));
    }
  }
  const maxRow = (lane: 0 | 1, below: boolean) =>
    drafts
      .filter((draft) => draft.lane === lane && (below ? draft.shape === "diamond" : draft.shape !== "diamond"))
      .reduce((max, draft) => Math.max(max, (rowsOf.get(draft.key) ?? 0) + 1), 0);

  const half = TIMELINE.barHeight / 2;
  let cursor: number = TIMELINE.top;
  const laneY: number[] = [];
  for (const lane of [0, 1] as const) {
    cursor += 6 + maxRow(lane, false) * TIMELINE.rowHeight + half;
    laneY.push(cursor);
    cursor += half + maxRow(lane, true) * TIMELINE.rowHeight + 6;
  }
  const bottom = cursor + 4;

  const marks: TimelineMark[] = drafts.map((draft) => {
    const x = weekX(draft.from);
    const x2 = weekX(draft.to);
    const y = laneY[draft.lane];
    const row = rowsOf.get(draft.key) ?? 0;
    const below = draft.shape === "diamond";
    const center = (x + x2) / 2;
    const labelWidth = width(draft.label);
    // У краёв оси подпись не вылезает за рисунок.
    let labelAnchor: TimelineMark["labelAnchor"] = "middle";
    let labelX = center;
    if (center - labelWidth / 2 < 4) {
      labelAnchor = "start";
      labelX = Math.max(4, x - 4);
    } else if (center + labelWidth / 2 > TIMELINE.width - 4) {
      labelAnchor = "end";
      labelX = Math.min(TIMELINE.width - 4, x2 + 4);
    }
    return {
      ...draft,
      x,
      x2,
      y,
      labelX: Math.round(labelX * 10) / 10,
      labelY: below ? y + 20 + row * TIMELINE.rowHeight : y - 12 - row * TIMELINE.rowHeight,
      labelAnchor,
    };
  });

  const weeks = profile?.gestationalAgeWeeks ?? null;
  const birth =
    weeks != null
      ? { x: weekX(weeks + (profile?.gestationalAgeDays ?? 0) / 7), label: `Роды · ${gestationText(weeks, profile?.gestationalAgeDays ?? null)}` }
      : null;

  return {
    width: TIMELINE.width,
    height: bottom + 22,
    top: TIMELINE.top,
    bottom,
    lanes: [
      { y: laneY[0], label: "Мама" },
      { y: laneY[1], label: "Плод" },
    ],
    trimesters: TRIMESTERS.map(([from, to, label, at], index) => ({
      x: weekX(from),
      width: Math.round((weekX(to) - weekX(from)) * 10) / 10,
      label,
      labelX: weekX(at),
      shaded: index !== 1,
    })),
    ticks: Array.from({ length: 11 }, (_, index) => ({ week: index * 4, x: weekX(index * 4) })),
    marks,
    birth,
    undated,
    empty: marks.length === 0 && birth == null && undated.length === 0,
  };
}
