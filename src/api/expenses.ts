import { apiRequest } from "./client";
export { parseBackendError } from "./appointments";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ExpenseMethod = "cash" | "card" | "mixed";
export type ExpenseCategoryKind = "general" | "advance" | "salary";

export interface ExpenseCategory {
  id: number;
  organizationId: number;
  name: string;
  kind: ExpenseCategoryKind;
  isActive: boolean;
}

export interface Expense {
  id: number;
  name: string;
  branchId: number | null;
  branchName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryKind: ExpenseCategoryKind;
  method: ExpenseMethod;
  cashAmount: string;
  cardAmount: string;
  amount: string;
  expenseDate: string;
  description: string;
  employeeId: number | null;
  employeeName: string | null;
  affectsMonth: string | null;
  photoUrl: string | null;
  isVoided: boolean;
  voidedById: number | null;
  voidedAt: string | null;
  voidReason: string;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ExpensesResponse {
  results: Expense[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface ExpenseCategoriesResponse {
  results: ExpenseCategory[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface CreateCategoryPayload {
  organizationId?: number;
  name: string;
  kind?: ExpenseCategoryKind;
  isActive?: boolean;
}

export interface CreateExpensePayload {
  organizationId?: number;
  branchId?: number;
  categoryId: number;
  name: string;
  cashAmount?: number | string;
  cardAmount?: number | string;
  expenseDate: string;
  description?: string;
  employeeId?: number | null;
}

export interface VoidExpensePayload {
  reason: string;
}

export interface ExpensesFilters {
  organizationId?: number;
  branchId?: number;
  categoryId?: number;
  method?: ExpenseMethod;
  dateFrom?: string;
  dateTo?: string;
  isVoided?: boolean;
  page?: number;
  pageSize?: number;
}

export interface UpdateCategoryKindPayload {
  kind: ExpenseCategoryKind;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildExpenseParams(filters: ExpensesFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.categoryId != null) q.set("categoryId", String(filters.categoryId));
  if (filters.method) q.set("method", filters.method);  // still supported for cashbox filter
  if (filters.dateFrom) q.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) q.set("dateTo", filters.dateTo);
  if (filters.isVoided != null) q.set("isVoided", String(filters.isVoided));
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  return q;
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function getExpenseCategories(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<ExpenseCategory[]> {
  const q = new URLSearchParams();
  if (organizationId != null) q.set("organizationId", String(organizationId));
  const qs = q.toString();
  const data = await apiRequest<ExpenseCategoriesResponse | ExpenseCategory[]>(
    `/finance/expense-categories/${qs ? `?${qs}` : ""}`,
    { signal },
  );
  // Handle both paginated {results:[]} and plain array responses
  return Array.isArray(data) ? data : data.results;
}

export function createExpenseCategory(
  payload: CreateCategoryPayload,
): Promise<ExpenseCategory> {
  return apiRequest<ExpenseCategory>("/finance/expense-categories/", {
    method: "POST",
    body: payload,
  });
}

export function getExpenseCategoriesPage(
  filters: { organizationId?: number; isActive?: boolean; page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<ExpenseCategoriesResponse> {
  const q = new URLSearchParams();
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  if (filters.isActive != null) q.set("isActive", String(filters.isActive));
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  const qs = q.toString();
  return apiRequest<ExpenseCategoriesResponse>(
    `/finance/expense-categories/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

export function getExpenses(
  filters: ExpensesFilters = {},
  signal?: AbortSignal,
): Promise<ExpensesResponse> {
  const q = buildExpenseParams(filters);
  return apiRequest<ExpensesResponse>(`/finance/expenses/?${q.toString()}`, { signal });
}

export function createExpense(payload: CreateExpensePayload): Promise<Expense> {
  return apiRequest<Expense>("/finance/expenses/", {
    method: "POST",
    body: payload,
  });
}

export function voidExpense(expenseId: number, payload: VoidExpensePayload): Promise<Expense> {
  return apiRequest<Expense>(`/finance/expenses/${expenseId}/void/`, {
    method: "POST",
    body: payload,
  });
}

export function uploadExpensePhoto(expenseId: number, file: File): Promise<Expense> {
  const formData = new FormData();
  formData.append("photo", file);
  return apiRequest<Expense>(`/finance/expenses/${expenseId}/photo/`, {
    method: "PUT",
    formData,
  });
}
