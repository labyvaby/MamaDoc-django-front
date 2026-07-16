import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Card,
  Skeleton,
} from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";

import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import PostAddOutlined from "@mui/icons-material/PostAddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";

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
  type KnowledgeArticlePayload,
} from "../../api/knowledge";
import ArticleEditorDrawer from "./ArticleEditorDrawer";
import CategoriesDialog from "./CategoriesDialog";
import FeedCard from "./FeedCard";

/**
 * Статьи и видеоуроки показываются одной лентой (пожелание заказчика),
 * поэтому статьи запрашиваем без серверной пагинации — одним куском.
 * При росте базы до сотен материалов вернём пагинацию/инфинит-скролл.
 */
const ARTICLES_PAGE_SIZE = 100;

const MotionBox = motion(Box);

/** Сетка карточек — общая для секций «Статьи» и «Видеоуроки». */
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

const KnowledgePage: React.FC = () => {
  usePageTitle("База знаний");
  const navigate = useNavigate();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { moduleGate } = useModuleGate();

  // Доступ к странице гейтит RequireModule (App.tsx); здесь — право на действия.
  // В демо-режиме открыто всем, после выключения KNOWLEDGE_USE_MOCKS начнёт
  // требовать право автоматически (см. useModuleGate).
  const canManage = moduleGate("knowledge", ["knowledge.manage"]);

  const [categoryFilter, setCategoryFilter] = React.useState<number | "all">("all");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search.trim());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.knowledge.all });

  // ── Данные ────────────────────────────────────────────────────────────────
  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.categories({ includeInactive: false, orgId: orgId ?? null }),
    queryFn: ({ signal }) => getKnowledgeCategories({ organizationId: orgId }, signal),
  });
  const categories = categoriesQuery.data ?? [];

  const articlesQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.articles({
      category: categoryFilter,
      search: debouncedSearch,
      orgId: orgId ?? null,
    }),
    queryFn: ({ signal }) =>
      getKnowledgeArticles(
        {
          category: categoryFilter === "all" ? undefined : categoryFilter,
          search: debouncedSearch || undefined,
          // Без manage бэк и так отдаёт только published — дублируем для моков.
          isPublished: canManage ? undefined : true,
          page: 1,
          pageSize: ARTICLES_PAGE_SIZE,
          organizationId: orgId,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  // Лента — только статьи; видео живут внутри статей (YouTube-эмбед в
  // контенте, UPD заказчика 15.07.2026 — отдельная сущность «видеоурок»
  // удалена).
  const articles = articlesQuery.data?.results ?? [];
  const feedLoading = articlesQuery.isLoading;
  const feedEmpty = articles.length === 0;

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
        {/* Фильтр по разделам */}
        <MotionBox
          variants={cascadeItem}
          sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}
        >
          {categories.length > 0 && (
            <>
              <Chip
                size="small"
                label="Все"
                color={categoryFilter === "all" ? "primary" : undefined}
                variant={categoryFilter === "all" ? "filled" : "outlined"}
                onClick={() => setCategoryFilter("all")}
                sx={{ borderRadius: "7px" }}
              />
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  size="small"
                  label={c.name}
                  color={categoryFilter === c.id ? "primary" : undefined}
                  variant={categoryFilter === c.id ? "filled" : "outlined"}
                  onClick={() => setCategoryFilter(c.id)}
                  sx={{ borderRadius: "7px" }}
                />
              ))}
            </>
          )}
          {KNOWLEDGE_USE_MOCKS && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label="Демо-данные"
              sx={{ borderRadius: "7px", ml: "auto" }}
            />
          )}
        </MotionBox>

        {/* Лента статей (видео — внутри статей) */}
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
                  ? "Соберите здесь инструкции для команды — в статьи можно вставлять видео с YouTube."
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
            {articles.map((article) => (
              <FeedCard
                key={article.id}
                article={article}
                onOpen={(id) => navigate(`/knowledge/${id}`)}
              />
            ))}
          </Box>
        </MotionBox>
      </MotionBox>

      {/* Диалоги/дроверы */}
      <ArticleEditorDrawer
        open={editorOpen}
        article={null}
        categories={categories}
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
