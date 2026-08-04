import React from "react";

import {
  BOOKING_ORG_SLUG,
  getOrganization,
  getOrganizationBranches,
  type BranchPreview,
  type OrganizationDetail,
} from "../../api/publicBooking";
import { isAbortError } from "../../api/client";

/**
 * Клиника витрины `/book/*`: название для шапки, филиалы — для телефонов,
 * адресов и фильтра списка врачей.
 *
 * Обе страницы показывают одну и ту же клинику, поэтому запрос делаем один раз
 * на загрузку вкладки и держим в модульном кэше: переход «список → врач → назад»
 * не должен дёргать сеть заново.
 */

export interface BookingOrg {
  organization: OrganizationDetail | null;
  branches: BranchPreview[];
  /**
   * Запрос клиники завершён (успехом или неудачей). Нужен потребителям, которые
   * ждут филиалов: пустой список сам по себе не отличает «ещё грузится» от
   * «филиалов нет», и без этого флага их скелетон висел бы вечно.
   */
  loaded: boolean;
}

let orgCache: Promise<Omit<BookingOrg, "loaded">> | null = null;

/**
 * Филиалы, которые показываем гостю. Публичный API отдаёт все филиалы
 * организации, включая служебные («Тестовый филиал» с адресом «АААА10»), —
 * признака публичности в контракте нет, поэтому опираемся на телефон: филиал
 * без единого номера пациенту бесполезен, туда нельзя даже позвонить.
 * Правильное решение — флаг публичности на бэке, см. тикет в docs.
 */
function publicBranches(branches: BranchPreview[]): BranchPreview[] {
  const withPhone = branches.filter((b) => b.phones?.some(Boolean));
  // Если номеров нет ни у кого, лучше показать всё, чем пустой список.
  return withPhone.length ? withPhone : branches;
}

function loadBookingOrg(): Promise<Omit<BookingOrg, "loaded">> {
  if (!orgCache) {
    orgCache = Promise.all([
      getOrganization(BOOKING_ORG_SLUG).catch(() => null),
      getOrganizationBranches(BOOKING_ORG_SLUG)
        .then((r) => publicBranches(r.items))
        .catch(() => [] as BranchPreview[]),
    ]).then(([organization, branches]) => ({ organization, branches }));
  }
  return orgCache;
}

export function useBookingOrg(): BookingOrg {
  const [state, setState] = React.useState<BookingOrg>({
    organization: null,
    branches: [],
    loaded: false,
  });

  React.useEffect(() => {
    let alive = true;
    loadBookingOrg()
      .then((data) => {
        if (alive) setState({ ...data, loaded: true });
      })
      .catch((e) => {
        // Сеть могла лечь — не кэшируем провал, дадим следующему заходу шанс.
        if (!isAbortError(e)) orgCache = null;
        if (alive) setState((prev) => ({ ...prev, loaded: true }));
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/** Первый телефон клиники (телефоны хранятся на филиалах, не на организации). */
export function primaryPhone(branches: BranchPreview[]): string | null {
  for (const branch of branches) {
    const phone = branch.phones?.find(Boolean);
    if (phone) return phone;
  }
  return null;
}
