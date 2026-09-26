import { apiRequest } from "./client";
import { type Scope, scopeParams } from "./scope";

/** Печатные формы организации (`/api/v2/printforms/`): бланки, ценники, чеки. */

export type PrintTemplateKind = "price_tag" | "receipt" | "invoice" | "blank";

export interface PrintTemplate {
  id: number;
  organizationId: number;
  name: string;
  kind: PrintTemplateKind;
  pageSize: string;
  orientation: string;
  fields: unknown[];
  background: Record<string, unknown>;
  /** Текст бланка с подстановками `{child.fullName}`; пусто — печать таблицей полей. */
  body: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrintTemplateCreate {
  name: string;
  kind: PrintTemplateKind;
  body?: string;
}

export interface PrintTemplateUpdate {
  name?: string;
  body?: string;
  isActive?: boolean;
}

function scoped(path: string, scope: Scope): string {
  const query = scopeParams(scope).toString();
  return query ? `${path}?${query}` : path;
}

export function listPrintTemplates(
  scope: Scope,
  kind: PrintTemplateKind,
  signal?: AbortSignal,
): Promise<PrintTemplate[]> {
  const query = scopeParams(scope);
  query.set("kind", kind);
  return apiRequest<PrintTemplate[]>(`/v2/printforms/templates/?${query.toString()}`, { signal });
}

export function createPrintTemplate(scope: Scope, payload: PrintTemplateCreate): Promise<PrintTemplate> {
  return apiRequest<PrintTemplate>(scoped("/v2/printforms/templates/", scope), { method: "POST", body: payload });
}

export function updatePrintTemplate(scope: Scope, id: number, payload: PrintTemplateUpdate): Promise<PrintTemplate> {
  return apiRequest<PrintTemplate>(scoped(`/v2/printforms/templates/${id}/`, scope), {
    method: "PATCH",
    body: payload,
  });
}
