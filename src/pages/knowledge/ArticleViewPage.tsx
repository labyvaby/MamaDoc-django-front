import React from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Chip,
  Divider,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { useNavigate, useParams } from "react-router";

import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import ListAltOutlined from "@mui/icons-material/ListAltOutlined";

import { usePageTitle } from "../../hooks/usePageTitle";
import { useModuleGate } from "../../hooks/useModuleGate";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { getErrorMessage } from "../../api/client";
import { formatDateRu } from "../../utility/format";
import { djangoQueryKeys } from "../../api/queryKeys";
import { AppBottomSheet, ConfirmDialog } from "../../components/ui";
import {
  PDF_LINK_TITLE,
  deleteKnowledgeArticle,
  getKnowledgeArticle,
  getKnowledgeCategories,
  getKnowledgeSeries,
  partLabel,
  splitCover,
  updateKnowledgeArticle,
  type KnowledgeArticlePayload,
} from "../../api/knowledge";
import { pdfCardStyles } from "./pdfCard";
import ArticleEditorDrawer from "./ArticleEditorDrawer";
import ArticleLightbox from "./ArticleLightbox";
import { SeriesFooterNav, SeriesHeader } from "./SeriesNav";
import { useArticleSeries } from "./useArticleSeries";
import { useReadArticles } from "./useReadArticles";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * Извлекает оглавление из h2/h3 контента и проставляет им id для якорей;
 * попутно готовит к показу PDF-вложения (ссылки с меткой title="pdf").
 */
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
  // Файл открывается в новой вкладке: уходить со статьи на просмотр PDF
  // (и терять прочитанное место) незачем. target бэк не сохраняет — ставим тут.
  doc.body.querySelectorAll(`a[title="${PDF_LINK_TITLE}"]`).forEach((el) => {
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer");
    if (!(el.textContent ?? "").trim()) el.textContent = "Файл PDF";
  });
  // Каждую таблицу — в свой горизонтальный скроллер. Без него таблица в четыре
  // колонки распирала статью на телефоне, и вся страница начинала ездить влево-
  // вправо; сжимать колонки до нечитаемого — тоже не выход.
  doc.body.querySelectorAll("table").forEach((table) => {
    const wrap = doc.createElement("div");
    wrap.className = "table-scroll";
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);
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
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
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

  // ── Серия: соседние части ─────────────────────────────────────────────────
  const series = useArticleSeries(article, orgId);
  const { isRead, markRead } = useReadArticles();
  const openPart = (id: number) => navigate(`/knowledge/${id}`);

  // Обложка — отдельным «героем» над заголовком, из тела статьи её вырезаем
  // (в content она лежит первой картинкой title="cover" — см. api/knowledge.ts).
  const { coverUrl, body } = React.useMemo(
    () => splitCover(article?.content ?? ""),
    [article],
  );
  // Битая ссылка на обложку — просто не показываем блок.
  const [coverError, setCoverError] = React.useState(false);
  React.useEffect(() => setCoverError(false), [coverUrl]);

  // Контент с якорями + оглавление и время чтения.
  const processed = React.useMemo(
    () => (article ? processArticleHtml(body) : { html: "", toc: [] as TocItem[] }),
    [article, body],
  );
  const readMin = React.useMemo(() => (article ? readingTimeMin(body) : 0), [article, body]);
  const showToc = processed.toc.length >= 2;

  // ── Оглавление и действия на телефоне ─────────────────────────────────────
  // На широком экране содержание стоит колонкой справа, а «изменить/удалить» —
  // двумя иконками. На 390px колонки нет вовсе, а иконки жались к крошкам,
  // поэтому там содержание уходит в лист, а действия — в меню.
  const [tocOpen, setTocOpen] = React.useState(false);
  const [actionsAnchor, setActionsAnchor] = React.useState<HTMLElement | null>(null);

  // ── Просмотр картинок ─────────────────────────────────────────────────────
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [lightbox, setLightbox] = React.useState<{ images: string[]; index: number } | null>(null);

  /** Картинки статьи в порядке появления: обложка-герой, затем всё из текста. */
  const collectImages = React.useCallback((): string[] => {
    const inBody = Array.from(contentRef.current?.querySelectorAll("img") ?? []).map(
      (img) => img.currentSrc || img.src,
    );
    return coverUrl && !coverError ? [coverUrl, ...inBody] : inBody;
  }, [coverUrl, coverError]);

  /**
   * Клик по картинке в тексте открывает просмотр. Обработчик один на контейнер,
   * а не разметка в HTML: контент приходит с бэка, и вешать на него слушатели
   * поштучно значило бы переписывать содержимое статьи.
   */
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "IMG") return;
    // Картинка внутри ссылки — это ссылка, а не иллюстрация.
    if (target.closest("a")) return;
    const images = collectImages();
    const src = (target as HTMLImageElement).currentSrc || (target as HTMLImageElement).src;
    const index = images.indexOf(src);
    if (index >= 0) setLightbox({ images, index });
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Прогресс чтения ───────────────────────────────────────────────────────
  // Страница скроллит себя сама (см. корневой Box): лейаут приложения —
  // childrenBox с фиксированной высотой и overflow:hidden, поэтому без своего
  // контейнера длинная статья просто обрезалась бы без полосы прокрутки.
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = React.useState(0);
  /** Шапку статьи прижимаем к верху; грань под ней появляется только при прокрутке. */
  const [scrolled, setScrolled] = React.useState(false);

  // Следующая статья открывается с начала: контейнер переиспользуется при
  // переходе между частями серии, иначе часть 2 открылась бы с середины.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [articleId]);

  React.useEffect(() => {
    if (!article) return;
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const total = el.scrollHeight - el.clientHeight;
      // Короткая статья без прокрутки считается прочитанной сразу.
      setProgress(total > 80 ? Math.min(el.scrollTop / total, 1) : 1);
      setScrolled(el.scrollTop > 4);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // processed.html в deps: пока картинки/эмбеды не отрисованы, scrollHeight
    // ещё не финальный — пересчитываем и после смены содержимого.
  }, [article, processed.html]);

  // Дочитал — отмечаем прочитанной. Порог, а не факт открытия: иначе часть
  // засчиталась бы за прочитанную от случайного клика, и «продолжить с части N»
  // отправляло бы не туда. Короткая статья без прокрутки даёт progress = 1 сразу.
  React.useEffect(() => {
    if (article && progress >= 0.9) markRead(article.id);
  }, [article, progress, markRead]);

  // Разделы — для селекта в редакторе (ключ совпадает с лентой — из кэша).
  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.categories({ includeInactive: false, orgId: orgId ?? null }),
    queryFn: ({ signal }) => getKnowledgeCategories({ organizationId: orgId }, signal),
    enabled: canManage,
  });

  // Существующие серии — подсказка автокомплита в редакторе.
  const seriesQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.series({ orgId: orgId ?? null }),
    queryFn: ({ signal }) => getKnowledgeSeries({ organizationId: orgId }, signal),
    enabled: canManage,
  });
  const knownSeries = seriesQuery.data ?? [];

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
    <Box
      ref={scrollRef}
      sx={{
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        // На телефоне боковые отступы минимальные: свои поля есть у карточки
        // статьи, и складывать их с полями страницы значит читать текст в
        // колонку на две трети экрана.
        px: { xs: 0.5, md: 2 },
        pt: { xs: 0, md: 2 },
        pb: { xs: 2, md: 2 },
        // Колонка текста по центру: ограничиваем содержимое, а не сам скроллер,
        // иначе полоса прокрутки уехала бы от края экрана.
        "& > *": { maxWidth: showToc ? 1120 : 880, mx: "auto" },
      }}
    >
      {/* Шапка статьи: прогресс чтения и навигация. Прижата к верху — «назад»,
          содержание и действия нужны в любой точке текста, а мотать до начала
          ради них на телефоне особенно неудобно. */}
      <Box
        sx={(t) => ({
          position: "sticky",
          top: 0,
          zIndex: 3,
          bgcolor: "background.default",
          pt: { xs: 0.5, md: 0 },
          mb: { xs: 1, md: 2 },
          borderBottom: `1px solid ${scrolled ? t.palette.divider : "transparent"}`,
          transition: "border-color .15s ease",
        })}
      >
        {article && (
          <Box
            sx={(t) => ({
              height: 3,
              mb: 0.5,
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

        <Stack direction="row" alignItems="center" gap={0.5} sx={{ pb: 0.5 }}>
          <IconButton onClick={() => navigate("/knowledge")} aria-label="К списку материалов">
            <ArrowBackOutlined />
          </IconButton>

          {/* Телефон: одна строка с названием вместо цепочки крошек — на 390px
              из «База знаний / Серия / Часть» всё равно оставались многоточия. */}
          {isMobile ? (
            <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>
              {series.index >= 0
                ? partLabel(series.parts[series.index])
                : article?.title ?? "…"}
            </Typography>
          ) : (
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
              {series.ref && series.index >= 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  noWrap
                  sx={{ maxWidth: 240 }}
                >
                  {series.ref.name}
                </Typography>
              )}
              <Typography variant="body2" color="text.primary" noWrap sx={{ maxWidth: 360 }}>
                {series.index >= 0 ? partLabel(series.parts[series.index]) : article?.title ?? "…"}
              </Typography>
            </Breadcrumbs>
          )}

          <Stack direction="row" gap={0.25} sx={{ ml: "auto", flexShrink: 0 }}>
            {isMobile && showToc && (
              <Tooltip title="Содержание">
                <IconButton onClick={() => setTocOpen(true)} aria-label="Содержание">
                  <ListAltOutlined />
                </IconButton>
              </Tooltip>
            )}
            {canManage && article && !isMobile && (
              <>
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
              </>
            )}
            {canManage && article && isMobile && (
              <IconButton
                onClick={(e) => setActionsAnchor(e.currentTarget)}
                aria-label="Действия со статьёй"
              >
                <MoreVertOutlined />
              </IconButton>
            )}
          </Stack>
        </Stack>
      </Box>

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
        <Box sx={{ flex: 1, minWidth: 0 }}>
        {series.index >= 0 && series.ref && (
          <SeriesHeader
            name={series.ref.name}
            parts={series.parts}
            index={series.index}
            isRead={isRead}
            onOpen={openPart}
          />
        )}
        <Paper
          variant="outlined"
          sx={{ p: { xs: 1.75, md: 4 }, borderRadius: "14px" }}
        >
          {coverUrl && !coverError && (
            <Box
              component="img"
              src={coverUrl}
              alt=""
              onError={() => setCoverError(true)}
              onClick={() => setLightbox({ images: collectImages(), index: 0 })}
              sx={{
                display: "block",
                width: "100%",
                maxHeight: { xs: 240, md: 320 },
                objectFit: "cover",
                borderRadius: "10px",
                mb: 2,
                cursor: "zoom-in",
              }}
            />
          )}
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
            {article.categoryName && (
              <Chip size="small" variant="outlined" label={article.categoryName} sx={{ borderRadius: "7px" }} />
            )}
            {!article.isPublished && (
              <Chip size="small" color="warning" variant="outlined" label="Черновик" sx={{ borderRadius: "7px" }} />
            )}
            {series.index >= 0 && (
              <Chip
                size="small"
                variant="outlined"
                label={`Часть ${series.parts[series.index].partNumber} из ${series.parts.length}`}
                sx={{ borderRadius: "7px" }}
              />
            )}
          </Stack>
          {/* Внутри серии имя серии уже показано в плашке над статьёй —
              в заголовке оставляем подзаголовок части, чтобы не дублировать. */}
          <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
            {series.index >= 0 ? partLabel(series.parts[series.index]) : article.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {article.authorName ?? "—"} · обновлено {formatDateRu(article.updatedAt)} · ~{readMin}{" "}
            мин чтения
          </Typography>
          <Divider sx={{ my: 2 }} />
          {/* content — HTML из TipTap; санитизация по allowlist на бэке (контракт). */}
          <Box
            ref={contentRef}
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: processed.html }}
            sx={{
              // Кегль на телефоне чуть крупнее: инструкции читают с рук, и
              // базовые 14px в узкой колонке заставляют щуриться.
              fontSize: { xs: "1.02rem", md: "inherit" },
              // Длинная ссылка или код не должны распирать колонку.
              overflowWrap: "anywhere",
              "& p": { m: 0, mb: 1.25, lineHeight: { xs: 1.75, md: 1.7 } },
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
              // PDF-вложение — карточка с меткой формата (см. pdfCard.ts).
              [`& a[title="${PDF_LINK_TITLE}"]`]: pdfCardStyles(theme),
              // Картинка открывается на весь экран (ArticleLightbox): в базе
              // знаний половина иллюстраций — сфотографированные памятки, и в
              // колонке шириной в телефон надписи на них не разобрать.
              "& img": { maxWidth: "100%", borderRadius: 1.5, cursor: "zoom-in" },
              // Видео в статье (@tiptap/extension-youtube).
              "& div[data-youtube-video]": {
                my: 2,
                "& iframe": {
                  display: "block",
                  width: "100%",
                  maxWidth: 720,
                  aspectRatio: "16/9",
                  height: "auto",
                  border: 0,
                  borderRadius: 1.5,
                },
              },
              // Таблица едет в своём скроллере (обёртку ставит
              // processArticleHtml), а не тащит за собой всю страницу.
              "& .table-scroll": {
                overflowX: "auto",
                my: 1.5,
                WebkitOverflowScrolling: "touch",
              },
              "& table": {
                borderCollapse: "collapse",
                width: "100%",
                minWidth: { xs: 460, md: 0 },
              },
              "& td, & th": { border: `1px solid ${theme.palette.divider}`, p: 1 },
              // Якорь не прячется под sticky-прогрессбаром при переходе из оглавления.
              "& h2, & h3": { scrollMarginTop: 16 },
            }}
          />
          {(series.prev || series.next) && (
            <SeriesFooterNav prev={series.prev} next={series.next} onOpen={openPart} />
          )}
        </Paper>
        </Box>

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
                  onClick={() => scrollToSection(item.id)}
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

      {/* Содержание на телефоне: лист вместо боковой колонки. */}
      <AppBottomSheet open={tocOpen} onClose={() => setTocOpen(false)}>
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
            Содержание
          </Typography>
          <Stack gap={0.25}>
            {processed.toc.map((item) => (
              <Link
                key={item.id}
                component="button"
                type="button"
                underline="none"
                onClick={() => {
                  setTocOpen(false);
                  scrollToSection(item.id);
                }}
                sx={{
                  display: "block",
                  textAlign: "left",
                  minHeight: 44,
                  py: 1,
                  pl: item.level === 3 ? 2.5 : 1,
                  pr: 1,
                  borderRadius: "10px",
                  fontSize: "0.95rem",
                  color: item.level === 3 ? "text.secondary" : "text.primary",
                  "&:active": { bgcolor: "action.hover" },
                }}
              >
                {item.text}
              </Link>
            ))}
          </Stack>
        </Box>
      </AppBottomSheet>

      {/* Действия со статьёй на телефоне — вместо двух иконок в шапке. */}
      <Menu
        open={actionsAnchor !== null}
        anchorEl={actionsAnchor}
        onClose={() => setActionsAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setActionsAnchor(null);
            setEditorError(null);
            setEditorOpen(true);
          }}
        >
          <ListItemIcon>
            <EditOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>Изменить</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setActionsAnchor(null);
            setDeleting(true);
          }}
        >
          <ListItemIcon>
            <DeleteOutlineOutlined fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ color: "error.main" }}>Удалить</ListItemText>
        </MenuItem>
      </Menu>

      <ArticleLightbox
        images={lightbox?.images ?? []}
        index={lightbox?.index ?? null}
        onIndexChange={(index) => setLightbox((s) => (s ? { ...s, index } : s))}
        onClose={() => setLightbox(null)}
      />

      <ArticleEditorDrawer
        open={editorOpen}
        article={article ?? null}
        categories={categoriesQuery.data ?? []}
        knownSeries={knownSeries}
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
