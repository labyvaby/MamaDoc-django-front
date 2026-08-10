import React from "react";

import {
  getOrganization,
  getOrganizationBranches,
  type BranchPreview,
  type OrganizationDetail,
} from "../../api/publicBooking";
import { isAbortError } from "../../api/client";
import { useBookingOrgSlug } from "./orgSlug";

/**
 * Клиника витрины `/book/*`: название для шапки, филиалы — для телефонов,
 * адресов и фильтра списка врачей. Какая именно клиника — говорит адрес
 * (см. `./orgSlug.ts`).
 *
 * Все страницы витрины показывают одну и ту же клинику, поэтому запрос делаем
 * один раз на загрузку вкладки и держим в модульном кэше: переход «список →
 * врач → назад» не должен дёргать сеть заново. Кэш — по slug: на одном домене
 * живут витрины разных организаций.
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

const orgCache = new Map<string, Promise<Omit<BookingOrg, "loaded">>>();

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

function loadBookingOrg(orgSlug: string): Promise<Omit<BookingOrg, "loaded">> {
  const cached = orgCache.get(orgSlug);
  if (cached) return cached;
  const pending = Promise.all([
    getOrganization(orgSlug).catch(() => null),
    getOrganizationBranches(orgSlug)
      .then((r) => publicBranches(r.items))
      .catch(() => [] as BranchPreview[]),
  ]).then(([organization, branches]) => ({ organization, branches }));
  orgCache.set(orgSlug, pending);
  return pending;
}

export function useBookingOrg(): BookingOrg {
  const orgSlug = useBookingOrgSlug();
  const [state, setState] = React.useState<BookingOrg>({
    organization: null,
    branches: [],
    loaded: false,
  });

  React.useEffect(() => {
    let alive = true;
    // Смена клиники в адресе: старые название и филиалы показывать нельзя.
    setState({ organization: null, branches: [], loaded: false });
    loadBookingOrg(orgSlug)
      .then((data) => {
        if (alive) setState({ ...data, loaded: true });
      })
      .catch((e) => {
        // Сеть могла лечь — не кэшируем провал, дадим следующему заходу шанс.
        if (!isAbortError(e)) orgCache.delete(orgSlug);
        if (alive) setState((prev) => ({ ...prev, loaded: true }));
      });
    return () => {
      alive = false;
    };
  }, [orgSlug]);

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
