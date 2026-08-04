import React from "react";

import { getBranchSpecialists, type BranchPreview } from "../../api/publicBooking";
import { isAbortError } from "../../api/client";
import { useBookingOrg } from "./useBookingOrg";

/**
 * Специализации витрины: экран выбора специализации и панель фильтров в списке
 * врачей показывают один и тот же справочник.
 *
 * Одно и то же название приходит из разных филиалов со своими id («Дерматолог»
 * есть и в «Мама Доктор», и в «Плюс»), поэтому группируем по названию и
 * фильтруем врачей сразу по всем его id.
 */
export interface SpecialtyGroup {
  /** Название в нижнем регистре — ключ группы и значение в query-параметре. */
  key: string;
  title: string;
  ids: number[];
}

/**
 * Берём специализации из филиалов, а не из общего справочника `/specialists/`:
 * тот не скоупится по организации и отдаёт все записи обеих организаций — в
 * фильтре висели Проктолог, Флеболог и УЗИст, к которым записаться нельзя,
 * потому что врачей с ними нет. При выбранном филиале список сужается до его
 * специализаций.
 */
function groupSpecialties(lists: Array<{ id: number; title: string }[]>): SpecialtyGroup[] {
  const groups = new Map<string, SpecialtyGroup>();
  for (const item of lists.flat()) {
    const title = item.title.trim();
    const key = title.toLowerCase();
    if (!key) continue;
    const group = groups.get(key);
    if (group) {
      if (!group.ids.includes(item.id)) group.ids.push(item.id);
    } else {
      groups.set(key, { key, title, ids: [item.id] });
    }
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

/**
 * Справочник специализаций клиники. `branchSlug` сужает его до одного филиала
 * (пустая строка — все филиалы).
 */
export function useSpecialties(branchSlug = ""): {
  specialties: SpecialtyGroup[];
  loading: boolean;
} {
  const { branches, loaded } = useBookingOrg();
  const [specialties, setSpecialties] = React.useState<SpecialtyGroup[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Клиника ещё грузится — ждём: пустой список филиалов пока ничего не значит.
    if (!loaded) return;
    // Филиалов нет совсем — специализациям взяться неоткуда, и держать скелетон
    // бесконечно нельзя.
    if (!branches.length) {
      setSpecialties([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const targets = branchSlug
      ? branches.filter((b: BranchPreview) => (b.slug || String(b.id)) === branchSlug)
      : branches;

    Promise.all(
      targets.map((b) =>
        getBranchSpecialists(b.slug || b.id, controller.signal)
          .then((r) => r.items)
          .catch((e) => {
            if (isAbortError(e)) throw e;
            return [];
          }),
      ),
    )
      .then((lists) => {
        setSpecialties(groupSpecialties(lists));
        setLoading(false);
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        setSpecialties([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [branches, branchSlug, loaded]);

  return { specialties, loading };
}
