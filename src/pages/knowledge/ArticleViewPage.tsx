import React from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Chip,
  Divider,
  IconButton,
  Link,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { useNavigate, useParams } from "react-router";

import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { useModuleGate } from "../../hooks/useModuleGate";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { getErrorMessage } from "../../api/client";
import { formatDateRu } from "../../utility/format";
import { djangoQueryKeys } from "../../api/queryKeys";
import { ConfirmDialog } from "../../components/ui";
import {
  deleteKnowledgeArticle,
  getKnowledgeArticle,
  getKnowledgeCategories,
  updateKnowledgeArticle,
  type KnowledgeArticlePayload,
} from "../../api/knowledge";
import ArticleEditorDrawer from "./ArticleEditorDrawer";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Извлекает оглавление из h2/h3 контента и проставляет им id для якорей. */
function processArticleHtml(html: string): { html: string; toc: TocItem[] } {
  if (typeof DOMParser === "undefined") return { html, toc: [] };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const toc: TocItem[] = [];
  doc.body.querySelectorAll("h2, h3").forEach((el, i) => {
    const id = `article-section-${i}`;
    el.id = id;
    const text = (el.textContent ?? "").trim();
    if (text) toc.push({ id, text, level: el.tagName === "H2" ? 2 : 3 });
  });
  return { html: doc.body.innerHTML, toc };
}

/** Оценка времени чтения: ~180 слов в минуту, минимум 1 мин. */
function readingTimeMin(html: string): number {
  const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

/**
 * Страница статьи базы знаний — /knowledge/:articleId (deep-link: ссылкой
 * можно делиться, «назад» браузера возвращает в ленту).
 */
const ArticleViewPage: React.FC = () => {
  usePageTitle("База знаний");
  const theme = useTheme();
  const navigate = useNavigate();
  const { articleId: articleIdParam } = useParams();
  const articleId = Number(articleIdParam);
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { moduleGate } = useModuleGate();

  // Право на действия: в демо-режиме открыто всем, после выключения
  // KNOWLEDGE_USE_MOCKS начнёт требовать право автоматически (см. useModuleGate).
  const canManage = moduleGate("knowledge", ["knowledge.manage"]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.knowledge.all });

  const articleQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.article(articleId),
    queryFn: ({ signal }) => getKnowledgeArticle(articleId, orgId, signal),
    enabled: Number.isFinite(articleId),
  });
  const article = articleQuery.data;

  // Контент с якорями + оглавление и время чтения.
  const processed = React.useMemo(
    () => (article ? processArticleHtml(article.content) : { html: "", toc: [] as TocItem[] }),
    [article],
  );
  const readMin = React.useMemo(
    () => (article ? readingTimeMin(article.content) : 0),
    [article],
  );
  const showToc = processed.toc.length >= 2;

  // ── Прогресс чтения ───────────────────────────────────────────────────────
  const articleRef = React.useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (!article) return;
    let raf = 0;
    const update = () => {
      const el = articleRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const passed = Math.min(Math.max(-rect.top, 0), Math.max(total, 0));
      setProgress(total > 80 ? passed / total : 1);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    // capture=true: контент скроллится во вложенном контейнере лейаута, не на window.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [article]);

  // Разделы — для селекта в редакторе (ключ совпадает с лентой — из кэша).
  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.categories({ includeInactive: false, orgId: orgId ?? null }),
    queryFn: ({ signal }) => getKnowledgeCategories({ organizationId: orgId }, signal),
    enabled: canManage,
  });

  // ── Редактирование ────────────────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorBusy, setEditorBusy] = React.useState(false);
  const [editorError, setEditorError] = React.useState<string | null>(null);

  const handleSubmit = async (payload: KnowledgeArticlePayload) => {
    setEditorBusy(true);
    setEditorError(null);
    try {
      await updateKnowledgeArticle(articleId, payload, orgId);
      notify?.({ type: "success", message: "Статья сохранена" });
      setEditorOpen(false);
      invalidate();
    } catch (err) {
      setEditorError(getErrorMessage(err));
    } finally {
      setEditorBusy(false);
    }
  };

  // ── Удаление ──────────────────────────────────────────────────────────────
  const [deleting, setDeleting] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const handleDelete = async () => {
    setDeleteBusy(true);
    try {
      await deleteKnowledgeArticle(articleId, orgId);
      notify?.({ type: "success", message: "Статья удалена" });
      invalidate();
      navigate("/knowledge");
    } catch (err) {
      notify?.({ type: "error", message: "Не удалось удалить", description: getErrorMessage(err) });
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: showToc ? 1120 : 880, mx: "auto" }}>
      {/* Прогресс чтения */}
      {article && (
        <Box
          sx={(t) => ({
            position: "sticky",
            top: 0,
            zIndex: 2,
            height: 3,
            mb: 1,
            borderRadius: "2px",
            bgcolor: alpha(t.palette.primary.main, 0.12),
            overflow: "hidden",
          })}
        >
          <Box
            sx={{
              height: "100%",
              width: `${Math.round(progress * 100)}%`,
              bgcolor: "primary.main",
              transition: "width .1s linear",
            }}
          />
        </Box>
      )}

      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate("/knowledge")}>
          <ArrowBackOutlined />
        </IconButton>
        <Breadcrumbs sx={{ minWidth: 0, "& .MuiBreadcrumbs-ol": { flexWrap: "nowrap" } }}>
          <Link
            component="button"
            type="button"
            underline="hover"
            color="text.secondary"
            variant="body2"
            onClick={() => navigate("/knowledge")}
          >
            База знаний
          </Link>
          <Typography variant="body2" color="text.primary" noWrap sx={{ maxWidth: { xs: 160, sm: 360 } }}>
            {article?.title ?? "…"}
          </Typography>
        </Breadcrumbs>
        {canManage && article && (
          <Stack direction="row" gap={0.5} sx={{ ml: "auto" }}>
            <Tooltip title="Изменить">
              <IconButton onClick={() => { setEditorError(null); setEditorOpen(true); }}>
                <EditOutlined />
              </IconButton>
            </Tooltip>
            <Tooltip title="Удалить">
              <IconButton color="error" onClick={() => setDeleting(true)}>
                <DeleteOutlineOutlined />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Stack>

      {articleQuery.isLoading && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 }, borderRadius: "14px" }}>
          <Stack direction="row" gap={1} sx={{ mb: 1.5 }}>
            <Skeleton variant="rounded" width={84} height={22} sx={{ borderRadius: "7px" }} />
            <Skeleton variant="rounded" width={64} height={22} sx={{ borderRadius: "7px" }} />
          </Stack>
          <Skeleton variant="text" width="65%" height={40} />
          <Skeleton variant="text" width={220} sx={{ mb: 2 }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="text" width={`${[95, 88, 92, 70, 90, 45][i]}%`} />
          ))}
        </Paper>
      )}
      {articleQuery.isError && (
        <Alert severity="error">{getErrorMessage(articleQuery.error)}</Alert>
      )}
      {article && (
        <Stack direction="row" gap={2.5} alignItems="flex-start">
        <Paper
          ref={articleRef}
          variant="outlined"
          sx={{ p: { xs: 2, md: 4 }, borderRadius: "14px", flex: 1, minWidth: 0 }}
        >
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
            {article.categoryName && (
              <Chip size="small" variant="outlined" label={article.categoryName} sx={{ borderRadius: "7px" }} />
            )}
            {!article.isPublished && (
              <Chip size="small" color="warning" variant="outlined" label="Черновик" sx={{ borderRadius: "7px" }} />
            )}
          </Stack>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
            {article.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {article.authorName ?? "—"} · обновлено {formatDateRu(article.updatedAt)} · ~{readMin}{" "}
            мин чтения
          </Typography>
          <Divider sx={{ my: 2 }} />
          {/* content — HTML из TipTap; санитизация по allowlist на бэке (контракт). */}
          <Box
            dangerouslySetInnerHTML={{ __html: processed.html }}
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
              // Якорь не прячется под sticky-прогрессбаром при переходе из оглавления.
              "& h2, & h3": { scrollMarginTop: 16 },
            }}
          />
        </Paper>

        {/* Оглавление (десктоп) */}
        {showToc && (
          <Box
            component="nav"
            sx={{
              width: 220,
              flexShrink: 0,
              position: "sticky",
              top: 16,
              display: { xs: "none", md: "block" },
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1, fontSize: "0.75rem" }}
            >
              Содержание
            </Typography>
            <Stack gap={0.25}>
              {processed.toc.map((item) => (
                <Link
                  key={item.id}
                  component="button"
                  type="button"
                  underline="none"
                  onClick={() =>
                    document
                      .getElementById(item.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  sx={{
                    display: "block",
                    textAlign: "left",
                    py: 0.5,
                    pl: item.level === 3 ? 2 : 0.5,
                    pr: 0.5,
                    borderRadius: "7px",
                    fontSize: "0.85rem",
                    color: "text.secondary",
                    transition: "color .15s ease, background-color .15s ease",
                    "&:hover": { color: "text.primary", bgcolor: "action.hover" },
                  }}
                >
                  {item.text}
                </Link>
              ))}
            </Stack>
          </Box>
        )}
        </Stack>
      )}

      <ArticleEditorDrawer
        open={editorOpen}
        article={article ?? null}
        categories={categoriesQuery.data ?? []}
        busy={editorBusy}
        error={editorError}
        onClose={() => setEditorOpen(false)}
        onSubmit={handleSubmit}
      />
      <ConfirmDialog
        open={deleting}
        title="Удалить статью?"
        message={`«${article?.title ?? ""}» будет удалена без возможности восстановления.`}
        confirmText="Удалить"
        variant="error"
        loading={deleteBusy}
        onConfirm={handleDelete}
        onClose={() => setDeleting(false)}
      />
    </Box>
  );
};

export default ArticleViewPage;
