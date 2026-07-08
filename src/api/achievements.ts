import { apiRequest } from "./client";

/**
 * Модуль достижений сотрудников.
 *
 * Контракт: docs/backend-achievements-api.md (тикет:
 * MamaDoc/backend_ticket_achievements_module.md) — НЕ менять без
 * согласования с бэкенд-командой. Бэкенд реализован (гайд
 * frontend-tickets-2026-07-guide.md, 08.07.2026), модуль работает на живом API.
 * Моки оставлены для локальной разработки без бэка (ACHIEVEMENTS_USE_MOCKS = true).
 *
 * Принципы (см. ТЗ MamaDoc/TZ_achievements_module.md):
 * - фронт ничего не вычисляет — только отображает данные бэка;
 * - награды символические, без лидерборда; у коллег видны только бейджи;
 * - приёмы/процедуры засчитываются по оплате (paid|discounted).
 */

// Бэкенд app `achievements` задеплоен — моки только для локальной отладки.
export const ACHIEVEMENTS_USE_MOCKS = false;

// ── Types ──────────────────────────────────────────────────────────────────────

export type AchievementKind = "milestone" | "streak" | "tenure";
export type AchievementScope = "employee" | "organization";

export interface AchievementTier {
  /** Уровень внутри достижения, 1..N. */
  level: number;
  /** Порог метрики для получения уровня. */
  threshold: number;
  /** Название уровня («Бронза», «Первый приём»...). */
  name: string;
}

export interface AchievementDefinition {
  /** Стабильный код (appointments, tasks_done...). */
  code: string;
  title: string;
  description: string;
  kind: AchievementKind;
  scope: AchievementScope;
  /** RBAC-роли, которым релевантна метрика; пусто — всем. */
  relevantRoles: string[];
  tiers: AchievementTier[];
}

/** Полученный уровень достижения. */
export interface EarnedAchievement {
  /** id записи EmployeeAchievement (для mark-seen); в чужих бейджах может отсутствовать. */
  id?: number;
  code: string;
  level: number;
  tierName: string;
  achievedAt: string; // ISO
  /** Значение метрики в момент получения (у чужих бейджей бэк не отдаёт). */
  valueAtAchievement?: number | null;
}

/** Текущее значение метрики + следующий порог (для прогресс-баров). */
export interface AchievementProgress {
  code: string;
  currentValue: number;
  /** null — достигнут максимальный уровень. */
  nextLevel: number | null;
  nextThreshold: number | null;
}

export interface MyAchievementsResponse {
  achievements: EarnedAchievement[];
  progress: AchievementProgress[];
}

export interface AchievementFeedItem {
  id: number;
  /** null — командное достижение организации. */
  employeeId: number | null;
  employeeName: string | null;
  code: string;
  title: string;
  tierName: string;
  level: number;
  achievedAt: string;
}

export interface AchievementsFeedResponse {
  results: AchievementFeedItem[];
  count: number;
  next: string | null;
  previous: string | null;
}

/** Высший полученный уровень по каждому коду (для сеток бейджей). */
export function topEarnedByCode(
  earned: EarnedAchievement[],
): Map<string, EarnedAchievement> {
  const map = new Map<string, EarnedAchievement>();
  for (const e of earned) {
    const prev = map.get(e.code);
    if (!prev || e.level > prev.level) map.set(e.code, e);
  }
  return map;
}

// ── Mock store ─────────────────────────────────────────────────────────────────

/** Текущий сотрудник в моках (бэкенд определяет «me» по сессии). */
const MOCK_ME = { id: 101, name: "Вы (текущий сотрудник)" };

const daysAgoIso = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString();
};

const mockDelay = <T,>(value: T, ms = 300): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

/** Каталог v1 — зеркало сида из тикета бэкенду (§«Каталог v1»). */
const mockDefinitions: AchievementDefinition[] = [
  // Вехи
  {
    code: "appointments",
    title: "Приёмы",
    description: "Оплаченные приёмы, где вы — врач",
    kind: "milestone",
    scope: "employee",
    relevantRoles: ["doctor"],
    tiers: [
      { level: 1, threshold: 1, name: "Первый приём" },
      { level: 2, threshold: 100, name: "Бронза" },
      { level: 3, threshold: 500, name: "Серебро" },
      { level: 4, threshold: 1000, name: "Золото" },
      { level: 5, threshold: 5000, name: "Платина" },
    ],
  },
  {
    code: "procedures",
    title: "Процедуры",
    description: "Оплаченные процедуры, выполненные вами",
    kind: "milestone",
    scope: "employee",
    relevantRoles: ["doctor", "nurse"],
    tiers: [
      { level: 1, threshold: 1, name: "Первая процедура" },
      { level: 2, threshold: 100, name: "Бронза" },
      { level: 3, threshold: 500, name: "Серебро" },
      { level: 4, threshold: 1000, name: "Золото" },
      { level: 5, threshold: 5000, name: "Платина" },
    ],
  },
  {
    code: "patients",
    title: "Пациенты",
    description: "Уникальные пациенты на ваших оплаченных приёмах",
    kind: "milestone",
    scope: "employee",
    relevantRoles: ["doctor"],
    tiers: [
      { level: 1, threshold: 50, name: "Бронза" },
      { level: 2, threshold: 200, name: "Серебро" },
      { level: 3, threshold: 500, name: "Золото" },
      { level: 4, threshold: 1000, name: "Платина" },
    ],
  },
  {
    code: "tasks_done",
    title: "Дела сделаны",
    description: "Выполненные вами задачи",
    kind: "milestone",
    scope: "employee",
    relevantRoles: [],
    tiers: [
      { level: 1, threshold: 1, name: "Первое дело" },
      { level: 2, threshold: 50, name: "Бронза" },
      { level: 3, threshold: 200, name: "Серебро" },
      { level: 4, threshold: 500, name: "Золото" },
    ],
  },
  {
    code: "thanks",
    title: "Спасибо!",
    description: "Благодарности от коллег за выполненные задачи",
    kind: "milestone",
    scope: "employee",
    relevantRoles: [],
    tiers: [
      { level: 1, threshold: 1, name: "Первое спасибо" },
      { level: 2, threshold: 10, name: "Бронза" },
      { level: 3, threshold: 50, name: "Серебро" },
      { level: 4, threshold: 100, name: "Золото" },
    ],
  },
  {
    code: "sales",
    title: "Продажи",
    description: "Продажи товаров, оформленные вами",
    kind: "milestone",
    scope: "employee",
    relevantRoles: ["receptionist", "registrator"],
    tiers: [
      { level: 1, threshold: 1, name: "Первая продажа" },
      { level: 2, threshold: 100, name: "Бронза" },
      { level: 3, threshold: 500, name: "Серебро" },
      { level: 4, threshold: 1000, name: "Золото" },
    ],
  },
  // Серии
  {
    code: "on_time",
    title: "Точно в срок",
    description: "Задачи подряд, выполненные не позже срока",
    kind: "streak",
    scope: "employee",
    relevantRoles: [],
    tiers: [
      { level: 1, threshold: 10, name: "Бронза" },
      { level: 2, threshold: 25, name: "Серебро" },
      { level: 3, threshold: 50, name: "Золото" },
    ],
  },
  {
    code: "active_months",
    title: "Стабильность",
    description: "Месяцы подряд с приёмами, процедурами или задачами",
    kind: "streak",
    scope: "employee",
    relevantRoles: [],
    tiers: [
      { level: 1, threshold: 3, name: "Бронза" },
      { level: 2, threshold: 6, name: "Серебро" },
      { level: 3, threshold: 12, name: "Золото" },
    ],
  },
  // Стаж
  {
    code: "tenure",
    title: "В команде",
    description: "Стаж работы в клинике",
    kind: "tenure",
    scope: "employee",
    relevantRoles: [],
    tiers: [
      { level: 1, threshold: 1, name: "Первый месяц" },
      { level: 2, threshold: 12, name: "Год в команде" },
      { level: 3, threshold: 36, name: "3 года" },
      { level: 4, threshold: 60, name: "5 лет" },
    ],
  },
  // Командные
  {
    code: "org_appointments",
    title: "Приёмы клиники",
    description: "Оплаченные приёмы всей организации",
    kind: "milestone",
    scope: "organization",
    relevantRoles: [],
    tiers: [
      { level: 1, threshold: 1000, name: "Бронза" },
      { level: 2, threshold: 10000, name: "Серебро" },
      { level: 3, threshold: 50000, name: "Золото" },
      { level: 4, threshold: 100000, name: "Платина" },
    ],
  },
  {
    code: "org_patients",
    title: "Наши пациенты",
    description: "Уникальные пациенты организации",
    kind: "milestone",
    scope: "organization",
    relevantRoles: [],
    tiers: [
      { level: 1, threshold: 1000, name: "Бронза" },
      { level: 2, threshold: 5000, name: "Серебро" },
      { level: 3, threshold: 20000, name: "Золото" },
    ],
  },
  {
    code: "org_anniversary",
    title: "Юбилей",
    description: "Лет работы клиники в системе",
    kind: "tenure",
    scope: "organization",
    relevantRoles: [],
    tiers: [
      { level: 1, threshold: 1, name: "1 год" },
      { level: 2, threshold: 3, name: "3 года" },
      { level: 3, threshold: 5, name: "5 лет" },
    ],
  },
];

/** Мои полученные уровни (uniq по code+level, как EmployeeAchievement на бэке). */
const mockMyAchievements: EarnedAchievement[] = [
  { code: "appointments", level: 1, tierName: "Первый приём", achievedAt: daysAgoIso(400), valueAtAchievement: 1 },
  { code: "appointments", level: 2, tierName: "Бронза", achievedAt: daysAgoIso(210), valueAtAchievement: 100 },
  { code: "procedures", level: 1, tierName: "Первая процедура", achievedAt: daysAgoIso(390), valueAtAchievement: 1 },
  { code: "procedures", level: 2, tierName: "Бронза", achievedAt: daysAgoIso(120), valueAtAchievement: 100 },
  { code: "patients", level: 1, tierName: "Бронза", achievedAt: daysAgoIso(250), valueAtAchievement: 50 },
  { code: "tasks_done", level: 1, tierName: "Первое дело", achievedAt: daysAgoIso(300), valueAtAchievement: 1 },
  { code: "tasks_done", level: 2, tierName: "Бронза", achievedAt: daysAgoIso(60), valueAtAchievement: 50 },
  { code: "thanks", level: 1, tierName: "Первое спасибо", achievedAt: daysAgoIso(1), valueAtAchievement: 1 },
  { code: "on_time", level: 1, tierName: "Бронза", achievedAt: daysAgoIso(30), valueAtAchievement: 10 },
  { code: "active_months", level: 1, tierName: "Бронза", achievedAt: daysAgoIso(330), valueAtAchievement: 3 },
  { code: "active_months", level: 2, tierName: "Серебро", achievedAt: daysAgoIso(240), valueAtAchievement: 6 },
  { code: "tenure", level: 1, tierName: "Первый месяц", achievedAt: daysAgoIso(395), valueAtAchievement: 1 },
  { code: "tenure", level: 2, tierName: "Год в команде", achievedAt: daysAgoIso(60), valueAtAchievement: 12 },
];

/** Текущие значения моих метрик (кэш EmployeeMetricProgress на бэке).
 *  sales отсутствует: метрика нерелевантна роли и равна 0 — бэк её не отдаёт. */
const mockMyProgress: AchievementProgress[] = [
  { code: "appointments", currentValue: 487, nextLevel: 3, nextThreshold: 500 },
  { code: "procedures", currentValue: 112, nextLevel: 3, nextThreshold: 500 },
  { code: "patients", currentValue: 156, nextLevel: 2, nextThreshold: 200 },
  { code: "tasks_done", currentValue: 63, nextLevel: 3, nextThreshold: 200 },
  { code: "thanks", currentValue: 4, nextLevel: 2, nextThreshold: 10 },
  { code: "on_time", currentValue: 18, nextLevel: 2, nextThreshold: 25 },
  { code: "active_months", currentValue: 7, nextLevel: 3, nextThreshold: 12 },
  { code: "tenure", currentValue: 14, nextLevel: 3, nextThreshold: 36 },
];

/** Достижения организации + прогресс. */
const mockOrgAchievements: EarnedAchievement[] = [
  { code: "org_appointments", level: 1, tierName: "Бронза", achievedAt: daysAgoIso(500), valueAtAchievement: 1000 },
  { code: "org_patients", level: 1, tierName: "Бронза", achievedAt: daysAgoIso(430), valueAtAchievement: 1000 },
  { code: "org_anniversary", level: 1, tierName: "1 год", achievedAt: daysAgoIso(200), valueAtAchievement: 1 },
];

const mockOrgProgress: AchievementProgress[] = [
  { code: "org_appointments", currentValue: 8214, nextLevel: 2, nextThreshold: 10000 },
  { code: "org_patients", currentValue: 3421, nextLevel: 2, nextThreshold: 5000 },
  { code: "org_anniversary", currentValue: 1, nextLevel: 2, nextThreshold: 3 },
];

/** Бейджи коллег (для карточки сотрудника): employeeId → достижения. */
const mockEmployeeAchievements: Record<number, EarnedAchievement[]> = {
  102: [
    { code: "tasks_done", level: 2, tierName: "Бронза", achievedAt: daysAgoIso(90) },
    { code: "tenure", level: 2, tierName: "Год в команде", achievedAt: daysAgoIso(45) },
  ],
  103: [
    { code: "procedures", level: 3, tierName: "Серебро", achievedAt: daysAgoIso(12) },
    { code: "on_time", level: 2, tierName: "Серебро", achievedAt: daysAgoIso(20) },
  ],
};

let mockFeedSeq = 500;

const mockFeed: AchievementFeedItem[] = [
  {
    id: ++mockFeedSeq,
    employeeId: MOCK_ME.id,
    employeeName: MOCK_ME.name,
    code: "thanks",
    title: "Спасибо!",
    tierName: "Первое спасибо",
    level: 1,
    achievedAt: daysAgoIso(1),
  },
  {
    id: ++mockFeedSeq,
    employeeId: 103,
    employeeName: "Динара К. (медсестра)",
    code: "procedures",
    title: "Процедуры",
    tierName: "Серебро",
    level: 3,
    achievedAt: daysAgoIso(12),
  },
  {
    id: ++mockFeedSeq,
    employeeId: 103,
    employeeName: "Динара К. (медсестра)",
    code: "on_time",
    title: "Точно в срок",
    tierName: "Серебро",
    level: 2,
    achievedAt: daysAgoIso(20),
  },
  {
    id: ++mockFeedSeq,
    employeeId: null,
    employeeName: null,
    code: "org_anniversary",
    title: "Юбилей",
    tierName: "1 год",
    level: 1,
    achievedAt: daysAgoIso(200),
  },
  {
    id: ++mockFeedSeq,
    employeeId: 102,
    employeeName: "Айгерим С. (регистратор)",
    code: "tenure",
    title: "В команде",
    tierName: "Год в команде",
    level: 2,
    achievedAt: daysAgoIso(45),
  },
  {
    id: ++mockFeedSeq,
    employeeId: 102,
    employeeName: "Айгерим С. (регистратор)",
    code: "tasks_done",
    title: "Дела сделаны",
    tierName: "Бронза",
    level: 2,
    achievedAt: daysAgoIso(90),
  },
];

/** Непросмотренные (seen_at=null) — для тоста-поздравления. */
let mockUnseen: EarnedAchievement[] = [
  { id: 9001, code: "thanks", level: 1, tierName: "Первое спасибо", achievedAt: daysAgoIso(1), valueAtAchievement: 1 },
];

// ── API ────────────────────────────────────────────────────────────────────────

/**
 * Бэк выводит организацию из membership сессии, но суперпользователю (и
 * мультиорг-аккаунту) нужен явный query-параметр organizationId — на всех
 * орг-скоупных эндпоинтах модуля (проверено на живом API 08.07.2026;
 * definitions — глобальный справочник, ему organizationId не нужен).
 */
function withOrg(path: string, organizationId?: number): string {
  if (organizationId == null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organizationId=${organizationId}`;
}

export function getAchievementDefinitions(
  signal?: AbortSignal,
): Promise<AchievementDefinition[]> {
  if (ACHIEVEMENTS_USE_MOCKS) {
    return mockDelay(mockDefinitions);
  }
  return apiRequest<{ results: AchievementDefinition[] } | AchievementDefinition[]>(
    "/achievements/definitions/",
    { signal },
  ).then((data) => (Array.isArray(data) ? data : data.results));
}

export function getMyAchievements(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<MyAchievementsResponse> {
  if (ACHIEVEMENTS_USE_MOCKS) {
    return mockDelay({ achievements: mockMyAchievements, progress: mockMyProgress });
  }
  return apiRequest<MyAchievementsResponse>(withOrg("/achievements/me/", organizationId), {
    signal,
  });
}

/** Полученные бейджи коллеги — без прогресса и счётчиков (решение по видимости). */
export function getEmployeeAchievements(
  employeeId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<EarnedAchievement[]> {
  if (ACHIEVEMENTS_USE_MOCKS) {
    if (employeeId === MOCK_ME.id) {
      // Чужой профиль не получает счётчики — эмулируем сериализацию бэка.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return mockDelay(mockMyAchievements.map(({ valueAtAchievement, ...rest }) => rest));
    }
    return mockDelay(mockEmployeeAchievements[employeeId] ?? []);
  }
  return apiRequest<{ results: EarnedAchievement[] } | EarnedAchievement[]>(
    withOrg(`/achievements/employees/${employeeId}/`, organizationId),
    { signal },
  ).then((data) => (Array.isArray(data) ? data : data.results));
}

export function getOrganizationAchievements(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<MyAchievementsResponse> {
  if (ACHIEVEMENTS_USE_MOCKS) {
    return mockDelay({ achievements: mockOrgAchievements, progress: mockOrgProgress });
  }
  return apiRequest<MyAchievementsResponse>(
    withOrg("/achievements/organization/", organizationId),
    { signal },
  );
}

export function getAchievementsFeed(
  params: { page?: number; pageSize?: number; organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<AchievementsFeedResponse> {
  if (ACHIEVEMENTS_USE_MOCKS) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const sorted = [...mockFeed].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
    const start = (page - 1) * pageSize;
    return mockDelay({
      results: sorted.slice(start, start + pageSize),
      count: sorted.length,
      next: start + pageSize < sorted.length ? "mock" : null,
      previous: page > 1 ? "mock" : null,
    });
  }
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.pageSize != null) q.set("pageSize", String(params.pageSize));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  return apiRequest<AchievementsFeedResponse>(`/achievements/feed/?${q.toString()}`, {
    signal,
  });
}

/** Мои непросмотренные достижения — для поздравления при заходе. */
export function getUnseenAchievements(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<EarnedAchievement[]> {
  if (ACHIEVEMENTS_USE_MOCKS) {
    return mockDelay(mockUnseen);
  }
  return apiRequest<{ results: EarnedAchievement[] } | EarnedAchievement[]>(
    withOrg("/achievements/unseen/", organizationId),
    { signal },
  ).then((data) => (Array.isArray(data) ? data : data.results));
}

/** Пометить достижения просмотренными (без ids — все мои). */
export function markAchievementsSeen(ids?: number[], organizationId?: number): Promise<void> {
  if (ACHIEVEMENTS_USE_MOCKS) {
    mockUnseen = [];
    return mockDelay(undefined);
  }
  return apiRequest<void>(withOrg("/achievements/mark-seen/", organizationId), {
    method: "POST",
    body: ids ? { ids } : {},
  });
}
