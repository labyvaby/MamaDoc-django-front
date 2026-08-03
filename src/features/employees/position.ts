/**
 * Должность сотрудника для показа в списке и карточке.
 *
 * В карточке и списке исторически показывалась роль доступа (RBAC) — для
 * нелечебных должностей это верно («Уборщица», «Регистратор», «Управляющий»,
 * «Главный врач»). Но роль доступа в клинике часто выдаётся «с запасом»:
 * медсестре дают доступ врача, и тогда подпись «Врач» противоречит остальному
 * интерфейсу, который делит людей по клинической роли (`clinicalRole`) —
 * приёмы, процедуры, ЗП, DjangoDoctorQuickViewDrawer.
 *
 * Поэтому роль доступа остаётся подписью по умолчанию, а клиническая роль
 * перебивает её только при прямом противоречии внутри лечебного набора
 * (доступ врача у медсестры и наоборот).
 */

import type { EmployesRow } from "./types";

/** Коды ролей доступа, которые заявляют клиническую принадлежность. */
const CLINICAL_ACCESS_ROLES: Record<string, "doctor" | "nurse"> = {
  doctor: "doctor",
  chief_doctor: "doctor",
  nurse: "nurse",
};

export type EmployeePosition = {
  /** Подпись должности; пустая строка — роль доступа не назначена. */
  label: string;
  /**
   * Название роли доступа, если оно противоречит клинической роли
   * (медсестра с доступом врача) — иначе null.
   */
  conflictingAccessRole: string | null;
};

export function getEmployeePosition(
  emp: Pick<EmployesRow, "clinicalRole" | "_djangoRole"> | null | undefined,
  t: (key: string) => string,
): EmployeePosition {
  const accessRole = emp?._djangoRole ?? null;
  const accessLabel = accessRole?.name || "";
  const clinical = emp?.clinicalRole;
  const accessClinical = accessRole?.code
    ? CLINICAL_ACCESS_ROLES[accessRole.code]
    : undefined;

  if (
    (clinical === "doctor" || clinical === "nurse") &&
    accessClinical &&
    accessClinical !== clinical
  ) {
    return {
      label: t(clinical === "doctor" ? "clinicalRole.doctor" : "clinicalRole.nurse"),
      conflictingAccessRole: accessLabel || null,
    };
  }

  return { label: accessLabel, conflictingAccessRole: null };
}

/**
 * Вес группы должностей для сортировки списка: сначала лечебный персонал
 * (главный врач → врачи → медсёстры), затем остальные роли по алфавиту,
 * и в самом конце — сотрудники без доступа в систему.
 */
export function getPositionGroupWeight(
  emp: Pick<EmployesRow, "clinicalRole" | "_djangoRole"> | null | undefined,
): number {
  const accessRole = emp?._djangoRole ?? null;
  if (!accessRole) return 90;

  // Вес считаем по той подписи, которая реально показана: у менеджера с
  // clinicalRole=doctor группа называется «Управляющий», и место ей среди
  // прочих ролей, а не между врачами и медсёстрами.
  const clinical = getEmployeePosition(emp, () => "").conflictingAccessRole
    ? emp?.clinicalRole
    : CLINICAL_ACCESS_ROLES[accessRole.code];

  if (clinical === "nurse") return 30;
  if (accessRole.code === "chief_doctor") return 10;
  if (clinical === "doctor") return 20;
  return 50;
}
