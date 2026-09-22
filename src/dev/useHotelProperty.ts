/**
 * Текущий объект размещения (Property) Viva — все отельные вызовы принимают
 * propertyId, а не branchId. Объект ≠ филиал: филиал — общая сущность CRM,
 * объект — его отельная «надстройка» (см. hotel-viva-frontend-api.md, §1).
 * Соответствие ищем сами: GET /hotel/properties/ → найти запись с
 * branchId === activeBranch.id. Без выбранного филиала (activeBranch: null,
 * например суперадмин без контекста) откатываемся на первый объект — лучше
 * какой-то объект, чем ничего не показывать.
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

export interface UseHotelPropertyResult {
  /** Текущий объект — null, пока список не загружен или объектов нет вовсе. */
  property: HotelProperty | null;
  /** Все объекты организации — для будущего переключателя, если объектов станет больше одного. */
  properties: HotelProperty[];
  isLoading: boolean;
  isError: boolean;
}

export function useHotelProperty(): UseHotelPropertyResult {
  const { activeBranch, activeOrganization } = usePermissions();
  const isHotelOrg = activeOrganization?.vertical === "hotel";
  const query = useQuery({
    queryKey: ["hotel", "properties", activeOrganization?.id],
    queryFn: ({ signal }) => listHotelProperties(signal),
    enabled: isHotelOrg,
    staleTime: HOTEL_PROPERTIES_STALE_TIME_MS,
  });
  const properties = isHotelOrg ? query.data ?? [] : [];
  const property =
    properties.find((p) => activeBranch != null && p.branchId === activeBranch.id) ?? properties[0] ?? null;
  return { property, properties, isLoading: query.isLoading, isError: query.isError };
}
