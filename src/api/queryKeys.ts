export const DJANGO_LIST_STALE_TIME_MS = 30_000;
export const DJANGO_REFERENCE_STALE_TIME_MS = 10 * 60_000;
export const DJANGO_DETAIL_STALE_TIME_MS = 60_000;
export const DJANGO_POLL_INTERVAL_MS = 30_000;
/**
 * Интервал лёгкого heartbeat-чека last-update (детекция изменений приёмов).
 * Псевдо-realtime без websocket: каждые 2.5с опрашиваем дешёвый last-update
 * (один SELECT MAX(updated_at)), а тяжёлый список рефетчим ТОЛЬКО когда
 * таймстамп сдвинулся. Плюс мгновенная проверка при возврате на вкладку
 * (см. useAppointmentsAutoSync). Поллинг идёт лишь на видимой вкладке.
 */
export const DJANGO_HEARTBEAT_INTERVAL_MS = 2_500;
/**
 * Интервал того же heartbeat-чека, когда живо WebSocket-соединение
 * `/ws/changes/` (см. useChangesSocket): обновления приходят по сокету
 * мгновенно, а редкий polling остаётся страховкой на случай тихого обрыва
 * сокета (wifi, сон ноутбука, прокси) — экран не «застынет» на устаревших
 * данных. Сокет отвалился → возвращаемся к частому интервалу выше.
 */
export const DJANGO_REALTIME_FALLBACK_INTERVAL_MS = 25_000;

export const djangoQueryKeys = {
  all: ["django"] as const,

  appointments: {
    all: ["django", "appointments"] as const,
    list: (params: Record<string, unknown>) =>
      ["django", "appointments", "list", params] as const,
    dayCounts: (params: Record<string, unknown>) =>
      ["django", "appointments", "day-counts", params] as const,
    home: (params: Record<string, unknown>) =>
      ["django", "appointments", "home", params] as const,
    // Иконки SMS-уведомлений: батч по видимым id приёмов (key зависит от id).
    notifications: (ids: number[]) =>
      ["django", "appointments", "notifications", ids] as const,
    serviceProviders: () =>
      ["django", "appointments", "service-providers"] as const,
    formData: (context: { orgId?: number | null; branchId?: number | null; membershipId?: number | null } = {}) =>
      ["django", "appointments", "form-data", context] as const,
    payments: (appointmentId: number) =>
      ["django", "appointments", appointmentId, "payments"] as const,
    conclusionSlots: (appointmentId: number) =>
      ["django", "appointments", appointmentId, "conclusion-slots"] as const,
  },

  patients: {
    balance: (patientId: number) =>
      ["django", "patients", patientId, "balance"] as const,
    // Root key — use for invalidateQueries to bust all pages.
    transactions: (patientId: number) =>
      ["django", "patients", patientId, "balance-transactions"] as const,
    // Keyed by page params — use for individual page queries.
    transactionsPage: (patientId: number, params: { page: number; pageSize: number }) =>
      ["django", "patients", patientId, "balance-transactions", params] as const,
  },

  cashbox: {
    summary: (filters: Record<string, unknown>) =>
      ["django", "cashbox", "summary", filters] as const,
    entries: (entryType: string, filters: Record<string, unknown>) =>
      ["django", "cashbox", "entries", entryType, filters] as const,
  },

  reports: {
    monthly: (filters: Record<string, unknown>) =>
      ["django", "reports", "monthly", filters] as const,
    activeMonths: (organizationId: number | null | undefined) =>
      ["django", "reports", "active-months", organizationId ?? null] as const,
    load: (filters: Record<string, unknown>) =>
      ["django", "reports", "load", filters] as const,
  },

  notifications: {
    settings: (organizationId: number | null | undefined) =>
      ["django", "notifications", "settings", organizationId ?? null] as const,
    history: (filters: Record<string, unknown>) =>
      ["django", "notifications", "history", filters] as const,
  },

  expenses: {
    all: ["django", "expenses"] as const,
    list: (filters: Record<string, unknown>) =>
      ["django", "expenses", "list", filters] as const,
    categories: (organizationId: number | null | undefined) =>
      ["django", "expenses", "categories", organizationId ?? null] as const,
  },

  shifts: {
    current: (filters: Record<string, unknown>) =>
      ["django", "shifts", "current", filters] as const,
    list: (filters: Record<string, unknown>) =>
      ["django", "shifts", "list", filters] as const,
    summary: (id: number) =>
      ["django", "shifts", id, "summary"] as const,
    all: ["django", "shifts"] as const,
  },

  payroll: {
    report: (params: Record<string, unknown>) =>
      ["django", "payroll", "report", params] as const,
    rules: (employeeId: number) =>
      ["django", "payroll", employeeId, "rules"] as const,
    bonuses: (params: Record<string, unknown>) =>
      ["django", "payroll", "bonuses", params] as const,
  },

  attendance: {
    all: ["django", "attendance"] as const,
    active: ["django", "attendance", "active"] as const,
    list: (filters: Record<string, unknown>) =>
      ["django", "attendance", "list", filters] as const,
    officeIp: ["django", "attendance", "office-ip"] as const,
  },

  organization: {
    branches: ["django", "organization", "branches"] as const,
  },

  bookings: {
    all: ["django", "bookings"] as const,
    list: (params: Record<string, unknown>) =>
      ["django", "bookings", "list", params] as const,
    detail: (id: number) => ["django", "bookings", id] as const,
  },

  reviews: {
    all: ["django", "reviews"] as const,
    list: (params: Record<string, unknown>) =>
      ["django", "reviews", "list", params] as const,
    stats: (params: Record<string, unknown>) =>
      ["django", "reviews", "stats", params] as const,
    settings: (organizationId: number | null | undefined) =>
      ["django", "reviews", "settings", organizationId ?? null] as const,
    byAppointment: (appointmentId: number) =>
      ["django", "reviews", "appointment", appointmentId] as const,
  },

  tasks: {
    all: ["django", "tasks"] as const,
    list: (params: Record<string, unknown>) =>
      ["django", "tasks", "list", params] as const,
    detail: (id: number) => ["django", "tasks", id] as const,
    categories: ["django", "tasks", "categories"] as const,
    recurringRules: ["django", "tasks", "recurring-rules"] as const,
    stockRules: ["django", "tasks", "stock-rules"] as const,
    suggestions: ["django", "tasks", "automation-suggestions"] as const,
    notifications: ["django", "tasks", "notifications"] as const,
    templates: ["django", "tasks", "templates"] as const,
    summary: ["django", "tasks", "summary"] as const,
    myStats: ["django", "tasks", "my-stats"] as const,
  },

  achievements: {
    all: ["django", "achievements"] as const,
    definitions: ["django", "achievements", "definitions"] as const,
    me: ["django", "achievements", "me"] as const,
    employee: (employeeId: number) =>
      ["django", "achievements", "employee", employeeId] as const,
    organization: ["django", "achievements", "organization"] as const,
    feed: (params: Record<string, unknown>) =>
      ["django", "achievements", "feed", params] as const,
    unseen: ["django", "achievements", "unseen"] as const,
  },

  documents: {
    all: ["django", "documents"] as const,
    list: (params: Record<string, unknown>) =>
      ["django", "documents", "list", params] as const,
    roles: (organizationId: number | null | undefined) =>
      ["django", "documents", "roles", organizationId ?? null] as const,
  },

  cleaning: {
    all: ["django", "cleaning"] as const,
    types: (params: Record<string, unknown>) =>
      ["django", "cleaning", "types", params] as const,
    records: (params: Record<string, unknown>) =>
      ["django", "cleaning", "records", params] as const,
    summary: (params: Record<string, unknown>) =>
      ["django", "cleaning", "summary", params] as const,
    activeMonths: (organizationId: number | null | undefined) =>
      ["django", "cleaning", "active-months", organizationId ?? null] as const,
  },

  knowledge: {
    all: ["django", "knowledge"] as const,
    categories: (params: Record<string, unknown>) =>
      ["django", "knowledge", "categories", params] as const,
    articles: (params: Record<string, unknown>) =>
      ["django", "knowledge", "articles", params] as const,
    article: (articleId: number) =>
      ["django", "knowledge", "article", articleId] as const,
    videos: (params: Record<string, unknown>) =>
      ["django", "knowledge", "videos", params] as const,
  },

  staff: {
    /** Справочник «auth-user id → ФИО сотрудника» (подписи Создан/Изм). */
    userNames: ["django", "staff", "userNames"] as const,
    specializations: (organizationId: number | null | undefined) =>
      ["django", "staff", "specializations", organizationId ?? null] as const,
    banks: (organizationId: number | null | undefined) =>
      ["django", "staff", "banks", organizationId ?? null] as const,
  },

  insurers: {
    list: (organizationId: number | null | undefined) =>
      ["django", "insurers", organizationId ?? null] as const,
  },

  scheduling: {
    rules: (params: Record<string, unknown>) =>
      ["django", "scheduling", "rules", params] as const,
    exceptions: (params: Record<string, unknown>) =>
      ["django", "scheduling", "exceptions", params] as const,
    availability: (params: Record<string, unknown>) =>
      ["django", "scheduling", "availability", params] as const,
    // Root key — инвалидация всех запросов свободных окон разом
    // (занятость меняется при любом изменении приёмов).
    availabilityAll: ["django", "scheduling", "availability"] as const,
  },

  catalog: {
    services: (context: { orgId?: number | null; branchId?: number | null } = {}) =>
      ["django", "catalog", "services", context] as const,
  },

  reference: {
    patients: ["django", "reference", "patients"] as const,
    employees: ["django", "reference", "employees"] as const,
    services: (context: { orgId?: number | null; branchId?: number | null } = {}) =>
      ["django", "reference", "services", context] as const,
  },
};
