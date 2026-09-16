/**
 * Настройки хода приёма, которые организация задаёт сама.
 *
 * Первая из них — шаг «Подтверждён» (`scheduled → confirmed`): в одних
 * клиниках регистратор обзванивает пациентов и отмечает подтверждение, в
 * других шаг только мешает — визит сразу отмечают «Пациент здесь». Поэтому
 * кнопку можно выключить на организацию, а не убирать из кода для всех.
 *
 * Хранение — `organization.themeConfig.appointmentWorkflow`, тем же приёмом,
 * что терминология (`glossary`) и лендинг (`landing`): поле приходит в
 * /auth/me/, отдельного эндпоинта и тикета бэкенду не нужно. Writer'ы
 * themeConfig обязаны мержить поверх текущего значения, иначе сохранение
 * настроек хода приёма сотрёт палитру и терминологию организации.
 *
 * Выключенный шаг прячет только действие «Подтвердить»: уже подтверждённые
 * приёмы остаются в своём статусе, и чип «Подтверждён» у них по-прежнему
 * виден — данные не переписываем.
 */

/** Ключ внутри themeConfig, под которым живут настройки хода приёма. */
export const APPOINTMENT_WORKFLOW_CONFIG_KEY = "appointmentWorkflow";

export type AppointmentWorkflowSettings = {
  /** Показывать ли действие «Подтвердить» (переход в статус confirmed). */
  confirmStep: boolean;
};

export const DEFAULT_APPOINTMENT_WORKFLOW: AppointmentWorkflowSettings = {
  confirmStep: true,
};

/**
 * Достаёт настройки хода приёма из themeConfig организации. Всё, что не
 * похоже на булево, заменяется значением по умолчанию — поле на бэке
 * свободный JSON, и туда могла попасть запись старой версии фронта.
 */
export const readAppointmentWorkflow = (
  themeConfig: Record<string, unknown> | null | undefined,
): AppointmentWorkflowSettings => {
  const raw = themeConfig?.[APPOINTMENT_WORKFLOW_CONFIG_KEY];
  if (!raw || typeof raw !== "object") return DEFAULT_APPOINTMENT_WORKFLOW;
  const value = raw as Record<string, unknown>;
  return {
    confirmStep:
      typeof value.confirmStep === "boolean"
        ? value.confirmStep
        : DEFAULT_APPOINTMENT_WORKFLOW.confirmStep,
  };
};

/**
 * Патч themeConfig для PATCH /organization/<id>/ — всегда поверх текущего
 * значения. Настройки по умолчанию не храним: ключ удаляется, чтобы
 * themeConfig не зарастал записями «всё как обычно».
 */
export const buildAppointmentWorkflowThemeConfig = (
  themeConfig: Record<string, unknown> | null | undefined,
  settings: AppointmentWorkflowSettings,
): Record<string, unknown> => {
  const next = { ...(themeConfig ?? {}) };
  if (settings.confirmStep === DEFAULT_APPOINTMENT_WORKFLOW.confirmStep) {
    delete next[APPOINTMENT_WORKFLOW_CONFIG_KEY];
    return next;
  }
  next[APPOINTMENT_WORKFLOW_CONFIG_KEY] = { confirmStep: settings.confirmStep };
  return next;
};
