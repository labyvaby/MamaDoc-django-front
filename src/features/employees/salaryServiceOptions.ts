/**
 * Какие услуги предлагать в «Ставках по услугам» правил ЗП.
 *
 * Ставка на услугу, не закреплённую за сотрудником, мертва: дровер приёма
 * ограничивает выбор услуг привязками исполнителя (см.
 * `canEmployeeProvideService` в hooks/useDjangoAppointmentData.ts), так что
 * строка приёма с этой парой услуга/исполнитель просто не появится.
 * Поэтому список сужаем до закреплённых услуг.
 *
 * Два ограничения:
 * - без загруженных привязок (нет `catalog.view`) сужать нечем — отдаём каталог
 *   как есть, иначе список окажется пустым на ровном месте;
 * - услуги из уже созданных правил остаются в списке даже после открепления,
 *   иначе чип правила потерял бы имя и правило нельзя было бы отредактировать.
 */
export function buildSalaryServiceOptions<T extends { id: number }>(params: {
  /** Весь активный каталог организации. */
  allServices: T[];
  /** Закреплённые за сотрудником услуги (живой выбор вкладки «Услуги»). */
  assignedServices: T[];
  /** ID услуг, упомянутых в текущих правилах ЗП. */
  ruleServiceIds: number[];
  /** Загружены ли привязки услуг (есть право их видеть). */
  assignmentsKnown: boolean;
}): T[] {
  const { allServices, assignedServices, ruleServiceIds, assignmentsKnown } = params;
  if (!assignmentsKnown) return allServices;

  const referencedIds = new Set(ruleServiceIds);
  const assignedIds = new Set(assignedServices.map((s) => s.id));
  const extras = allServices.filter(
    (s) => referencedIds.has(s.id) && !assignedIds.has(s.id),
  );
  return [...assignedServices, ...extras];
}
