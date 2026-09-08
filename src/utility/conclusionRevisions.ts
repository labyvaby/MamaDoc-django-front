import type { MedicalConclusionRevision } from "../api/medical";
import { CONCLUSION_FIELD_LABELS } from "./conclusionFields";
import { formatDiagnoses } from "./conclusionPrintParts";

/**
 * История правок заключения: что именно изменилось между ревизиями.
 *
 * Зачем. Бэк хранит ревизии с самого начала (`GET /medical/conclusions/<id>/revisions/`),
 * но в интерфейсе их не показывали нигде — на вопрос «кто и когда переписал
 * заключение» ответа не было, хотя ответ лежал в базе. Список снимков сам по
 * себе бесполезен: врачу нужен не снимок, а разница.
 *
 * Сравниваем каждую ревизию с предыдущей по времени. Бэк отдаёт их
 * новыми вперёд, поэтому «предыдущая» — следующий элемент массива.
 *
 * ⚠ Рост, вес и температура в ревизии не попадают — бэк их не версионирует
 * (см. MedicalConclusionRevision). Их правки в истории не видны, и это
 * ограничение контракта, а не потеря на фронте.
 */

export interface RevisionFieldChange {
  field: string;
  label: string;
  /** Пусто — поля не было (заполнили впервые). */
  before: string;
  /** Пусто — поле очистили. */
  after: string;
}

export interface RevisionEntry {
  id: number;
  createdAt: string;
  /** Пользователь правки; ФИО подставляет вызывающий код по `authUserId`. */
  changedById: number | null;
  changeReason: MedicalConclusionRevision["changeReason"];
  /** Пустой список — правка не тронула ни одного отслеживаемого поля. */
  changes: RevisionFieldChange[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  completed: "Завершено",
};

/** Поля снимка в том порядке, в каком они идут в форме заключения. */
const TEXT_FIELDS = [
  { field: "complaints", label: CONCLUSION_FIELD_LABELS.complaints },
  { field: "anamnesis", label: CONCLUSION_FIELD_LABELS.anamnesis },
  { field: "objective", label: CONCLUSION_FIELD_LABELS.objective },
  { field: "conclusion", label: CONCLUSION_FIELD_LABELS.conclusion },
  { field: "internalComment", label: "Комментарий для клиники" },
] as const;

const text = (value: string | null | undefined) => (value ?? "").trim();

/** Разница между двумя снимками. `prev` = null — самая первая ревизия. */
export function diffRevision(
  next: MedicalConclusionRevision,
  prev: MedicalConclusionRevision | null,
): RevisionFieldChange[] {
  const changes: RevisionFieldChange[] = [];

  for (const { field, label } of TEXT_FIELDS) {
    const before = text(prev?.[field]);
    const after = text(next[field]);
    if (before !== after) changes.push({ field, label, before, after });
  }

  const diagnosisBefore = formatDiagnoses(prev?.diagnosisData ?? []);
  const diagnosisAfter = formatDiagnoses(next.diagnosisData ?? []);
  if (diagnosisBefore !== diagnosisAfter) {
    changes.push({
      field: "diagnosis",
      label: CONCLUSION_FIELD_LABELS.diagnosis,
      before: diagnosisBefore,
      after: diagnosisAfter,
    });
  }

  const photosBefore = prev?.photoUrls?.length ?? 0;
  const photosAfter = next.photoUrls?.length ?? 0;
  if (photosBefore !== photosAfter) {
    changes.push({
      field: "photoUrls",
      label: "Фото",
      before: photosBefore ? String(photosBefore) : "",
      after: photosAfter ? String(photosAfter) : "",
    });
  }

  if (prev && prev.status !== next.status) {
    changes.push({
      field: "status",
      label: "Статус",
      before: STATUS_LABELS[prev.status] ?? prev.status,
      after: STATUS_LABELS[next.status] ?? next.status,
    });
  }

  // Бланк сравниваем по значениям полей, а не по всему объекту: в снимке
  // шаблона меняются служебные поля, до которых врачу дела нет.
  const formBefore = JSON.stringify(prev?.formData?.forms?.[0]?.values ?? null);
  const formAfter = JSON.stringify(next.formData?.forms?.[0]?.values ?? null);
  if (formBefore !== formAfter) {
    changes.push({ field: "formData", label: "Бланк", before: "", after: "изменён" });
  }

  return changes;
}

/** Ревизии (новые вперёд) → записи истории с разницей. */
export function buildRevisionHistory(
  revisions: MedicalConclusionRevision[],
): RevisionEntry[] {
  return revisions.map((revision, index) => ({
    id: revision.id,
    createdAt: revision.createdAt,
    changedById: revision.changedById,
    changeReason: revision.changeReason,
    changes: diffRevision(revision, revisions[index + 1] ?? null),
  }));
}
