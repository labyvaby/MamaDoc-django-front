import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";
import { fromRawProjectMedia, fromRawUnitMedia, type ProjectMedia, type UnitMedia } from "./realtyFiles";

/**
 * «Каталог объектов» застройщика (AIVIO): ЖК с подбором, планировки, секции,
 * справочник планировок ЖК и акции.
 *
 * Контракт — гайд бэка `frontend-sales.md` §7 (05.10.2026), формы ответов
 * сверены с test2 06.10.2026.
 * - `GET /projects/` с фильтрами отдаёт `available` (свободные под условия) и
 *   `matching` (все квартиры под условия, `null` без фильтров);
 * - ЖК, секции, планировки ЖК — `realty.catalog.manage` (+ `realty.manage`);
 *   акции — `realty.manage`;
 * - удалить ЖК/секцию/планировку с квартирами или сделками → 409
 *   `PROJECT_HAS_DEALS` / `SECTION_HAS_UNITS` / `LAYOUT_HAS_UNITS`.
 * - `PATCH /projects/<id>/` — только изменённые поля; незнакомое поле → 400 с
 *   именем в `details.fields` (с 09.10.2026, список — `frontend-sales.md` §14).
 */

const REALTY_API = "/v2/realty";

export const CATALOG_SORTS = ["popular", "price", "ready", "free"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const CATALOG_FEATURES = ["terrace", "balcony", "south", "panoramic"] as const;
export type CatalogFeature = (typeof CATALOG_FEATURES)[number];

export const PROMOTION_KINDS = ["none", "fixed", "percent", "per_sqm"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_TONES = ["green", "orange", "violet", "blue"] as const;
export type PromotionTone = (typeof PROMOTION_TONES)[number];

export interface RoomStat {
  rooms: number;
  free: number;
  total: number;
  minArea: number;
  maxArea: number;
  minPrice: number;
}

export interface CatalogSection {
  id: number;
  name: string;
  floors: number;
  startFloor: number;
  progress: number;
  deadline: string | null;
  deadlineLabel: string;
}

export interface CatalogProject {
  id: number;
  code: string;
  name: string;
  queue: string;
  className: string;
  address: string;
  district: string;
  status: string;
  statusLabel: string;
  stage: string;
  progress: number;
  floors: number;
  startFloor: number;
  total: number;
  free: number;
  reserved: number;
  sold: number;
  priceFrom: number;
  pricePerSqm: number;
  areaFrom: number | null;
  areaTo: number | null;
  deadline: string | null;
  deadlineLabel: string;
  finish: string;
  features: string[];
  promo: string;
  badge: string;
  manager: string;
  managerPhone: string;
  sellerInfo: string;
  escrowBank: string;
  permit: string;
  cadastral: string;
  landPlot: string;
  defaultReservationAmount: number | null;
  sections: CatalogSection[];
  roomStats: RoomStat[];
  /** Квартир под фильтры (все статусы); `null` — фильтров нет. */
  matching: number | null;
  /** Свободных под фильтры. */
  available: number;
  /** Фото, фасад, документы и презентация (`frontend-new-modules.md` §1). */
  media: ProjectMedia;
}

export interface CatalogFilters {
  projectId?: number | null;
  rooms?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  areaMin?: number | null;
  areaMax?: number | null;
  feature?: CatalogFeature | null;
  sort?: CatalogSort;
}

export interface CatalogLayout {
  id: string;
  code: string;
  projectId: number;
  projectName: string;
  rooms: number;
  terrace: boolean;
  total: number;
  free: number;
  reserved: number;
  minArea: number;
  maxArea: number;
  minPrice: number;
  maxPrice: number;
  /** [первый, последний] этаж с этой планировкой. */
  floors: number[];
  orientations: string[];
  hasBalcony: boolean;
  panoramic: boolean;
  corner: boolean;
  /** План планировки — защищённые ссылки, показывать через `ProtectedImage`. */
  images: string[];
  representativeUnitId: number | null;
  media: UnitMedia;
}

export interface UnitLayout {
  id: number;
  projectId: number;
  code: string;
  rooms: number;
  area: number | null;
  image: string;
  description: string;
  unitCount: number;
}

export interface Promotion {
  id: number;
  /** `null` — акция для всех ЖК. */
  projectId: number | null;
  code: string;
  title: string;
  badge: string;
  tone: PromotionTone | string;
  text: string;
  validUntil: string | null;
  kind: PromotionKind | string;
  value: number;
  maxDiscount: number | null;
  isActive: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const money = (value: unknown) => Number(value ?? 0) || 0;
const moneyOrNull = (value: unknown) => (value == null || value === "" ? null : Number(value));

const fromRawSection = (raw: any): CatalogSection => ({
  id: raw.id,
  name: raw.name ?? "",
  floors: Number(raw.floors) || 0,
  startFloor: Number(raw.startFloor) || 1,
  progress: Number(raw.progress) || 0,
  deadline: raw.deadline || null,
  deadlineLabel: raw.deadlineLabel ?? "",
});

export const fromRawCatalogProject = (raw: any): CatalogProject => ({
  id: raw.id,
  code: raw.code ?? "",
  name: raw.name ?? "",
  queue: raw.queue ?? "",
  className: raw.className ?? "",
  address: raw.address ?? "",
  district: raw.district ?? "",
  status: raw.status ?? "",
  statusLabel: raw.statusLabel ?? "",
  stage: raw.stage ?? "",
  progress: Number(raw.progress) || 0,
  floors: Number(raw.floors) || 0,
  startFloor: Number(raw.startFloor) || 1,
  total: Number(raw.total) || 0,
  free: Number(raw.free) || 0,
  reserved: Number(raw.reserved) || 0,
  sold: Number(raw.sold) || 0,
  priceFrom: money(raw.priceFrom),
  pricePerSqm: money(raw.pricePerSqm),
  areaFrom: raw.areaFrom ?? null,
  areaTo: raw.areaTo ?? null,
  deadline: raw.deadline || null,
  deadlineLabel: raw.deadlineLabel ?? "",
  finish: raw.finish ?? "",
  features: Array.isArray(raw.features) ? raw.features : [],
  promo: raw.promo ?? "",
  badge: raw.badge ?? "",
  manager: raw.manager ?? "",
  managerPhone: raw.managerPhone ?? "",
  sellerInfo: raw.sellerInfo ?? "",
  escrowBank: raw.escrowBank ?? "",
  permit: raw.permit ?? "",
  cadastral: raw.cadastral ?? "",
  landPlot: raw.landPlot ?? "",
  defaultReservationAmount: moneyOrNull(raw.defaultReservationAmount),
  sections: Array.isArray(raw.sections) ? raw.sections.map(fromRawSection) : [],
  roomStats: Array.isArray(raw.roomStats)
    ? raw.roomStats.map((r: any) => ({ rooms: r.rooms, free: r.free ?? 0, total: r.total ?? 0, minArea: r.minArea ?? 0, maxArea: r.maxArea ?? 0, minPrice: money(r.minPrice) }))
    : [],
  matching: typeof raw.matching === "number" ? raw.matching : null,
  available: Number(raw.available ?? raw.free) || 0,
  media: fromRawProjectMedia(raw),
});

const fromRawLayout = (raw: any): CatalogLayout => ({
  id: String(raw.id),
  code: raw.code ?? "",
  projectId: raw.projectId,
  projectName: raw.projectName ?? "",
  rooms: Number(raw.rooms) || 0,
  terrace: Boolean(raw.terrace),
  total: Number(raw.total) || 0,
  free: Number(raw.free) || 0,
  reserved: Number(raw.reserved) || 0,
  minArea: Number(raw.minArea) || 0,
  maxArea: Number(raw.maxArea) || 0,
  minPrice: money(raw.minPrice),
  maxPrice: money(raw.maxPrice),
  floors: Array.isArray(raw.floors) ? raw.floors : [],
  orientations: Array.isArray(raw.orientations) ? raw.orientations : [],
  hasBalcony: Boolean(raw.hasBalcony),
  panoramic: Boolean(raw.panoramic),
  corner: Boolean(raw.corner),
  images: Array.isArray(raw.images) ? raw.images : [],
  representativeUnitId: raw.representativeUnitId ?? null,
  media: fromRawUnitMedia(raw),
});

const fromRawUnitLayout = (raw: any): UnitLayout => ({
  id: raw.id,
  projectId: raw.projectId,
  code: raw.code ?? "",
  rooms: Number(raw.rooms) || 0,
  area: raw.area == null ? null : Number(raw.area),
  image: raw.image ?? "",
  description: raw.description ?? "",
  unitCount: Number(raw.unitCount) || 0,
});

const fromRawPromotion = (raw: any): Promotion => ({
  id: raw.id,
  projectId: raw.projectId ?? null,
  code: raw.code ?? "",
  title: raw.title ?? "",
  badge: raw.badge ?? "",
  tone: raw.tone ?? "",
  text: raw.text ?? "",
  validUntil: raw.validUntil || null,
  kind: raw.kind ?? "none",
  value: money(raw.value),
  maxDiscount: moneyOrNull(raw.maxDiscount),
  isActive: raw.isActive !== false,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const realty = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${REALTY_API}${path}`, { ...options, headers: realtyHeaders(scope) });

export function catalogQuery(filters: CatalogFilters): string {
  const query = new URLSearchParams();
  for (const key of ["projectId", "rooms", "priceMin", "priceMax", "areaMin", "areaMax", "feature"] as const) {
    const value = filters[key];
    if (value != null) query.set(key, String(value));
  }
  if (filters.sort && filters.sort !== "popular") query.set("sort", filters.sort);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function getCatalogProjects(filters: CatalogFilters, scope?: RealtyScope, signal?: AbortSignal): Promise<CatalogProject[]> {
  const raw = await realty<unknown[]>(scope, `/projects/${catalogQuery(filters)}`, { signal });
  return (raw ?? []).map(fromRawCatalogProject);
}

export async function getCatalogProject(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<CatalogProject> {
  return fromRawCatalogProject(await realty(scope, `/projects/${id}/`, { signal }));
}

export type ProjectPatch = Partial<
  Pick<CatalogProject, "name" | "queue" | "className" | "address" | "district" | "stage" | "progress" | "finish" | "promo" | "badge" | "sellerInfo"> & {
    deadline: string | null;
    pricePerSqm: string;
    defaultReservationAmount: string | null;
  }
>;

export async function updateCatalogProject(id: number, patch: ProjectPatch, scope?: RealtyScope): Promise<CatalogProject> {
  return fromRawCatalogProject(await realty(scope, `/projects/${id}/`, { method: "PATCH", body: patch }));
}

export async function deleteCatalogProject(id: number, scope?: RealtyScope): Promise<void> {
  await realty(scope, `/projects/${id}/`, { method: "DELETE" });
}

export interface SectionInput {
  name: string;
  floors: number;
  startFloor: number;
  progress: number;
  deadline: string | null;
}

export async function createSection(projectId: number, input: SectionInput, scope?: RealtyScope): Promise<CatalogSection> {
  return fromRawSection(await realty(scope, `/projects/${projectId}/sections/`, { method: "POST", body: input }));
}

export async function updateSection(projectId: number, id: number, input: Partial<SectionInput>, scope?: RealtyScope): Promise<CatalogSection> {
  return fromRawSection(await realty(scope, `/projects/${projectId}/sections/${id}/`, { method: "PATCH", body: input }));
}

export async function deleteSection(projectId: number, id: number, scope?: RealtyScope): Promise<void> {
  await realty(scope, `/projects/${projectId}/sections/${id}/`, { method: "DELETE" });
}

export interface UnitLayoutInput {
  code: string;
  rooms: number;
  area: number | null;
  image: string;
  description: string;
}

export async function getUnitLayouts(projectId: number, scope?: RealtyScope, signal?: AbortSignal): Promise<UnitLayout[]> {
  const raw = await realty<unknown[]>(scope, `/projects/${projectId}/unit-layouts/`, { signal });
  return (raw ?? []).map(fromRawUnitLayout);
}

export async function createUnitLayout(projectId: number, input: UnitLayoutInput, scope?: RealtyScope): Promise<UnitLayout> {
  return fromRawUnitLayout(await realty(scope, `/projects/${projectId}/unit-layouts/`, { method: "POST", body: input }));
}

export async function updateUnitLayout(projectId: number, id: number, input: Partial<UnitLayoutInput>, scope?: RealtyScope): Promise<UnitLayout> {
  return fromRawUnitLayout(await realty(scope, `/projects/${projectId}/unit-layouts/${id}/`, { method: "PATCH", body: input }));
}

export async function deleteUnitLayout(projectId: number, id: number, scope?: RealtyScope): Promise<void> {
  await realty(scope, `/projects/${projectId}/unit-layouts/${id}/`, { method: "DELETE" });
}

export async function getCatalogLayouts(params: { projectId?: number | null; rooms?: number | null; sort?: string }, scope?: RealtyScope, signal?: AbortSignal): Promise<CatalogLayout[]> {
  const query = new URLSearchParams();
  if (params.projectId != null) query.set("projectId", String(params.projectId));
  if (params.rooms != null) query.set("rooms", String(params.rooms));
  if (params.sort) query.set("sort", params.sort);
  const qs = query.toString();
  const raw = await realty<unknown[]>(scope, `/layouts/${qs ? `?${qs}` : ""}`, { signal });
  return (raw ?? []).map(fromRawLayout);
}

export interface PromotionInput {
  code: string;
  title: string;
  projectId: number | null;
  kind: PromotionKind;
  value: string;
  maxDiscount: string | null;
  validUntil: string | null;
  badge: string;
  tone: PromotionTone;
  text: string;
}

/** Акции ЖК и общие (`projectId: null`); без `projectId` — все. */
export async function getPromotions(projectId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<Promotion[]> {
  const raw = await realty<unknown[]>(scope, `/promotions/${projectId != null ? `?projectId=${projectId}` : ""}`, { signal });
  return (raw ?? []).map(fromRawPromotion);
}

export async function createPromotion(input: PromotionInput, scope?: RealtyScope): Promise<Promotion> {
  return fromRawPromotion(await realty(scope, "/promotions/", { method: "POST", body: input }));
}

export async function updatePromotion(id: number, input: Partial<PromotionInput>, scope?: RealtyScope): Promise<Promotion> {
  return fromRawPromotion(await realty(scope, `/promotions/${id}/`, { method: "PATCH", body: input }));
}

export async function deletePromotion(id: number, scope?: RealtyScope): Promise<void> {
  await realty(scope, `/promotions/${id}/`, { method: "DELETE" });
}

/** Код акции: латиница, цифры, `_` и `-` (иначе бэк ответит 400). */
export const PROMOTION_CODE_RE = /^[a-z0-9_-]+$/;

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realtyCatalogKeys = {
  all: ["django", "realty", "catalog"] as const,
  projects: (scope: RealtyScope | undefined, filters: CatalogFilters) => [...realtyCatalogKeys.all, ...scopeKey(scope), "projects", filters] as const,
  project: (scope: RealtyScope | undefined, id: number) => [...realtyCatalogKeys.all, ...scopeKey(scope), "project", id] as const,
  unitLayouts: (scope: RealtyScope | undefined, projectId: number) => [...realtyCatalogKeys.all, ...scopeKey(scope), "unit-layouts", projectId] as const,
  layouts: (scope: RealtyScope | undefined, params: object) => [...realtyCatalogKeys.all, ...scopeKey(scope), "layouts", params] as const,
  promotions: (scope: RealtyScope | undefined, projectId: number | null) => [...realtyCatalogKeys.all, ...scopeKey(scope), "promotions", projectId] as const,
};
