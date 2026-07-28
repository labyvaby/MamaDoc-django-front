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
 * рендерит ответ бэка как доверенный.
 *
 * Картинки в статьях (проверено на живом API 25.07.2026, орг. 1):
 * `<img>` allowlist пропускает, но оставляет только атрибуты `src`, `alt`,
 * `title` — `width/height/class/style` вырезаются (ресайз хранить негде,
 * масштаб задаётся CSS), `data:`-URI из src вырезается (base64 не пройдёт),
 * `<figure>/<figcaption>` вырезаются целиком (подпись остаётся сырым текстом,
 * поэтому подпись храним в `alt`). Относительные src (`/media/...`) проходят.
 * Эндпоинта загрузки файла нет (POST /knowledge/attachments/ → 404) — см.
 * KNOWLEDGE_IMAGE_UPLOAD_ENABLED и тикет
 * MamaDoc/backend_ticket_knowledge_images.md.
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
  /**
   * Обложка для ленты. Бэк такого поля пока не отдаёт (undefined) — тогда
   * карточка догружает detail и берёт обложку из content (см. coverFromHtml).
   * Как только поле появится (тикет backend_ticket_knowledge_images.md, п. 4),
   * догрузка отключится сама: null = «обложки нет», а не «неизвестно».
   */
  coverUrl?: string | null;
  /** Серия, которой принадлежит статья — см. раздел «Серии статей» ниже. */
  seriesId: number | null;
  /** Денормализованное имя серии (для карточек ленты, без похода за деталями). */
  seriesName: string | null;
  partNumber: number | null;
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

// ── Картинки в статьях ────────────────────────────────────────────────────────

/**
 * Загрузка картинки файлом. Бэк закрыл тикет MamaDoc/backend_ticket_knowledge_images.md;
 * проверено живым POST 27.07.2026 — форма ответа `{url}` подтвердилась.
 */
export const KNOWLEDGE_IMAGE_UPLOAD_ENABLED = true;

export interface KnowledgeAttachment {
  /** Абсолютный или относительный URL загруженного файла. */
  url: string;
}

export function uploadKnowledgeImage(
  file: File,
  organizationId?: number,
): Promise<KnowledgeAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<KnowledgeAttachment>(
    withOrg("/knowledge/attachments/", organizationId),
    { method: "POST", formData },
  );
}

// ── Обложка статьи ────────────────────────────────────────────────────────────

/**
 * Обложка статьи хранится внутри `content` — первой картинкой с `title="cover"`.
 * Отдельного поля у бэка нет, а `title` — один из трёх атрибутов, которые
 * санитайзер оставляет на `<img>` (`class/style/data-*` он вырезает), поэтому
 * метка живёт именно в нём. В теле статьи обложка не показывается: редактор и
 * страница статьи отрезают её через splitCover.
 */
const COVER_TITLE = "cover";

const parseHtml = (html: string): Document | null =>
  typeof DOMParser === "undefined" ? null : new DOMParser().parseFromString(html, "text/html");

/**
 * Отделяет обложку от тела статьи: `body` — content без картинки-обложки.
 * Обложкой считается только явно помеченная картинка (первая картинка в тексте
 * остаётся в тексте).
 */
export function splitCover(html: string): { coverUrl: string | null; body: string } {
  const doc = parseHtml(html);
  if (!doc) return { coverUrl: null, body: html };
  const img = doc.body.querySelector(`img[title="${COVER_TITLE}"]`);
  if (!img) return { coverUrl: null, body: html };
  const coverUrl = img.getAttribute("src");
  img.remove();
  return { coverUrl: coverUrl || null, body: doc.body.innerHTML };
}

/** Возвращает content с обложкой в начале (или без неё, если url пустой). */
export function withCover(html: string, coverUrl: string | null): string {
  const { body } = splitCover(html);
  if (!coverUrl) return body;
  const src = coverUrl.replace(/"/g, "&quot;");
  return `<img src="${src}" title="${COVER_TITLE}" alt="Обложка статьи">${body}`;
}

/**
 * Обложка для карточки в ленте: явно помеченная картинка, а если её нет —
 * первая картинка статьи (чтобы у старых статей обложка появилась сама).
 */
export function coverFromHtml(html: string): string | null {
  const doc = parseHtml(html);
  if (!doc) return null;
  const img =
    doc.body.querySelector(`img[title="${COVER_TITLE}"]`) ?? doc.body.querySelector("img");
  return img?.getAttribute("src") || null;
}

/**
 * Пропустит ли санитайзер бэка такой src: абсолютные http(s) и относительные
 * (`/media/...`) — да, `data:`-URI — нет (вырезается молча, картинка исчезнет
 * после сохранения). Поэтому base64 в редакторе не разрешаем.
 */
export function isSafeImageUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/")) return true;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// ── Серии статей ──────────────────────────────────────────────────────────────

/**
 * Серия — несколько отдельных статей, которые читают по порядку («Обзор CRM.
 * Часть 1 / 2 / 3»). Каждая часть остаётся самостоятельной статьёй со своей
 * ссылкой; серия — только способ их связать.
 *
 * Бэк реализовал контракт полностью (тикет backend_ticket_knowledge_series.md,
 * ответ + проверка живым API 28.07.2026, орг. 1): отдельная сущность серии с
 * CRUD на /knowledge/series/ ({id,name,position,isActive} — тот же вид, что и
 * категории), на статье — поля `seriesId`/`seriesName` (денормализовано,
 * только для чтения)/`partNumber`. `partNumber` — целое ≥1 (ограничение в
 * БД), уникальность номера внутри серии не требуется. Очистка — явный
 * `{seriesId:null,partNumber:null}` в PATCH, отдельный tri-state флаг (как в
 * задачах) не нужен.
 *
 * ⚠ `seriesId` НЕ фильтрует список статей, а серверный поиск (`search`)
 * индексирует только title+content — `seriesName` в него не попадает
 * (проверено на живом API 28.07.2026). Соседей серии ищем среди широкой
 * выборки статей организации и сверяем `seriesId` на клиенте (см.
 * useArticleSeries.ts) — так же, как groupArticleFeed группирует ленту.
 */
export interface KnowledgeSeries {
  id: number;
  name: string;
  position: number;
  isActive: boolean;
}

export interface KnowledgeSeriesPart {
  article: KnowledgeArticleListItem;
  partNumber: number;
  /** Заголовок статьи — он же подпись части (отдельного подзаголовка у бэка нет). */
  partTitle: string;
}

/** Подпись части: заголовок статьи, а если он пуст — просто номер. */
export const partLabel = (part: KnowledgeSeriesPart): string =>
  part.partTitle || `Часть ${part.partNumber}`;

export interface KnowledgeSeriesGroup {
  key: string;
  name: string;
  /** Части по возрастанию номера. */
  parts: KnowledgeSeriesPart[];
  /** Самая свежая правка среди частей — по ней серия занимает место в ленте. */
  updatedAt: string;
}

export type KnowledgeFeedItem =
  | { kind: "article"; key: string; article: KnowledgeArticleListItem }
  | { kind: "series"; key: string; series: KnowledgeSeriesGroup };

/** Минимум частей, при котором показываем серию, а не обычную статью. */
const MIN_SERIES_PARTS = 2;

/**
 * Схлопывает части одной серии в один элемент ленты. Одинокая часть — ещё не
 * серия (автор мог только начать писать), поэтому показываем её обычной
 * карточкой. Порядок ленты сохраняется: серия встаёт на место своей первой
 * встреченной части, то есть сортировка бэка не ломается.
 *
 * ⚠ Части, не попавшие в загруженные страницы, в группу не войдут — серия
 * покажет меньше частей, чем есть. Поэтому лента группирует по всем
 * подгруженным страницам сразу, а не по одной.
 */
export function groupArticleFeed(articles: KnowledgeArticleListItem[]): KnowledgeFeedItem[] {
  const groups = new Map<number, KnowledgeSeriesGroup>();
  for (const article of articles) {
    if (article.seriesId == null || article.seriesName == null || article.partNumber == null) {
      continue;
    }
    const part: KnowledgeSeriesPart = {
      article,
      partNumber: article.partNumber,
      partTitle: article.title,
    };
    const group = groups.get(article.seriesId);
    if (group) {
      group.parts.push(part);
      if (article.updatedAt > group.updatedAt) group.updatedAt = article.updatedAt;
    } else {
      groups.set(article.seriesId, {
        key: String(article.seriesId),
        name: article.seriesName,
        parts: [part],
        updatedAt: article.updatedAt,
      });
    }
  }

  const emitted = new Set<number>();
  const feed: KnowledgeFeedItem[] = [];
  for (const article of articles) {
    const group = article.seriesId != null ? groups.get(article.seriesId) : undefined;
    if (!group || group.parts.length < MIN_SERIES_PARTS) {
      feed.push({ kind: "article", key: `a${article.id}`, article });
      continue;
    }
    if (emitted.has(article.seriesId as number)) continue;
    emitted.add(article.seriesId as number);
    group.parts.sort((a, b) => a.partNumber - b.partNumber || a.article.id - b.article.id);
    feed.push({ kind: "series", key: `s${group.key}`, series: group });
  }
  return feed;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockSeq = 800;

const mockCategories: KnowledgeCategory[] = [
  { id: 1, name: "Регистратура", position: 1, isActive: true },
  { id: 2, name: "Врачам и медсёстрам", position: 2, isActive: true },
  { id: 3, name: "Архив", position: 3, isActive: false },
];

const mockSeriesList: KnowledgeSeries[] = [
  { id: 900, name: "Работа с кассой", position: 0, isActive: true },
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
    seriesId: null,
    seriesName: null,
    partNumber: null,
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
    seriesId: null,
    seriesName: null,
    partNumber: null,
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
    seriesId: null,
    seriesName: null,
    partNumber: null,
    content:
      "<p>Чек-лист перед сменой:</p><ul><li>Проверить автоклав (журнал циклов).</li><li>Разложить инструменты по наборам.</li><li>Отметить в журнале стерилизации.</li></ul><p><i>Ответственная — старшая медсестра смены.</i></p>",
    createdAt: "2026-07-05T08:00:00Z",
    updatedAt: "2026-07-05T08:00:00Z",
  },
  // Серия из трёх частей — связаны через seriesId/partNumber (см. mockSeriesList).
  {
    id: 14,
    title: "Открытие смены",
    categoryId: 1,
    categoryName: "Регистратура",
    authorName: "Шаршебаев Автандил",
    isPublished: true,
    seriesId: 900,
    seriesName: "Работа с кассой",
    partNumber: 1,
    content:
      "<p>Смену открывает администратор, который первым вышел на работу.</p><h2>Порядок действий</h2><ol><li>Включить ККМ и дождаться загрузки.</li><li>Пробить X-отчёт, сверить остаток с журналом.</li><li>Внести разменные деньги и записать сумму.</li></ol><p>Если остаток не сошёлся — не открывать смену и позвонить бухгалтеру.</p>",
    createdAt: "2026-07-14T09:00:00Z",
    updatedAt: "2026-07-14T09:00:00Z",
  },
  {
    id: 15,
    title: "Приём оплаты",
    categoryId: 1,
    categoryName: "Регистратура",
    authorName: "Шаршебаев Автандил",
    isPublished: true,
    seriesId: 900,
    seriesName: "Работа с кассой",
    partNumber: 2,
    content:
      "<p>Оплата принимается после приёма, кроме процедур по прейскуранту.</p><h2>Наличные</h2><p>Пересчитать при пациенте, пробить чек, выдать сдачу вместе с чеком.</p><h2>Карта</h2><p>Сумма на терминале должна совпадать с суммой в системе до копейки.</p>",
    createdAt: "2026-07-15T09:00:00Z",
    updatedAt: "2026-07-16T11:00:00Z",
  },
  {
    id: 16,
    title: "Закрытие смены и инкассация",
    categoryId: 1,
    categoryName: "Регистратура",
    authorName: "Шаршебаев Автандил",
    isPublished: true,
    seriesId: 900,
    seriesName: "Работа с кассой",
    partNumber: 3,
    content:
      "<p>Смена закрывается в день её открытия, переносить на завтра нельзя.</p><h2>Z-отчёт</h2><p>Снять Z-отчёт, подшить в журнал, расписаться.</p><h2>Инкассация</h2><p>Сумму сверх разменного фонда сдать старшему администратору под роспись.</p>",
    createdAt: "2026-07-16T09:00:00Z",
    updatedAt: "2026-07-17T08:00:00Z",
  },
  {
    id: 13,
    title: "Регламент работы с кассой (черновик)",
    categoryId: 1,
    categoryName: "Регистратура",
    authorName: "Шаршебаев Автандил",
    isPublished: false,
    seriesId: null,
    seriesName: null,
    partNumber: null,
    content: "<p>Черновик: правила открытия/закрытия смены, инкассация…</p>",
    createdAt: "2026-07-12T15:00:00Z",
    updatedAt: "2026-07-12T15:00:00Z",
  },
];

const categoryName = (id: number | null): string | null =>
  id == null ? null : mockCategories.find((c) => c.id === id)?.name ?? `Раздел #${id}`;

const resolveSeriesName = (id: number | null | undefined): string | null =>
  id == null ? null : mockSeriesList.find((s) => s.id === id)?.name ?? null;

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

// ── Серии ─────────────────────────────────────────────────────────────────────

export function getKnowledgeSeries(
  params: { organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<KnowledgeSeries[]> {
  if (KNOWLEDGE_USE_MOCKS) {
    return mockDelay([...mockSeriesList].sort((a, b) => a.position - b.position));
  }
  const q = new URLSearchParams();
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  const qs = q.toString();
  return apiRequest<KnowledgeSeries[]>(`/knowledge/series/${qs ? `?${qs}` : ""}`, { signal });
}

export interface KnowledgeSeriesPayload {
  name: string;
  position?: number;
  isActive?: boolean;
}

export function createKnowledgeSeries(
  payload: KnowledgeSeriesPayload,
  organizationId?: number,
): Promise<KnowledgeSeries> {
  if (KNOWLEDGE_USE_MOCKS) {
    const series: KnowledgeSeries = {
      id: ++mockSeq,
      name: payload.name,
      position: payload.position ?? mockSeriesList.length,
      isActive: payload.isActive ?? true,
    };
    mockSeriesList.push(series);
    return mockDelay(series);
  }
  return apiRequest<KnowledgeSeries>(withOrg("/knowledge/series/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateKnowledgeSeries(
  seriesId: number,
  payload: Partial<KnowledgeSeriesPayload>,
  organizationId?: number,
): Promise<KnowledgeSeries> {
  if (KNOWLEDGE_USE_MOCKS) {
    const series = mockSeriesList.find((s) => s.id === seriesId);
    if (!series) return Promise.reject(new Error("Серия не найдена (мок)"));
    Object.assign(series, payload);
    return mockDelay({ ...series });
  }
  return apiRequest<KnowledgeSeries>(
    withOrg(`/knowledge/series/${seriesId}/`, organizationId),
    { method: "PATCH", body: payload },
  );
}

export function deleteKnowledgeSeries(
  seriesId: number,
  organizationId?: number,
): Promise<void> {
  if (KNOWLEDGE_USE_MOCKS) {
    const idx = mockSeriesList.findIndex((s) => s.id === seriesId);
    if (idx >= 0) mockSeriesList.splice(idx, 1);
    return mockDelay(undefined);
  }
  return apiRequest<void>(withOrg(`/knowledge/series/${seriesId}/`, organizationId), {
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
  /** Серия статьи; null (в паре с partNumber: null) — отвязать от серии. */
  seriesId?: number | null;
  partNumber?: number | null;
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
      seriesId: payload.seriesId ?? null,
      seriesName: resolveSeriesName(payload.seriesId),
      partNumber: payload.partNumber ?? null,
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
    if (payload.seriesId !== undefined) article.seriesName = resolveSeriesName(payload.seriesId);
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

