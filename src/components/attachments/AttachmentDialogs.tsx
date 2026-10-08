/**
 * AttachmentDialogs.tsx — просмотр PDF и переименование файла карточки.
 */
import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";

import { AppButton } from "../ui";
import { attachmentSrc, type CardAttachment } from "../../api/attachments";
import { fileExtension } from "./attachmentFiles";

type PdfPreviewDialogProps = {
  /** null — диалог закрыт. */
  attachment: CardAttachment | null;
  onClose: () => void;
};

/**
 * PDF во встроенном вьювере браузера. Только для экранов шире телефона:
 * мобильные браузеры PDF во фрейме не листают, там файл открывается вкладкой.
 */
export const PdfPreviewDialog: React.FC<PdfPreviewDialogProps> = ({ attachment, onClose }) => (
  <Dialog open={attachment !== null} onClose={onClose} maxWidth="lg" fullWidth>
    {attachment && (
      <>
        <DialogTitle sx={{ pr: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {attachment.name}
          <IconButton onClick={onClose} aria-label="Закрыть" sx={{ position: "absolute", right: 12, top: 12, borderRadius: "10px" }}>
            <CloseOutlined />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Box
            component="iframe"
            src={attachmentSrc(attachment.url)}
            title={attachment.name}
            sx={{
              display: "block",
              width: "100%",
              height: "75vh",
              border: 1,
              borderColor: "divider",
              borderRadius: "10px",
              bgcolor: "background.paper",
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            component="a"
            href={attachmentSrc(attachment.url)}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<OpenInNewOutlined />}
          >
            Открыть в новой вкладке
          </Button>
          <Button component="a" href={attachmentSrc(attachment.downloadUrl)} download={attachment.name} startIcon={<DownloadOutlined />}>
            Скачать
          </Button>
        </DialogActions>
      </>
    )}
  </Dialog>
);

type RenameAttachmentDialogProps = {
  attachment: CardAttachment | null;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
};

export const RenameAttachmentDialog: React.FC<RenameAttachmentDialogProps> = ({ attachment, busy, onClose, onSave }) => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const [name, setName] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (attachment) setName(attachment.name);
  }, [attachment]);

  const trimmed = name.trim();
  const unchanged = attachment !== null && trimmed === attachment.name;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (trimmed && !unchanged && !busy) onSave(trimmed);
  };

  // Когда диалог открылся, выделено имя без расширения — его и меняют.
  // Не autoFocus: тот срабатывает раньше, чем значение попадает в поле.
  const selectStem = () => {
    const input = inputRef.current;
    if (!input) return;
    const ext = fileExtension(input.value);
    const stemLength = ext ? input.value.length - ext.length - 1 : input.value.length;
    input.focus();
    input.setSelectionRange(0, Math.max(stemLength, 0));
  };

  return (
    <Dialog
      open={attachment !== null}
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      fullScreen={isPhone}
      TransitionProps={{ onEntered: selectStem }}
    >
      <Box component="form" onSubmit={submit} noValidate>
        <DialogTitle>Переименовать файл</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название"
            value={name}
            onChange={(event) => setName(event.target.value)}
            inputRef={inputRef}
            inputProps={{ maxLength: 255 }}
            disabled={busy}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <AppButton type="submit" variant="contained" disabled={!trimmed || unchanged || busy}>
            Сохранить
          </AppButton>
        </DialogActions>
      </Box>
    </Dialog>
  );
};
