import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Card,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";

import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import PostAddOutlined from "@mui/icons-material/PostAddOutlined";
import VideoCallOutlined from "@mui/icons-material/VideoCallOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { useModuleGate } from "../../hooks/useModuleGate";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  ConfirmDialog,
  ListEmptyState,
  PageHeader,
  cascadeContainer,
  cascadeItem,
} from "../../components/ui";
import {
  KNOWLEDGE_USE_MOCKS,
  createKnowledgeArticle,
  createKnowledgeVideo,
  deleteKnowledgeVideo,
  getKnowledgeArticles,
  getKnowledgeCategories,
  getKnowledgeVideos,
  parseYoutubeId,
  updateKnowledgeVideo,
  youtubeEmbedUrl,
  type KnowledgeArticlePayload,
  type KnowledgeVideo,
  type KnowledgeVideoPayload,
} from "../../api/knowledge";
import ArticleEditorDrawer from "./ArticleEditorDrawer";
import VideoFormDialog from "./VideoFormDialog";
import CategoriesDialog from "./CategoriesDialog";
import FeedCard, { type FeedItem } from "./FeedCard";

/**
 * Статьи и видеоуроки показываются одной лентой (пожелание заказчика),
 * поэтому статьи запрашиваем без серверной пагинации — одним куском.
 * При росте базы до сотен материалов вернём пагинацию/инфинит-скролл.
 */
const ARTICLES_PAGE_SIZE = 100;

const MotionBox = motion(Box);

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

  const videosQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.videos({ category: categoryFilter, orgId: orgId ?? null }),
    queryFn: ({ signal }) =>
      getKnowledgeVideos(
        {
          category: categoryFilter === "all" ? undefined : categoryFilter,
          organizationId: orgId,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  // Общая лента: статьи и видео вместе, новые сверху. Поиск по видео —
  // клиентский (в API поиска по видео нет), по статьям — серверный.
  const feed = React.useMemo<FeedItem[]>(() => {
    const s = debouncedSearch.toLowerCase();
    const articles: FeedItem[] = (articlesQuery.data?.results ?? []).map((article) => ({
      kind: "article",
      createdAt: article.createdAt,
      article,
    }));
    const videos: FeedItem[] = (videosQuery.data ?? [])
      // Без manage показываем только опубликованные (на бэке это делает право).
      .filter((v) => canManage || v.isPublished)
      .filter(
        (v) =>
          !s ||
          v.title.toLowerCase().includes(s) ||
          v.description.toLowerCase().includes(s),
      )
      .map((video) => ({ kind: "video", createdAt: video.createdAt, video }));
    return [...articles, ...videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [articlesQuery.data, videosQuery.data, canManage, debouncedSearch]);

  const feedLoading = articlesQuery.isLoading || videosQuery.isLoading;

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

  // ── Видео ─────────────────────────────────────────────────────────────────
  const [videoFormOpen, setVideoFormOpen] = React.useState(false);
  const [videoEditing, setVideoEditing] = React.useState<KnowledgeVideo | null>(null);
  const [videoBusy, setVideoBusy] = React.useState(false);
  const [videoError, setVideoError] = React.useState<string | null>(null);
  const [deletingVideo, setDeletingVideo] = React.useState<KnowledgeVideo | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [playing, setPlaying] = React.useState<KnowledgeVideo | null>(null);

  const handleVideoSubmit = async (payload: KnowledgeVideoPayload) => {
    setVideoBusy(true);
    setVideoError(null);
    try {
      if (videoEditing) {
        await updateKnowledgeVideo(videoEditing.id, payload, orgId);
        notify?.({ type: "success", message: "Видеоурок сохранён" });
      } else {
        await createKnowledgeVideo(payload, orgId);
        notify?.({ type: "success", message: "Видеоурок добавлен" });
      }
      setVideoFormOpen(false);
      invalidate();
    } catch (err) {
      setVideoError(getErrorMessage(err));
    } finally {
      setVideoBusy(false);
    }
  };

  const handleVideoDelete = async () => {
    if (!deletingVideo) return;
    setDeleteBusy(true);
    try {
      await deleteKnowledgeVideo(deletingVideo.id, orgId);
      notify?.({ type: "success", message: "Видеоурок удалён" });
      setDeletingVideo(null);
      invalidate();
    } catch (err) {
      notify?.({ type: "error", message: "Не удалось удалить", description: getErrorMessage(err) });
    } finally {
      setDeleteBusy(false);
    }
  };

  const [categoriesOpen, setCategoriesOpen] = React.useState(false);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="База знаний"
        showTitle={false}
        onAdd={
          canManage
            ? () => {
                setVideoEditing(null);
                setVideoError(null);
                setVideoFormOpen(true);
              }
            : undefined
        }
        addButtonText="Видео"
        addButtonIcon={<VideoCallOutlined />}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder="Поиск по материалам"
        loading={articlesQuery.isFetching || videosQuery.isFetching}
        actions={
          canManage ? (
            <>
              <Button
                variant="outlined"
                startIcon={<PostAddOutlined />}
                onClick={() => { setEditorError(null); setEditorOpen(true); }}
                sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
              >
                Статья
              </Button>
              <Button
                variant="outlined"
                startIcon={<CategoryOutlined />}
                onClick={() => setCategoriesOpen(true)}
                sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
              >
                Разделы
              </Button>
            </>
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

        {/* Общая лента: статьи и видео вместе */}
        <MotionBox variants={cascadeItem} sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {(articlesQuery.isError || videosQuery.isError) && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {getErrorMessage(articlesQuery.error ?? videosQuery.error)}
            </Alert>
          )}
          {!feedLoading && feed.length === 0 && (
            <ListEmptyState
              icon={<MenuBookOutlined />}
              title={debouncedSearch ? "Ничего не найдено" : "Материалов пока нет"}
              description={
                debouncedSearch
                  ? "Попробуйте изменить запрос или снять фильтр по разделу."
                  : canManage
                  ? "Соберите здесь инструкции и видеоуроки для команды — статьи и видео появятся общей лентой."
                  : "Здесь появятся инструкции и видеоуроки вашей организации."
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
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(4, 1fr)" },
              gap: 1.5,
            }}
          >
            {feedLoading &&
              Array.from({ length: 8 }).map((_, i) => <FeedCardSkeleton key={`s_${i}`} />)}
            {feed.map((item) => (
              <FeedCard
                key={item.kind === "article" ? `a_${item.article.id}` : `v_${item.video.id}`}
                item={item}
                canManage={canManage}
                onOpenArticle={(id) => navigate(`/knowledge/${id}`)}
                onPlayVideo={setPlaying}
                onEditVideo={(video) => {
                  setVideoEditing(video);
                  setVideoError(null);
                  setVideoFormOpen(true);
                }}
                onDeleteVideo={setDeletingVideo}
              />
            ))}
          </Box>
        </MotionBox>
      </MotionBox>

      {/* Плеер */}
      <Dialog open={playing !== null} onClose={() => setPlaying(null)} maxWidth="md" fullWidth>
        {playing && (
          <>
            <DialogTitle sx={{ pr: 6 }}>
              {playing.title}
              <IconButton
                onClick={() => setPlaying(null)}
                sx={{ position: "absolute", right: 8, top: 8 }}
              >
                <CloseOutlined />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pb: 3 }}>
              {(() => {
                const videoId = parseYoutubeId(playing.youtubeUrl);
                return videoId ? (
                  <Box
                    component="iframe"
                    src={youtubeEmbedUrl(videoId)}
                    title={playing.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    sx={{ width: "100%", aspectRatio: "16/9", border: 0, borderRadius: 1.5 }}
                  />
                ) : (
                  <Alert severity="error">Не удалось распознать ссылку на YouTube</Alert>
                );
              })()}
              {playing.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  {playing.description}
                </Typography>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>

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
      <VideoFormDialog
        open={videoFormOpen}
        video={videoEditing}
        categories={categories}
        busy={videoBusy}
        error={videoError}
        onClose={() => setVideoFormOpen(false)}
        onSubmit={handleVideoSubmit}
      />
      <CategoriesDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
      <ConfirmDialog
        open={deletingVideo !== null}
        title="Удалить видеоурок?"
        message={`«${deletingVideo?.title ?? ""}» будет удалён. Само видео на YouTube не пострадает.`}
        confirmText="Удалить"
        variant="error"
        loading={deleteBusy}
        onConfirm={handleVideoDelete}
        onClose={() => setDeletingVideo(null)}
      />
    </Box>
  );
};

export default KnowledgePage;
