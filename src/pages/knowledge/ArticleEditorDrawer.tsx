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

import {
  parseYoutubeId,
  youtubeEmbedUrl,
  type KnowledgeArticle,
  type KnowledgeArticlePayload,
  type KnowledgeCategory,
} from "../../api/knowledge";

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
 * отдельной сущности «видеоурок» нет — UPD заказчика 15.07.2026). Кнопки
 * вставки изображений нет намеренно — эндпоинт загрузки картинок в v1 не
 * согласован (открытый вопрос тикета knowledge).
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

  const [title, setTitle] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<number | "">("");
  const [isPublished, setIsPublished] = React.useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      // nocookie — единый домен эмбедов (youtube-nocookie.com), как в
      // youtubeEmbedUrl; его же ждёт allowlist санитизации на бэке.
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
    ],
    content: "",
    editorProps: {
      attributes: { class: "tiptap-editor" },
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
          blockquote: false, codeBlock: false, link: false,
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
    editor.commands.setContent(article?.content ?? "");
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

  // ── Сохранение ────────────────────────────────────────────────────────────
  const hasContent = !(editorState?.isEmpty ?? true);
  const valid = title.trim().length > 0 && hasContent;

  const handleSubmit = () => {
    if (!editor || !valid) return;
    onSubmit({
      title: title.trim(),
      content: editor.getHTML(),
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
          </Stack>

          {/* Контент */}
          <Box
            onClick={() => editor?.chain().focus().run()}
            sx={{
              flex: 1,
              minHeight: 280,
              cursor: "text",
              borderRadius: 1.5,
              border: `1px solid ${theme.palette.divider}`,
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
            disabled={busy || !valid}
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
    </Drawer>
  );
};

export default ArticleEditorDrawer;
