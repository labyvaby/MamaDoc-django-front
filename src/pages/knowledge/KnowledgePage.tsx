import React from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Card,
  Divider,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router";

import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import PostAddOutlined from "@mui/icons-material/PostAddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import FolderOffOutlined from "@mui/icons-material/FolderOffOutlined";
import CreateNewFolderOutlined from "@mui/icons-material/CreateNewFolderOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { useModuleGate } from "../../hooks/useModuleGate";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  ListEmptyState,
  PageHeader,
  cascadeContainer,
  cascadeItem,
} from "../../components/ui";
import {
  KNOWLEDGE_USE_MOCKS,
  createKnowledgeArticle,
  getKnowledgeArticles,
  getKnowledgeCategories,
  getKnowledgeFolders,
  getKnowledgeSeries,
  groupArticleFeed,
  setArticleFolder,
  type KnowledgeArticleListItem,
  type KnowledgeArticlePayload,
} from "../../api/knowledge";
import ArticleDraggable from "./ArticleDraggable";
import ArticleEditorDrawer from "./ArticleEditorDrawer";
import CategoriesDialog from "./CategoriesDialog";
import FeedCard from "./FeedCard";
import FolderTile from "./FolderTile";
import FoldersDialog from "./FoldersDialog";
import { ARTICLE_DND_TYPE, readDraggedArticleIds } from "./folders";
import SeriesCard from "./SeriesCard";
import { useReadArticles } from "./useReadArticles";

/**
 * Размер страницы ленты. Крупный намеренно: части одной серии схлопываются в
 * общую карточку только среди загруженных статей (см. groupArticleFeed), и
 * чем меньше страница, тем чаще серия покажется неполной до дозагрузки.
 */
const ARTICLES_PAGE_SIZE = 60;

/** Сортировка — клиентская: серверного ordering у бэка не подтверждено. */
type SortKey = "recent" | "oldest" | "title";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Сначала новые" },
  { value: "oldest", label: "Сначала старые" },
  { value: "title", label: "По алфавиту" },
];

const MotionBox = motion(Box);

/** Сетка карточек ленты. */
const feedGridSx = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, 1fr)",
    md: "repeat(3, 1fr)",
    lg: "repeat(4, 1fr)",
  },
  gap: 1.5,
} as const;

/**
 * Сетка папок — те же колонки, что у ленты, но плитка низкая: папка несёт
 * только название и счётчик, обложки у неё нет.
 */
const folderGridSx = { ...feedGridSx, mb: 0.5 } as const;

/** Скелетон карточки ленты: превью 16:9 + две строки текста. */
const FeedCardSkeleton: React.FC = () => (
  <Card variant="outlined" sx={{ borderRadius: "14px" }}>
    <Skeleton variant="rectangular" sx={{ aspectRatio: "16/9", height: "auto", width: "100%" }} />
    <Box sx={{ p: 1.5 }}>
      <Skeleton variant="rounded" width={72} height={20} sx={{ borderRadius: "7px", mb: 0.75 }} />
      <Skeleton variant="text" width="85%" />
      <Skeleton variant="text" width="55%" />
    </Box>
  </Card>
);

const sortArticles = (
  articles: KnowledgeArticleListItem[],
  sort: SortKey,
): KnowledgeArticleListItem[] => {
  const list = [...articles];
  if (sort === "title") return list.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  const dir = sort === "oldest" ? 1 : -1;
  return list.sort((a, b) => dir * a.updatedAt.localeCompare(b.updatedAt));
};

const KnowledgePage: React.FC = () => {
  usePageTitle("База знаний");
  const navigate = useNavigate();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { moduleGate } = useModuleGate();
  const { isRead } = useReadArticles();

  // Доступ к странице гейтит RequireModule (App.tsx); здесь — право на действия.
  // В демо-режиме открыто всем, после выключения KNOWLEDGE_USE_MOCKS начнёт
  // требовать право автоматически (см. useModuleGate).
  const canManage = moduleGate("knowledge", ["knowledge.manage"]);

  const [categoryFilter, setCategoryFilter] = React.useState<number | "all">("all");
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const debouncedSearch = useDebouncedValue(search.trim());

  /**
   * Открытая папка живёт в URL (`?folder=12`), а не в стейте: так на папку можно
   * дать ссылку, а возврат со страницы статьи (кнопкой браузера или «Назад»)
   * приводит обратно в папку, а не в корень.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const folderParam = searchParams.get("folder");
  const openFolderId = folderParam && /^\d+$/.test(folderParam) ? Number(folderParam) : null;

  const openFolder = React.useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(searchParams);
      if (id == null) next.delete("folder");
      else next.set("folder", String(id));
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.knowledge.all });

  // ── Данные ────────────────────────────────────────────────────────────────
  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.categories({ includeInactive: false, orgId: orgId ?? null }),
    queryFn: ({ signal }) => getKnowledgeCategories({ organizationId: orgId }, signal),
  });
  const categories = React.useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  const foldersQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.folders({ orgId: orgId ?? null }),
    queryFn: ({ signal }) => getKnowledgeFolders({ organizationId: orgId }, signal),
  });
  const folders = React.useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);

  const currentFolder = React.useMemo(
    () => folders.find((f) => f.id === openFolderId) ?? null,
    [folders, openFolderId],
  );

  /**
   * Папку удалили под открытой ссылкой — возвращаем в корень, иначе человек
   * остался бы в пустой папке без названия и без выхода, кроме «Назад».
   */
  React.useEffect(() => {
    if (openFolderId != null && !foldersQuery.isLoading && !currentFolder) {
      openFolder(null);
    }
  }, [openFolderId, currentFolder, foldersQuery.isLoading, openFolder]);

  // Без manage бэк и так отдаёт только published — дублируем для моков.
  const publishedFilter = canManage ? undefined : true;

  /**
   * Отбор по папке — на сервере (`?folder=<id>` / `?folder=none`):
   *   • в папке — только её статьи;
   *   • в корне — только статьи вне папок (разложенные лежат внутри плиток);
   *   • при поиске — фильтр снимаем: искать надо и внутри папок, иначе находка
   *     превратилась бы в «ничего не найдено» на глазах у найденного.
   */
  const serverFolder: number | "none" | undefined = debouncedSearch
    ? undefined
    : openFolderId ?? "none";

  const articlesQuery = useInfiniteQuery({
    queryKey: djangoQueryKeys.knowledge.articles({
      category: categoryFilter,
      folder: serverFolder ?? "any",
      search: debouncedSearch,
      orgId: orgId ?? null,
    }),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getKnowledgeArticles(
        {
          category: categoryFilter === "all" ? undefined : categoryFilter,
          folder: serverFolder,
          search: debouncedSearch || undefined,
          isPublished: publishedFilter,
          page: pageParam,
          pageSize: ARTICLES_PAGE_SIZE,
          organizationId: orgId,
        },
        signal,
      ),
    // next — абсолютный URL следующей страницы; номер считаем сами, чтобы
    // не разбирать чужой querystring.
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    placeholderData: keepPreviousData,
  });

  /** Лента: отбор по папке сделал сервер, здесь статьи уже нужные. */
  const visibleArticles = React.useMemo(
    () => articlesQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [articlesQuery.data],
  );

  const allLoaded = !articlesQuery.hasNextPage;

  /** Счётчики плиток считает бэк (`articleCount`) — по запросу на плитку не ходим. */
  const folderCounts = React.useMemo(
    () => new Map(folders.map((f) => [f.id, f.articleCount ?? 0])),
    [folders],
  );

  /**
   * Чип «Все» — по всем статьям организации, а не по текущей выборке: в корне
   * лента показывает только статьи вне папок, и её `count` занижал бы итог на
   * всё разложенное по папкам.
   */
  const totalQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.articles({
      countOf: "all",
      search: debouncedSearch,
      orgId: orgId ?? null,
    }),
    queryFn: ({ signal }) =>
      getKnowledgeArticles(
        {
          search: debouncedSearch || undefined,
          isPublished: publishedFilter,
          page: 1,
          pageSize: 1,
          organizationId: orgId,
        },
        signal,
      ),
    select: (r) => r.count,
    placeholderData: keepPreviousData,
  });
  const total = totalQuery.data ?? 0;

  /**
   * Счётчики у чипов разделов. Бэк агрегата не отдаёт, но `count` в ответе
   * списка — это общее число по фильтру, поэтому берём его запросом на одну
   * запись. Отдельные запросы, чтобы счётчик был верным и при пагинации:
   * считать по загруженным статьям значило бы показывать «12» там, где 40.
   */
  const countQueries = useQueries({
    queries: categories.map((category) => ({
      queryKey: djangoQueryKeys.knowledge.articles({
        countOf: category.id,
        search: debouncedSearch,
        orgId: orgId ?? null,
      }),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getKnowledgeArticles(
          {
            category: category.id,
            search: debouncedSearch || undefined,
            isPublished: publishedFilter,
            page: 1,
            pageSize: 1,
            organizationId: orgId,
          },
          signal,
        ),
      select: (r: { count: number }) => r.count,
      placeholderData: keepPreviousData,
    })),
  });
  // Без useMemo: countQueries — новый массив на каждый рендер, мемоизация по
  // нему всё равно не сработала бы, а построение Map из горстки разделов дешевле.
  const categoryCounts = new Map(
    categories.map((c, i) => [c.id, countQueries[i]?.data as number | undefined] as const),
  );

  /**
   * Лента: сортировка, затем схлопывание серий. При активном поиске серии не
   * схлопываем — человек ищет конкретную часть, и прятать её внутрь карточки
   * серии значило бы «ничего не найдено» на глазах у найденного.
   */
  const feed = React.useMemo(() => {
    const sorted = sortArticles(visibleArticles, sort);
    if (debouncedSearch) {
      return sorted.map((article) => ({
        kind: "article" as const,
        key: `a${article.id}`,
        article,
      }));
    }
    return groupArticleFeed(sorted);
  }, [visibleArticles, sort, debouncedSearch]);

  const feedLoading = articlesQuery.isLoading;
  const feedEmpty = feed.length === 0;

  // ── Новая статья (редактирование — на странице статьи) ───────────────────
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorBusy, setEditorBusy] = React.useState(false);
  const [editorError, setEditorError] = React.useState<string | null>(null);

  const handleArticleSubmit = async (payload: KnowledgeArticlePayload) => {
    setEditorBusy(true);
    setEditorError(null);
    try {
      await createKnowledgeArticle(payload, orgId);
      notify?.({ type: "success", message: "Статья создана" });
      setEditorOpen(false);
      invalidate();
    } catch (err) {
      setEditorError(getErrorMessage(err));
    } finally {
      setEditorBusy(false);
    }
  };

  const [categoriesOpen, setCategoriesOpen] = React.useState(false);
  const [foldersOpen, setFoldersOpen] = React.useState(false);

  /**
   * Меню выбора папки — путь для тач-устройств: нативного HTML5-перетаскивания
   * на телефоне нет, и без меню папки были бы там только для чтения.
   */
  const [moveMenu, setMoveMenu] = React.useState<{
    anchor: HTMLElement;
    articleIds: number[];
  } | null>(null);

  /** Положить статьи в папку (folderId: null — вынуть из папки). */
  const moveArticles = React.useCallback(
    async (articleIds: number[], folderId: number | null) => {
      try {
        // Последовательно: у серии частей несколько, и на живом API это PATCH'и —
        // параллельные запросы к одному ресурсу без нужды.
        for (const id of articleIds) {
          await setArticleFolder(id, folderId, orgId);
        }
        // Инвалидируем весь модуль: у папок изменился articleCount, а статья
        // ушла из выборки корня (`?folder=none`) в выборку папки.
        invalidate();
        const target = folderId != null ? folders.find((f) => f.id === folderId)?.name : null;
        notify?.({
          type: "success",
          message: target ? `Перенесено в «${target}»` : "Убрано из папки",
        });
      } catch (err) {
        notify?.({ type: "error", message: getErrorMessage(err) });
      }
    },
    // invalidate — стабильная замыкающая функция над queryClient
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, folders, notify],
  );

  /** Плитки папок показываем только в корне: внутри папки и в поиске они лишние. */
  const showFolders = openFolderId == null && !debouncedSearch && folders.length > 0;

  // Существующие серии — подсказка автокомплита в редакторе.
  const seriesQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.series({ orgId: orgId ?? null }),
    queryFn: ({ signal }) => getKnowledgeSeries({ organizationId: orgId }, signal),
    enabled: canManage,
  });
  const knownSeries = seriesQuery.data ?? [];

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="База знаний"
        showTitle={false}
        onAdd={canManage ? () => { setEditorError(null); setEditorOpen(true); } : undefined}
        addButtonText="Статья"
        addButtonIcon={<PostAddOutlined />}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder="Поиск по материалам"
        loading={articlesQuery.isFetching}
        actions={
          canManage ? (
            <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
              <Button
                variant="outlined"
                startIcon={<CreateNewFolderOutlined />}
                onClick={() => setFoldersOpen(true)}
                sx={{ whiteSpace: "nowrap" }}
              >
                Папки
              </Button>
              <Button
                variant="outlined"
                startIcon={<CategoryOutlined />}
                onClick={() => setCategoriesOpen(true)}
                sx={{ whiteSpace: "nowrap" }}
              >
                Разделы
              </Button>
            </Stack>
          ) : undefined
        }
      />

      <MotionBox
        variants={cascadeContainer}
        initial="hidden"
        animate="show"
        sx={(t) => ({
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          px: t.appLayout.page.paddingX,
          pb: 1.5,
        })}
      >
        {/* Хлебные крошки открытой папки. «База знаний» — ещё и зона сброса:
            карточку, брошенную на неё, вынимаем из папки. */}
        {openFolderId != null && (
          <MotionBox
            variants={cascadeItem}
            sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 34 }}
          >
            <Tooltip title="Ко всем материалам">
              <IconButton size="small" onClick={() => openFolder(null)}>
                <ArrowBackOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Breadcrumbs sx={{ flex: 1, minWidth: 0 }}>
              <Link
                component="button"
                underline="hover"
                color="text.secondary"
                onClick={() => openFolder(null)}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(ARTICLE_DND_TYPE)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const ids = readDraggedArticleIds(e.dataTransfer);
                  if (ids.length > 0) void moveArticles(ids, null);
                }}
                sx={{ background: "none", border: 0, p: 0, cursor: "pointer", font: "inherit" }}
              >
                База знаний
              </Link>
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
                <FolderOutlined sx={{ fontSize: 18, color: "primary.main" }} />
                {currentFolder ? (
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {currentFolder.name}
                  </Typography>
                ) : (
                  <Skeleton variant="text" width={120} />
                )}
              </Stack>
            </Breadcrumbs>
          </MotionBox>
        )}

        {/* Фильтр по разделам + сортировка */}
        <MotionBox
          variants={cascadeItem}
          sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}
        >
          {categories.length > 0 && (
            <>
              <Chip
                size="small"
                label={total > 0 ? `Все · ${total}` : "Все"}
                color={categoryFilter === "all" ? "primary" : undefined}
                variant={categoryFilter === "all" ? "filled" : "outlined"}
                onClick={() => setCategoryFilter("all")}
                sx={{ borderRadius: "7px" }}
              />
              {categories.map((c) => {
                const count = categoryCounts.get(c.id);
                return (
                  <Chip
                    key={c.id}
                    size="small"
                    label={count === undefined ? c.name : `${c.name} · ${count}`}
                    color={categoryFilter === c.id ? "primary" : undefined}
                    variant={categoryFilter === c.id ? "filled" : "outlined"}
                    onClick={() => setCategoryFilter(c.id)}
                    sx={{ borderRadius: "7px" }}
                  />
                );
              })}
            </>
          )}

          <Stack direction="row" alignItems="center" gap={0.75} sx={{ ml: "auto" }}>
            {KNOWLEDGE_USE_MOCKS && (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label="Демо-данные"
                sx={{ borderRadius: "7px" }}
              />
            )}
            <TextField
              select
              size="small"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              sx={{ minWidth: 168, "& .MuiInputBase-root": { borderRadius: "7px" } }}
            >
              {SORT_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </MotionBox>

        {/* Лента материалов (видео — внутри статей) */}
        <MotionBox variants={cascadeItem} sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {articlesQuery.isError && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {getErrorMessage(articlesQuery.error)}
            </Alert>
          )}

          {/* Папки: только в корне. Плитка — цель перетаскивания карточек. */}
          {showFolders && (
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="overline"
                color="text.secondary"
                component="div"
                sx={{ mb: 0.75 }}
              >
                Папки
              </Typography>
              <Box sx={folderGridSx}>
                {folders.map((folder) => (
                  <FolderTile
                    key={folder.id}
                    name={folder.name}
                    count={folderCounts.get(folder.id) ?? 0}
                    onOpen={() => openFolder(folder.id)}
                    onDropArticles={
                      canManage ? (ids) => void moveArticles(ids, folder.id) : undefined
                    }
                    onEdit={canManage ? () => setFoldersOpen(true) : undefined}
                  />
                ))}
              </Box>
              {feed.length > 0 && (
                <Typography
                  variant="overline"
                  color="text.secondary"
                  component="div"
                  sx={{ mt: 2, mb: 0.75 }}
                >
                  Статьи вне папок
                </Typography>
              )}
            </Box>
          )}

          {/* Пустая лента в корне при наличии папок — норма (всё разложено),
              подсказку в этом случае не показываем. */}
          {!feedLoading && feedEmpty && (openFolderId != null || !!debouncedSearch || !showFolders) && (
            <ListEmptyState
              icon={openFolderId != null ? <FolderOffOutlined /> : <MenuBookOutlined />}
              title={
                debouncedSearch
                  ? "Ничего не найдено"
                  : openFolderId != null
                  ? "В этой папке пока нет статей"
                  : "Материалов пока нет"
              }
              description={
                debouncedSearch
                  ? "Попробуйте изменить запрос или снять фильтр по разделу."
                  : openFolderId != null
                  ? canManage
                    ? "Перетащите карточку статьи на папку в общем списке — или воспользуйтесь кнопкой на карточке."
                    : "Статьи появятся здесь, когда их сюда сложат."
                  : canManage
                  ? "Соберите здесь инструкции для команды — в статьи можно вставлять картинки и видео с YouTube, а длинный материал разбить на части."
                  : "Здесь появятся инструкции вашей организации."
              }
              action={
                canManage && !debouncedSearch && openFolderId == null ? (
                  <Button
                    variant="outlined"
                    startIcon={<PostAddOutlined />}
                    onClick={() => { setEditorError(null); setEditorOpen(true); }}
                  >
                    Написать первую статью
                  </Button>
                ) : undefined
              }
            />
          )}
          <Box sx={feedGridSx}>
            {feedLoading &&
              Array.from({ length: 8 }).map((_, i) => <FeedCardSkeleton key={`s_${i}`} />)}
            {feed.map((item) => {
              // Серию переносим целиком: её части иначе расползутся по папкам, и
              // в корне серия схлопнется в неполную карточку.
              const articleIds =
                item.kind === "series"
                  ? item.series.parts.map((p) => p.article.id)
                  : [item.article.id];
              return (
                <ArticleDraggable
                  key={item.key}
                  articleIds={articleIds}
                  enabled={canManage}
                  onMoveClick={
                    canManage ? (anchor) => setMoveMenu({ anchor, articleIds }) : undefined
                  }
                >
                  {item.kind === "series" ? (
                    <SeriesCard
                      series={item.series}
                      orgId={orgId}
                      isRead={isRead}
                      highlight={debouncedSearch}
                      onOpen={(id) => navigate(`/knowledge/${id}`)}
                    />
                  ) : (
                    <FeedCard
                      article={item.article}
                      orgId={orgId}
                      read={isRead(item.article.id)}
                      highlight={debouncedSearch}
                      onOpen={(id) => navigate(`/knowledge/${id}`)}
                    />
                  )}
                </ArticleDraggable>
              );
            })}
          </Box>

          {/* Дозагрузка: раньше лента молча обрезалась на сотне материалов */}
          {!feedLoading && !allLoaded && (
            <Stack alignItems="center" gap={0.5} sx={{ py: 2 }}>
              <Button
                variant="outlined"
                startIcon={<ExpandMoreOutlined />}
                onClick={() => void articlesQuery.fetchNextPage()}
                disabled={articlesQuery.isFetchingNextPage}
              >
                {articlesQuery.isFetchingNextPage ? "Загрузка…" : "Показать ещё"}
              </Button>
              <Typography variant="caption" color="text.secondary">
                Показано {visibleArticles.length} из {total}
                {sort !== "recent" && " · сортировка применяется к загруженным"}
              </Typography>
            </Stack>
          )}
        </MotionBox>
      </MotionBox>

      {/* Диалоги/дроверы */}
      <ArticleEditorDrawer
        open={editorOpen}
        article={null}
        categories={categories}
        knownSeries={knownSeries}
        busy={editorBusy}
        error={editorError}
        onClose={() => setEditorOpen(false)}
        onSubmit={handleArticleSubmit}
      />
      <CategoriesDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
      <FoldersDialog open={foldersOpen} onClose={() => setFoldersOpen(false)} />

      {/* Выбор папки без перетаскивания — путь для телефона и планшета. */}
      <Menu
        open={moveMenu !== null}
        anchorEl={moveMenu?.anchor ?? null}
        onClose={() => setMoveMenu(null)}
      >
        {folders.map((folder) => (
          <MenuItem
            key={folder.id}
            onClick={() => {
              if (moveMenu) void moveArticles(moveMenu.articleIds, folder.id);
              setMoveMenu(null);
            }}
          >
            <ListItemIcon>
              <FolderOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>{folder.name}</ListItemText>
          </MenuItem>
        ))}
        {folders.length === 0 && (
          <MenuItem
            onClick={() => {
              setMoveMenu(null);
              setFoldersOpen(true);
            }}
          >
            <ListItemIcon>
              <CreateNewFolderOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>Создать первую папку</ListItemText>
          </MenuItem>
        )}
        {/* «Вынести» показываем только внутри папки: в корне статья и так вне папок. */}
        {openFolderId != null && folders.length > 0 && <Divider />}
        {openFolderId != null && (
          <MenuItem
            onClick={() => {
              if (moveMenu) void moveArticles(moveMenu.articleIds, null);
              setMoveMenu(null);
            }}
          >
            <ListItemIcon>
              <FolderOffOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>Убрать из папки</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};

export default KnowledgePage;
