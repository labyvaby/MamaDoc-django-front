import dayjs, { type Dayjs } from "dayjs";

import type { CatalogProject, ProjectPatch } from "../../api/realtyCatalog";

/** «5 000 000», «5,2» → число; пусто или мусор → null (фильтр не применяется). */
export function parseAmount(value: string): number | null {
  const text = value.replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Ключ подписи комнат: 4 и больше — одна группа «4+». */
export const roomsKey = (rooms: number) => String(Math.min(Math.max(rooms, 0), 4));

/** Поиск по названию, адресу и району — на клиенте: бэк по тексту ЖК не ищет. */
export function matchesProjectSearch(project: Pick<CatalogProject, "name" | "address" | "district" | "code">, search: string): boolean {
  const query = search.trim().toLocaleLowerCase("ru");
  if (!query) return true;
  return [project.name, project.address, project.district, project.code].some((field) => field.toLocaleLowerCase("ru").includes(query));
}

export const isoDate = (value: Dayjs | null) => (value && value.isValid() ? value.format("YYYY-MM-DD") : null);

/** Сумма для тела запроса строкой-decimal; пусто/мусор — null. */
export const amountText = (value: string) => {
  const parsed = parseAmount(value);
  return parsed == null ? null : String(parsed);
};

// ─── Форма ЖК ──────────────────────────────────────────────────────────────

export interface ProjectForm {
  name: string;
  queue: string;
  className: string;
  address: string;
  district: string;
  stage: string;
  progress: string;
  deadline: Dayjs | null;
  finish: string;
  promo: string;
  badge: string;
  pricePerSqm: string;
  reservationAmount: string;
  sellerInfo: string;
}

export const projectForm = (p: CatalogProject): ProjectForm => ({
  name: p.name,
  queue: p.queue,
  className: p.className,
  address: p.address,
  district: p.district,
  stage: p.stage,
  progress: String(p.progress),
  deadline: p.deadline ? dayjs(p.deadline) : null,
  finish: p.finish,
  promo: p.promo,
  badge: p.badge,
  pricePerSqm: p.pricePerSqm ? String(p.pricePerSqm) : "",
  reservationAmount: p.defaultReservationAmount != null ? String(p.defaultReservationAmount) : "",
  sellerInfo: p.sellerInfo,
});

/** Только изменённые поля: PATCH не перезаписывает то, чего не трогали. */
export function projectPatch(before: ProjectForm, after: ProjectForm): ProjectPatch {
  const patch: ProjectPatch = {};
  for (const key of ["name", "queue", "className", "address", "district", "stage", "finish", "promo", "badge", "sellerInfo"] as const) {
    if (after[key].trim() !== before[key].trim()) patch[key] = after[key].trim();
  }
  if (after.progress.trim() !== before.progress.trim()) patch.progress = Number(parseAmount(after.progress) ?? 0);
  if (isoDate(after.deadline) !== isoDate(before.deadline)) patch.deadline = isoDate(after.deadline);
  if (after.pricePerSqm.trim() !== before.pricePerSqm.trim()) patch.pricePerSqm = amountText(after.pricePerSqm) ?? "0";
  if (after.reservationAmount.trim() !== before.reservationAmount.trim()) patch.defaultReservationAmount = amountText(after.reservationAmount);
  return patch;
}

