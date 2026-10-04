/**
 * Локальный черновик заключения (localStorage) — вынесен из
 * DjangoConclusionDrawer 28.09.2026 без изменений логики.
 */
import type { CatalogDiagnosis, ConclusionStatus } from "../../api/medical";
import type { ConclusionFormTemplate, FormTarget } from "../../api/conclusionForms";

// ── localStorage draft persistence ─────────────────────────────────────────────
// Черновик заключения хранится локально: 1 документ = 1 запись в
// localStorage. Ключ — строка услуги, для второго и следующих документов
// строки ещё и различитель (см. draftScope). Восстанавливается при повторном
// открытии и удаляется после успешного сохранения на сервере.

const conclusionDraftKey = (draftId: string) => `conclusion_draft_${draftId}`;

export const conclusionDraftId = (serviceLineId: number, draftScope?: string) =>
  draftScope ? `${serviceLineId}_${draftScope}` : String(serviceLineId);

export type ConclusionDraftBody = {
  complaints: string;
  anamnesis: string;
  objective: string;
  conclusionText: string;
  selectedDiagnoses: CatalogDiagnosis[];
  photoUrls: string[];
  weightKg: string;
  heightCm: string;
  temperature: string;
  internalComment: string;
  status: ConclusionStatus;
  /**
   * Прикреплённый бланк и значения его полей.
   *
   * С 03.09.2026 то же самое едет и на сервер — в `formData` заключения
   * (api/conclusionFormData), поэтому после сохранения бланк открывается
   * заполненным, а не «простынёй» собранного текста. Локальная копия осталась
   * черновиком: она переживает закрытие дровера до сохранения.
   *
   * ⚠ Шаблон для уже сохранённого заключения берётся из снапшота внутри
   * `formData`, а не из настроек: администратор мог позже переставить поля или
   * переназначить привязку к колонке (`slot`), и старое заключение записало бы
   * значение в чужую колонку.
   */
  formId?: number | null;
  formValues?: Record<string, string>;
  /** Свободный хвост бланка (см. manualText в компоненте). */
  formManual?: string;
  /** Снапшот бланка сохранённого заключения (см. formSnapshot в компоненте). */
  formSnapshot?: ConclusionFormTemplate | null;
};

/** Поле формы, в которое бланк собирает свой текст. */
export const targetField = (target: FormTarget): keyof ConclusionDraftBody =>
  target === "anamnesis" ? "anamnesis" : target === "objective" ? "objective" : "conclusionText";

export type ConclusionDraft = ConclusionDraftBody & { savedAt: string };

export function readConclusionDraft(draftId: string): ConclusionDraft | null {
  try {
    const raw = window.localStorage.getItem(conclusionDraftKey(draftId));
    return raw ? (JSON.parse(raw) as ConclusionDraft) : null;
  } catch {
    return null;
  }
}

export function writeConclusionDraft(draftId: string, body: ConclusionDraftBody) {
  try {
    window.localStorage.setItem(
      conclusionDraftKey(draftId),
      JSON.stringify({ ...body, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* localStorage переполнен или недоступен — работаем без черновика */
  }
}

export function clearConclusionDraft(draftId: string) {
  try {
    window.localStorage.removeItem(conclusionDraftKey(draftId));
  } catch {
    /* ignore */
  }
}
