/**
 * Заполненный бланк внутри заключения: сборка `formData` для сохранения и
 * разбор его обратно в шаблон + значения при открытии.
 *
 * Зачем отдельный модуль. До 03.09.2026 заполненный бланк жил только в
 * localStorage-черновике: на сервер уезжал собранный текст, и при повторном
 * открытии заключения врач видел «простыню» вместо строк протокола. Разбирать
 * текст обратно в поля нельзя — на любой ручной правке такой разбор врёт.
 * Бэк добавил `formData` (свободный JSON, ≤ 256 КБ), и теперь заключение
 * хранит и текст, и сами значения.
 *
 * Ключевая деталь — снапшот. Открывать сохранённое заключение нужно по копии
 * шаблона, сохранённой рядом со значениями, а не по актуальному бланку из
 * настроек: администратор мог позже переставить поля, переименовать строки или
 * переназначить привязку к колонке (`slot`) — и тогда значения легли бы не в
 * свои строки, а привязанное поле записало бы температуру в чужую колонку.
 */
import {
  CONCLUSION_FORM_DATA_LIMIT_BYTES,
  type ConclusionFormData,
} from "./medical";
import type {
  ConclusionFormTemplate,
  FormField,
  FormOrientation,
  FormPageSize,
  FormTarget,
} from "./conclusionForms";

/** Версия структуры: чужую версию разбирать вслепую нельзя. */
export const CONCLUSION_FORM_DATA_VERSION = 1;

/**
 * Собранный бланк для отправки.
 *
 * `null` означает «бланк откреплён» и на бэке очищает поле. Возвращаем именно
 * `null`, а не пропуск: PATCH без поля сохраняет прежнее значение, и
 * открепление молча не доехало бы до сервера.
 */
export function buildConclusionFormData(
  form: ConclusionFormTemplate | null,
  values: Record<string, string>,
  manualText: string,
): ConclusionFormData | null {
  if (!form) return null;

  const manual = manualText.trim();
  return {
    version: CONCLUSION_FORM_DATA_VERSION,
    forms: [
      {
        formId: form.id,
        // Только поля этого бланка: в значениях мог остаться хвост от ранее
        // прикреплённого — на листе он не рисуется, а место занимает.
        values: Object.fromEntries(
          form.fields.map((field) => [field.id, values[field.id] ?? ""]),
        ),
        snapshot: {
          name: form.name,
          title: form.title,
          subtitle: form.subtitle ?? "",
          footerNote: form.footerNote ?? "",
          target: form.target,
          pageSize: form.pageSize,
          orientation: form.orientation,
          showClinicHeader: form.showClinicHeader,
          headerContacts: form.headerContacts ?? "",
          background: form.background,
          fields: form.fields,
        },
      },
    ],
    ...(manual ? { manual: { [form.target]: manual } } : {}),
  };
}

/**
 * Приводит `formData` к лимиту бэка (256 КБ).
 *
 * Перевесить лимит может только подложка, попавшая в снапшот data-URL'ом
 * (шаблоны, собранные до выкладки бэка бланков, хранили её прямо в шаблоне).
 * Тогда снапшот дешевле выбросить, чем терять значения: текст заключения уже
 * собран и сохраняется отдельно, а бланк для повторного открытия возьмётся из
 * актуального шаблона. Совсем не влезло — сохраняем заключение без `formData`,
 * о чём вызывающий код предупреждает врача.
 */
export function fitConclusionFormData(
  data: ConclusionFormData | null,
): { data: ConclusionFormData | null; droppedSnapshot: boolean; dropped: boolean } {
  if (!data) return { data: null, droppedSnapshot: false, dropped: false };
  if (byteSize(data) <= CONCLUSION_FORM_DATA_LIMIT_BYTES) {
    return { data, droppedSnapshot: false, dropped: false };
  }

  const withoutSnapshot: ConclusionFormData = {
    ...data,
    forms: data.forms.map((entry) => ({ ...entry, snapshot: null })),
  };
  if (byteSize(withoutSnapshot) <= CONCLUSION_FORM_DATA_LIMIT_BYTES) {
    return { data: withoutSnapshot, droppedSnapshot: true, dropped: false };
  }
  return { data: null, droppedSnapshot: false, dropped: true };
}

function byteSize(value: unknown): number {
  const json = JSON.stringify(value) ?? "";
  return typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(json).length
    : // Кириллица в UTF-8 — два байта на символ; без TextEncoder оцениваем
      // сверху, чтобы не отправить больше лимита.
      json.length * 2;
}

/** Разобранный бланк заключения — то, чем дровер заполняет свою форму. */
export interface ParsedConclusionForm {
  formId: number;
  values: Record<string, string>;
  /** Шаблон из снапшота; null — снапшота нет, берём актуальный по formId. */
  snapshot: ConclusionFormTemplate | null;
  /** Ручной хвост врача под собранным текстом. */
  manual: string;
}

const PAGE_SIZES: FormPageSize[] = ["A4", "A5"];
const ORIENTATIONS: FormOrientation[] = ["portrait", "landscape"];
const TARGETS: FormTarget[] = ["conclusion", "anamnesis", "objective"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Разбирает `formData` заключения.
 *
 * Данные недоверенные: их писала прошлая версия фронта (а после появления
 * новых типов полей — и будущая), поэтому всё, что не проходит проверку, молча
 * отбрасывается: заключение должно открыться в любом случае, пусть и без
 * бланка. По той же причине читаем только первый элемент `forms`: несколько
 * бланков на одном заключении фронт не собирает, а «лишний» бланк из чужой
 * версии дорисовывать некуда.
 */
export function parseConclusionFormData(
  raw: unknown,
): ParsedConclusionForm | null {
  if (!isRecord(raw)) return null;
  const forms = raw.forms;
  if (!Array.isArray(forms) || forms.length === 0) return null;

  const entry = forms[0];
  if (!isRecord(entry)) return null;
  const formId = entry.formId;
  if (typeof formId !== "number" || !Number.isFinite(formId)) return null;

  const values: Record<string, string> = {};
  if (isRecord(entry.values)) {
    for (const [key, value] of Object.entries(entry.values)) {
      // Числа и булевы значения могли попасть из будущих типов полей —
      // показываем их строкой, а не теряем.
      if (typeof value === "string") values[key] = value;
      else if (typeof value === "number" || typeof value === "boolean") {
        values[key] = String(value);
      }
    }
  }

  const snapshot = parseSnapshot(formId, entry);

  // Ручной хвост лежит под именем колонки, в которую бланк собирает текст.
  const target = snapshot?.target ?? "conclusion";
  let manual = "";
  if (isRecord(raw.manual)) {
    const own = raw.manual[target];
    if (typeof own === "string") manual = own;
    else {
      // Адресат бланка мог смениться — берём единственное непустое значение,
      // иначе ручной текст врача пропал бы без следа.
      const texts = Object.values(raw.manual).filter(
        (value): value is string => typeof value === "string" && value.trim() !== "",
      );
      if (texts.length === 1) manual = texts[0];
    }
  }

  return { formId, values, snapshot, manual };
}

/** Снапшот шаблона → объект бланка, каким его рисуют лист и поля дровера. */
function parseSnapshot(
  formId: number,
  entry: Record<string, unknown>,
): ConclusionFormTemplate | null {
  const snapshot = entry.snapshot;
  if (!isRecord(snapshot)) return null;

  const fields = Array.isArray(snapshot.fields)
    ? (snapshot.fields.filter(
        (field) => isRecord(field) && typeof field.id === "string",
      ) as unknown as FormField[])
    : [];
  if (fields.length === 0) return null;

  const str = (value: unknown, fallback = "") =>
    typeof value === "string" ? value : fallback;
  const background = isRecord(snapshot.background) ? snapshot.background : null;

  return {
    id: formId,
    name: str(snapshot.name),
    pageSize: PAGE_SIZES.includes(snapshot.pageSize as FormPageSize)
      ? (snapshot.pageSize as FormPageSize)
      : "A4",
    orientation: ORIENTATIONS.includes(snapshot.orientation as FormOrientation)
      ? (snapshot.orientation as FormOrientation)
      : "portrait",
    specializationIds: [],
    serviceIds: [],
    branchIds: [],
    isDefault: false,
    title: str(snapshot.title),
    subtitle: str(snapshot.subtitle),
    showClinicHeader: snapshot.showClinicHeader !== false,
    headerContacts: str(snapshot.headerContacts),
    background: {
      imageUrl: typeof background?.imageUrl === "string" ? background.imageUrl : null,
      opacity: typeof background?.opacity === "number" ? background.opacity : 1,
    },
    fields,
    footerNote: str(snapshot.footerNote),
    target: TARGETS.includes(snapshot.target as FormTarget)
      ? (snapshot.target as FormTarget)
      : "conclusion",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}
