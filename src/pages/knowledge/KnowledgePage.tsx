import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Card,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
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
import { useNavigate } from "react-router";

import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import PostAddOutlined from "@mui/icons-material/PostAddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";

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
  getKnowledgeSeries,
  groupArticleFeed,
  type KnowledgeArticleListItem,
  type KnowledgeArticlePayload,
} from "../../api/knowledge";
import ArticleEditorDrawer from "./ArticleEditorDrawer";
import CategoriesDialog from "./CategoriesDialog";
import FeedCard from "./FeedCard";
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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.knowledge.all });

  // ── Данные ────────────────────────────────────────────────────────────────
  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.categories({ includeInactive: false, orgId: orgId ?? null }),
    queryFn: ({ signal }) => getKnowledgeCategories({ organizationId: orgId }, signal),
  });
  const categories = React.useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  // Без manage бэк и так отдаёт только published — дублируем для моков.
  const publishedFilter = canManage ? undefined : true;

  const articlesQuery = useInfiniteQuery({
    queryKey: djangoQueryKeys.knowledge.articles({
      category: categoryFilter,
      search: debouncedSearch,
      orgId: orgId ?? null,
    }),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getKnowledgeArticles(
        {
          category: categoryFilter === "all" ? undefined : categoryFilter,
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

  const articles = React.useMemo(
    () => articlesQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [articlesQuery.data],
  );
  const total = articlesQuery.data?.pages[0]?.count ?? 0;
  const allLoaded = !articlesQuery.hasNextPage;

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
    const sorted = sortArticles(articles, sort);
    if (debouncedSearch) {
      return sorted.map((article) => ({
        kind: "article" as const,
        key: `a${article.id}`,
        article,
      }));
    }
    return groupArticleFeed(sorted);
  }, [articles, sort, debouncedSearch]);

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
            <Button
              variant="outlined"
              startIcon={<CategoryOutlined />}
              onClick={() => setCategoriesOpen(true)}
              sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              Разделы
            </Button>
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
          {!feedLoading && feedEmpty && (
            <ListEmptyState
              icon={<MenuBookOutlined />}
              title={debouncedSearch ? "Ничего не найдено" : "Материалов пока нет"}
              description={
                debouncedSearch
                  ? "Попробуйте изменить запрос или снять фильтр по разделу."
                  : canManage
                  ? "Соберите здесь инструкции для команды — в статьи можно вставлять картинки и видео с YouTube, а длинный материал разбить на части."
                  : "Здесь появятся инструкции вашей организации."
              }
              action={
                canManage && !debouncedSearch ? (
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
            {feed.map((item) =>
              item.kind === "series" ? (
                <SeriesCard
                  key={item.key}
                  series={item.series}
                  orgId={orgId}
                  isRead={isRead}
                  highlight={debouncedSearch}
                  onOpen={(id) => navigate(`/knowledge/${id}`)}
                />
              ) : (
                <FeedCard
                  key={item.key}
                  article={item.article}
                  orgId={orgId}
                  read={isRead(item.article.id)}
                  highlight={debouncedSearch}
                  onOpen={(id) => navigate(`/knowledge/${id}`)}
                />
              ),
            )}
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
                Показано {articles.length} из {total}
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
    </Box>
  );
};

export default KnowledgePage;
