import { apiRequest } from "./client";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";
import { DEFAULT_VERTICAL, type Vertical } from "../i18n/types";
import { isVertical } from "../i18n/glossary";

// ── Organization shape (mirrors OrganizationPayload rename='camel') ──────────

/** Patient registry scope — must match server PatientScope choices. */
export type PatientScope = "shared" | "per_branch";

/** Overlap policy — must match server AppointmentOverlapMode choices.
 *  forbid — пересечение приёмов запрещено; warn — разрешено после
 *  подтверждения (бэк отвечает 409 со списком конфликтов). */
export type AppointmentOverlapMode = "forbid" | "warn";

export interface DjangoOrganization {
  id: number;
  name: string;
  slug: string;
  status: string;
  patientScope: PatientScope;
  appointmentOverlapMode: AppointmentOverlapMode;
  /** Абсолютный URL логотипа организации; null — логотип не загружен.
   *  Контракт: MamaDoc/backend_ticket_organization_logo.md (реализовано бэком
   *  08.07.2026; в /auth/me и /auth/context поле относительное `/media/...`). */
  logoUrl: string | null;
  themeConfig?: Record<string, any> | null;
  /** Вертикаль бизнеса — определяет терминологию интерфейса
   *  («пациент» для клиники, «клиент» для салона красоты). Choices на бэке:
   *  MamaDoc/backend_ticket_organization_vertical.md. Отсутствующее или
   *  незнакомое значение нормализуется в DEFAULT_VERTICAL. */
  vertical: Vertical;
  bakaiTokenMasked: string;
  bakaiTokenSet: boolean;
  onlinePaymentEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Partial update payload for PATCH /organization/<id>/. */
export interface UpdateOrganizationPayload {
  name?: string;
  slug?: string;
  status?: string;
  patientScope?: PatientScope;
  appointmentOverlapMode?: AppointmentOverlapMode;
  themeConfig?: Record<string, any> | null;
  vertical?: Vertical;
  /** Write-only: пустая строка удаляет сохранённый токен. */
  bakaiOpenbankingToken?: string;
  onlinePaymentEnabled?: boolean;
}

// ── Branch shape (mirrors BranchPayload rename='camel') ──────────────────────

export interface DjangoBranch {
  id: number;
  organizationId: number;
  name: string;
  address: string;
  /** Contact phone numbers (a branch can have several). */
  phones: string[];
  /** Links to the branch page on map services ("" when not set). */
  twoGisUrl: string;
  yandexMapsUrl: string;
  googleMapsUrl: string;
  timezone: string;
  isActive: boolean;
  /** Абсолютный URL логотипа филиала; null — логотип не загружен.
   *  Контракт: MamaDoc/backend_tickets_2026-07-13/backend_ticket_branch_logo.md (зеркало логотипа
   *  организации; до реализации на бэке поле отсутствует в ответе). */
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

/** Форма филиала «с провода»: старый бэкенд отдаёт один `phone` строкой и не
 *  знает про ссылки карт. Нормализуем, чтобы интерфейс не падал, пока бэкенд
 *  с миграцией phones/карт не задеплоен. */
type DjangoBranchWire = Omit<
  DjangoBranch,
  "phones" | "twoGisUrl" | "yandexMapsUrl" | "googleMapsUrl" | "logoUrl"
> &
  Partial<
    Pick<
      DjangoBranch,
      "phones" | "twoGisUrl" | "yandexMapsUrl" | "googleMapsUrl" | "logoUrl"
    >
  > & {
    /** Устаревшее поле старого бэкенда. */
    phone?: string;
  };

function normalizeBranch(raw: DjangoBranchWire): DjangoBranch {
  const { phone, ...rest } = raw;
  return {
    ...rest,
    phones: raw.phones ?? (phone ? [phone] : []),
    twoGisUrl: raw.twoGisUrl ?? "",
    yandexMapsUrl: raw.yandexMapsUrl ?? "",
    googleMapsUrl: raw.googleMapsUrl ?? "",
    logoUrl: raw.logoUrl ?? null,
  };
}

/** Старый бэкенд не отдаёт logoUrl / appointmentOverlapMode — приводим
 *  отсутствующие поля к дефолтам (null / "forbid" = текущее поведение). */
type DjangoOrganizationWire = Omit<
  DjangoOrganization,
  "logoUrl" | "appointmentOverlapMode" | "themeConfig" | "vertical" | "bakaiTokenMasked" | "bakaiTokenSet" | "onlinePaymentEnabled"
> &
  Partial<Pick<DjangoOrganization, "logoUrl" | "appointmentOverlapMode" | "themeConfig" | "bakaiTokenMasked" | "bakaiTokenSet" | "onlinePaymentEnabled">> & {
    vertical?: string | null;
  };

function normalizeOrganization(raw: DjangoOrganizationWire): DjangoOrganization {
  return {
    ...raw,
    logoUrl: raw.logoUrl ?? null,
    appointmentOverlapMode: raw.appointmentOverlapMode ?? "forbid",
    themeConfig: raw.themeConfig ?? null,
    vertical: isVertical(raw.vertical) ? raw.vertical : DEFAULT_VERTICAL,
    bakaiTokenMasked: raw.bakaiTokenMasked ?? "",
    bakaiTokenSet: raw.bakaiTokenSet ?? false,
    onlinePaymentEnabled: raw.onlinePaymentEnabled ?? false,
  };
}

export function getOrganization(id: number): Promise<DjangoOrganization> {
  return apiRequest<DjangoOrganizationWire>(`/organization/${id}/`).then(
    normalizeOrganization,
  );
}

export function updateOrganization(
  id: number,
  payload: UpdateOrganizationPayload,
): Promise<DjangoOrganization> {
  return apiRequest<DjangoOrganizationWire>(`/organization/${id}/`, {
    method: "PATCH",
    body: payload,
  }).then(normalizeOrganization);
}

/**
 * PUT /organization/<id>/logo/ — загрузка/замена логотипа (multipart, поле
 * `logo`; ≤ 5 МБ, jpg/jpeg/png/webp/svg). Возвращает обновлённую организацию
 * с новым logoUrl. Право: organization.update.
 */
export async function uploadOrganizationLogo(
  id: number,
  file: File,
): Promise<DjangoOrganization> {
  const formData = new FormData();
  // keepAlpha — у логотипов прозрачный фон, jpeg залил бы его белым.
  // svg подготовка пропускает как есть (см. api/uploads.ts).
  formData.append("logo", await preparePhotoOrThrow(file, { keepAlpha: true }));
  const wire = await withUploadErrors(() =>
    apiRequest<DjangoOrganizationWire>(`/organization/${id}/logo/`, {
      method: "PUT",
      formData,
    }),
  );
  return normalizeOrganization(wire);
}

/** DELETE /organization/<id>/logo/ — удаление логотипа. Возвращает 204. */
export function deleteOrganizationLogo(id: number): Promise<void> {
  return apiRequest<void>(`/organization/${id}/logo/`, { method: "DELETE" });
}

/**
 * PUT /organization/branches/<id>/logo/ — загрузка/замена логотипа филиала
 * (multipart, поле `logo`; ≤ 5 МБ, jpg/jpeg/png/webp/svg). Возвращает
 * обновлённый филиал. Контракт: MamaDoc/backend_tickets_2026-07-13/backend_ticket_branch_logo.md.
 */
export async function uploadBranchLogo(id: number, file: File): Promise<DjangoBranch> {
  const formData = new FormData();
  formData.append("logo", await preparePhotoOrThrow(file, { keepAlpha: true }));
  const wire = await withUploadErrors(() =>
    apiRequest<DjangoBranchWire>(`/organization/branches/${id}/logo/`, {
      method: "PUT",
      formData,
    }),
  );
  return normalizeBranch(wire);
}

/** DELETE /organization/branches/<id>/logo/ — удаление логотипа филиала, 204. */
export function deleteBranchLogo(id: number): Promise<void> {
  return apiRequest<void>(`/organization/branches/${id}/logo/`, {
    method: "DELETE",
  });
}

/**
 * GET /organization/branches/ — справочник филиалов.
 *
 * Суперюзеру и мультиорг-пользователю бэкенд отдаёт филиалы ВСЕХ его
 * организаций, а параметра фильтрации у эндпоинта нет (проверено 10.08.2026:
 * при активной организации 1 в ответе приходит филиал организации 4,
 * `?organizationId=`/`?organization_id=` игнорируются). Поэтому режем список
 * на клиенте — иначе в выборе филиалов видны чужие клиники.
 */
export function getBranches(organizationId?: number | null): Promise<DjangoBranch[]> {
  return apiRequest<DjangoBranchWire[]>("/organization/branches/").then((branches) => {
    const list = branches.map(normalizeBranch);
    return organizationId == null
      ? list
      : list.filter((b) => b.organizationId === organizationId);
  });
}

/** Fields accepted when creating a branch. */
export interface CreateBranchPayload {
  name: string;
  /** Target organization. Required for multi-org superusers (otherwise the
   *  backend infers the wrong organization from the active membership). */
  organizationId?: number;
  address?: string;
  phones?: string[];
  twoGisUrl?: string;
  yandexMapsUrl?: string;
  googleMapsUrl?: string;
  timezone?: string;
  isActive?: boolean;
}

/** Partial update payload for PATCH /organization/branches/<id>/. */
export interface UpdateBranchPayload {
  name?: string;
  address?: string;
  phones?: string[];
  twoGisUrl?: string;
  yandexMapsUrl?: string;
  googleMapsUrl?: string;
  timezone?: string;
  isActive?: boolean;
}

/** POST /organization/branches/ — create a branch in the target organization. */
export function createBranch(payload: CreateBranchPayload): Promise<DjangoBranch> {
  return apiRequest<DjangoBranchWire>("/organization/branches/", {
    method: "POST",
    body: payload,
  }).then(normalizeBranch);
}

/** PATCH /organization/branches/<id>/ — update a branch (only sent fields). */
export function updateBranch(
  id: number,
  payload: UpdateBranchPayload,
): Promise<DjangoBranch> {
  return apiRequest<DjangoBranchWire>(`/organization/branches/${id}/`, {
    method: "PATCH",
    body: payload,
  }).then(normalizeBranch);
}

/**
 * Soft-delete (archive) an organization regardless of related data.
 * Backend marks status=archived; nothing is physically removed. Returns 204.
 */
export function deleteOrganization(id: number): Promise<void> {
  return apiRequest<void>(`/organization/${id}/`, { method: "DELETE" });
}

/**
 * Soft-delete (deactivate) a branch regardless of related data.
 * Backend marks is_active=false; nothing is physically removed. Returns 204.
 */
export function deleteBranch(id: number): Promise<void> {
  return apiRequest<void>(`/organization/branches/${id}/`, {
    method: "DELETE",
  });
}
