/**
 * Текущий объект размещения (Property) Viva — все отельные вызовы принимают
 * propertyId, а не branchId. Объект ≠ филиал: филиал — общая сущность CRM,
 * объект — его отельная «надстройка» (см. hotel-viva-frontend-api.md, §1).
 * Соответствие ищем сами: GET /hotel/properties/ → найти запись с
 * branchId === activeBranch.id. Без выбранного филиала (activeBranch: null,
 * например суперадмин без контекста) объекта нет — см. missingReason.
 *
 * enabled + ключ кэша по activeOrganization.id — HotelOccupancyBanner.tsx
 * вызывает этот хук безусловно (Rules of Hooks, сам решает рендериться ли
 * только после), поэтому без этих двух условий запрос уходил на бэк и
 * кэшировался под одним и тем же ключом даже на клинике: переключение
 * Viva → клиника → Viva в пределах staleTime отдавало обратно на Viva
 * пустой список объектов клиники из кэша — «не найден объект размещения»
 * там, где реально всё есть.
 */
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "../hooks/usePermissions";
import { listHotelProperties, type HotelProperty } from "../api/hotel";

const HOTEL_PROPERTIES_STALE_TIME_MS = 5 * 60_000;

// Последний известный список объектов организации — чтобы при повторном входе
// все отельные запросы (номера, шахматка, дашборд) стартовали сразу, а не
// ждали /hotel/properties/ (~1,5–3 с цепочкой). Кэш сразу считается
// устаревшим и перечитывается в фоне; список объектов меняется редко, а если
// объект удалили — после перечитывания страница это увидит.
const cacheKey = (orgId: number) => `mamadoc:hotel-properties:${orgId}`;

function readCachedProperties(orgId: number | undefined): HotelProperty[] | undefined {
  if (orgId == null) return undefined;
  try {
    const raw = window.localStorage.getItem(cacheKey(orgId));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return Array.isArray(parsed) ? (parsed as HotelProperty[]) : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedProperties(orgId: number, properties: HotelProperty[]): void {
  try {
    window.localStorage.setItem(cacheKey(orgId), JSON.stringify(properties));
  } catch {
    // Хранилище недоступно (приватный режим, квота) — просто без кэша.
  }
}

export interface UseHotelPropertyResult {
  /** Текущий объект — null, пока список не загружен или объектов нет вовсе. */
  property: HotelProperty | null;
  /** Все объекты организации — для будущего переключателя, если объектов станет больше одного. */
  properties: HotelProperty[];
  isLoading: boolean;
  isError: boolean;
  /** Почему property === null после загрузки: не выбран филиал или у филиала нет объекта. */
  missingReason: string;
}

export function useHotelProperty(): UseHotelPropertyResult {
  const { activeBranch, activeOrganization, loading: permissionsLoading } = usePermissions();
  const isHotelOrg = activeOrganization?.vertical === "hotel";
  const orgId = activeOrganization?.id;
  const query = useQuery({
    queryKey: ["hotel", "properties", orgId],
    queryFn: async ({ signal }) => {
      const list = await listHotelProperties(signal);
      if (orgId != null) writeCachedProperties(orgId, list);
      return list;
    },
    enabled: isHotelOrg,
    staleTime: HOTEL_PROPERTIES_STALE_TIME_MS,
    initialData: () => (isHotelOrg ? readCachedProperties(orgId) : undefined),
    // 0 — кэш «устарел с рождения»: показываем его и сразу перечитываем.
    initialDataUpdatedAt: 0,
  });
  const properties = isHotelOrg ? query.data ?? [] : [];
  // Только объект активного филиала. Отката на properties[0] нет: без филиала
  // или у филиала без объекта страница честно говорит об этом, а не показывает
  // и не правит номера/брони чужого филиала.
  const property = activeBranch != null ? properties.find((p) => p.branchId === activeBranch.id) ?? null : null;
  // «Загружается», пока грузятся права/контекст (/auth/me/) и пока у отеля не
  // пришёл список объектов. query.isLoading тут не годится: выключенный запрос
  // не считается загрузкой, и страницы на долю секунды показывали «Не найден
  // объект размещения» вместо спиннера. Отсутствие организации само по себе —
  // не загрузка: суперадмин без контекста иначе смотрел бы на вечный спиннер.
  const isLoading = permissionsLoading || (isHotelOrg && query.isPending);
  const missingReason =
    activeBranch == null
      ? "Выберите филиал — объект размещения привязан к филиалу."
      : "У текущего филиала нет объекта размещения.";
  return { property, properties, isLoading, isError: query.isError, missingReason };
}
