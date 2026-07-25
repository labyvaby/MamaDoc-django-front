import React from "react";
import {
  Alert,
  Box,
  Button,
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
  ToggleButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Youtube from "@tiptap/extension-youtube";
import Image from "@tiptap/extension-image";

import CloseOutlined from "@mui/icons-material/CloseOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import RedoOutlined from "@mui/icons-material/RedoOutlined";
import FormatBoldOutlined from "@mui/icons-material/FormatBoldOutlined";
import FormatItalicOutlined from "@mui/icons-material/FormatItalicOutlined";
import FormatUnderlinedOutlined from "@mui/icons-material/FormatUnderlinedOutlined";
import StrikethroughSOutlined from "@mui/icons-material/StrikethroughSOutlined";
import FormatListBulletedOutlined from "@mui/icons-material/FormatListBulletedOutlined";
import FormatListNumberedOutlined from "@mui/icons-material/FormatListNumberedOutlined";
import FormatQuoteOutlined from "@mui/icons-material/FormatQuoteOutlined";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import LinkOffOutlined from "@mui/icons-material/LinkOffOutlined";
import SmartDisplayOutlined from "@mui/icons-material/SmartDisplayOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";

import { getErrorMessage } from "../../api/client";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useFormValidation } from "../../hooks/useFormValidation";
import {
  KNOWLEDGE_IMAGE_UPLOAD_ENABLED,
  isSafeImageUrl,
  parseYoutubeId,
  splitCover,
  uploadKnowledgeImage,
  withCover,
  youtubeEmbedUrl,
  type KnowledgeArticle,
  type KnowledgeArticlePayload,
  type KnowledgeCategory,
} from "../../api/knowledge";

/** Отбирает из FileList только картинки (paste/drop приносят и текст, и файлы). */
const imageFiles = (list: FileList | null | undefined): File[] =>
  Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

interface ArticleEditorDrawerProps {
  open: boolean;
  /** null — создание новой статьи. */
  article: KnowledgeArticle | null;
  categories: KnowledgeCategory[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: KnowledgeArticlePayload) => void;
}

/**
 * Редактор статьи базы знаний: заголовок, раздел, публикация и rich-text
 * (TipTap StarterKit + YouTube-эмбеды: видео вставляются прямо в статью,
 * отдельной сущности «видеоурок» нет — UPD заказчика 15.07.2026).
 *
 * Картинки: вставка по ссылке работает (санитайзер бэка пропускает `<img src>`
 * с http(s), см. api/knowledge.ts). Загрузка файлом (кнопка «Загрузить», вставка
 * из буфера, drag&drop) закрыта флагом KNOWLEDGE_IMAGE_UPLOAD_ENABLED — на бэке
 * эндпоинта ещё нет; при выключенном флаге файл не вставляется (base64 бэк
 * молча вырежет), вместо этого показываем подсказку про ссылку.
 */
const ArticleEditorDrawer: React.FC<ArticleEditorDrawerProps> = ({
  open,
  article,
  categories,
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
  /** Обложка живёт в content отдельной картинкой — см. splitCover/withCover. */
  const [coverUrl, setCoverUrl] = React.useState("");
  /** Превью обложки не загрузилось (битая ссылка) — предупреждаем, но не блокируем. */
  const [coverBroken, setCoverBroken] = React.useState(false);
  const coverValid = coverUrl.trim() === "" || isSafeImageUrl(coverUrl);
  const coverPreview = coverValid && !coverBroken ? coverUrl.trim() || null : null;

  // Актуальный обработчик файлов для editorProps: useEditor создаёт editorProps
  // один раз, поэтому колбэк дёргаем через ref (иначе замкнём устаревший стейт).
  const filesHandlerRef = React.useRef<(files: File[]) => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit,
      // nocookie — единый домен эмбедов (youtube-nocookie.com), как в
      // youtubeEmbedUrl; его же ждёт allowlist санитизации на бэке.
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
      // allowBase64: false — data:-URI бэк вырезает из src при сохранении,
      // картинка исчезла бы после первого же сохранения статьи.
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: "",
    editorProps: {
      attributes: { class: "tiptap-editor" },
      // Вставка/перетаскивание файлов картинок — через наш загрузчик, иначе
      // ProseMirror вставит имя файла текстом.
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length) return false;
        event.preventDefault();
        filesHandlerRef.current(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = imageFiles((event as DragEvent).dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        filesHandlerRef.current(files);
        return true;
      },
    },
  });

  // Активные форматы для тулбара (v3 не ререндерит на каждую транзакцию сам).
  const editorState = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      // isDestroyed — обязательная проверка: после destroy (StrictMode-ремаунт
      // в dev, уход со страницы) у редактора обнулён commandManager, и
      // can()/isActive() бросают TypeError, роняя страницу в ErrorBoundary.
      if (!e || e.isDestroyed) {
        return {
          bold: false, italic: false, underline: false, strike: false,
          h2: false, h3: false, bulletList: false, orderedList: false,
          blockquote: false, codeBlock: false, link: false, image: false,
          canUndo: false, canRedo: false, isEmpty: true,
        };
      }
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        blockquote: e.isActive("blockquote"),
        codeBlock: e.isActive("codeBlock"),
        link: e.isActive("link"),
        image: e.isActive("image"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        // Для валидации «Сохранить»: без isEmpty селектор не меняется при
        // опустошении текста (canUndo остаётся true) и ререндера нет.
        isEmpty: e.isEmpty,
      };
    },
  });

  React.useEffect(() => {
    if (!open || !editor) return;
    setTitle(article?.title ?? "");
    setCategoryId(article?.categoryId ?? "");
    setIsPublished(article?.isPublished ?? false);
    setUploadHint(false);
    // Обложку показываем отдельным полем, поэтому в редактор идёт тело без неё.
    const { coverUrl: cover, body } = splitCover(article?.content ?? "");
    setCoverUrl(cover ?? "");
    setCoverBroken(false);
    editor.commands.setContent(body);
  }, [open, article, editor]);

  // ── Ссылки ────────────────────────────────────────────────────────────────
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");

  const openLinkDialog = () => {
    if (!editor) return;
    setLinkUrl((editor.getAttributes("link").href as string) ?? "");
    setLinkOpen(true);
  };

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkOpen(false);
  };

  // ── Видео (YouTube-эмбед в тело статьи) ───────────────────────────────────
  const [videoOpen, setVideoOpen] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState("");
  const videoId = parseYoutubeId(videoUrl);

  const applyVideo = () => {
    if (!editor || !videoId) return;
    // Нормализуем любую форму ссылки (watch/youtu.be/shorts) к embed-URL.
    editor.chain().focus().setYoutubeVideo({ src: youtubeEmbedUrl(videoId) }).run();
    setVideoOpen(false);
    setVideoUrl("");
  };

  // ── Картинки ──────────────────────────────────────────────────────────────
  const [imageOpen, setImageOpen] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState("");
  const [imageAlt, setImageAlt] = React.useState("");
  const [imageBusy, setImageBusy] = React.useState(false);
  const [imageError, setImageError] = React.useState<string | null>(null);
  /** Показываем, когда пользователь принёс файл, а загрузка ещё не включена. */
  const [uploadHint, setUploadHint] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const imageUrlValid = isSafeImageUrl(imageUrl);

  const openImageDialog = () => {
    setImageUrl("");
    setImageAlt("");
    setImageError(null);
    setImageOpen(true);
  };

  const insertImage = (src: string, alt: string) => {
    if (!editor) return;
    // Подпись храним в alt: <figure>/<figcaption> санитайзер бэка вырезает.
    editor
      .chain()
      .focus()
      .setImage(alt.trim() ? { src, alt: alt.trim() } : { src })
      .run();
  };

  const applyImageUrl = () => {
    if (!imageUrlValid) return;
    insertImage(imageUrl.trim(), imageAlt);
    setImageOpen(false);
  };

  const uploadImageFile = async (file: File) => {
    if (!KNOWLEDGE_IMAGE_UPLOAD_ENABLED) {
      setUploadHint(true);
      return;
    }
    setImageBusy(true);
    setImageError(null);
    try {
      const { url } = await uploadKnowledgeImage(file, orgId);
      insertImage(url, imageAlt || file.name);
      setImageOpen(false);
    } catch (err) {
      setImageError(getErrorMessage(err));
      setImageOpen(true);
    } finally {
      setImageBusy(false);
    }
  };

  // Свежий обработчик для editorProps (paste/drop) — см. filesHandlerRef;
  // без deps: editorProps создаются один раз, а функция замыкает стейт рендера.
  React.useEffect(() => {
    filesHandlerRef.current = (files) => {
      void uploadImageFile(files[0]);
    };
  });

  // ── Сохранение ────────────────────────────────────────────────────────────
  const hasContent = !(editorState?.isEmpty ?? true);
  const form = useFormValidation({
    title: title.trim() ? null : "Введите заголовок статьи",
    cover: coverValid ? null : "Нужна ссылка http(s) — файл с компьютера так не вставить",
    content: hasContent ? null : "Напишите текст статьи",
  });

  const handleSubmit = () => {
    if (!editor) return;
    if (!form.validate()) return;
    onSubmit({
      title: title.trim(),
      // Обложка хранится внутри content первой картинкой title="cover".
      content: withCover(editor.getHTML(), coverUrl.trim() || null),
      categoryId: categoryId === "" ? null : categoryId,
      isPublished,
    });
  };

  const tb = (
    label: string,
    icon: React.ReactNode,
    active: boolean,
    onClick: () => void,
    disabled = false,
  ) => (
    <Tooltip title={label} key={label}>
      <span>
        <ToggleButton
          value={label}
          size="small"
          selected={active}
          disabled={disabled || busy}
          onMouseDown={(e) => e.preventDefault()} // не отдаём фокус из редактора
          onClick={onClick}
          sx={{ border: 0, borderRadius: 1, p: 0.6 }}
        >
          {icon}
        </ToggleButton>
      </span>
    </Tooltip>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", md: 720 } } }}
    >
      <Stack sx={{ height: "100%" }}>
        {/* Шапка */}
        <Stack direction="row" alignItems="center" sx={{ px: 2.5, py: 1.5 }}>
          <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
            {article ? "Изменить статью" : "Новая статья"}
          </Typography>
          <IconButton onClick={onClose} disabled={busy}>
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />

        {/* Форма */}
        <Stack spacing={2} sx={{ p: 2.5, flex: 1, minHeight: 0, overflow: "auto" }}>
          <TextField
            label="Заголовок"
            size="small"
            fullWidth
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            {...form.field("title")}
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
              disabled={busy}
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
                disabled={busy}
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
              disabled={busy}
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
                    disabled={busy}
                  >
                    <CloseOutlined fontSize="small" />
                  </IconButton>
                ) : undefined,
              }}
            />
          </Stack>

          {/* Тулбар */}
          <Stack
            direction="row"
            gap={0.25}
            flexWrap="wrap"
            sx={{
              p: 0.5,
              borderRadius: 1.5,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: "background.paper",
            }}
          >
            {tb("Отменить", <UndoOutlined fontSize="small" />, false, () => editor?.chain().focus().undo().run(), !editorState?.canUndo)}
            {tb("Повторить", <RedoOutlined fontSize="small" />, false, () => editor?.chain().focus().redo().run(), !editorState?.canRedo)}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            {tb("Жирный", <FormatBoldOutlined fontSize="small" />, editorState?.bold ?? false, () => editor?.chain().focus().toggleBold().run())}
            {tb("Курсив", <FormatItalicOutlined fontSize="small" />, editorState?.italic ?? false, () => editor?.chain().focus().toggleItalic().run())}
            {tb("Подчёркнутый", <FormatUnderlinedOutlined fontSize="small" />, editorState?.underline ?? false, () => editor?.chain().focus().toggleUnderline().run())}
            {tb("Зачёркнутый", <StrikethroughSOutlined fontSize="small" />, editorState?.strike ?? false, () => editor?.chain().focus().toggleStrike().run())}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            {tb("Заголовок", <Typography variant="button" sx={{ px: 0.25 }}>H2</Typography>, editorState?.h2 ?? false, () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
            {tb("Подзаголовок", <Typography variant="button" sx={{ px: 0.25 }}>H3</Typography>, editorState?.h3 ?? false, () => editor?.chain().focus().toggleHeading({ level: 3 }).run())}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            {tb("Маркированный список", <FormatListBulletedOutlined fontSize="small" />, editorState?.bulletList ?? false, () => editor?.chain().focus().toggleBulletList().run())}
            {tb("Нумерованный список", <FormatListNumberedOutlined fontSize="small" />, editorState?.orderedList ?? false, () => editor?.chain().focus().toggleOrderedList().run())}
            {tb("Цитата", <FormatQuoteOutlined fontSize="small" />, editorState?.blockquote ?? false, () => editor?.chain().focus().toggleBlockquote().run())}
            {tb("Код", <CodeOutlined fontSize="small" />, editorState?.codeBlock ?? false, () => editor?.chain().focus().toggleCodeBlock().run())}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            {tb("Ссылка", <LinkOutlined fontSize="small" />, editorState?.link ?? false, openLinkDialog)}
            {tb("Убрать ссылку", <LinkOffOutlined fontSize="small" />, false, () => editor?.chain().focus().unsetLink().run(), !editorState?.link)}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            {tb("Видео (YouTube)", <SmartDisplayOutlined fontSize="small" />, false, () => { setVideoUrl(""); setVideoOpen(true); })}
            {tb("Изображение", <ImageOutlined fontSize="small" />, editorState?.image ?? false, openImageDialog)}
          </Stack>

          {/* Контент */}
          <Box
            ref={form.anchor("content")}
            onClick={() => editor?.chain().focus().run()}
            sx={{
              flex: 1,
              minHeight: 280,
              cursor: "text",
              borderRadius: 1.5,
              border: `1px solid ${
                form.errorOf("content") ? theme.palette.error.main : theme.palette.divider
              }`,
              "&:focus-within": {
                borderColor: "primary.main",
                boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
              },
              "& .tiptap-editor": {
                outline: "none",
                minHeight: 280,
                padding: theme.spacing(1.5, 2),
              },
              "& .tiptap-editor p": { margin: theme.spacing(0, 0, 1) },
              "& .tiptap-editor h2": { margin: theme.spacing(2, 0, 1), fontSize: "1.25rem" },
              "& .tiptap-editor h3": { margin: theme.spacing(1.5, 0, 1), fontSize: "1.1rem" },
              "& .tiptap-editor ul, & .tiptap-editor ol": { paddingLeft: theme.spacing(3), margin: theme.spacing(0, 0, 1) },
              "& .tiptap-editor blockquote": {
                borderLeft: `3px solid ${theme.palette.divider}`,
                margin: theme.spacing(1, 0),
                paddingLeft: theme.spacing(1.5),
                color: theme.palette.text.secondary,
              },
              "& .tiptap-editor pre": {
                background: alpha(theme.palette.text.primary, 0.06),
                borderRadius: 6,
                padding: theme.spacing(1, 1.5),
                fontSize: "0.85rem",
                overflowX: "auto",
              },
              "& .tiptap-editor a": { color: theme.palette.primary.main },
              "& .tiptap-editor img": {
                display: "block",
                maxWidth: "100%",
                height: "auto",
                borderRadius: 8,
                margin: theme.spacing(1, 0),
              },
              // Выделенная картинка (клик по ней) — рамка вместо системного outline.
              "& .tiptap-editor img.ProseMirror-selectednode": {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
              "& .tiptap-editor div[data-youtube-video]": {
                margin: theme.spacing(1, 0),
                "& iframe": {
                  display: "block",
                  width: "100%",
                  maxWidth: 640,
                  aspectRatio: "16/9",
                  height: "auto",
                  border: 0,
                  borderRadius: 8,
                },
              },
            }}
          >
            <EditorContent editor={editor} />
          </Box>

          {uploadHint && (
            <Alert severity="info" onClose={() => setUploadHint(false)}>
              Загрузка картинок файлом пока недоступна — вставьте ссылку на
              изображение кнопкой «Изображение» в панели.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>

        <Divider />
        <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </Button>
        </Stack>
      </Stack>

      {/* Диалог ссылки */}
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Ссылка</DialogTitle>
        <DialogContent>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            sx={{ mt: 0.5 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
            helperText="Пустое поле — убрать ссылку"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={applyLink}>
            Применить
          </Button>
        </DialogActions>
      </Dialog>

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

      {/* Диалог вставки картинки */}
      <Dialog open={imageOpen} onClose={() => setImageOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Изображение</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              autoFocus
              label="Ссылка на картинку"
              placeholder="https://…/photo.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              disabled={imageBusy}
              error={imageUrl.trim() !== "" && !imageUrlValid}
              helperText={
                imageUrl.trim() !== "" && !imageUrlValid
                  ? "Нужна ссылка http(s) — файл с компьютера так не вставить"
                  : "Картинка должна быть доступна по ссылке (она не копируется на сервер)"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyImageUrl();
                }
              }}
            />
            <TextField
              size="small"
              fullWidth
              label="Описание (необязательно)"
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
              disabled={imageBusy}
              helperText="Показывается, если картинка не загрузилась"
            />
            {KNOWLEDGE_IMAGE_UPLOAD_ENABLED && (
              <>
                <Button
                  variant="outlined"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageBusy}
                  startIcon={imageBusy ? <CircularProgress size={16} /> : <ImageOutlined />}
                >
                  {imageBusy ? "Загрузка…" : "Загрузить файл"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ""; // повторный выбор того же файла
                    if (file) void uploadImageFile(file);
                  }}
                />
              </>
            )}
            {imageError && <Alert severity="error">{imageError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageOpen(false)} disabled={imageBusy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={applyImageUrl}
            disabled={!imageUrlValid || imageBusy}
          >
            Вставить
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export default ArticleEditorDrawer;
