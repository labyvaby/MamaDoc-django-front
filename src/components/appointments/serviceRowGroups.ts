/** Строка формы вместе с её позицией в плоском массиве `serviceRows`. */
export interface GroupedServiceRow<T> {
  row: T;
  /** Индекс строки в исходном массиве — по нему идут точечные апдейты. */
  index: number;
}

/** Блок формы: один специалист и все его услуги. */
export interface ServiceRowGroup<T> {
  /** Стабильный ключ списка. */
  key: string;
  employeeId: number | null;
  /** Идентификатор блока — держит услуги вместе, пока специалист не выбран. */
  groupId: string;
  rows: GroupedServiceRow<T>[];
}

/**
 * Группирует строки услуг в блоки «специалист → его услуги».
 *
 * Пока специалист выбран, блок определяется им: две услуги одного человека
 * попадают в один блок, даже если лежат в массиве не рядом (порядок блоков — по
 * первому появлению специалиста), а выбор того же специалиста в другом блоке
 * сливает блоки. Когда специалист снят, блок опознаётся по ``groupId``, иначе
 * услуги рассыпались бы на отдельные блоки с пустым исполнителем.
 */
export function groupServiceRowsByEmployee<
  T extends { employeeId: number | null; groupId?: string; uid?: string },
>(rows: T[]): ServiceRowGroup<T>[] {
  const groups: ServiceRowGroup<T>[] = [];
  const byKey = new Map<string, ServiceRowGroup<T>>();

  rows.forEach((row, index) => {
    const groupId = row.groupId ?? row.uid ?? String(index);
    const groupingKey =
      row.employeeId !== null ? `employee-${row.employeeId}` : `group-${groupId}`;
    const existing = byKey.get(groupingKey);
    if (existing) {
      existing.rows.push({ row, index });
      return;
    }
    const group: ServiceRowGroup<T> = {
      // Keep the React key tied to the row block, not to the selected
      // employee. Clearing the employee then updates the existing Autocomplete
      // instead of remounting it and stealing focus from its input.
      key: groupId,
      employeeId: row.employeeId,
      groupId,
      rows: [{ row, index }],
    };
    byKey.set(groupingKey, group);
    groups.push(group);
  });

  return groups;
}
