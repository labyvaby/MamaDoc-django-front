import React from "react";

import {
  getOrganization,
  getOrganizationBranches,
  type BranchPreview,
  type OrganizationDetail,
} from "../../api/publicBooking";
import { useBookingOrgSlug } from "./orgSlug";
import { loadCatalog } from "./catalogCache";

/**
 * Клиника витрины `/book/*`: название для шапки, филиалы — для телефонов,
 * адресов и фильтра списка врачей. Какая именно клиника — говорит адрес
 * (см. `./orgSlug.ts`).
 *
 * Все страницы витрины показывают одну и ту же клинику, поэтому запрос делаем
 * совместно и держим в модульном кэше пять минут: переход «список → врач →
 * назад» не должен дёргать сеть заново. Кэш — по slug: на одном домене живут
 * витрины разных организаций. Неудачные запросы повторяем при следующем заходе.
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
  return Promise.all([
    loadCatalog(`org:${orgSlug}`, () => getOrganization(orgSlug)).catch(() => null),
    loadCatalog(`branches:${orgSlug}`, () => getOrganizationBranches(orgSlug)
      .then((r) => publicBranches(r.items)))
      .catch(() => [] as BranchPreview[]),
  ]).then(([organization, branches]) => ({ organization, branches }));
}

export function useBookingOrg(): BookingOrg {
  const orgSlug = useBookingOrgSlug();
  const [resolvedSlug, setResolvedSlug] = React.useState<string | null>(null);
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
        if (alive) {
          setState({ ...data, loaded: true });
          setResolvedSlug(orgSlug);
        }
      })
      .catch(() => {
        // Сеть могла лечь — не кэшируем провал, дадим следующему заходу шанс.
        if (alive) {
          setState((prev) => ({ ...prev, loaded: true }));
          setResolvedSlug(orgSlug);
        }
      });
    return () => {
      alive = false;
    };
  }, [orgSlug]);

  return resolvedSlug === orgSlug ? state : { organization: null, branches: [], loaded: false };
}

/** Первый телефон клиники (телефоны хранятся на филиалах, не на организации). */
export function primaryPhone(branches: BranchPreview[]): string | null {
  for (const branch of branches) {
    const phone = branch.phones?.find(Boolean);
    if (phone) return phone;
  }
  return null;
}
