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
    const key =
      row.employeeId !== null ? `employee-${row.employeeId}` : `group-${groupId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push({ row, index });
      return;
    }
    const group: ServiceRowGroup<T> = {
      key,
      employeeId: row.employeeId,
      groupId,
      rows: [{ row, index }],
    };
    byKey.set(key, group);
    groups.push(group);
  });

  return groups;
}
