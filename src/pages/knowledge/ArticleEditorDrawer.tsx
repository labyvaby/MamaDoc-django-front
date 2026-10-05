import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import CloseOutlined from "@mui/icons-material/CloseOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import SmartDisplayOutlined from "@mui/icons-material/SmartDisplayOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import AttachFileOutlined from "@mui/icons-material/AttachFileOutlined";
import FullscreenOutlined from "@mui/icons-material/FullscreenOutlined";
import FullscreenExitOutlined from "@mui/icons-material/FullscreenExitOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";

import { getErrorMessage } from "../../api/client";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useFormValidation } from "../../hooks/useFormValidation";
import { compressImage, PHOTO_ACCEPT } from "../../utility/imageCompression";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../utility/formDraft";
import {
  FILE_LINK_TITLE,
  KNOWLEDGE_FILES_UPLOAD_ENABLED,
  KNOWLEDGE_IMAGE_UPLOAD_ENABLED,
  KNOWLEDGE_PDF_UPLOAD_ENABLED,
  PDF_LINK_TITLE,
  createKnowledgeSeries,
  fileNameFromUrl,
  isSafeImageUrl,
  parseYoutubeId,
  splitCover,
  uploadKnowledgeFile,
  uploadKnowledgeImage,
  withCover,
  youtubeEmbedUrl,
  type KnowledgeArticle,
  type KnowledgeArticlePayload,
  type KnowledgeCategory,
  type KnowledgeSeries,
} from "../../api/knowledge";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_FORMATS_HINT,
  attachmentKindOf,
  attachmentMaxMb,
} from "./attachmentTypes";
import ArticleBlockEditor, { type ArticleBlockEditorHandle } from "./ArticleBlockEditor";

/** Пустой документ (в т.ч. `<p></p>` из старых черновиков) — не считаем его текстом. */
const isEmptyContent = (html: string): boolean => {
  const trimmed = html.trim();
  return trimmed === "" || trimmed === "<p></p>";
};

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Защита от потери набранного текста при закрытии дровера (крестик, клик по
// фону, Esc, кнопка «Отмена») — заменяет собой прежний useCloseGuard
// (confirm-диалог «закрыть без сохранения?» + перехват beforeunload/back).
// Два режима, как в DjangoProductFormDrawer:
//  - создание: черновик по общему ключу, очищается после успешного сабмита,
//    иконка «восстановлен черновик» у крестика откатывает к пустой форме;
//  - редактирование: ключ включает id статьи, черновик пишется только если
//    текущие значения отличаются от исходных данных статьи (baseline),
//    иконка откатывает к baseline.
// Картинки/обложка хранятся как URL внутри HTML-контента (строка) — это
// сериализуется штатно; File-объекты (пока идёт загрузка) в стейте формы не
// живут, поэтому проблемы сериализации File здесь нет.
const ADD_DRAFT_KEY = "mamadoc:knowledge:add-draft";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // статья длинная — черновик живёт неделю

type ArticleFormValues = {
  title: string;
  content: string;
  categoryId: number | "";
  isPublished: boolean;
  coverUrl: string;
  seriesOn: boolean;
  seriesName: string;
  partNumber: string;
};

type ArticleDraft = ArticleFormValues & { savedAt: number };

const defaultArticleValues: ArticleFormValues = {
  title: "",
  content: "",
  categoryId: "",
  isPublished: false,
  coverUrl: "",
  seriesOn: false,
  seriesName: "",
  partNumber: "",
};

function editDraftKeyFor(articleId: number): string {
  return `mamadoc:knowledge:edit-draft:${articleId}`;
}

function isDraftEmpty(v: ArticleFormValues): boolean {
  return (
    v.title === defaultArticleValues.title &&
    isEmptyContent(v.content) &&
    v.categoryId === defaultArticleValues.categoryId &&
    v.isPublished === defaultArticleValues.isPublished &&
    v.coverUrl === defaultArticleValues.coverUrl &&
    v.seriesOn === defaultArticleValues.seriesOn &&
    v.seriesName === defaultArticleValues.seriesName &&
    v.partNumber === defaultArticleValues.partNumber
  );
}

function sameAsBaseline(a: ArticleFormValues, b: ArticleFormValues): boolean {
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.categoryId === b.categoryId &&
    a.isPublished === b.isPublished &&
    a.coverUrl === b.coverUrl &&
    a.seriesOn === b.seriesOn &&
    a.seriesName === b.seriesName &&
    a.partNumber === b.partNumber
  );
}

interface ArticleEditorDrawerProps {
  open: boolean;
  /** null — создание новой статьи. */
  article: KnowledgeArticle | null;
  categories: KnowledgeCategory[];
  /** Существующие серии — подсказка автокомплита и источник seriesId при выборе. */
  knownSeries?: KnowledgeSeries[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: KnowledgeArticlePayload) => void;
}

/**
 * Редактор статьи базы знаний: заголовок, раздел, публикация и rich-text
 * (BlockNote, см. ArticleBlockEditor.tsx: слэш-меню и панель форматирования;
 * YouTube-эмбеды вставляются прямо в статью, отдельной сущности «видеоурок»
 * нет — UPD заказчика 15.07.2026). Хранится санитизируемый HTML.
 *
 * Картинки: BlockNote загружает их сам (панель блока «Картинка», вставка из
 * буфера, перетаскивание) через uploadKnowledgeImage; ссылкой тоже можно —
 * base64 бэк молча вырежет.
 *
 * Файлы: кнопка «Файл» и пункт слэш-меню вставляют карточку-ссылку (блок
 * file, articleBlocks.tsx) — PDF, Word, Excel, аудио, видео и др. (реестр —
 * attachmentTypes.ts). Вставка по ссылке работает для всех форматов; загрузка
 * файлом у PDF включена (KNOWLEDGE_PDF_UPLOAD_ENABLED), у остальных ждёт бэк
 * (KNOWLEDGE_FILES_UPLOAD_ENABLED). Вставка из буфера и перенос мышью
 * перехватываются в ArticleBlockEditor и идут в uploadAttachmentFile.
 *
 * Серия: поле «Название серии» — автокомплит по уже существующим сериям
 * (knownSeries); выбор существующего имени привязывает статью к её seriesId,
 * новое имя создаёт серию на лету (POST /knowledge/series/) перед сохранением
 * статьи. Заголовок статьи — обычное поле, отдельного «сборного» названия
 * больше нет (см. api/knowledge.ts).
 */
const ArticleEditorDrawer: React.FC<ArticleEditorDrawerProps> = ({
  open,
  article,
  categories,
  knownSeries = [],
  busy,
  error,
  onClose,
  onSubmit,
}) => {
  const theme = useTheme();
  const orgId = useApiOrgId();

  const [title, setTitle] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<number | "">("");
  const [isPublished, setIsPublished] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  /** Статья — часть серии; поля серии показываются только при включённом. */
  const [seriesOn, setSeriesOn] = React.useState(false);
  const [seriesName, setSeriesName] = React.useState("");
  const [partNumber, setPartNumber] = React.useState("");
  /** Создание новой серии (POST /knowledge/series/) перед сохранением статьи. */
  const [seriesBusy, setSeriesBusy] = React.useState(false);
  const [seriesError, setSeriesError] = React.useState<string | null>(null);
  /** Обложка живёт в content отдельной картинкой — см. splitCover/withCover. */
  const [coverUrl, setCoverUrl] = React.useState("");
  /** Превью обложки не загрузилось (битая ссылка) — предупреждаем, но не блокируем. */
  const [coverBroken, setCoverBroken] = React.useState(false);
  const coverValid = coverUrl.trim() === "" || isSafeImageUrl(coverUrl);
  const coverPreview = coverValid && !coverBroken ? coverUrl.trim() || null : null;

  const editorRef = React.useRef<ArticleBlockEditorHandle | null>(null);
  /**
   * Стартовое содержимое редактора. Смена `key` пересоздаёт BlockNote с новым
   * HTML (открытие статьи, «Очистить черновик»).
   */
  const [editorInit, setEditorInit] = React.useState({ key: 0, html: "" });
  /** Есть ли в тексте хоть что-то — для валидации «Сохранить». */
  const [hasContent, setHasContent] = React.useState(false);

  // baseline — снимок исходных значений на открытие: defaultArticleValues при
  // создании, данные статьи при редактировании. Используется и для индикатора
  // несохранённых правок, и для отката черновика («Очистить»).
  const baselineRef = React.useRef<ArticleFormValues>(defaultArticleValues);
  const [draftRestored, setDraftRestored] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const hasSeries = article?.seriesId != null && article?.partNumber != null;
    // Обложку показываем отдельным полем, поэтому в редактор идёт тело без неё.
    const { coverUrl: cover, body } = splitCover(article?.content ?? "");

    const baseline: ArticleFormValues = {
      title: article?.title ?? "",
      content: body,
      categoryId: article?.categoryId ?? "",
      isPublished: article?.isPublished ?? false,
      coverUrl: cover ?? "",
      seriesOn: hasSeries,
      seriesName: hasSeries ? article?.seriesName ?? "" : "",
      partNumber: hasSeries ? String(article?.partNumber) : "",
    };
    baselineRef.current = baseline;

    const draftKey = article ? editDraftKeyFor(article.id) : ADD_DRAFT_KEY;
    const draft = readFormDraft<ArticleDraft>(draftKey, DRAFT_TTL_MS);
    const values: ArticleFormValues = draft ?? baseline;

    setTitle(values.title);
    setCategoryId(values.categoryId);
    setIsPublished(values.isPublished);
    setCoverUrl(values.coverUrl);
    setCoverBroken(false);
    setSeriesOn(values.seriesOn);
    setSeriesName(values.seriesName);
    setPartNumber(values.partNumber);
    setEditorInit((s) => ({ key: s.key + 1, html: values.content }));
    setHasContent(!isEmptyContent(values.content));
    setDraftRestored(Boolean(draft));

    setUploadHint(null);
    setFullscreen(false);
    setSeriesError(null);
    setContentDirty(false);
  }, [open, article]);

  // ── Несохранённые правки ──────────────────────────────────────────────────
  // Поля сравниваем со снимком на открытие, текст — по событию редактора:
  // дёргать getHTML() на каждый рендер ради сравнения строк слишком дорого
  // для длинной статьи (полное сравнение содержимого делаем только внутри
  // flushDraftRef — он вызывается дебаунсом/на закрытии, а не на каждый рендер).
  const [contentDirty, setContentDirty] = React.useState(false);

  const fieldsDirty =
    title !== baselineRef.current.title ||
    categoryId !== baselineRef.current.categoryId ||
    isPublished !== baselineRef.current.isPublished ||
    coverUrl !== baselineRef.current.coverUrl ||
    seriesOn !== baselineRef.current.seriesOn ||
    seriesName !== baselineRef.current.seriesName ||
    partNumber !== baselineRef.current.partNumber;
  const dirty = (contentDirty || fieldsDirty) && !busy;

  // ── Черновик в браузере ───────────────────────────────────────────────────
  // flushDraftRef переприсваивается на каждый рендер, поэтому всегда видит
  // актуальные значения полей — вызывается и из debounce-таймера, и синхронно
  // из handleClose (иначе последние введённые символы теряются вместе с ещё
  // не сработавшим таймером при быстром «напечатал и закрыл»).
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    const html = editorRef.current?.getHTML();
    // Редактор ещё не смонтирован — писать нечего, иначе затрём черновик пустышкой.
    if (html === undefined) return;
    const snapshot: ArticleFormValues = {
      title,
      content: html,
      categoryId,
      isPublished,
      coverUrl,
      seriesOn,
      seriesName: seriesOn ? seriesName : "",
      partNumber: seriesOn ? partNumber : "",
    };
    if (article) {
      const key = editDraftKeyFor(article.id);
      if (sameAsBaseline(snapshot, baselineRef.current)) {
        clearFormDraft(key);
      } else {
        writeFormDraft(key, snapshot);
      }
    } else if (isDraftEmpty(snapshot)) {
      clearFormDraft(ADD_DRAFT_KEY);
    } else {
      writeFormDraft(ADD_DRAFT_KEY, snapshot);
    }
  };

  const draftTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDraftFlush = React.useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => flushDraftRef.current(), 600);
  }, []);

  // Реакция на изменения обычных полей формы.
  React.useEffect(() => {
    if (!open) return;
    scheduleDraftFlush();
  }, [open, title, categoryId, isPublished, coverUrl, seriesOn, seriesName, partNumber, scheduleDraftFlush]);

  // Реакция на изменения текста статьи — состояние React о наборе текста
  // внутри BlockNote не знает, поэтому редактор сам зовёт этот колбэк.
  const handleContentChange = React.useCallback(() => {
    setContentDirty(true);
    setHasContent(!(editorRef.current?.isEmpty() ?? true));
    scheduleDraftFlush();
  }, [scheduleDraftFlush]);

  React.useEffect(
    () => () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    },
    [],
  );

  const handleDiscardDraft = () => {
    const key = article ? editDraftKeyFor(article.id) : ADD_DRAFT_KEY;
    clearFormDraft(key);
    const target = article ? baselineRef.current : defaultArticleValues;
    setTitle(target.title);
    setCategoryId(target.categoryId);
    setIsPublished(target.isPublished);
    setCoverUrl(target.coverUrl);
    setCoverBroken(false);
    setSeriesOn(target.seriesOn);
    setSeriesName(target.seriesName);
    setPartNumber(target.partNumber);
    setEditorInit((s) => ({ key: s.key + 1, html: target.content }));
    setHasContent(!isEmptyContent(target.content));
    setContentDirty(false);
    setDraftRestored(false);
  };

  // Сохранилось на сервере — черновик больше не нужен. Признак успеха:
  // busy сняли, а ошибку не показали (родитель ставит error именно при сбое).
  const wasBusy = React.useRef(false);
  React.useEffect(() => {
    if (wasBusy.current && !busy && !error) {
      clearFormDraft(article ? editDraftKeyFor(article.id) : ADD_DRAFT_KEY);
      setDraftRestored(false);
    }
    wasBusy.current = busy;
  }, [busy, error, article]);

  // Закрытие (крестик, клик мимо дровера, кнопка «Отмена») — черновик пишется
  // синхронно перед вызовом onClose, никакого confirm-диалога больше нет.
  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  // ── Видео (YouTube-эмбед в тело статьи) ───────────────────────────────────
  const [videoOpen, setVideoOpen] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState("");
  const videoId = parseYoutubeId(videoUrl);

  const applyVideo = () => {
    if (!videoId) return;
    // Нормализуем любую форму ссылки (watch/youtu.be/shorts) к embed-URL.
    editorRef.current?.insertYoutube(youtubeEmbedUrl(videoId));
    setVideoOpen(false);
    setVideoUrl("");
  };

  /**
   * Пользователь принёс файл, а загрузка такого типа ещё не включена на бэке:
   * "image" — картинки, "file" — файл-вложение (см. KNOWLEDGE_*_UPLOAD_ENABLED).
   * Картинки в тело статьи BlockNote загружает сам (панель блока «Картинка»).
   */
  const [uploadHint, setUploadHint] = React.useState<"image" | "file" | null>(null);
  const [editorUploadError, setEditorUploadError] = React.useState<string | null>(null);

  // ── Обложка: загрузка файлом ──────────────────────────────────────────────
  const [coverBusy, setCoverBusy] = React.useState(false);
  const [coverUploadError, setCoverUploadError] = React.useState<string | null>(null);
  const coverFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const uploadCoverFile = async (file: File) => {
    if (!KNOWLEDGE_IMAGE_UPLOAD_ENABLED) {
      setUploadHint("image");
      return;
    }
    setCoverBusy(true);
    setCoverUploadError(null);
    try {
      const compressed = await compressImage(file);
      const outFile =
        compressed instanceof File
          ? compressed
          : new File([compressed], file.name, { type: "image/jpeg" });
      const { url } = await uploadKnowledgeImage(outFile, orgId);
      setCoverUrl(url);
      setCoverBroken(false);
    } catch (err) {
      setCoverUploadError(getErrorMessage(err));
    } finally {
      setCoverBusy(false);
    }
  };

  // ── Файлы-вложения (PDF, Word, Excel, аудио, видео…) ───────────────────────
  // Файл вставляется в текст карточкой-ссылкой (см. articleBlocks.tsx): встроить
  // просмотрщик нельзя — <iframe> с не-YouTube src санитайзер бэка вырезает.
  // Аудио и видео получают плеер на странице статьи (ArticleViewPage).
  const [fileOpen, setFileOpen] = React.useState(false);
  const [fileUrl, setFileUrl] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [fileBusy, setFileBusy] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const fileAttachInputRef = React.useRef<HTMLInputElement | null>(null);
  // Проверка та же, что для картинок: санитайзер бэка одинаково относится к
  // href и src — пропускает http(s) и относительные пути, остальное вырезает.
  const fileUrlValid = isSafeImageUrl(fileUrl);
  const fileUrlKind = attachmentKindOf(fileUrl);

  const openFileDialog = () => {
    setFileUrl("");
    setFileName("");
    setFileError(null);
    setFileOpen(true);
  };

  const insertFile = (href: string, name: string, isPdf: boolean) => {
    editorRef.current?.insertFile(
      href,
      name.trim() || fileNameFromUrl(href) || "Файл",
      isPdf ? PDF_LINK_TITLE : FILE_LINK_TITLE,
    );
  };

  const applyFileUrl = () => {
    if (!fileUrlValid) return;
    insertFile(fileUrl.trim(), fileName, fileUrlKind === "pdf");
    setFileOpen(false);
  };

  const uploadAttachmentFile = async (file: File) => {
    const kind = attachmentKindOf(file);
    if (!kind) {
      setFileError(`Такой формат не поддерживается. Можно: ${ATTACHMENT_FORMATS_HINT}`);
      setFileOpen(true);
      return;
    }
    const enabled = kind === "pdf" ? KNOWLEDGE_PDF_UPLOAD_ENABLED : KNOWLEDGE_FILES_UPLOAD_ENABLED;
    if (!enabled) {
      setUploadHint("file");
      return;
    }
    const maxMb = attachmentMaxMb(kind);
    if (file.size > maxMb * 1024 * 1024) {
      setFileError(`Файл больше ${maxMb} МБ — сервер его не примет`);
      setFileOpen(true);
      return;
    }
    setFileBusy(true);
    setFileError(null);
    try {
      const { url } = await uploadKnowledgeFile(file, orgId);
      insertFile(url, fileName || file.name, kind === "pdf");
      setFileOpen(false);
    } catch (err) {
      setFileError(getErrorMessage(err));
      setFileOpen(true);
    } finally {
      setFileBusy(false);
    }
  };

  // ── Сохранение ────────────────────────────────────────────────────────────
  const partNo = Number(partNumber);
  const partValid = Number.isInteger(partNo) && partNo >= 1 && partNo <= 999;

  // Заголовок статьи в серии необязателен — «Часть N» уже отличает её от
  // остальных, номер уже задан отдельным полем. Пустое поле подставит
  // дефолтное название при сохранении (бэк не принимает пустой title).
  const finalTitle = title.trim() || (seriesOn && partValid ? `Часть ${partNo}` : "");

  const form = useFormValidation({
    title:
      seriesOn || title.trim() ? null : "Введите заголовок статьи",
    seriesName: !seriesOn || seriesName.trim() ? null : "Укажите название серии",
    partNumber: !seriesOn || partValid ? null : "Номер части — целое число от 1 до 999",
    cover: coverValid ? null : "Нужна ссылка http(s) — файл с компьютера так не вставить",
    content: hasContent ? null : "Напишите текст статьи",
  });

  const handleSubmit = async () => {
    if (!form.validate()) return;

    let seriesId: number | null = null;
    if (seriesOn && seriesName.trim() && partValid) {
      const name = seriesName.trim();
      const existing = knownSeries.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        seriesId = existing.id;
      } else {
        setSeriesError(null);
        setSeriesBusy(true);
        try {
          seriesId = (await createKnowledgeSeries({ name }, orgId)).id;
        } catch (err) {
          setSeriesBusy(false);
          setSeriesError(getErrorMessage(err));
          return;
        }
        setSeriesBusy(false);
      }
    }

    onSubmit({
      title: finalTitle,
      // Обложка хранится внутри content первой картинкой title="cover".
      content: withCover(editorRef.current?.getHTML() ?? "", coverUrl.trim() || null),
      categoryId: categoryId === "" ? null : categoryId,
      isPublished,
      seriesId,
      partNumber: seriesOn && partValid ? partNo : null,
    });
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy || seriesBusy ? undefined : handleClose}
      PaperProps={{ sx: { width: fullscreen ? "100%" : { xs: "100%", md: 720 } } }}
    >
      <Stack sx={{ height: "100%" }}>
        {/* Шапка */}
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ px: 2.5, py: 1.5 }}>
          <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
            {article ? "Изменить статью" : "Новая статья"}
          </Typography>
          <Tooltip title={fullscreen ? "Свернуть" : "Развернуть на весь экран"}>
            <IconButton
              onClick={() => setFullscreen((v) => !v)}
              sx={{ display: { xs: "none", md: "inline-flex" } }}
            >
              {fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            </IconButton>
          </Tooltip>
          {draftRestored && (
            <Tooltip title="Восстановлен черновик — очистить?">
              <IconButton onClick={handleDiscardDraft} aria-label="Очистить черновик">
                <RestoreOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={handleClose} disabled={busy || seriesBusy}>
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />

        {/* Форма */}
        <Stack
          spacing={2}
          sx={{
            p: 2.5,
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            // На весь экран колонка текста не растягивается на всю ширину —
            // читать и править строку в 2000px невозможно.
            ...(fullscreen && { maxWidth: 980, width: "100%", mx: "auto" }),
          }}
        >
          {/* Серия: несколько статей, которые читают по порядку */}
          <Stack
            sx={{
              borderRadius: 1.5,
              border: `1px solid ${theme.palette.divider}`,
              px: 1.5,
              py: 1,
            }}
          >
            <Stack direction="row" alignItems="center" gap={1}>
              <LayersOutlined fontSize="small" sx={{ color: "text.secondary" }} />
              <Typography variant="body2" sx={{ flex: 1 }}>
                Часть серии
              </Typography>
              <Switch
                size="small"
                checked={seriesOn}
                onChange={(e) => setSeriesOn(e.target.checked)}
                disabled={busy || seriesBusy}
              />
            </Stack>
            {seriesOn && (
              <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} sx={{ mt: 1.5 }}>
                <Autocomplete
                  freeSolo
                  options={knownSeries.map((s) => s.name)}
                  value={seriesName}
                  onInputChange={(_e, value) => setSeriesName(value)}
                  disabled={busy || seriesBusy}
                  sx={{ flex: 1 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Название серии"
                      size="small"
                      placeholder="Обзор CRM"
                      {...form.field(
                        "seriesName",
                        "Общее для всех частей — выберите из списка, чтобы часть попала в ту же серию",
                      )}
                    />
                  )}
                />
                <TextField
                  label="Номер части"
                  size="small"
                  type="number"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  disabled={busy || seriesBusy}
                  inputProps={{ min: 1, max: 999 }}
                  sx={{ width: { xs: "100%", sm: 140 } }}
                  {...form.field("partNumber")}
                />
              </Stack>
            )}
            {seriesError && (
              <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setSeriesError(null)}>
                {seriesError}
              </Alert>
            )}
          </Stack>

          <TextField
            label={seriesOn ? "Заголовок части" : "Заголовок"}
            size="small"
            fullWidth
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy || seriesBusy}
            placeholder={seriesOn ? "Приёмы" : undefined}
            {...form.field(
              "title",
              seriesOn && !title.trim() && partValid
                ? `Если оставить пустым — название будет «Часть ${partNo}»`
                : undefined,
            )}
          />
          <Stack direction="row" gap={2} alignItems="center">
            <TextField
              select
              label="Раздел"
              size="small"
              value={categoryId === "" ? "none" : String(categoryId)}
              onChange={(e) =>
                setCategoryId(e.target.value === "none" ? "" : Number(e.target.value))
              }
              disabled={busy || seriesBusy}
              sx={{ width: 260 }}
            >
              <MenuItem value="none">Без раздела</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ ml: "auto" }}>
              <Typography variant="body2" color="text.secondary">
                {isPublished ? "Опубликована" : "Черновик"}
              </Typography>
              <Switch
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                disabled={busy || seriesBusy}
              />
            </Stack>
          </Stack>

          {/* Обложка — картинка на карточке статьи в ленте */}
          <Stack direction="row" gap={1.5} alignItems="flex-start">
            <Box
              sx={{
                width: 96,
                height: 54,
                flexShrink: 0,
                borderRadius: 1.5,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: "action.hover",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {coverPreview ? (
                <Box
                  component="img"
                  src={coverPreview}
                  alt=""
                  onError={() => setCoverBroken(true)}
                  sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <ImageOutlined fontSize="small" sx={{ color: "text.disabled" }} />
              )}
            </Box>
            <TextField
              label="Обложка (ссылка на картинку)"
              size="small"
              fullWidth
              placeholder="https://…/photo.jpg"
              value={coverUrl}
              onChange={(e) => {
                setCoverUrl(e.target.value);
                setCoverBroken(false);
              }}
              disabled={busy || seriesBusy}
              {...form.field(
                "cover",
                coverBroken
                  ? "Картинка не загрузилась — проверьте ссылку"
                  : "Необязательно: показывается на карточке статьи в ленте",
              )}
              InputProps={{
                endAdornment: coverUrl ? (
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={() => {
                      setCoverUrl("");
                      setCoverBroken(false);
                    }}
                    disabled={busy || seriesBusy}
                  >
                    <CloseOutlined fontSize="small" />
                  </IconButton>
                ) : undefined,
              }}
            />
            <Tooltip title="Загрузить файл с компьютера">
              <span>
                <IconButton
                  size="small"
                  onClick={() => coverFileInputRef.current?.click()}
                  disabled={busy || seriesBusy || coverBusy}
                  sx={{ mt: 0.5 }}
                >
                  {coverBusy ? (
                    <CircularProgress size={18} />
                  ) : (
                    <ImageOutlined fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <input
              ref={coverFileInputRef}
              type="file"
              hidden
              accept={PHOTO_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadCoverFile(file);
              }}
            />
          </Stack>
          {coverUploadError && <Alert severity="error">{coverUploadError}</Alert>}

          {/* Редактор BlockNote: форматирование — всплывающая панель над
              выделением, блоки — слэш-меню («/»). Видео и файл вынесены кнопками
              для тех, кто не знает про «/». */}
          <Stack direction="row" gap={1}>
            <Button
              size="small"
              startIcon={<SmartDisplayOutlined />}
              disabled={busy}
              onClick={() => {
                setVideoUrl("");
                setVideoOpen(true);
              }}
            >
              Видео YouTube
            </Button>
            <Button
              size="small"
              startIcon={<AttachFileOutlined />}
              disabled={busy}
              onClick={openFileDialog}
            >
              Файл
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", ml: "auto" }}>
              «/» — меню блоков
            </Typography>
          </Stack>
          <Box
            ref={form.anchor("content")}
            sx={{
              flex: "1 0 auto",
              minHeight: 280,
              borderRadius: 1.5,
              border: `1px solid ${
                form.errorOf("content") ? theme.palette.error.main : theme.palette.divider
              }`,
              "&:focus-within": {
                borderColor: "primary.main",
                boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
              },
            }}
          >
            <ArticleBlockEditor
              key={editorInit.key}
              ref={editorRef}
              initialHtml={editorInit.html}
              organizationId={orgId}
              disabled={busy || seriesBusy}
              onChange={handleContentChange}
              onFile={(file) => void uploadAttachmentFile(file)}
              onRequestVideo={() => {
                setVideoUrl("");
                setVideoOpen(true);
              }}
              onRequestFile={openFileDialog}
              onUploadError={setEditorUploadError}
            />
          </Box>

          {uploadHint && (
            <Alert severity="info" onClose={() => setUploadHint(null)}>
              {uploadHint === "file"
                ? "Загрузка файлов этого формата пока недоступна на сервере — вставьте ссылку кнопкой «Файл» над редактором (например ссылку на файл из раздела «Документы»)."
                : "Загрузка картинок файлом пока недоступна — вставьте ссылку на изображение кнопкой «Изображение» в панели."}
            </Alert>
          )}
          {editorUploadError && (
            <Alert severity="error" onClose={() => setEditorUploadError(null)}>
              {editorUploadError}
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>

        <Divider />
        <Stack direction="row" alignItems="center" gap={1} sx={{ p: 2 }}>
          {dirty && (
            <Chip
              size="small"
              variant="outlined"
              label="Черновик сохранён в браузере"
              sx={{ borderRadius: "7px" }}
            />
          )}
          <Button onClick={handleClose} disabled={busy || seriesBusy} sx={{ ml: "auto" }}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={busy || seriesBusy}
            startIcon={busy || seriesBusy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy || seriesBusy ? "Сохранение…" : "Сохранить"}
          </Button>
        </Stack>
      </Stack>

      {/* Диалог вставки видео */}
      <Dialog open={videoOpen} onClose={() => setVideoOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Видео (YouTube)</DialogTitle>
        <DialogContent>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="https://www.youtube.com/watch?v=…"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            sx={{ mt: 0.5 }}
            error={videoUrl.trim() !== "" && !videoId}
            helperText={
              videoUrl.trim() !== "" && !videoId
                ? "Не похоже на ссылку YouTube (youtube.com / youtu.be)"
                : "Видео вставится в текст статьи в месте курсора"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyVideo();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVideoOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={applyVideo} disabled={!videoId}>
            Вставить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог вложения файла */}
      <Dialog open={fileOpen} onClose={() => setFileOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Файл</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              autoFocus
              label="Ссылка на файл"
              placeholder="https://…/pamyatka.pdf"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              disabled={fileBusy}
              error={fileUrl.trim() !== "" && !fileUrlValid}
              helperText={
                fileUrl.trim() !== "" && !fileUrlValid
                  ? "Нужна ссылка http(s) — файл с компьютера так не вставить"
                  : fileUrl.trim() !== "" && !fileUrlKind
                    ? "Формат по ссылке не распознан — файл всё равно откроется, но проверьте её"
                    : "Файл должен быть доступен по ссылке (он не копируется на сервер)"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyFileUrl();
                }
              }}
            />
            <TextField
              size="small"
              fullWidth
              label="Название (необязательно)"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              disabled={fileBusy}
              placeholder={fileNameFromUrl(fileUrl) || "Памятка для родителей.pdf"}
              helperText="Подпись на карточке файла в статье"
            />
            {KNOWLEDGE_PDF_UPLOAD_ENABLED ? (
              <>
                <Button
                  variant="outlined"
                  onClick={() => fileAttachInputRef.current?.click()}
                  disabled={fileBusy}
                  startIcon={
                    fileBusy ? <CircularProgress size={16} /> : <AttachFileOutlined />
                  }
                >
                  {fileBusy
                    ? "Загрузка…"
                    : KNOWLEDGE_FILES_UPLOAD_ENABLED
                      ? "Загрузить файл"
                      : "Загрузить PDF"}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {KNOWLEDGE_FILES_UPLOAD_ENABLED
                    ? `${ATTACHMENT_FORMATS_HINT}. Аудио и видео можно будет послушать и посмотреть прямо в статье.`
                    : "Word, Excel, аудио и видео пока вставляются только ссылкой."}
                </Typography>
                <input
                  ref={fileAttachInputRef}
                  type="file"
                  accept={KNOWLEDGE_FILES_UPLOAD_ENABLED ? ATTACHMENT_ACCEPT : "application/pdf,.pdf"}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ""; // повторный выбор того же файла
                    if (file) void uploadAttachmentFile(file);
                  }}
                />
              </>
            ) : (
              <Alert severity="info">
                Загрузка файлом ещё не включена на сервере. Пока файл можно
                выложить в разделе «Документы» и вставить сюда ссылку на него.
              </Alert>
            )}
            {fileError && <Alert severity="error">{fileError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFileOpen(false)} disabled={fileBusy}>
            Отмена
          </Button>
          <Button variant="contained" onClick={applyFileUrl} disabled={!fileUrlValid || fileBusy}>
            Вставить
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export default ArticleEditorDrawer;
