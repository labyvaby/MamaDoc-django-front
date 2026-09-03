import { apiRequest } from "./client";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";

/**
 * Конструктор бланков заключения.
 *
 * Клиники печатают заключения на своих формах: протокол УЗИ, амбулаторная карта
 * осмотра, дневник беременной. До сих пор такие бланки жили в Word — врач
 * открывал .doc, стирал лишнее и печатал. Конструктор переносит их в CRM:
 * администратор один раз собирает бланк (лист, шапка, поля), врач заполняет
 * поля в дровере заключения, результат уходит в текст заключения и печатается
 * штатным `/print/conclusion/...`.
 *
 * Флаг включён 14.08.2026: бэк задеплоен, шаблоны лежат в системе и видны всем
 * врачам клиники. `false` возвращает CRUD в localStorage (`localDriver` ниже) —
 * это откат на случай проблем, шаблоны в базе при этом остаются.
 *
 * ⚠ Переноса собранных ранее localStorage-бланков нет: их собирают заново.
 * ⚠ На сервере должен быть прогнан `sync_permissions` — иначе права
 * `medical.conclusion_forms.manage` нет ни у кого, кроме суперпользователя.
 */
export const CONCLUSION_FORMS_BACKEND = true;

// ── Геометрия листа ────────────────────────────────────────────────────────────

export type FormPageSize = "A4" | "A5";
export type FormOrientation = "portrait" | "landscape";

/** Размеры листа в мм (портретная ориентация; альбом — обмен сторон). */
export const PAGE_SIZES_MM: Record<FormPageSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
};

/** Итоговые размеры листа с учётом ориентации. */
export function sheetSizeMm(
  pageSize: FormPageSize,
  orientation: FormOrientation,
): { width: number; height: number } {
  const base = PAGE_SIZES_MM[pageSize];
  return orientation === "landscape"
    ? { width: base.height, height: base.width }
    : { ...base };
}

// ── Обязательные блоки ─────────────────────────────────────────────────────────

/**
 * Блоки, которые есть в любом бланке и которые нельзя удалить или
 * переименовать в конструкторе, — требование заказчика. Их значения
 * подставляются из приёма, врач их не вводит.
 *
 * Круга «Место для печати» здесь больше нет (убран 03.09.2026 по просьбе
 * заказчика): печать ставят поверх подписи, и очерченное место под неё на
 * листе только занимало нижнюю треть.
 */
export const REQUIRED_BLOCK_KEYS = [
  "appointmentDateTime",
  "patientFio",
  "patientDob",
  "doctorFio",
  "signature",
] as const;

export type RequiredBlockKey = (typeof REQUIRED_BLOCK_KEYS)[number];

/**
 * Подписи обязательных блоков на бланке.
 *
 * Обычный объект, а не геттер: это надписи на печатном документе, они не
 * терминологичны и не зависят от вертикали бизнеса (см. CLAUDE.md — «Карты-
 * константы с текстом»: ленивость нужна только переводимым строкам).
 */
export const REQUIRED_BLOCK_LABELS: Record<RequiredBlockKey, string> = {
  appointmentDateTime: "Дата и время приёма",
  patientFio: "ФИО пациента",
  patientDob: "Дата рождения",
  doctorFio: "Врач",
  signature: "Подпись",
};

// ── Поля бланка ────────────────────────────────────────────────────────────────

/**
 * Тип поля.
 *
 * Заказчик заказал только текстовый ввод (решение от 12.08.2026), поэтому в
 * конструкторе выбираются лишь `text` и `multiline`. Само перечисление заведено
 * расширяемым намеренно: присланные бланки полны конструкций вида «продольное
 * поперечное косое» и «КТР __ мм», под которые напрашиваются `choice` и
 * `number`. Когда до них дойдёт очередь, добавляется вариант сюда и ветка в
 * рендере — формат хранения шаблонов при этом не ломается.
 */
export type FormFieldType = "text" | "multiline";

/** Доля ширины строки, которую занимает поле. */
export type FormFieldWidth = "full" | "half";

/**
 * Поле заключения, в которое пишет поле бланка.
 *
 * Зачем. Администраторы заводят полями бланка то, что в заключении уже есть
 * отдельной колонкой: «Карта осмотра педиатра» содержит «Температура, °C»,
 * «Вес, кг», «Рост, см», «Жалобы», «Анамнез заболевания». Без привязки врач
 * видит их дважды (в бланке и в штатном поле), а температура уезжает в текст
 * — колонка остаётся пустой, и динамика по ней не считается.
 *
 * Привязка необязательна: поле без неё работает как раньше — свободная строка
 * протокола, попадающая в собираемый текст. Привязанное поле в текст НЕ идёт:
 * его значение уже лежит в своей колонке, и в тексте оно бы задвоилось.
 *
 * ⚠ Одна колонка — максимум одно привязанное поле в бланке (проверяется в
 * конструкторе): иначе два контрола писали бы в одно значение.
 */
export type FormFieldSlot =
  | "complaints"
  | "anamnesis"
  | "objective"
  | "conclusion"
  | "weightKg"
  | "heightCm"
  | "temperature";

export const FORM_FIELD_SLOTS: FormFieldSlot[] = [
  "complaints",
  "anamnesis",
  "objective",
  "conclusion",
  "weightKg",
  "heightCm",
  "temperature",
];

/** Подписи слотов в конструкторе — те же слова, что видит врач в заключении. */
export const FORM_FIELD_SLOT_LABELS: Record<FormFieldSlot, string> = {
  complaints: "Жалобы",
  anamnesis: "Анамнез",
  objective: "Объективно",
  conclusion: "Заключение",
  weightKg: "Вес, кг",
  heightCm: "Рост, см",
  temperature: "Температура, °C",
};

export interface FormField {
  /** Стабильный идентификатор: переживает переименование и сортировку. */
  id: string;
  label: string;
  type: FormFieldType;
  /** Преднабранная норма — то, что в Word-бланках уже стоит в строке. */
  defaultValue?: string;
  placeholder?: string;
  width?: FormFieldWidth;
  /** Высота многострочного поля в строках. */
  rows?: number;
  /**
   * Куда поле пишет в самом заключении. Не задано — свободная строка
   * протокола (см. FormFieldSlot).
   */
  slot?: FormFieldSlot | null;
}

/** Занятые слоты бланка: для проверки «одна колонка — одно поле». */
export function usedSlots(fields: FormField[]): Map<FormFieldSlot, number> {
  const used = new Map<FormFieldSlot, number>();
  for (const field of fields) {
    if (!field.slot) continue;
    used.set(field.slot, (used.get(field.slot) ?? 0) + 1);
  }
  return used;
}

// ── Шаблон ─────────────────────────────────────────────────────────────────────

/** Куда попадает собранный текст в карточке заключения. */
export type FormTarget = "conclusion" | "anamnesis" | "objective";

export interface FormBackground {
  /** URL картинки-подложки (фирменный бланк). */
  imageUrl: string | null;
  /** Прозрачность подложки, 0..1 — чтобы текст поверх оставался читаемым. */
  opacity: number;
}

export interface ConclusionFormTemplate {
  id: number;
  name: string;
  pageSize: FormPageSize;
  orientation: FormOrientation;
  /** Пустой массив = бланк доступен врачам любой специализации. */
  specializationIds: number[];
  /** Заголовок документа на листе («Протокол ультразвукового исследования»). */
  title: string;
  subtitle?: string;
  /** Показывать шапку клиники (логотип, название, контакты) в верху листа. */
  showClinicHeader: boolean;
  /**
   * Контакты под названием клиники — адрес, телефон.
   * Вводятся вручную: `/auth/me/` отдаёт по организации только name и logoUrl,
   * адреса там нет (см. RbacOrganization в api/auth.ts).
   */
  headerContacts?: string;
  background: FormBackground;
  fields: FormField[];
  /** Дисклеймер внизу листа — в присланных протоколах УЗИ он есть везде. */
  footerNote?: string;
  target: FormTarget;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConclusionFormPayload {
  name: string;
  pageSize: FormPageSize;
  orientation: FormOrientation;
  specializationIds: number[];
  title: string;
  subtitle?: string;
  showClinicHeader: boolean;
  headerContacts?: string;
  background: FormBackground;
  fields: FormField[];
  footerNote?: string;
  target: FormTarget;
  isActive?: boolean;
}

/** Заготовка нового шаблона — то, с чего открывается пустой конструктор. */
export function emptyFormPayload(): ConclusionFormPayload {
  return {
    name: "",
    pageSize: "A4",
    orientation: "portrait",
    specializationIds: [],
    title: "",
    subtitle: "",
    showClinicHeader: true,
    headerContacts: "",
    background: { imageUrl: null, opacity: 1 },
    fields: [],
    footerNote: "",
    target: "conclusion",
    isActive: true,
  };
}

/** Идентификатор поля: `crypto.randomUUID` есть во всех целевых браузерах. */
export function newFieldId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

// ── Локальный драйвер (до готовности бэка) ─────────────────────────────────────

const LS_KEY = "mamadoc:conclusionForms";

type LocalStore = Record<string, ConclusionFormTemplate[]>;

function readStore(): LocalStore {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as LocalStore) : {};
  } catch {
    // Битый или недоступный localStorage не должен ронять страницу настроек.
    return {};
  }
}

function writeStore(store: LocalStore): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* приватный режим / переполнение — молча, UI покажет несохранённое состояние */
  }
}

/**
 * Шаблоны скоупятся организацией даже локально: у одного пользователя может
 * быть несколько организаций, и бланки гинекологии не должны всплывать
 * в другой клинике.
 */
const orgBucket = (organizationId: number | null | undefined) =>
  String(organizationId ?? "none");

const localDriver = {
  list(organizationId: number | null | undefined): ConclusionFormTemplate[] {
    return readStore()[orgBucket(organizationId)] ?? [];
  },

  create(
    organizationId: number | null | undefined,
    payload: ConclusionFormPayload,
  ): ConclusionFormTemplate {
    const store = readStore();
    const bucket = orgBucket(organizationId);
    const items = store[bucket] ?? [];
    const now = new Date().toISOString();
    const created: ConclusionFormTemplate = {
      ...payload,
      isActive: payload.isActive ?? true,
      // Локальный id: max + 1, чтобы не конфликтовать после удалений.
      id: items.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      createdAt: now,
      updatedAt: now,
    };
    store[bucket] = [...items, created];
    writeStore(store);
    return created;
  },

  update(
    organizationId: number | null | undefined,
    id: number,
    payload: Partial<ConclusionFormPayload>,
  ): ConclusionFormTemplate {
    const store = readStore();
    const bucket = orgBucket(organizationId);
    const items = store[bucket] ?? [];
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) throw new Error("Шаблон не найден");
    const updated: ConclusionFormTemplate = {
      ...items[index],
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    store[bucket] = items.map((item, i) => (i === index ? updated : item));
    writeStore(store);
    return updated;
  },

  remove(organizationId: number | null | undefined, id: number): void {
    const store = readStore();
    const bucket = orgBucket(organizationId);
    store[bucket] = (store[bucket] ?? []).filter((item) => item.id !== id);
    writeStore(store);
  },
};

// ── API ────────────────────────────────────────────────────────────────────────

const withOrg = (
  path: string,
  organizationId: number | null | undefined,
  extra?: Record<string, string>,
) => {
  const params = new URLSearchParams(extra);
  if (organizationId != null) params.set("organizationId", String(organizationId));
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
};

export async function getConclusionForms(
  organizationId: number | null | undefined,
  signal?: AbortSignal,
  options?: { includeInactive?: boolean },
): Promise<ConclusionFormTemplate[]> {
  if (!CONCLUSION_FORMS_BACKEND) {
    const items = localDriver.list(organizationId);
    return options?.includeInactive ? items : items.filter((item) => item.isActive);
  }
  return apiRequest<ConclusionFormTemplate[]>(
    withOrg(
      "/medical/conclusion-forms/",
      organizationId,
      options?.includeInactive ? { includeInactive: "1" } : undefined,
    ),
    { signal },
  );
}

export async function createConclusionForm(
  organizationId: number | null | undefined,
  payload: ConclusionFormPayload,
): Promise<ConclusionFormTemplate> {
  if (!CONCLUSION_FORMS_BACKEND) return localDriver.create(organizationId, payload);
  return apiRequest<ConclusionFormTemplate>(
    withOrg("/medical/conclusion-forms/", organizationId),
    { method: "POST", body: payload },
  );
}

export async function updateConclusionForm(
  organizationId: number | null | undefined,
  id: number,
  payload: Partial<ConclusionFormPayload>,
): Promise<ConclusionFormTemplate> {
  if (!CONCLUSION_FORMS_BACKEND) return localDriver.update(organizationId, id, payload);
  return apiRequest<ConclusionFormTemplate>(
    withOrg(`/medical/conclusion-forms/${id}/`, organizationId),
    { method: "PATCH", body: payload },
  );
}

export async function deleteConclusionForm(
  organizationId: number | null | undefined,
  id: number,
): Promise<void> {
  if (!CONCLUSION_FORMS_BACKEND) {
    localDriver.remove(organizationId, id);
    return;
  }
  await apiRequest<void>(withOrg(`/medical/conclusion-forms/${id}/`, organizationId), {
    method: "DELETE",
  });
}

/**
 * POST `/api/medical/conclusion-form-backgrounds/` — загрузка подложки
 * (multipart, поле `image`), в ответе публичный URL картинки.
 *
 * Контракт и обвязка те же, что у `uploadConclusionPhoto`. Пока флаг выключен,
 * подложка лежит data-URL'ом внутри шаблона в localStorage — отсюда
 * агрессивное сжатие в конструкторе. С бэкендом картинка уезжает в хранилище,
 * а в шаблоне остаётся только ссылка, и жать так сильно уже не нужно.
 */
export async function uploadConclusionFormBackground(
  file: File,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append("image", await preparePhotoOrThrow(file));
  return withUploadErrors(() =>
    apiRequest<{ url: string }>("/medical/conclusion-form-backgrounds/", {
      method: "POST",
      formData: form,
    }),
  );
}

// ── Сборка текста из заполненного бланка ───────────────────────────────────────

/**
 * Собирает заполненный бланк в плоский текст для поля заключения.
 *
 * Пустые поля выбрасываются целиком: в печатном заключении строка
 * «Шевеление:» без значения выглядит как недоделанная работа врача, а не как
 * «признак не оценивался». Многострочные значения переносятся на строку ниже
 * подписи — так они читаются в PDF, где ширина листа фиксирована.
 *
 * Привязанные к колонкам заключения поля (`slot`) пропускаются: их значение
 * уже лежит в своей колонке, и в тексте жалобы или температура задвоились бы.
 * На печатном ЛИСТЕ они, наоборот, нужны — там значения слотов подмешиваются
 * в `values`, и лист рисует их как обычные строки (см. FormSheet).
 */
export function renderFilledForm(
  template: Pick<ConclusionFormTemplate, "title" | "fields" | "footerNote">,
  values: Record<string, string>,
): string {
  const lines: string[] = [];

  const title = template.title.trim();
  if (title) lines.push(title, "");

  for (const field of template.fields) {
    if (field.slot) continue; // значение живёт в своей колонке заключения
    const value = (values[field.id] ?? "").trim();
    if (!value) continue;
    const label = field.label.trim();
    if (!label) {
      lines.push(value);
    } else if (field.type === "multiline" || value.includes("\n")) {
      lines.push(`${label}:`, value);
    } else {
      lines.push(`${label}: ${value}`);
    }
  }

  const note = template.footerNote?.trim();
  if (note) lines.push("", note);

  // Схлопываем подряд идущие пустые строки: у бланка без заполненных полей
  // разделители заголовка и примечания иначе складываются в двойной пробел.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
