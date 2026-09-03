/**
 * Бланк заключения по умолчанию: какой макет подставляется врачу, когда он
 * открывает НОВОЕ заключение.
 *
 * Правило — тройка «филиал × услуга → бланк»: протокол УЗИ ОБП привязывают к
 * услуге «УЗИ ОБП», карту осмотра — к приёму; `null` в поле означает «любой»
 * (мультифилиальность и общий бланк на все услуги).
 *
 * ⚠ Почему услуга, а не специализация врача. `specializationIds` у бланка есть,
 * но назначить специализацию существующему сотруднику нечем: `PATCH
 * /staff/employees/<id>/` с этим полем отвечает 200 и молча его игнорирует
 * (проверено на test.crm.operator.kg 03.09.2026). Заключение и так привязано к
 * строке услуги, поэтому услуга — и точнее по смыслу, и единственный ключ,
 * который на живых данных действительно заполнен.
 *
 * ⚠ Где это лежит. Полей «бланк по умолчанию» на модели бланка бэк не имеет
 * (`ConclusionFormTemplate` в api/conclusionForms.ts — весь контракт), поэтому
 * правила живут в `organization.themeConfig` — свободном JSON, который уже
 * хранит палитру CRM, лендинг `/site` и терминологию. Отсюда два следствия:
 *   • скоупинг по организации получается сам собой: themeConfig принадлежит
 *     организации, и правила одной клиники не видны другой;
 *   • правку гейтит `organization.update`, а не `medical.conclusion_forms.manage`
 *     — у администратора бланков без права на организацию секция будет только
 *     на чтение.
 * Правильное место — поля `serviceIds`/`isDefault` на самом бланке, они уже
 * запрошены тикетом `MamaDoc/backend_ticket_conclusion_form_data.md` (§3);
 * филиальную часть просит `backend_ticket_conclusion_forms_scoping.md`. После
 * выкладки правила переезжают на модель, а этот модуль удаляется.
 *
 * Данные недоверенные: их мог записать другой фронт или старая версия этого,
 * поэтому всё, что не проходит валидацию, молча отбрасывается — интерфейс от
 * мусора в конфиге падать не должен.
 */

/** Ключ внутри themeConfig, под которым живут правила. */
export const CONCLUSION_FORM_DEFAULTS_KEY = "conclusionFormDefaults";

export interface ConclusionFormDefaultRule {
  /** id филиала; null — правило действует во всех филиалах организации. */
  branchId: number | null;
  /** id услуги; null — для любой услуги. */
  serviceId: number | null;
  /** id бланка (ConclusionFormTemplate.id). */
  formId: number;
}

const isPositiveInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isNullableId = (value: unknown): value is number | null =>
  value === null || isPositiveInt(value);

function parseRule(raw: unknown): ConclusionFormDefaultRule | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  // `undefined` тоже читаем как «любой»: правило, записанное без поля,
  // осмысленно, и терять его из-за формальности незачем.
  const branchId = item.branchId ?? null;
  const serviceId = item.serviceId ?? null;
  if (!isNullableId(branchId) || !isNullableId(serviceId)) return null;
  if (!isPositiveInt(item.formId)) return null;
  return { branchId, serviceId, formId: item.formId };
}

/** Правила из themeConfig организации; при любом сомнении — пустой список. */
export function readConclusionFormDefaults(
  themeConfig: Record<string, unknown> | null | undefined,
): ConclusionFormDefaultRule[] {
  const raw = themeConfig?.[CONCLUSION_FORM_DEFAULTS_KEY];
  if (!Array.isArray(raw)) return [];

  const rules: ConclusionFormDefaultRule[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const rule = parseRule(item);
    if (!rule) continue;
    // Одна пара «филиал + услуга» — одно правило: дубли в конфиге означали бы,
    // что подставляемый бланк зависит от порядка записи.
    const key = `${rule.branchId ?? "any"}:${rule.serviceId ?? "any"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(rule);
  }
  return rules;
}

/**
 * Патч themeConfig с новыми правилами.
 *
 * ⚠ Только поверх текущего значения: themeConfig общий, и запись целиком
 * стёрла бы тему, лендинг и терминологию (та же причина, что у
 * buildGlossaryThemeConfig).
 */
export function buildConclusionFormDefaultsThemeConfig(
  themeConfig: Record<string, unknown> | null | undefined,
  rules: ConclusionFormDefaultRule[],
): Record<string, unknown> {
  const next = { ...(themeConfig ?? {}) };
  if (rules.length === 0) {
    delete next[CONCLUSION_FORM_DEFAULTS_KEY];
    return next;
  }
  next[CONCLUSION_FORM_DEFAULTS_KEY] = rules;
  return next;
}

/**
 * Какой бланк подставить для этой услуги в этом филиале.
 *
 * Приоритет — от точного правила к общему:
 *   1. филиал + услуга,
 *   2. все филиалы + услуга,
 *   3. филиал + любая услуга,
 *   4. все филиалы + любая услуга.
 *
 * Услуга важнее филиала намеренно: она определяет, ЧТО за документ печатают
 * («Протокол УЗИ ОБП»), а филиал — лишь где. Общий бланк филиала не должен
 * подменять протокол конкретного исследования; своя форма филиала для той же
 * услуги побеждает на первом уровне.
 */
export function resolveDefaultFormId(
  rules: ConclusionFormDefaultRule[],
  scope: { branchId: number | null; serviceId: number | null },
): number | null {
  const sameBranch = (rule: ConclusionFormDefaultRule) =>
    scope.branchId != null && rule.branchId === scope.branchId;
  const sameService = (rule: ConclusionFormDefaultRule) =>
    scope.serviceId != null && rule.serviceId === scope.serviceId;

  const levels: ((rule: ConclusionFormDefaultRule) => boolean)[] = [
    (rule) => sameBranch(rule) && sameService(rule),
    (rule) => rule.branchId == null && sameService(rule),
    (rule) => sameBranch(rule) && rule.serviceId == null,
    (rule) => rule.branchId == null && rule.serviceId == null,
  ];

  for (const matches of levels) {
    const found = rules.find(matches);
    if (found) return found.formId;
  }
  return null;
}
