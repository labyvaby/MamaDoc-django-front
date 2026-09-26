import type {
  DealActorKind,
  DealStage,
  DealStageLogEntry,
} from "../../api/deals";

/** Сегмент цветной линии: один вход в этап и сколько карточка там пробыла. */
export interface StageSegment {
  stageId: number;
  name: string;
  color: string;
  kind: DealStage["kind"] | null;
  from: string;
  /** Конец отрезка; у открытого — «сейчас» на момент расчёта. */
  to: string;
  seconds: number;
  /** Доля ширины полосы, 0..1; сумма по сегментам = 1. */
  share: number;
  actorName: string | null;
  actorKind: DealActorKind | null;
  actorColor: string | null;
  /** Последний сегмент открытой сделки — ещё идёт. */
  open: boolean;
}

/** Цвет этапа, которого уже нет в настройках (удалили или переименовали). */
const FALLBACK_COLOR = "#94A3B8";

/**
 * Короткий этап не должен исчезать: меньше этой доли — растягиваем, остальные
 * ужимаем пропорционально. Иначе «Дозвонились» за час на фоне недели в
 * «Записан» стал бы невидимым штрихом.
 */
export const MIN_SHARE = 0.04;

/**
 * Сегменты линии из лога переходов (старые первыми) и справочника этапов.
 *
 * Длительность считается по соседним записям, последний отрезок — до `now`.
 * Возврат в уже пройденный этап даёт ещё один сегмент того же цвета — так
 * видно «ходили туда-сюда», а не только итог.
 */
export function buildStageSegments(
  log: readonly DealStageLogEntry[],
  stages: readonly DealStage[],
  now: Date,
  closed: boolean
): StageSegment[] {
  if (log.length === 0) return [];
  const byId = new Map(stages.map((s) => [s.id, s]));
  const raw = log.map((entry, index) => {
    const next = log[index + 1];
    const from = new Date(entry.enteredAt);
    const to = next ? new Date(next.enteredAt) : now;
    const stage = byId.get(entry.toStageId);
    return {
      stageId: entry.toStageId,
      name: stage?.name ?? entry.toStageName,
      color: stage?.color ?? FALLBACK_COLOR,
      kind: stage?.kind ?? null,
      from: from.toISOString(),
      to: to.toISOString(),
      seconds: Math.max(0, (to.getTime() - from.getTime()) / 1000),
      actorName: entry.actorName,
      actorKind: entry.actorKind,
      actorColor: entry.actorColor,
      open: !next && !closed,
    };
  });
  const total = raw.reduce((sum, s) => sum + s.seconds, 0);
  const shares = normalizeShares(
    raw.map((s) => (total > 0 ? s.seconds / total : 1 / raw.length))
  );
  return raw.map((s, i) => ({ ...s, share: shares[i] }));
}

/** Поднять доли ниже MIN_SHARE до минимума, остальные ужать, сумма = 1. */
export function normalizeShares(shares: number[]): number[] {
  if (shares.length === 0) return [];
  if (shares.length * MIN_SHARE >= 1)
    return shares.map(() => 1 / shares.length);
  const small = shares.map((s) => s < MIN_SHARE);
  const reserved = small.filter(Boolean).length * MIN_SHARE;
  const bigTotal = shares.reduce((sum, s, i) => (small[i] ? sum : sum + s), 0);
  const scale = bigTotal > 0 ? (1 - reserved) / bigTotal : 0;
  return shares.map((s, i) => (small[i] ? MIN_SHARE : s * scale));
}

/** «2 д 4 ч», «35 мин», «меньше минуты». */
export function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 1) return "меньше минуты";
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч${mins % 60 ? ` ${mins % 60} мин` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} д${hours % 24 ? ` ${hours % 24} ч` : ""}`;
}
