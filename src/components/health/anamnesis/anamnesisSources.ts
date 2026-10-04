/**
 * Соседние разделы книжки → вход анамнеза (ТЗ §2.12): «История болезней» и
 * «Операции и травмы». Чистые функции, без запросов.
 */
import type { Condition, Hospitalization, IllnessHistory, Surgery } from "../../../api/health";
import type { AnamnesisInput, SurgeriesInput } from "./anamnesisTypes";

type IllnessEntry = AnamnesisInput["conditions"][number];
type StayEntry = AnamnesisInput["hospitalizations"][number];

export interface IllnessEntries {
  conditions: IllnessEntry[];
  hospitalizations: StayEntry[];
}

/** Рубрика МКБ («J06») или название без регистра — одна болезнь внутри случая. */
function rubric(code: string, title: string): string {
  return code.trim().slice(0, 3).toUpperCase() || title.trim().toLowerCase();
}

/**
 * Болезни для абзаца и факторов — из «Истории болезней»: каждый случай (приёмы
 * одной группы до 21 дня, архив, внесённое вручную) — одна болезнь на рубрику с
 * датой начала случая; хронические без случаев — по дате установления.
 * Госпитализация без диагноза привязывается к случаю, в дни которого началась.
 */
export function illnessEntries(illness: IllnessHistory): IllnessEntries {
  const conditions: IllnessEntry[] = [];
  const ranges: Array<{ from: string; to: string; id: number }> = [];
  const known = new Set<number>();
  let synthetic = 0;
  // Случаи новые сверху — для абзаца порядок не важен, он сортирует сам.
  for (const episode of illness.episodes) {
    const seen = new Set<string>();
    let first: number | null = null;
    for (const diagnosis of episode.diagnoses) {
      const key = rubric(diagnosis.code, diagnosis.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      // У внесённого вручную — его строка диагноза: к ней привязаны госпитализации.
      const own = episode.source === "manual" && episode.conditionId != null && first == null;
      const id: number = own && episode.conditionId != null ? episode.conditionId : (synthetic -= 1);
      conditions.push({ id, diagnosisCode: diagnosis.code, title: diagnosis.title, diagnosedOn: episode.startedOn });
      known.add(id);
      first ??= id;
    }
    if (first != null) ranges.push({ from: episode.startedOn, to: episode.endedOn, id: first });
  }
  const withEpisodes = new Set(illness.episodes.map((episode) => episode.conditionId).filter((id): id is number => id != null));
  for (const condition of illness.chronic) {
    if (condition.status === "refuted" || withEpisodes.has(condition.id)) continue;
    conditions.push(pickCondition(condition));
    known.add(condition.id);
  }
  const hospitalizations = illness.hospitalizations.map((stay) => ({
    conditionId: stayCondition(stay, known, ranges),
    admittedOn: stay.admittedOn,
  }));
  return { conditions, hospitalizations };
}

function pickCondition(condition: Condition): IllnessEntry {
  return { id: condition.id, diagnosisCode: condition.diagnosisCode, title: condition.title, diagnosedOn: condition.diagnosedOn };
}

function stayCondition(stay: Pick<Hospitalization, "conditionId" | "admittedOn">, known: Set<number>, ranges: Array<{ from: string; to: string; id: number }>): number | null {
  if (stay.conditionId != null && known.has(stay.conditionId)) return stay.conditionId;
  const episode = ranges.find((range) => range.from <= stay.admittedOn && stay.admittedOn <= range.to);
  return episode?.id ?? stay.conditionId;
}

/**
 * «Операции и травмы»: записи как есть (ошибочно внесённые абзац отбрасывает
 * сам). Отметок «операций / травм / переливаний не было» в разделе нет —
 * отрицание не печатается (ТЗ §2.12).
 */
export function surgeriesInput(rows: ReadonlyArray<Surgery>): SurgeriesInput {
  return {
    items: rows.map((row) => ({
      kind: row.kind,
      performedOn: row.performedOn,
      title: row.title,
      transfusionProduct: row.transfusionProduct || undefined,
      status: row.status,
    })),
    noneOperations: false,
    noneInjuries: false,
    noneTransfusions: false,
  };
}
