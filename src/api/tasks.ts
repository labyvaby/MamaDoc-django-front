import { apiRequest } from "./client";

/**
 * Модуль внутренних заявок/задач.
 *
 * Контракт: MamaDoc/backend_ticket_tasks_module.md — НЕ менять без согласования
 * с бэкенд-командой. Пока бэкенд не готов, модуль работает на in-memory моках
 * (TASKS_USE_MOCKS = true). После готовности бэка: выставить флаг в false —
 * сигнатуры функций совпадают с контрактом один в один.
 */

// Переключить в false, когда бэкенд реализует app `tasks`.
export const TASKS_USE_MOCKS = true;

// ── Types ──────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "new"
  | "in_progress"
  | "paused"
  | "awaiting_approval"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type TaskSource = "manual" | "recurring" | "auto_stock";

export interface TaskCategory {
  id: number;
  name: string;
  /** RBAC-роли, которым видна категория (nurse, receptionist...). */
  assignedRoles: string[];
  defaultPriority: TaskPriority;
  isActive: boolean;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  categoryName: string;
  authorId: number;
  authorName: string;
  assigneeId: number | null;
  assigneeName: string | null;
  priority: TaskPriority;
  dueDate: string | null; // YYYY-MM-DD
  status: TaskStatus;
  source: TaskSource;
  approvedById: number | null;
  approvedByName: string | null;
  /** Автор поблагодарил исполнителя (после done). */
  thankedByAuthor: boolean;
  commentsCount: number;
  attachmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: number;
  taskId: number;
  authorId: number;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface TaskAttachment {
  id: number;
  taskId: number;
  commentId: number | null;
  fileUrl: string;
  fileName: string;
  uploadedById: number;
  uploadedByName: string;
  createdAt: string;
}

export interface TaskStatusLogEntry {
  id: number;
  taskId: number;
  actorId: number;
  actorName: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  reason: string;
  createdAt: string;
}

export interface TaskDetail extends Task {
  comments: TaskComment[];
  attachments: TaskAttachment[];
  statusLog: TaskStatusLogEntry[];
}

export interface TasksResponse {
  results: Task[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface TasksFilters {
  status?: TaskStatus;
  categoryId?: number;
  priority?: TaskPriority;
  /** "me" — задачи, назначенные на текущего сотрудника. */
  assignee?: "me";
  /** "me" — заявки, созданные текущим сотрудником. */
  author?: "me";
  search?: string;
  /** Диапазон по сроку (YYYY-MM-DD, включительно). Контракт v2. */
  dueFrom?: string;
  dueTo?: string;
  /** Диапазон по дате подачи (YYYY-MM-DD, включительно). Контракт v2, P2. */
  createdFrom?: string;
  createdTo?: string;
  /** "smart" — просроченные → приоритет → срок → дата создания (дефолт списков). */
  ordering?: "smart" | "created";
  page?: number;
  pageSize?: number;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  categoryId: number;
  /** Опционально: адресовать конкретному сотруднику (решение Рика 07.07.2026). */
  assigneeId?: number | null;
  dueDate?: string | null;
  /** Только для tasks.manage; иначе бэкенд берёт defaultPriority категории. */
  priority?: TaskPriority;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  categoryId?: number;
  assigneeId?: number | null;
  dueDate?: string | null;
  priority?: TaskPriority;
}

export interface ReasonPayload {
  reason: string;
}

// ── Mock store ─────────────────────────────────────────────────────────────────

/** Текущий сотрудник в моках. Бэкенд определяет «me» по сессии. */
const MOCK_ME = { id: 101, name: "Вы (текущий сотрудник)" };

/** Для UI в мок-режиме: подставной id «меня» (см. TODO при интеграции). */
export const TASKS_MOCK_EMPLOYEE_ID = MOCK_ME.id;

const mockCategories: TaskCategory[] = [
  { id: 1, name: "Расходники", assignedRoles: ["nurse"], defaultPriority: "normal", isActive: true },
  { id: 2, name: "Хозяйственные", assignedRoles: ["manager"], defaultPriority: "normal", isActive: true },
  { id: 3, name: "Оборудование", assignedRoles: ["manager", "admin"], defaultPriority: "high", isActive: true },
  { id: 4, name: "IT / CRM", assignedRoles: ["admin"], defaultPriority: "normal", isActive: true },
];

let mockTaskSeq = 1000;
let mockCommentSeq = 5000;
let mockLogSeq = 9000;
let mockAttachmentSeq = 20000;

const nowIso = () => new Date().toISOString();
const daysFromNow = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
};

interface MockTaskRecord extends Task {
  comments: TaskComment[];
  attachments: TaskAttachment[];
  statusLog: TaskStatusLogEntry[];
}

function seedTask(
  partial: Partial<MockTaskRecord> & Pick<Task, "title" | "categoryId" | "status">,
): MockTaskRecord {
  const id = ++mockTaskSeq;
  const cat = mockCategories.find((c) => c.id === partial.categoryId)!;
  return {
    id,
    title: partial.title,
    description: partial.description ?? "",
    categoryId: cat.id,
    categoryName: cat.name,
    authorId: partial.authorId ?? 102,
    authorName: partial.authorName ?? "Айгерим С. (регистратор)",
    assigneeId: partial.assigneeId ?? null,
    assigneeName: partial.assigneeName ?? null,
    priority: partial.priority ?? cat.defaultPriority,
    dueDate: partial.dueDate ?? null,
    status: partial.status,
    source: partial.source ?? "manual",
    approvedById: null,
    approvedByName: null,
    thankedByAuthor: partial.thankedByAuthor ?? false,
    commentsCount: partial.comments?.length ?? 0,
    attachmentsCount: partial.attachments?.length ?? 0,
    createdAt: partial.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    comments: partial.comments ?? [],
    attachments: partial.attachments ?? [],
    statusLog: partial.statusLog ?? [],
  };
}

const mockTasks: MockTaskRecord[] = [
  seedTask({
    title: "Пополнить шприцы 5 мл в процедурном",
    description: "Осталось меньше одной упаковки, нужны к четвергу.",
    categoryId: 1,
    status: "new",
    dueDate: daysFromNow(2),
    priority: "high",
  }),
  seedTask({
    title: "Заменить лампу в кабинете №3",
    categoryId: 2,
    status: "in_progress",
    assigneeId: MOCK_ME.id,
    assigneeName: MOCK_ME.name,
    dueDate: daysFromNow(1),
    comments: [
      {
        id: ++mockCommentSeq,
        taskId: 0,
        authorId: 102,
        authorName: "Айгерим С. (регистратор)",
        text: "Лампа мигает с утра, пациенты жалуются.",
        createdAt: nowIso(),
      },
    ],
  }),
  seedTask({
    title: "Ежемесячная поверка тонометров",
    categoryId: 3,
    status: "new",
    source: "recurring",
    dueDate: daysFromNow(5),
  }),
  seedTask({
    title: "Пополнить перчатки M (осталось 40 шт)",
    categoryId: 1,
    status: "awaiting_approval",
    source: "auto_stock",
    assigneeId: 103,
    assigneeName: "Динара К. (медсестра)",
  }),
  seedTask({
    title: "Настроить принтер на ресепшене",
    categoryId: 4,
    status: "done",
    authorId: MOCK_ME.id,
    authorName: MOCK_ME.name,
    assigneeId: 104,
    assigneeName: "Тимур А. (админ)",
    dueDate: daysFromNow(-3),
  }),
  seedTask({
    title: "Заказать воду в зал ожидания",
    categoryId: 2,
    status: "paused",
    authorId: MOCK_ME.id,
    authorName: MOCK_ME.name,
    assigneeId: 105,
    assigneeName: "Бакыт Ж. (завхоз)",
    dueDate: daysFromNow(0),
  }),
];

const mockDelay = <T,>(value: T, ms = 300): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

function mockFind(taskId: number): MockTaskRecord {
  const t = mockTasks.find((x) => x.id === taskId);
  if (!t) throw new Error("Задача не найдена");
  return t;
}

function mockLog(t: MockTaskRecord, toStatus: TaskStatus, reason = "") {
  t.statusLog.push({
    id: ++mockLogSeq,
    taskId: t.id,
    actorId: MOCK_ME.id,
    actorName: MOCK_ME.name,
    fromStatus: t.status,
    toStatus,
    reason,
    createdAt: nowIso(),
  });
  t.status = toStatus;
  t.updatedAt = nowIso();
}

function toTask(r: MockTaskRecord): Task {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { comments, attachments, statusLog, ...task } = r;
  return {
    ...task,
    commentsCount: comments.length,
    attachmentsCount: attachments.length,
  };
}

// ── API: список / деталь ───────────────────────────────────────────────────────

function buildTaskParams(filters: TasksFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (filters.status) q.set("status", filters.status);
  if (filters.categoryId != null) q.set("categoryId", String(filters.categoryId));
  if (filters.priority) q.set("priority", filters.priority);
  if (filters.assignee) q.set("assignee", filters.assignee);
  if (filters.author) q.set("author", filters.author);
  if (filters.search) q.set("search", filters.search);
  if (filters.dueFrom) q.set("dueFrom", filters.dueFrom);
  if (filters.dueTo) q.set("dueTo", filters.dueTo);
  if (filters.createdFrom) q.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) q.set("createdTo", filters.createdTo);
  if (filters.ordering) q.set("ordering", filters.ordering);
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  return q;
}

export function getTasks(
  filters: TasksFilters = {},
  signal?: AbortSignal,
): Promise<TasksResponse> {
  if (TASKS_USE_MOCKS) {
    let list = mockTasks.map(toTask);
    if (filters.status) list = list.filter((t) => t.status === filters.status);
    if (filters.categoryId != null) list = list.filter((t) => t.categoryId === filters.categoryId);
    if (filters.priority) list = list.filter((t) => t.priority === filters.priority);
    if (filters.assignee === "me") list = list.filter((t) => t.assigneeId === MOCK_ME.id);
    if (filters.author === "me") list = list.filter((t) => t.authorId === MOCK_ME.id);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(s));
    }
    // Диапазоны включительны; задачи без due_date под due-фильтр не попадают.
    if (filters.dueFrom) list = list.filter((t) => t.dueDate != null && t.dueDate >= filters.dueFrom!);
    if (filters.dueTo) list = list.filter((t) => t.dueDate != null && t.dueDate <= filters.dueTo!);
    if (filters.createdFrom) list = list.filter((t) => t.createdAt.slice(0, 10) >= filters.createdFrom!);
    if (filters.createdTo) list = list.filter((t) => t.createdAt.slice(0, 10) <= filters.createdTo!);
    if (filters.ordering === "created") {
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } else {
      // smart: просроченные → вес приоритета → ближайший срок → новизна
      const today = new Date().toISOString().slice(0, 10);
      const open = (t: Task) => t.status !== "done" && t.status !== "cancelled";
      const overdue = (t: Task) => (open(t) && t.dueDate != null && t.dueDate < today ? 1 : 0);
      const weight: Record<TaskPriority, number> = { urgent: 3, high: 2, normal: 1, low: 0 };
      list.sort(
        (a, b) =>
          overdue(b) - overdue(a) ||
          weight[b.priority] - weight[a.priority] ||
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
          b.createdAt.localeCompare(a.createdAt),
      );
    }
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return mockDelay({
      results: list.slice(start, start + pageSize),
      count: list.length,
      next: start + pageSize < list.length ? "mock" : null,
      previous: page > 1 ? "mock" : null,
    });
  }
  const q = buildTaskParams(filters);
  return apiRequest<TasksResponse>(`/tasks/?${q.toString()}`, { signal });
}

export function getTask(taskId: number, signal?: AbortSignal): Promise<TaskDetail> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    return mockDelay({
      ...toTask(r),
      comments: r.comments,
      attachments: r.attachments,
      statusLog: r.statusLog,
    });
  }
  return apiRequest<TaskDetail>(`/tasks/${taskId}/`, { signal });
}

export function createTask(payload: CreateTaskPayload): Promise<Task> {
  if (TASKS_USE_MOCKS) {
    const cat = mockCategories.find((c) => c.id === payload.categoryId);
    if (!cat) return Promise.reject(new Error("Категория не найдена"));
    const rec = seedTask({
      title: payload.title,
      description: payload.description ?? "",
      categoryId: payload.categoryId,
      status: "new",
      authorId: MOCK_ME.id,
      authorName: MOCK_ME.name,
      assigneeId: payload.assigneeId ?? null,
      assigneeName: payload.assigneeId ? `Сотрудник #${payload.assigneeId}` : null,
      dueDate: payload.dueDate ?? null,
      priority: payload.priority ?? cat.defaultPriority,
    });
    mockTasks.unshift(rec);
    return mockDelay(toTask(rec));
  }
  return apiRequest<Task>("/tasks/", { method: "POST", body: payload });
}

export function updateTask(taskId: number, payload: UpdateTaskPayload): Promise<Task> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    Object.assign(r, payload, { updatedAt: nowIso() });
    return mockDelay(toTask(r));
  }
  return apiRequest<Task>(`/tasks/${taskId}/`, { method: "PATCH", body: payload });
}

// ── API: действия со статусами ─────────────────────────────────────────────────

export function takeTask(taskId: number): Promise<Task> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    r.assigneeId = MOCK_ME.id;
    r.assigneeName = MOCK_ME.name;
    mockLog(r, "in_progress");
    return mockDelay(toTask(r));
  }
  return apiRequest<Task>(`/tasks/${taskId}/take/`, { method: "POST" });
}

export function pauseTask(taskId: number, payload: ReasonPayload): Promise<Task> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    mockLog(r, "paused", payload.reason);
    return mockDelay(toTask(r));
  }
  return apiRequest<Task>(`/tasks/${taskId}/pause/`, { method: "POST", body: payload });
}

/**
 * Исполнить. Бэкенд: assignee → awaiting_approval; обладатель tasks.manage →
 * сразу done (решение Рика 07.07.2026). В моках — всегда awaiting_approval.
 */
export function completeTask(taskId: number): Promise<Task> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    mockLog(r, "awaiting_approval");
    return mockDelay(toTask(r));
  }
  return apiRequest<Task>(`/tasks/${taskId}/complete/`, { method: "POST" });
}

/** Подтвердить исполнение (только tasks.manage). */
export function approveTask(taskId: number): Promise<Task> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    r.approvedById = MOCK_ME.id;
    r.approvedByName = MOCK_ME.name;
    mockLog(r, "done");
    return mockDelay(toTask(r));
  }
  return apiRequest<Task>(`/tasks/${taskId}/approve/`, { method: "POST" });
}

/** Вернуть в работу с приёмки (только tasks.manage). */
export function rejectTask(taskId: number, payload: ReasonPayload): Promise<Task> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    mockLog(r, "in_progress", payload.reason);
    return mockDelay(toTask(r));
  }
  return apiRequest<Task>(`/tasks/${taskId}/reject/`, { method: "POST", body: payload });
}

export function cancelTask(taskId: number, payload: ReasonPayload): Promise<Task> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    mockLog(r, "cancelled", payload.reason);
    return mockDelay(toTask(r));
  }
  return apiRequest<Task>(`/tasks/${taskId}/cancel/`, { method: "POST", body: payload });
}

// ── API: комментарии и вложения ────────────────────────────────────────────────

export function addTaskComment(taskId: number, text: string): Promise<TaskComment> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    const comment: TaskComment = {
      id: ++mockCommentSeq,
      taskId,
      authorId: MOCK_ME.id,
      authorName: MOCK_ME.name,
      text,
      createdAt: nowIso(),
    };
    r.comments.push(comment);
    r.updatedAt = nowIso();
    return mockDelay(comment);
  }
  return apiRequest<TaskComment>(`/tasks/${taskId}/comments/`, {
    method: "POST",
    body: { text },
  });
}

export function uploadTaskAttachment(
  taskId: number,
  file: File,
  commentId?: number,
): Promise<TaskAttachment> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    const attachment: TaskAttachment = {
      id: ++mockAttachmentSeq,
      taskId,
      commentId: commentId ?? null,
      fileUrl: URL.createObjectURL(file),
      fileName: file.name,
      uploadedById: MOCK_ME.id,
      uploadedByName: MOCK_ME.name,
      createdAt: nowIso(),
    };
    r.attachments.push(attachment);
    return mockDelay(attachment);
  }
  const formData = new FormData();
  formData.append("file", file);
  if (commentId != null) formData.append("commentId", String(commentId));
  return apiRequest<TaskAttachment>(`/tasks/${taskId}/attachments/`, {
    method: "POST",
    formData,
  });
}

// ── API: категории (справочник) ────────────────────────────────────────────────

export function getTaskCategories(signal?: AbortSignal): Promise<TaskCategory[]> {
  if (TASKS_USE_MOCKS) {
    return mockDelay(mockCategories.filter((c) => c.isActive));
  }
  return apiRequest<{ results: TaskCategory[] } | TaskCategory[]>(
    "/tasks/categories/",
    { signal },
  ).then((data) => (Array.isArray(data) ? data : data.results));
}

/** Все категории, включая неактивные — для админ-настроек (tasks.manage). */
export function getAllTaskCategories(signal?: AbortSignal): Promise<TaskCategory[]> {
  if (TASKS_USE_MOCKS) {
    return mockDelay(mockCategories);
  }
  return apiRequest<{ results: TaskCategory[] } | TaskCategory[]>(
    "/tasks/categories/?includeInactive=true",
    { signal },
  ).then((data) => (Array.isArray(data) ? data : data.results));
}

export interface CreateTaskCategoryPayload {
  name: string;
  assignedRoles: string[];
  defaultPriority?: TaskPriority;
}

export interface UpdateTaskCategoryPayload {
  name?: string;
  assignedRoles?: string[];
  defaultPriority?: TaskPriority;
  isActive?: boolean;
}

let mockCategorySeq = 100;

export function createTaskCategory(payload: CreateTaskCategoryPayload): Promise<TaskCategory> {
  if (TASKS_USE_MOCKS) {
    const category: TaskCategory = {
      id: ++mockCategorySeq,
      name: payload.name,
      assignedRoles: payload.assignedRoles,
      defaultPriority: payload.defaultPriority ?? "normal",
      isActive: true,
    };
    mockCategories.push(category);
    return mockDelay(category);
  }
  return apiRequest<TaskCategory>("/tasks/categories/", { method: "POST", body: payload });
}

export function updateTaskCategory(
  categoryId: number,
  payload: UpdateTaskCategoryPayload,
): Promise<TaskCategory> {
  if (TASKS_USE_MOCKS) {
    const category = mockCategories.find((c) => c.id === categoryId);
    if (!category) return Promise.reject(new Error("Категория не найдена"));
    Object.assign(category, payload);
    return mockDelay(category);
  }
  return apiRequest<TaskCategory>(`/tasks/categories/${categoryId}/`, {
    method: "PATCH",
    body: payload,
  });
}

// ── API: правила повторения ────────────────────────────────────────────────────

/**
 * Форма интервала — предложение фронта (см. «Открытые вопросы» тикета):
 * daily — каждый день; weekly — раз в неделю (dayOfWeek 1–7, пн=1);
 * monthly — раз в месяц (dayOfMonth 1–28).
 */
export type RecurringInterval = "daily" | "weekly" | "monthly";

export interface RecurringTaskRule {
  id: number;
  title: string;
  description: string;
  categoryId: number;
  categoryName: string;
  priority: TaskPriority;
  interval: RecurringInterval;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  nextRun: string; // YYYY-MM-DD
  isActive: boolean;
  createdByName: string;
}

export interface CreateRecurringRulePayload {
  title: string;
  description?: string;
  categoryId: number;
  priority?: TaskPriority;
  interval: RecurringInterval;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
}

export interface UpdateRecurringRulePayload {
  title?: string;
  description?: string;
  categoryId?: number;
  priority?: TaskPriority;
  interval?: RecurringInterval;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  isActive?: boolean;
}

let mockRuleSeq = 300;

function ruleNextRun(interval: RecurringInterval, dayOfWeek?: number | null, dayOfMonth?: number | null): string {
  const d = new Date();
  if (interval === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (interval === "weekly") {
    const target = dayOfWeek ?? 1;
    const current = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() + (((target - current + 7) % 7) || 7));
  } else {
    const target = dayOfMonth ?? 1;
    if (d.getDate() >= target) d.setMonth(d.getMonth() + 1);
    d.setDate(target);
  }
  return d.toISOString().slice(0, 10);
}

const mockRules: RecurringTaskRule[] = [
  {
    id: ++mockRuleSeq,
    title: "Ежемесячная поверка тонометров",
    description: "Проверить все тонометры в кабинетах, результат — комментарием.",
    categoryId: 3,
    categoryName: "Оборудование",
    priority: "high",
    interval: "monthly",
    dayOfWeek: null,
    dayOfMonth: 1,
    nextRun: ruleNextRun("monthly", null, 1),
    isActive: true,
    createdByName: "Тимур А. (админ)",
  },
  {
    id: ++mockRuleSeq,
    title: "Проверка запаса расходников в процедурном",
    description: "",
    categoryId: 1,
    categoryName: "Расходники",
    priority: "normal",
    interval: "weekly",
    dayOfWeek: 1,
    dayOfMonth: null,
    nextRun: ruleNextRun("weekly", 1, null),
    isActive: true,
    createdByName: "Тимур А. (админ)",
  },
];

export function getRecurringRules(signal?: AbortSignal): Promise<RecurringTaskRule[]> {
  if (TASKS_USE_MOCKS) {
    return mockDelay(mockRules);
  }
  return apiRequest<{ results: RecurringTaskRule[] } | RecurringTaskRule[]>(
    "/tasks/recurring-rules/",
    { signal },
  ).then((data) => (Array.isArray(data) ? data : data.results));
}

export function createRecurringRule(payload: CreateRecurringRulePayload): Promise<RecurringTaskRule> {
  if (TASKS_USE_MOCKS) {
    const cat = mockCategories.find((c) => c.id === payload.categoryId);
    if (!cat) return Promise.reject(new Error("Категория не найдена"));
    const rule: RecurringTaskRule = {
      id: ++mockRuleSeq,
      title: payload.title,
      description: payload.description ?? "",
      categoryId: cat.id,
      categoryName: cat.name,
      priority: payload.priority ?? cat.defaultPriority,
      interval: payload.interval,
      dayOfWeek: payload.dayOfWeek ?? null,
      dayOfMonth: payload.dayOfMonth ?? null,
      nextRun: ruleNextRun(payload.interval, payload.dayOfWeek, payload.dayOfMonth),
      isActive: true,
      createdByName: MOCK_ME.name,
    };
    mockRules.push(rule);
    return mockDelay(rule);
  }
  return apiRequest<RecurringTaskRule>("/tasks/recurring-rules/", {
    method: "POST",
    body: payload,
  });
}

export function updateRecurringRule(
  ruleId: number,
  payload: UpdateRecurringRulePayload,
): Promise<RecurringTaskRule> {
  if (TASKS_USE_MOCKS) {
    const rule = mockRules.find((r) => r.id === ruleId);
    if (!rule) return Promise.reject(new Error("Правило не найдено"));
    Object.assign(rule, payload);
    rule.nextRun = ruleNextRun(rule.interval, rule.dayOfWeek, rule.dayOfMonth);
    return mockDelay(rule);
  }
  return apiRequest<RecurringTaskRule>(`/tasks/recurring-rules/${ruleId}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteRecurringRule(ruleId: number): Promise<void> {
  if (TASKS_USE_MOCKS) {
    const idx = mockRules.findIndex((r) => r.id === ruleId);
    if (idx >= 0) mockRules.splice(idx, 1);
    return mockDelay(undefined);
  }
  return apiRequest<void>(`/tasks/recurring-rules/${ruleId}/`, { method: "DELETE" });
}

// ── API: предложения автономности ──────────────────────────────────────────────

export type SuggestionKind = "frequency" | "monthly";

export interface AutomationSuggestion {
  id: number;
  /** Название повторяющейся заявки. */
  title: string;
  categoryId: number;
  categoryName: string;
  kind: SuggestionKind;
  /** Сколько раз повторилась. */
  occurrences: number;
  /** За какой период (дней) — для kind=frequency. */
  periodDays: number | null;
  /** Сколько месяцев подряд — для kind=monthly. */
  monthsInARow: number | null;
  lastCreatedAt: string;
  suggestedInterval: RecurringInterval;
}

let mockSuggestionSeq = 700;

const mockSuggestions: AutomationSuggestion[] = [
  {
    id: ++mockSuggestionSeq,
    title: "Заказать воду в зал ожидания",
    categoryId: 2,
    categoryName: "Хозяйственные",
    kind: "frequency",
    occurrences: 4,
    periodDays: 30,
    monthsInARow: null,
    lastCreatedAt: nowIso(),
    suggestedInterval: "weekly",
  },
  {
    id: ++mockSuggestionSeq,
    title: "Оплатить подписку CRM",
    categoryId: 4,
    categoryName: "IT / CRM",
    kind: "monthly",
    occurrences: 3,
    periodDays: null,
    monthsInARow: 3,
    lastCreatedAt: nowIso(),
    suggestedInterval: "monthly",
  },
];

export function getAutomationSuggestions(signal?: AbortSignal): Promise<AutomationSuggestion[]> {
  if (TASKS_USE_MOCKS) {
    return mockDelay(mockSuggestions);
  }
  return apiRequest<{ results: AutomationSuggestion[] } | AutomationSuggestion[]>(
    "/tasks/automation-suggestions/",
    { signal },
  ).then((data) => (Array.isArray(data) ? data : data.results));
}

/** Принять предложение → бэкенд создаёт RecurringTaskRule. */
export function approveAutomationSuggestion(suggestionId: number): Promise<RecurringTaskRule> {
  if (TASKS_USE_MOCKS) {
    const idx = mockSuggestions.findIndex((s) => s.id === suggestionId);
    if (idx < 0) return Promise.reject(new Error("Предложение не найдено"));
    const [s] = mockSuggestions.splice(idx, 1);
    return createRecurringRule({
      title: s.title,
      categoryId: s.categoryId,
      interval: s.suggestedInterval,
      dayOfWeek: s.suggestedInterval === "weekly" ? 1 : undefined,
      dayOfMonth: s.suggestedInterval === "monthly" ? 1 : undefined,
    });
  }
  return apiRequest<RecurringTaskRule>(
    `/tasks/automation-suggestions/${suggestionId}/approve/`,
    { method: "POST" },
  );
}

/** Отклонить предложение (больше не показывать для этого шаблона). */
export function dismissAutomationSuggestion(suggestionId: number): Promise<void> {
  if (TASKS_USE_MOCKS) {
    const idx = mockSuggestions.findIndex((s) => s.id === suggestionId);
    if (idx >= 0) mockSuggestions.splice(idx, 1);
    return mockDelay(undefined);
  }
  return apiRequest<void>(`/tasks/automation-suggestions/${suggestionId}/dismiss/`, {
    method: "POST",
  });
}

// ── API: быстрые шаблоны заявок ────────────────────────────────────────────────

/** Популярный шаблон заявки — из истории (свои + группы). */
export interface TaskTemplate {
  title: string;
  categoryId: number;
  categoryName: string;
  priority: TaskPriority;
  /** Сколько раз подавалась. */
  count: number;
}

export function getTaskTemplates(signal?: AbortSignal): Promise<TaskTemplate[]> {
  if (TASKS_USE_MOCKS) {
    // Из истории моков: группируем ручные заявки по названию.
    const byTitle = new Map<string, TaskTemplate>();
    for (const t of mockTasks) {
      if (t.source !== "manual") continue;
      const key = t.title.toLowerCase();
      const existing = byTitle.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byTitle.set(key, {
          title: t.title,
          categoryId: t.categoryId,
          categoryName: t.categoryName,
          priority: t.priority,
          count: 1,
        });
      }
    }
    const templates = [...byTitle.values()].sort((a, b) => b.count - a.count).slice(0, 6);
    return mockDelay(templates);
  }
  return apiRequest<{ results: TaskTemplate[] } | TaskTemplate[]>("/tasks/templates/", {
    signal,
  }).then((data) => (Array.isArray(data) ? data : data.results));
}

// ── API: сводка и личная статистика ────────────────────────────────────────────

/** Сводка по открытым задачам, видимым пользователю (для плиток на доске и бейджа). */
export interface TasksSummary {
  new: number;
  inProgress: number;
  awaitingApproval: number;
  overdue: number;
  /** Новые задачи, адресованные мне или моей группе, — для бейджа в сайдбаре. */
  newForMe: number;
}

export function getTasksSummary(signal?: AbortSignal): Promise<TasksSummary> {
  if (TASKS_USE_MOCKS) {
    const today = new Date().toISOString().slice(0, 10);
    const open = mockTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
    return mockDelay({
      new: open.filter((t) => t.status === "new").length,
      inProgress: open.filter((t) => t.status === "in_progress" || t.status === "paused").length,
      awaitingApproval: open.filter((t) => t.status === "awaiting_approval").length,
      overdue: open.filter((t) => t.dueDate != null && t.dueDate < today).length,
      newForMe: open.filter((t) => t.status === "new" && (t.assigneeId == null || t.assigneeId === MOCK_ME.id)).length,
    });
  }
  return apiRequest<TasksSummary>("/tasks/summary/", { signal });
}

/** Личная статистика исполнителя (лёгкая геймификация). */
export interface MyTaskStats {
  doneLast7Days: number;
  doneLast30Days: number;
}

export function getMyTaskStats(signal?: AbortSignal): Promise<MyTaskStats> {
  if (TASKS_USE_MOCKS) {
    const since = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString();
    };
    const mineDone = mockTasks.filter((t) => t.status === "done" && t.assigneeId === MOCK_ME.id);
    return mockDelay({
      doneLast7Days: mineDone.filter((t) => t.updatedAt >= since(7)).length,
      doneLast30Days: mineDone.filter((t) => t.updatedAt >= since(30)).length,
    });
  }
  return apiRequest<MyTaskStats>("/tasks/stats/me/", { signal });
}

// ── API: «спасибо» от автора ───────────────────────────────────────────────────

/** Автор благодарит исполнителя выполненной задачи (однократно). */
export function thankTask(taskId: number): Promise<Task> {
  if (TASKS_USE_MOCKS) {
    const r = mockFind(taskId);
    r.thankedByAuthor = true;
    r.updatedAt = nowIso();
    return mockDelay(toTask(r));
  }
  return apiRequest<Task>(`/tasks/${taskId}/thank/`, { method: "POST" });
}
