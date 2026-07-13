import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";

import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import PostAddOutlined from "@mui/icons-material/PostAddOutlined";
import VideoCallOutlined from "@mui/icons-material/VideoCallOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { ApiError, extractErrorMessage as extractApiError } from "../../api/client";
import { formatDateRu } from "../../utility/format";
import { djangoQueryKeys } from "../../api/queryKeys";
import { ConfirmDialog } from "../../components/ui";
import {
  KNOWLEDGE_USE_MOCKS,
  createKnowledgeArticle,
  createKnowledgeVideo,
  deleteKnowledgeArticle,
  deleteKnowledgeVideo,
  getKnowledgeArticle,
  getKnowledgeArticles,
  getKnowledgeCategories,
  getKnowledgeVideos,
  parseYoutubeId,
  updateKnowledgeArticle,
  updateKnowledgeVideo,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  type KnowledgeArticle,
  type KnowledgeArticleListItem,
  type KnowledgeArticlePayload,
  type KnowledgeVideo,
  type KnowledgeVideoPayload,
} from "../../api/knowledge";
import ArticleEditorDrawer from "./ArticleEditorDrawer";
import VideoFormDialog from "./VideoFormDialog";
import CategoriesDialog from "./CategoriesDialog";

/**
 * Статьи и видеоуроки показываются одной лентой (пожелание заказчика),
 * поэтому статьи запрашиваем без серверной пагинации — одним куском.
 * При росте базы до сотен материалов вернём пагинацию/инфинит-скролл.
 */
const ARTICLES_PAGE_SIZE = 100;

/** Элемент общей ленты: статья или видео, сортировка по дате создания. */
type FeedItem =
  | { kind: "article"; createdAt: string; article: KnowledgeArticleListItem }
  | { kind: "video"; createdAt: string; video: KnowledgeVideo };

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return extractApiError(err.payload, err.status);
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
}

const KnowledgePage: React.FC = () => {
  usePageTitle("База знаний");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { isSuperAdmin, canAccess } = usePermissions();

  // TODO(после интеграции): убрать обход KNOWLEDGE_USE_MOCKS — как в tasks.
  const canManage = KNOWLEDGE_USE_MOCKS || isSuperAdmin() || canAccess("knowledge.manage");

  const [categoryFilter, setCategoryFilter] = React.useState<number | "all">("all");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

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

  // ── Просмотр статьи ───────────────────────────────────────────────────────
  const [viewArticleId, setViewArticleId] = React.useState<number | null>(null);
  const articleQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.article(viewArticleId ?? 0),
    queryFn: ({ signal }) => getKnowledgeArticle(viewArticleId!, orgId, signal),
    enabled: viewArticleId !== null,
  });

  // ── Редактор статьи ───────────────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorArticle, setEditorArticle] = React.useState<KnowledgeArticle | null>(null);
  const [editorBusy, setEditorBusy] = React.useState(false);
  const [editorError, setEditorError] = React.useState<string | null>(null);

  const openCreateArticle = () => {
    setEditorArticle(null);
    setEditorError(null);
    setEditorOpen(true);
  };

  const openEditArticle = (article: KnowledgeArticle) => {
    setEditorArticle(article);
    setEditorError(null);
    setEditorOpen(true);
  };

  const handleArticleSubmit = async (payload: KnowledgeArticlePayload) => {
    setEditorBusy(true);
    setEditorError(null);
    try {
      if (editorArticle) {
        await updateKnowledgeArticle(editorArticle.id, payload, orgId);
        notify?.({ type: "success", message: "Статья сохранена" });
      } else {
        await createKnowledgeArticle(payload, orgId);
        notify?.({ type: "success", message: "Статья создана" });
      }
      setEditorOpen(false);
      invalidate();
    } catch (err) {
      setEditorError(extractErrorMessage(err));
    } finally {
      setEditorBusy(false);
    }
  };

  const [deletingArticle, setDeletingArticle] = React.useState<KnowledgeArticleListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const handleArticleDelete = async () => {
    if (!deletingArticle) return;
    setDeleteBusy(true);
    try {
      await deleteKnowledgeArticle(deletingArticle.id, orgId);
      notify?.({ type: "success", message: "Статья удалена" });
      setDeletingArticle(null);
      setViewArticleId(null);
      invalidate();
    } catch (err) {
      notify?.({ type: "error", message: "Не удалось удалить", description: extractErrorMessage(err) });
    } finally {
      setDeleteBusy(false);
    }
  };

  // ── Видео ─────────────────────────────────────────────────────────────────
  const [videoFormOpen, setVideoFormOpen] = React.useState(false);
  const [videoEditing, setVideoEditing] = React.useState<KnowledgeVideo | null>(null);
  const [videoBusy, setVideoBusy] = React.useState(false);
  const [videoError, setVideoError] = React.useState<string | null>(null);
  const [deletingVideo, setDeletingVideo] = React.useState<KnowledgeVideo | null>(null);
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
      setVideoError(extractErrorMessage(err));
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
      notify?.({ type: "error", message: "Не удалось удалить", description: extractErrorMessage(err) });
    } finally {
      setDeleteBusy(false);
    }
  };

  const [categoriesOpen, setCategoriesOpen] = React.useState(false);

  /** Кнопки управления в углу карточки (canManage). */
  const cardActions = (edit: () => void, remove: () => void) => (
    <Stack
      direction="row"
      sx={{
        position: "absolute",
        top: 6,
        right: 6,
        borderRadius: 1.5,
        bgcolor: alpha(theme.palette.background.paper, 0.85),
      }}
    >
      <Tooltip title="Изменить">
        <IconButton size="small" onClick={edit}>
          <EditOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Удалить">
        <IconButton size="small" color="error" onClick={remove}>
          <DeleteOutlineOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  // ── Просмотр статьи (полноэкранный внутри страницы) ───────────────────────
  if (viewArticleId !== null) {
    const article = articleQuery.data;
    return (
      <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: 860, mx: "auto" }}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
          <IconButton onClick={() => setViewArticleId(null)}>
            <ArrowBackOutlined />
          </IconButton>
          <Typography variant="body2" color="text.secondary">
            База знаний
          </Typography>
          {canManage && article && (
            <Stack direction="row" gap={0.5} sx={{ ml: "auto" }}>
              <Tooltip title="Изменить">
                <IconButton onClick={() => openEditArticle(article)}>
                  <EditOutlined />
                </IconButton>
              </Tooltip>
              <Tooltip title="Удалить">
                <IconButton color="error" onClick={() => setDeletingArticle(article)}>
                  <DeleteOutlineOutlined />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Stack>

        {articleQuery.isLoading && (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        )}
        {articleQuery.isError && (
          <Alert severity="error">{extractErrorMessage(articleQuery.error)}</Alert>
        )}
        {article && (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 }, borderRadius: "14px" }}>
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
              {article.categoryName && (
                <Chip size="small" variant="outlined" label={article.categoryName} />
              )}
              {!article.isPublished && (
                <Chip size="small" color="warning" variant="outlined" label="Черновик" />
              )}
            </Stack>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
              {article.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {article.authorName ?? "—"} · обновлено {formatDateRu(article.updatedAt)}
            </Typography>
            <Divider sx={{ my: 2 }} />
            {/* content — HTML из TipTap; санитизация по allowlist на бэке (контракт). */}
            <Box
              dangerouslySetInnerHTML={{ __html: article.content }}
              sx={{
                "& p": { m: 0, mb: 1.25, lineHeight: 1.7 },
                "& h2": { mt: 2.5, mb: 1, fontSize: "1.3rem" },
                "& h3": { mt: 2, mb: 1, fontSize: "1.1rem" },
                "& ul, & ol": { pl: 3, mb: 1.25 },
                "& li": { mb: 0.5 },
                "& blockquote": {
                  borderLeft: `3px solid ${theme.palette.divider}`,
                  m: 0,
                  my: 1.5,
                  pl: 1.5,
                  color: "text.secondary",
                },
                "& pre": {
                  background: alpha(theme.palette.text.primary, 0.06),
                  borderRadius: 1.5,
                  p: 1.5,
                  fontSize: "0.85rem",
                  overflowX: "auto",
                },
                "& a": { color: "primary.main" },
                "& img": { maxWidth: "100%", borderRadius: 1.5 },
                "& table": { borderCollapse: "collapse", width: "100%" },
                "& td, & th": { border: `1px solid ${theme.palette.divider}`, p: 1 },
              }}
            />
          </Paper>
        )}

        <ArticleEditorDrawer
          open={editorOpen}
          article={editorArticle}
          categories={categories}
          busy={editorBusy}
          error={editorError}
          onClose={() => setEditorOpen(false)}
          onSubmit={handleArticleSubmit}
        />
        <ConfirmDialog
          open={deletingArticle !== null}
          title="Удалить статью?"
          message={`«${deletingArticle?.title ?? ""}» будет удалена без возможности восстановления.`}
          confirmText="Удалить"
          variant="error"
          loading={deleteBusy}
          onConfirm={handleArticleDelete}
          onClose={() => setDeletingArticle(null)}
        />
      </Box>
    );
  }

  // ── Лента ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 1.5, p: 1 }}>
      {/* Тулбар */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        gap={1.5}
      >
        <Stack direction="row" alignItems="center" gap={1} sx={{ mr: "auto" }}>
          <MenuBookOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            База знаний
          </Typography>
          {KNOWLEDGE_USE_MOCKS && (
            <Chip size="small" color="warning" variant="outlined" label="Демо-данные" />
          )}
        </Stack>

        <TextField
          size="small"
          placeholder="Поиск по материалам"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: "100%", sm: 240 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        {canManage && (
          <>
            <Button
              variant="outlined"
              startIcon={<CategoryOutlined />}
              onClick={() => setCategoriesOpen(true)}
            >
              Разделы
            </Button>
            <Button variant="outlined" startIcon={<PostAddOutlined />} onClick={openCreateArticle}>
              Статья
            </Button>
            <Button
              variant="contained"
              startIcon={<VideoCallOutlined />}
              onClick={() => {
                setVideoEditing(null);
                setVideoError(null);
                setVideoFormOpen(true);
              }}
            >
              Видео
            </Button>
          </>
        )}
      </Stack>

      {/* Фильтр по разделам */}
      {categories.length > 0 && (
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          <Chip
            size="small"
            label="Все"
            color={categoryFilter === "all" ? "primary" : undefined}
            variant={categoryFilter === "all" ? "filled" : "outlined"}
            onClick={() => setCategoryFilter("all")}
          />
          {categories.map((c) => (
            <Chip
              key={c.id}
              size="small"
              label={c.name}
              color={categoryFilter === c.id ? "primary" : undefined}
              variant={categoryFilter === c.id ? "filled" : "outlined"}
              onClick={() => setCategoryFilter(c.id)}
            />
          ))}
        </Stack>
      )}

      {/* Общая лента: статьи и видео вместе */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {(articlesQuery.isError || videosQuery.isError) && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {extractErrorMessage(articlesQuery.error ?? videosQuery.error)}
          </Alert>
        )}
        {feedLoading && (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        )}
        {!feedLoading && feed.length === 0 && (
          <Stack alignItems="center" justifyContent="center" sx={{ py: 8, color: "text.secondary" }}>
            <MenuBookOutlined sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="body2">
              {debouncedSearch ? "Ничего не найдено" : "Материалов пока нет"}
            </Typography>
          </Stack>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(4, 1fr)" },
            gap: 1.5,
          }}
        >
          {feed.map((item) => {
            if (item.kind === "article") {
              const article = item.article;
              return (
                <Card key={`a_${article.id}`} variant="outlined" sx={{ borderRadius: "14px", position: "relative" }}>
                  <CardActionArea onClick={() => setViewArticleId(article.id)}>
                    <Box
                      sx={{
                        aspectRatio: "16/9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.12 : 0.06),
                      }}
                    >
                      <ArticleOutlined sx={{ fontSize: 44, color: "primary.main", opacity: 0.75 }} />
                    </Box>
                    <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Stack direction="row" gap={0.75} sx={{ mb: 0.5 }} flexWrap="wrap">
                        <Chip size="small" variant="outlined" icon={<ArticleOutlined />} label="Статья" />
                        {article.categoryName && (
                          <Chip size="small" variant="outlined" label={article.categoryName} />
                        )}
                        {!article.isPublished && (
                          <Chip size="small" color="warning" variant="outlined" label="Черновик" />
                        )}
                      </Stack>
                      <Typography variant="body2" fontWeight={600}>
                        {article.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {article.authorName ?? "—"} · {formatDateRu(article.updatedAt)}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              );
            }
            const video = item.video;
            const videoId = parseYoutubeId(video.youtubeUrl);
            return (
              <Card key={`v_${video.id}`} variant="outlined" sx={{ borderRadius: "14px", position: "relative" }}>
                <CardActionArea onClick={() => setPlaying(video)}>
                  {videoId && (
                    <Box sx={{ position: "relative" }}>
                      <CardMedia
                        component="img"
                        image={youtubeThumbnailUrl(videoId)}
                        alt={video.title}
                        sx={{ aspectRatio: "16/9", objectFit: "cover" }}
                      />
                      <PlayCircleOutlined
                        sx={{
                          position: "absolute",
                          inset: 0,
                          m: "auto",
                          fontSize: 52,
                          color: "#fff",
                          filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.6))",
                        }}
                      />
                    </Box>
                  )}
                  <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                    <Stack direction="row" gap={0.75} sx={{ mb: 0.5 }} flexWrap="wrap">
                      <Chip size="small" variant="outlined" icon={<PlayCircleOutlined />} label="Видео" />
                      {video.categoryName && (
                        <Chip size="small" variant="outlined" label={video.categoryName} />
                      )}
                      {!video.isPublished && (
                        <Chip size="small" color="warning" variant="outlined" label="Черновик" />
                      )}
                    </Stack>
                    <Typography variant="body2" fontWeight={600}>
                      {video.title}
                    </Typography>
                    {video.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {video.description}
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
                {canManage &&
                  cardActions(
                    () => {
                      setVideoEditing(video);
                      setVideoError(null);
                      setVideoFormOpen(true);
                    },
                    () => setDeletingVideo(video),
                  )}
              </Card>
            );
          })}
        </Box>
      </Box>

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
        article={editorArticle}
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
        open={deletingArticle !== null}
        title="Удалить статью?"
        message={`«${deletingArticle?.title ?? ""}» будет удалена без возможности восстановления.`}
        confirmText="Удалить"
        variant="error"
        loading={deleteBusy}
        onConfirm={handleArticleDelete}
        onClose={() => setDeletingArticle(null)}
      />
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
