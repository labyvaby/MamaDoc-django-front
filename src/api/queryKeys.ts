export const DJANGO_LIST_STALE_TIME_MS = 30_000;
export const DJANGO_REFERENCE_STALE_TIME_MS = 10 * 60_000;
export const DJANGO_DETAIL_STALE_TIME_MS = 60_000;
export const DJANGO_POLL_INTERVAL_MS = 30_000;
/**
 * Интервал лёгкого heartbeat-чека last-update (детекция изменений приёмов).
 * Псевдо-realtime без websocket: каждые 10с опрашиваем дешёвый last-update
 * (один SELECT MAX(updated_at)), а тяжёлый список рефетчим ТОЛЬКО когда
 * таймстамп сдвинулся. Плюс мгновенная проверка при возврате на вкладку
 * (см. useAppointmentsAutoSync). Поллинг идёт лишь на видимой вкладке.
 */
export const DJANGO_HEARTBEAT_INTERVAL_MS = 10_000;
/**
 * Интервал того же heartbeat-чека, когда живо WebSocket-соединение
 * `/ws/changes/` (см. useChangesSocket): обновления приходят по сокету
 * мгновенно, а редкий polling остаётся страховкой на случай тихого обрыва
 * сокета (wifi, сон ноутбука, прокси) — экран не «застынет» на устаревших
 * данных. Сокет отвалился → возвращаемся к частому интервалу выше.
 */
export const DJANGO_REALTIME_FALLBACK_INTERVAL_MS = 60_000;

export const djangoQueryKeys = {
  all: ["django"] as const,

  appointments: {
    all: ["django", "appointments"] as const,
    list: (params: Record<string, unknown>) =>
      ["django", "appointments", "list", params] as const,
    // Один приём по id — карточка, открытая вне списка дня (клик по занятому
    // окну в виде «Окна»: приём может быть на другой дате).
    detail: (appointmentId: number) =>
      ["django", "appointments", appointmentId, "detail"] as const,
    dayCounts: (params: Record<string, unknown>) =>
      ["django", "appointments", "day-counts", params] as const,
    home: (params: Record<string, unknown>) =>
      ["django", "appointments", "home", params] as const,
    // Иконки SMS-уведомлений: батч по видимым id приёмов (key зависит от id).
    notifications: (ids: number[]) =>
      ["django", "appointments", "notifications", ids] as const,
    serviceProviders: () =>
      ["django", "appointments", "service-providers"] as const,
    /**
     * Исполнители одной услуги — секция «Кто оказывает» в карточке услуги.
     * Один запрос `service-providers/?serviceId=`; фолбэк на пересечение с
     * матрицей живёт под ключом `serviceProvidersInBranch` (см. хук).
     */
    serviceProvidersForService: (
      organizationId: number | null,
      branchId: number | null,
      serviceId: number | null,
    ) =>
      [
        "django",
        "appointments",
        "service-providers",
        "for-service",
        organizationId,
        branchId,
        serviceId,
      ] as const,
    /**
     * Все сотрудники филиала с хотя бы одной привязкой — справочник ФИО и
     * специализаций. Нужен как фолбэк секции «Кто оказывает» на окружениях,
     * где `service-providers/?serviceId=` ещё отдаёт пустой список.
     */
    serviceProvidersInBranch: (
      organizationId: number | null,
      branchId: number | null,
    ) =>
      [
        "django",
        "appointments",
        "service-providers",
        "in-branch",
        organizationId,
        branchId,
      ] as const,
    /**
     * Матрица пар «услуга ↔ сотрудник» — счётчик исполнителей в списке услуг
     * и состав секции «Кто оказывает» в карточке.
     */
    serviceAssignments: (branchId: number | null) =>
      ["django", "appointments", "service-assignments", branchId] as const,
    formData: (context: { orgId?: number | null; branchId?: number | null; membershipId?: number | null } = {}) =>
      ["django", "appointments", "form-data", context] as const,
    payments: (appointmentId: number) =>
      ["django", "appointments", appointmentId, "payments"] as const,
    conclusionSlots: (appointmentId: number) =>
      ["django", "appointments", appointmentId, "conclusion-slots"] as const,
  },

  patients: {
    detail: (patientId: number) => ["django", "patients", patientId] as const,
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
      settings: (organizationId: number | null | undefined, branchId?: number | null) =>
        ["django", "notifications", "settings", organizationId ?? null, branchId ?? null] as const,
    history: (filters: Record<string, unknown>) =>
      ["django", "notifications", "history", filters] as const,
  },

  automations: {
    all: ["django", "automations"] as const,
    // Всё, что меняется при сохранении правила. Каталог сюда НЕ входит: он
    // справочник, а его рефетч посреди открытого редактора лишний.
    mutable: ["django", "automations", "list"] as const,
    catalog: (organizationId: number | null | undefined) =>
      ["django", "automations", "catalog", organizationId ?? null] as const,
    list: (organizationId: number | null | undefined) =>
      ["django", "automations", "list", organizationId ?? null] as const,
    runs: (automationId: number, organizationId: number | null | undefined) =>
      ["django", "automations", automationId, "runs", organizationId ?? null] as const,
    // Общая история организации — отдельный ключ: фильтры вкладки не должны
    // сбрасывать кэш истории конкретного правила и наоборот.
    history: (
      organizationId: number | null | undefined,
      filters: Record<string, unknown>,
    ) => ["django", "automations", "history", organizationId ?? null, filters] as const,
  },

  announcements: {
    all: ["django", "announcements"] as const,
    active: ["django", "announcements", "active"] as const,
    list: (params?: Record<string, unknown>) =>
      ["django", "announcements", "list", params ?? {}] as const,
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
    activeMonths: (params: Record<string, unknown>) =>
      ["django", "payroll", "active-months", params] as const,
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
    summary: (orgId?: number) =>
      ["django", "tasks", "summary", orgId ?? null] as const,
    myStats: (orgId?: number) =>
      ["django", "tasks", "my-stats", orgId ?? null] as const,
  },

  deals: {
    all: ["django", "deals"] as const,
    list: (params: Record<string, unknown>) => ["django", "deals", "list", params] as const,
    detail: (id: number) => ["django", "deals", id] as const,
    /** Доска приходит одним агрегатом — ключ на набор фильтров, а не на колонку. */
    board: (params: Record<string, unknown>) => ["django", "deals", "board", params] as const,
    summary: (params: Record<string, unknown>) => ["django", "deals", "summary", params] as const,
    pipelines: (orgId?: number) => ["django", "deals", "pipelines", orgId ?? null] as const,
    stages: (pipelineId?: number, orgId?: number) =>
      ["django", "deals", "stages", pipelineId ?? null, orgId ?? null] as const,
    sources: (orgId?: number) => ["django", "deals", "sources", orgId ?? null] as const,
    lostReasons: (orgId?: number) => ["django", "deals", "lost-reasons", orgId ?? null] as const,
    duplicates: (phone: string, orgId?: number) =>
      ["django", "deals", "duplicates", phone, orgId ?? null] as const,
    funnel: (params: Record<string, unknown>) => ["django", "deals", "funnel", params] as const,
    /** Пикер услуг в карточке сделки: прайс общий по организации. */
    servicePicker: (search: string, orgId?: number) =>
      ["django", "deals", "service-picker", search, orgId ?? null] as const,
  },

  waitlist: {
    all: ["django", "waitlist"] as const,
    list: (params: Record<string, unknown>) =>
      ["django", "waitlist", "list", params] as const,
    detail: (id: number) => ["django", "waitlist", id] as const,
    /** Кандидаты на конкретное освободившееся окно. */
    matches: (params: Record<string, unknown>) =>
      ["django", "waitlist", "matches", params] as const,
    matchCounts: (params: Record<string, unknown>) =>
      ["django", "waitlist", "match-counts", params] as const,
    summary: (orgId?: number) => ["django", "waitlist", "summary", orgId ?? null] as const,
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
    activeMonths: (params: Record<string, unknown>) =>
      ["django", "cleaning", "active-months", params] as const,
    employees: (organizationId: number | null | undefined) =>
      ["django", "cleaning", "employees", organizationId ?? null] as const,
  },

  knowledge: {
    all: ["django", "knowledge"] as const,
    categories: (params: Record<string, unknown>) =>
      ["django", "knowledge", "categories", params] as const,
    articles: (params: Record<string, unknown>) =>
      ["django", "knowledge", "articles", params] as const,
    article: (articleId: number) =>
      ["django", "knowledge", "article", articleId] as const,
    series: (params: Record<string, unknown>) =>
      ["django", "knowledge", "series", params] as const,
    folders: (params: Record<string, unknown>) =>
      ["django", "knowledge", "folders", params] as const,
    videos: (params: Record<string, unknown>) =>
      ["django", "knowledge", "videos", params] as const,
  },

  vaccinations: {
    all: ["django", "vaccinations"] as const,
    vaccines: (params: Record<string, unknown>) =>
      ["django", "vaccinations", "vaccines", params] as const,
    batches: (params: Record<string, unknown>) =>
      ["django", "vaccinations", "batches", params] as const,
    // История списаний одной партии (порча/срок).
    batchWriteOffs: (batchId: number) =>
      ["django", "vaccinations", "batches", batchId, "write-offs"] as const,
    records: (params: Record<string, unknown>) =>
      ["django", "vaccinations", "records", params] as const,
    record: (id: number) => ["django", "vaccinations", "records", id] as const,
    // Дашборд «кому пора» (по всем пациентам филиала).
    schedule: (params: Record<string, unknown>) =>
      ["django", "vaccinations", "schedule", params] as const,
    // Календарь и история одного пациента.
    patientSchedule: (patientId: number) =>
      ["django", "vaccinations", "patients", patientId, "schedule"] as const,
    patientHistory: (patientId: number) =>
      ["django", "vaccinations", "patients", patientId, "history"] as const,
    // Шаблон нац. календаря (общий для организации).
    calendarTemplate: (params: Record<string, unknown>) =>
      ["django", "vaccinations", "calendar-template", params] as const,
    // Месячный отчёт по календарю.
    monthlyReport: (params: Record<string, unknown>) =>
      ["django", "vaccinations", "monthly-report", params] as const,
  },

  staff: {
    /** Справочник «auth-user id → ФИО сотрудника» (подписи Создан/Изм). */
    userNames: ["django", "staff", "userNames"] as const,
    /**
     * Полный справочник активных сотрудников орг. (все страницы) — под пикеры,
     * которые фильтруют ввод локально. См. useAllActiveEmployees.
     */
    activeEmployees: (organizationId: number | null | undefined) =>
      ["django", "staff", "activeEmployees", organizationId ?? null] as const,
    /** Услуги одного сотрудника — персональные цена и длительность. */
    employeeServices: (organizationId: number | null, employeeId: number) =>
      ["django", "staff", "employeeServices", organizationId, employeeId] as const,
    specializations: (organizationId: number | null | undefined) =>
      ["django", "staff", "specializations", organizationId ?? null] as const,
    banks: (organizationId: number | null | undefined) =>
      ["django", "staff", "banks", organizationId ?? null] as const,
  },

  insurers: {
    list: (organizationId: number | null | undefined) =>
      ["django", "insurers", organizationId ?? null] as const,
  },

  cashlessMethods: {
    // Филиал в ключе: список зависит от него (общие способы + способы филиала),
    // иначе кеш одного филиала подставился бы другому.
    list: (
      organizationId: number | null | undefined,
      branchId?: number | null,
      /** Списки со скрытыми способами кешируем отдельно: набор другой. */
      includeInactive?: boolean,
    ) =>
      [
        "django",
        "cashless-methods",
        organizationId ?? null,
        branchId ?? null,
        includeInactive === true,
      ] as const,
  },

  conclusionForms: {
    // Филиал — часть ключа: бэк режет выдачу по нему (бланки филиала + общие),
    // и список филиала A не должен подставляться в филиале B.
    list: (
      organizationId: number | null | undefined,
      branchId?: number | null,
    ) =>
      ["django", "conclusion-forms", organizationId ?? null, branchId ?? null] as const,
  },

  odoctor: {
    // Строка настроек одна на организацию, списка нет — только объект в скоупе
    // организации, поэтому и ключ один.
    settings: (organizationId: number | null | undefined) =>
      ["django", "odoctor", "settings", organizationId ?? null] as const,
    // Связи врачей — список в скоупе организации.
    links: (organizationId: number | null | undefined) =>
      ["django", "odoctor", "links", organizationId ?? null] as const,
    // Связи одного врача — ключ карточки сотрудника.
    employeeLinks: (employeeId: number) =>
      ["django", "odoctor", "links", "employee", employeeId] as const,
    // Предпросмотр спрашивается по одной связи и живёт до закрытия диалога:
    // он ходит в кабинет odoctor, и кешировать его надолго значило бы
    // показывать оператору вчерашнюю витрину как сегодняшнюю.
    linkPreview: (linkId: number) =>
      ["django", "odoctor", "link-preview", linkId] as const,
    // Предпросмотр всех связей одного врача: переключатель в карточке один
    // на врача, значит и картинка «что произойдёт» — на врача целиком.
    employeePreview: (employeeId: number, linkIds: readonly number[]) =>
      [
        "django", "odoctor", "employee-preview", employeeId, [...linkIds],
      ] as const,
    // Филиалы в разрезе кабинета — только своя база, кешируется как справочник.
    branches: (organizationId: number | null | undefined) =>
      ["django", "odoctor", "branches", organizationId ?? null] as const,
    // Филиалы самого кабинета — варианты выбора при связывании филиала.
    // Живёт недолго: список идёт из кабинета, а связанный филиал должен
    // сразу перестать предлагаться свободным.
    cabinetBranches: (organizationId: number | null | undefined) =>
      ["django", "odoctor", "cabinet-branches", organizationId ?? null] as const,
    // Врачи филиала в кабинете. Ключ по филиалу CRM, а не по филиалу
    // кабинета: наружу мы говорим о своих сущностях. Живёт недолго — запрос
    // идёт в кабинет, и вчерашний список врачей под видом сегодняшнего
    // отправил бы оператора сопоставлять то, чего там уже нет.
    cabinetDoctors: (branchId: number) =>
      ["django", "odoctor", "cabinet-doctors", branchId] as const,
  },

  scheduling: {
    rules: (params: Record<string, unknown>) =>
      ["django", "scheduling", "rules", params] as const,
    exceptions: (params: Record<string, unknown>) =>
      ["django", "scheduling", "exceptions", params] as const,
    /** Приёмы, попадающие под отсутствие сотрудника (exceptions/conflicts/). */
    conflicts: (params: Record<string, unknown>) =>
      ["django", "scheduling", "exceptions", "conflicts", params] as const,
    availability: (params: Record<string, unknown>) =>
      ["django", "scheduling", "availability", params] as const,
    availabilitySummary: (params: Record<string, unknown>) =>
      ["django", "scheduling", "availability", "summary", params] as const,
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

  lab: {
    all: ["django", "lab"] as const,
    /**
     * Врачи для поля «направивший врач». Ключ параметризован запросом:
     * пустой — уже известные, непустой — живой поиск по справочнику ЛИС,
     * и кэшировать их под одним ключом нельзя.
     */
    doctors: (query: string) =>
      ["django", "lab", "doctors", query] as const,
    /** Типы клиента ЛИС — готовый список скидок, зеркало синка. */
    clientTypes: ["django", "lab", "clientTypes"] as const,
    /**
     * Лента заказов лаборатории. Сегодня страница всегда шлёт пустые params —
     * плитки-фильтры над лентой (LabOrdersSummaryBar) режут уже загруженный
     * список на клиенте (см. filterLabOrders) и в сеть не ходят. Ключ всё
     * равно параметризован по образцу соседних list(): дровер приёма должен
     * уметь инвалидировать ленту после создания заказа, не зная её текущих
     * фильтров.
     */
    orders: (params: Record<string, unknown>) =>
      ["django", "lab", "orders", params] as const,
    /**
     * Карточка одного заказа (Task 11). Ключ вложен под тот же префикс
     * `["django", "lab"]`, что и `all` — инвалидация ленты после приёма или
     * повтора отправки (`djangoQueryKeys.lab.all`) рефетчит и открытую
     * карточку тоже, без отдельного вызова.
     */
    order: (orderId: number) => ["django", "lab", "orders", orderId] as const,
    /** Каталог анализов — грузится один раз при открытии дровера приёма. */
    tests: ["django", "lab", "tests"] as const,
    /**
     * Настройки раздела — плата за пробирки и «настроен ли раздел вообще»
     * (`GET /lab/settings/`). Грузятся один раз при открытии дровера приёма,
     * тем же моментом, что и каталог; параметров нет — организация, как и у
     * каталога, берётся из контекста пользователя, а не передаётся явно.
     */
    settings: ["django", "lab", "settings"] as const,
    /**
     * Пробирки/вопросы/подготовка зависят от состава корзины (`?tests=`) и
     * перезагружаются при её изменении, с debounce — ключ по строке
     * идентификаторов (`testIdsQuery`), а не по самому массиву: одинаковая
     * корзина обязана давать одинаковый ключ независимо от порядка добавления
     * строк.
     */
    instruments: (testIds: string) => ["django", "lab", "instruments", testIds] as const,
    questions: (testIds: string) => ["django", "lab", "questions", testIds] as const,
    preparation: (testIds: string) => ["django", "lab", "preparation", testIds] as const,
  },
};
