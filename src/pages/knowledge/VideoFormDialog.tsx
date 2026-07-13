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
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import {
  parseYoutubeId,
  youtubeThumbnailUrl,
  type KnowledgeCategory,
  type KnowledgeVideo,
  type KnowledgeVideoPayload,
} from "../../api/knowledge";

interface VideoFormDialogProps {
  open: boolean;
  /** null — добавление нового видео. */
  video: KnowledgeVideo | null;
  categories: KnowledgeCategory[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: KnowledgeVideoPayload) => void;
}

/** Форма видеоурока: только ссылка на YouTube (файлы не храним — контракт v1). */
const VideoFormDialog: React.FC<VideoFormDialogProps> = ({
  open,
  video,
  categories,
  busy,
  error,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<number | "">("");
  const [isPublished, setIsPublished] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setTitle(video?.title ?? "");
    setUrl(video?.youtubeUrl ?? "");
    setDescription(video?.description ?? "");
    setCategoryId(video?.categoryId ?? "");
    setIsPublished(video?.isPublished ?? true);
  }, [open, video]);

  const videoId = parseYoutubeId(url);
  const urlInvalid = url.trim().length > 0 && !videoId;
  const valid = title.trim().length > 0 && !!videoId;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{video ? "Изменить видеоурок" : "Новый видеоурок"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Название"
            size="small"
            fullWidth
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
          <TextField
            label="Ссылка на YouTube"
            size="small"
            fullWidth
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            error={urlInvalid}
            helperText={urlInvalid ? "Поддерживаются только ссылки youtube.com / youtu.be" : undefined}
          />
          {videoId && (
            <Box
              component="img"
              src={youtubeThumbnailUrl(videoId)}
              alt="Превью видео"
              sx={{ width: "100%", borderRadius: 1.5, aspectRatio: "16/9", objectFit: "cover" }}
            />
          )}
          <TextField
            label="Описание"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
          <TextField
            select
            label="Раздел"
            size="small"
            fullWidth
            value={categoryId === "" ? "none" : String(categoryId)}
            onChange={(e) => setCategoryId(e.target.value === "none" ? "" : Number(e.target.value))}
            disabled={busy}
          >
            <MenuItem value="none">Без раздела</MenuItem>
            {categories.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="body2">{isPublished ? "Опубликован" : "Черновик"}</Typography>
            <Switch
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              disabled={busy}
            />
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disabled={busy || !valid}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              youtubeUrl: url.trim(),
              description: description.trim(),
              categoryId: categoryId === "" ? null : categoryId,
              isPublished,
            })
          }
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VideoFormDialog;
