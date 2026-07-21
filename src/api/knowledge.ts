import { apiRequest } from "./client";
import { mockDelay, paginate, withOrg } from "./mockUtils";

/**
 * Модуль «База знаний» — статьи (rich-text, TipTap → HTML). Видео вставляются
 * прямо в статью (YouTube-эмбед через @tiptap/extension-youtube), отдельной
 * сущности «видеоурок» нет (UPD заказчика 15.07.2026; была — удалена).
 * Знания общие на организацию, скоупа по филиалам нет. Статьи редактирует
 * только админ (knowledge.manage).
 *
 * Контракт: MamaDoc/backend_tickets_2026-07-13/backend_ticket_knowledge_module.md +
 * frontend-knowledge-guide.md. Бэкенд реализован и проверен на живом API
 * (21.07.2026, орг. 1): категории — плоский массив {id,name,position,isActive},
 * статьи — DRF-пагинация {results,count,next,previous}, поля camelCase (DMR),
 * detail отдаёт content (HTML). Фильтры category/search подтверждены; неизвестные
 * query-параметры бэк молча игнорирует (не 400). Гейты (RequireModule/сайдбар)
 * возвращаются автоматически после выключения флага — см. useModuleGate.
 *
 * ⚠ content — HTML: санитизация на бэке (allowlist тегов; iframe разрешён
 * ТОЛЬКО с src на youtube-nocookie.com/youtube.com — см. UPD тикета), фронт
 * рендерит ответ бэка как доверенный. Картинки в статьях — v2 (открытый
 * вопрос тикета), кнопки вставки изображения в редакторе нет.
 *
 * ⚠ Открытый вопрос (не подтверждён на живом API — на проде нет черновиков):
 * фильтр публикации шлём как isPublished (camelCase, консистентно с остальными
 * DMR-полями/фильтрами модуля). Если бэк ждёт иное имя — черновики не
 * отфильтруются молча (неизвестный параметр игнорируется). Проверить, когда
 * появится хотя бы один неопубликованный черновик.
 */

export const KNOWLEDGE_USE_MOCKS = false;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeCategory {
  id: number;
  name: string;
  /** Порядок сортировки (меньше — выше). */
  position: number;
  isActive: boolean;
}

/** Облегчённая форма для списка — без content. */
export interface KnowledgeArticleListItem {
  id: number;
  title: string;
  categoryId: number | null;
  categoryName: string | null;
  authorName: string | null;
  isPublished: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface KnowledgeArticle extends KnowledgeArticleListItem {
  /** HTML из TipTap; бэк санитизирует по allowlist. */
  content: string;
}

export interface KnowledgeArticlesResponse {
  results: KnowledgeArticleListItem[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface KnowledgeArticlesFilters {
  category?: number;
  /** Поиск по title+content (на бэке). */
  search?: string;
  /** manage-only: без права бэк отдаёт только published. */
  isPublished?: boolean;
  page?: number;
  pageSize?: number;
  /** Обязателен для суперпользователя/мультиорг (см. withOrg в api/tasks.ts). */
  organizationId?: number;
}

// ── YouTube helpers ───────────────────────────────────────────────────────────

/**
 * Достаёт id видео из ссылки YouTube (watch?v=, youtu.be/, embed/, shorts/).
 * null — ссылка не распознана (валидация зеркалит бэк: домены youtube.com/youtu.be).
 */
export function parseYoutubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const idOk = (id: string | null | undefined) =>
    id && /^[\w-]{6,20}$/.test(id) ? id : null;
  if (host === "youtu.be") return idOk(u.pathname.split("/")[1]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") return idOk(u.searchParams.get("v"));
    const m = /^\/(embed|shorts|live)\/([\w-]+)/.exec(u.pathname);
    if (m) return idOk(m[2]);
  }
  return null;
}

export const youtubeEmbedUrl = (videoId: string): string =>
  `https://www.youtube-nocookie.com/embed/${videoId}`;

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockSeq = 800;

const mockCategories: KnowledgeCategory[] = [
  { id: 1, name: "Регистратура", position: 1, isActive: true },
  { id: 2, name: "Врачам и медсёстрам", position: 2, isActive: true },
  { id: 3, name: "Архив", position: 3, isActive: false },
];

type MockArticle = KnowledgeArticle;

const mockArticles: MockArticle[] = [
  {
    id: 10,
    title: "Обзор CRM для новых сотрудников",
    categoryId: 1,
    categoryName: "Регистратура",
    authorName: "Шаршебаев Автандил",
    isPublished: true,
    // Видео в статье — HTML, который генерирует @tiptap/extension-youtube.
    content:
      "<p>Полный тур по системе: приёмы, пациенты, расписание.</p>" +
      '<div data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" allowfullscreen="true"></iframe></div>' +
      "<p>После просмотра — попробуйте создать тестовый приём в своём филиале.</p>",
    createdAt: "2026-07-02T10:00:00Z",
    updatedAt: "2026-07-02T10:00:00Z",
  },
  {
    id: 11,
    title: "Как оформить приём пациента",
    categoryId: 1,
    categoryName: "Регистратура",
    authorName: "Шаршебаев Автандил",
    isPublished: true,
    content:
      "<h2>Порядок оформления</h2><p>Пациент подходит к стойке регистратуры. Проверяем карточку в системе: <b>Все пациенты → Поиск по телефону</b>.</p><ol><li>Если пациент новый — создаём карточку (ФИО, дата рождения, телефон).</li><li>Выбираем врача и услугу.</li><li>Печатаем талон и провожаем в кабинет.</li></ol><blockquote><p>Оплата — только после приёма, кроме процедур по прейскуранту.</p></blockquote>",
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-10T12:30:00Z",
  },
  {
    id: 12,
    title: "Стерилизация инструментов: чек-лист",
    categoryId: 2,
    categoryName: "Врачам и медсёстрам",
    authorName: "Шаршебаев Автандил",
    isPublished: true,
    content:
      "<p>Чек-лист перед сменой:</p><ul><li>Проверить автоклав (журнал циклов).</li><li>Разложить инструменты по наборам.</li><li>Отметить в журнале стерилизации.</li></ul><p><i>Ответственная — старшая медсестра смены.</i></p>",
    createdAt: "2026-07-05T08:00:00Z",
    updatedAt: "2026-07-05T08:00:00Z",
  },
  {
    id: 13,
    title: "Регламент работы с кассой (черновик)",
    categoryId: 1,
    categoryName: "Регистратура",
    authorName: "Шаршебаев Автандил",
    isPublished: false,
    content: "<p>Черновик: правила открытия/закрытия смены, инкассация…</p>",
    createdAt: "2026-07-12T15:00:00Z",
    updatedAt: "2026-07-12T15:00:00Z",
  },
];

const categoryName = (id: number | null): string | null =>
  id == null ? null : mockCategories.find((c) => c.id === id)?.name ?? `Раздел #${id}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const stripListItem = (a: MockArticle): KnowledgeArticleListItem => {
  const { content, ...rest } = a;
  void content; // content намеренно отбрасывается — форма списка без тела статьи
  return rest;
};

// ── Разделы ───────────────────────────────────────────────────────────────────

export function getKnowledgeCategories(
  params: { includeInactive?: boolean; organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<KnowledgeCategory[]> {
  if (KNOWLEDGE_USE_MOCKS) {
    let list = [...mockCategories].sort((a, b) => a.position - b.position);
    if (!params.includeInactive) list = list.filter((c) => c.isActive);
    return mockDelay(list);
  }
  const q = new URLSearchParams();
  if (params.includeInactive) q.set("includeInactive", "true");
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  const qs = q.toString();
  return apiRequest<KnowledgeCategory[]>(`/knowledge/categories/${qs ? `?${qs}` : ""}`, { signal });
}

export interface KnowledgeCategoryPayload {
  name: string;
  position: number;
  isActive: boolean;
}

export function createKnowledgeCategory(
  payload: KnowledgeCategoryPayload,
  organizationId?: number,
): Promise<KnowledgeCategory> {
  if (KNOWLEDGE_USE_MOCKS) {
    const category: KnowledgeCategory = { id: ++mockSeq, ...payload };
    mockCategories.push(category);
    return mockDelay(category);
  }
  return apiRequest<KnowledgeCategory>(withOrg("/knowledge/categories/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateKnowledgeCategory(
  categoryId: number,
  payload: Partial<KnowledgeCategoryPayload>,
  organizationId?: number,
): Promise<KnowledgeCategory> {
  if (KNOWLEDGE_USE_MOCKS) {
    const category = mockCategories.find((c) => c.id === categoryId);
    if (!category) return Promise.reject(new Error("Раздел не найден (мок)"));
    Object.assign(category, payload);
    return mockDelay({ ...category });
  }
  return apiRequest<KnowledgeCategory>(
    withOrg(`/knowledge/categories/${categoryId}/`, organizationId),
    { method: "PATCH", body: payload },
  );
}

export function deleteKnowledgeCategory(
  categoryId: number,
  organizationId?: number,
): Promise<void> {
  if (KNOWLEDGE_USE_MOCKS) {
    const idx = mockCategories.findIndex((c) => c.id === categoryId);
    if (idx >= 0) mockCategories.splice(idx, 1);
    return mockDelay(undefined);
  }
  return apiRequest<void>(withOrg(`/knowledge/categories/${categoryId}/`, organizationId), {
    method: "DELETE",
  });
}

// ── Статьи ────────────────────────────────────────────────────────────────────

export function getKnowledgeArticles(
  filters: KnowledgeArticlesFilters = {},
  signal?: AbortSignal,
): Promise<KnowledgeArticlesResponse> {
  if (KNOWLEDGE_USE_MOCKS) {
    let list = [...mockArticles];
    if (filters.category != null) list = list.filter((a) => a.categoryId === filters.category);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      list = list.filter(
        (a) => a.title.toLowerCase().includes(s) || a.content.toLowerCase().includes(s),
      );
    }
    if (filters.isPublished != null) list = list.filter((a) => a.isPublished === filters.isPublished);
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return mockDelay(paginate(list.map(stripListItem), filters.page, filters.pageSize));
  }
  const q = new URLSearchParams();
  if (filters.category != null) q.set("category", String(filters.category));
  if (filters.search) q.set("search", filters.search);
  if (filters.isPublished != null) q.set("isPublished", String(filters.isPublished));
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  return apiRequest<KnowledgeArticlesResponse>(`/knowledge/articles/?${q.toString()}`, { signal });
}

export function getKnowledgeArticle(
  articleId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<KnowledgeArticle> {
  if (KNOWLEDGE_USE_MOCKS) {
    const article = mockArticles.find((a) => a.id === articleId);
    if (!article) return Promise.reject(new Error("Статья не найдена (мок)"));
    return mockDelay({ ...article });
  }
  return apiRequest<KnowledgeArticle>(
    withOrg(`/knowledge/articles/${articleId}/`, organizationId),
    { signal },
  );
}

export interface KnowledgeArticlePayload {
  title: string;
  content: string;
  categoryId: number | null;
  isPublished: boolean;
}

export function createKnowledgeArticle(
  payload: KnowledgeArticlePayload,
  organizationId?: number,
): Promise<KnowledgeArticle> {
  if (KNOWLEDGE_USE_MOCKS) {
    const now = new Date().toISOString();
    const article: MockArticle = {
      id: ++mockSeq,
      title: payload.title,
      content: payload.content,
      categoryId: payload.categoryId,
      categoryName: categoryName(payload.categoryId),
      authorName: "Вы (мок)",
      isPublished: payload.isPublished,
      createdAt: now,
      updatedAt: now,
    };
    mockArticles.unshift(article);
    return mockDelay({ ...article });
  }
  return apiRequest<KnowledgeArticle>(withOrg("/knowledge/articles/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateKnowledgeArticle(
  articleId: number,
  payload: Partial<KnowledgeArticlePayload>,
  organizationId?: number,
): Promise<KnowledgeArticle> {
  if (KNOWLEDGE_USE_MOCKS) {
    const article = mockArticles.find((a) => a.id === articleId);
    if (!article) return Promise.reject(new Error("Статья не найдена (мок)"));
    Object.assign(article, payload);
    if (payload.categoryId !== undefined) article.categoryName = categoryName(payload.categoryId);
    article.updatedAt = new Date().toISOString();
    return mockDelay({ ...article });
  }
  return apiRequest<KnowledgeArticle>(
    withOrg(`/knowledge/articles/${articleId}/`, organizationId),
    { method: "PATCH", body: payload },
  );
}

export function deleteKnowledgeArticle(
  articleId: number,
  organizationId?: number,
): Promise<void> {
  if (KNOWLEDGE_USE_MOCKS) {
    const idx = mockArticles.findIndex((a) => a.id === articleId);
    if (idx >= 0) mockArticles.splice(idx, 1);
    return mockDelay(undefined);
  }
  return apiRequest<void>(withOrg(`/knowledge/articles/${articleId}/`, organizationId), {
    method: "DELETE",
  });
}

