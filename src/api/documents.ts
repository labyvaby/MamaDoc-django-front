import { apiRequest } from "./client";
import { mockDelay, paginate, withOrg } from "./mockUtils";

/**
 * Модуль «Документы организации» — плоское файловое хранилище уровня
 * организации (уставные документы, лицензии, договоры).
 *
 * Контракт: MamaDoc/backend_tickets_2026-07-13/backend_ticket_documents_module.md — НЕ менять без
 * согласования с бэкенд-командой. Бэкенд ещё не реализован — модуль работает
 * на моках (DOCUMENTS_USE_MOCKS = true); после деплоя бэка выключить флаг и
 * вернуть can-гейты (сайдбар, App.tsx), как делали с tasks/achievements.
 */

export const DOCUMENTS_USE_MOCKS = true;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrganizationDocument {
  id: number;
  /** Отображаемое имя (по умолчанию — имя файла). */
  name: string;
  fileUrl: string;
  /** Размер файла в байтах. */
  fileSize: number;
  /** null — общий документ организации, иначе привязан к филиалу. */
  branchId: number | null;
  branchName: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface DocumentsResponse {
  results: OrganizationDocument[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface DocumentsFilters {
  search?: string;
  /** id филиала или "null" — только общие документы. */
  branch?: number | "null";
  page?: number;
  pageSize?: number;
  /** Обязателен для суперпользователя/мультиорг (см. withOrg в api/tasks.ts). */
  organizationId?: number;
}

// Валидации зеркалят тикет: бэк — источник правды, фронт проверяет до отправки.
export const DOCUMENT_ALLOWED_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "doc", "docx", "xls", "xlsx",
]);
export const DOCUMENT_MAX_SIZE_MB = 25;

// ── Mocks ─────────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

let mockSeq = 100;

/**
 * Мини-PDF одной страницей для демо-предпросмотра (латиница — без встраивания
 * шрифтов). Относительные заглушки вида "#mock" не годятся: iframe
 * предпросмотра загружал бы по ним само приложение (рекурсивно).
 */
const MOCK_PDF_URL = `data:application/pdf;base64,${btoa(
  [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200]",
    "  /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "4 0 obj << /Length 55 >> stream",
    "BT /F1 16 Tf 30 120 Td (MamaDoc - demo document) Tj ET",
    "endstream endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "trailer << /Size 6 /Root 1 0 R >>",
    "%%EOF",
  ].join("\n"),
)}`;

/** Заглушка для непревьюируемых типов (docx и т.п.) — скачивается файликом. */
const MOCK_FILE_URL = `data:application/octet-stream;base64,${btoa("MamaDoc demo file")}`;

const mockDocs: OrganizationDocument[] = [
  {
    id: 1,
    name: "Устав организации.pdf",
    fileUrl: MOCK_PDF_URL,
    fileSize: 1_240_000,
    branchId: null,
    branchName: null,
    uploadedByName: "Шаршебаев Автандил",
    createdAt: "2026-07-01T10:15:00Z",
  },
  {
    id: 2,
    name: "Лицензия на мед. деятельность.pdf",
    fileUrl: MOCK_PDF_URL,
    fileSize: 860_000,
    branchId: null,
    branchName: null,
    uploadedByName: "Шаршебаев Автандил",
    createdAt: "2026-07-03T09:00:00Z",
  },
  {
    id: 3,
    name: "Договор аренды (Сейтек 9-10).docx",
    fileUrl: MOCK_FILE_URL,
    fileSize: 145_000,
    branchId: 2,
    branchName: "Мама Доктор Плюс",
    uploadedByName: "Шаршебаев Автандил",
    createdAt: "2026-07-10T14:30:00Z",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildParams(filters: DocumentsFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (filters.search) q.set("search", filters.search);
  if (filters.branch != null) q.set("branch", String(filters.branch));
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  return q;
}

// ── API ───────────────────────────────────────────────────────────────────────

export function getDocuments(
  filters: DocumentsFilters = {},
  signal?: AbortSignal,
): Promise<DocumentsResponse> {
  if (DOCUMENTS_USE_MOCKS) {
    let list = [...mockDocs];
    if (filters.search) {
      const s = filters.search.toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(s));
    }
    if (filters.branch === "null") list = list.filter((d) => d.branchId === null);
    else if (filters.branch != null) list = list.filter((d) => d.branchId === filters.branch);
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return mockDelay(paginate(list, filters.page, filters.pageSize));
  }
  const q = buildParams(filters);
  return apiRequest<DocumentsResponse>(`/documents/?${q.toString()}`, { signal });
}

export interface UploadDocumentPayload {
  file: File;
  /** Отображаемое имя; по умолчанию бэк берёт имя файла. */
  name?: string;
  /** null/undefined — общий документ. */
  branchId?: number | null;
  organizationId?: number;
}

export function uploadDocument(payload: UploadDocumentPayload): Promise<OrganizationDocument> {
  if (DOCUMENTS_USE_MOCKS) {
    const doc: OrganizationDocument = {
      id: ++mockSeq,
      name: payload.name?.trim() || payload.file.name,
      fileUrl: URL.createObjectURL(payload.file),
      fileSize: payload.file.size,
      branchId: payload.branchId ?? null,
      branchName: payload.branchId != null ? `Филиал #${payload.branchId}` : null,
      uploadedByName: "Вы (мок)",
      createdAt: nowIso(),
    };
    mockDocs.unshift(doc);
    return mockDelay(doc);
  }
  const formData = new FormData();
  formData.append("file", payload.file);
  if (payload.name?.trim()) formData.append("name", payload.name.trim());
  if (payload.branchId != null) formData.append("branchId", String(payload.branchId));
  return apiRequest<OrganizationDocument>(withOrg("/documents/", payload.organizationId), {
    method: "POST",
    formData,
  });
}

export function renameDocument(
  documentId: number,
  name: string,
  organizationId?: number,
): Promise<OrganizationDocument> {
  if (DOCUMENTS_USE_MOCKS) {
    const doc = mockDocs.find((d) => d.id === documentId);
    if (!doc) return Promise.reject(new Error("Документ не найден (мок)"));
    doc.name = name;
    return mockDelay({ ...doc });
  }
  return apiRequest<OrganizationDocument>(withOrg(`/documents/${documentId}/`, organizationId), {
    method: "PATCH",
    body: { name },
  });
}

export function deleteDocument(documentId: number, organizationId?: number): Promise<void> {
  if (DOCUMENTS_USE_MOCKS) {
    const idx = mockDocs.findIndex((d) => d.id === documentId);
    if (idx >= 0) mockDocs.splice(idx, 1);
    return mockDelay(undefined);
  }
  return apiRequest<void>(withOrg(`/documents/${documentId}/`, organizationId), {
    method: "DELETE",
  });
}
