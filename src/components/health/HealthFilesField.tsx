import React from "react";
import { Alert, Box, ButtonBase, Chip, IconButton, Stack, Tooltip, Typography, alpha } from "@mui/material";
import AttachFileOutlined from "@mui/icons-material/AttachFileOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PictureAsPdfOutlined from "@mui/icons-material/PictureAsPdfOutlined";

import { getErrorMessage } from "../../api/client";
import {
  HEALTH_FILE_ACCEPT,
  uploadHealthFile,
  type AttachmentKind,
  type HealthAttachment,
} from "../../api/health";
import { subtleBg } from "../../theme/uiHelpers";
import { AppButton } from "../ui";
import { isPdfAttachment } from "./illnessData";
import { useHealthScope } from "./useHealth";

/** Не больше 10 документов на запись (§2.5). */
export const HEALTH_FILES_MAX = 10;

const KIND_LABELS: Record<AttachmentKind, string> = { discharge: "Выписка", image: "Снимок", other: "Другое" };

/** Миниатюра документа: снимок или значок PDF; открывается в новой вкладке. */
export const AttachmentThumb: React.FC<{ attachment: HealthAttachment; size?: number }> = ({ attachment, size = 56 }) => {
  const pdf = isPdfAttachment(attachment);
  return (
    <Tooltip title={`${KIND_LABELS[attachment.kind] ?? "Документ"}: ${attachment.name || "без имени"}`} arrow>
      <ButtonBase
        component="a"
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event: React.MouseEvent) => event.stopPropagation()}
        aria-label={`Открыть документ «${attachment.name || KIND_LABELS[attachment.kind]}»`}
        sx={(theme) => ({
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: "10px",
          overflow: "hidden",
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: pdf ? alpha(theme.palette.error.main, 0.08) : subtleBg(theme, true),
          color: theme.palette.mode === "dark" ? theme.palette.error.light : theme.palette.error.dark,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        {pdf ? (
          <PictureAsPdfOutlined />
        ) : (
          <Box
            component="img"
            src={attachment.url}
            alt={attachment.name}
            loading="lazy"
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </ButtonBase>
    </Tooltip>
  );
};

/** Миниатюры документов записи и подпись «выписка, снимки (2)» (§4.2). */
export const AttachmentStrip: React.FC<{ attachments: ReadonlyArray<HealthAttachment>; caption: string; indent?: boolean }> = ({
  attachments,
  caption,
  indent = false,
}) =>
  attachments.length ? (
    <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center" sx={{ mt: 1, pl: indent ? { xs: 0, md: "48px" } : 0 }}>
      {attachments.map((attachment, index) => (
        <AttachmentThumb key={`${attachment.url}-${index}`} attachment={attachment} size={52} />
      ))}
      <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
        {caption}
      </Typography>
    </Stack>
  ) : null;

interface HealthFilesFieldProps {
  patientId: number;
  value: HealthAttachment[];
  onChange: (value: HealthAttachment[]) => void;
  /** Какие виды документов предлагать (у госпитализации — выписка и другое). */
  kinds: ReadonlyArray<AttachmentKind>;
  /** Вид нового документа. */
  defaultKind: AttachmentKind;
  /** Пока идёт загрузка, окно не сохраняют. */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Документы записи (§2.5): фото и PDF до 10 МБ, не больше 10. Файл сразу
 * уходит в `health-files/` этой карточки, в запись ложится ссылка, имя и вид.
 * Убранный документ из хранилища не удаляется — как фото заключений.
 */
export const HealthFilesField: React.FC<HealthFilesFieldProps> = ({
  patientId,
  value,
  onChange,
  kinds,
  defaultKind,
  onBusyChange,
}) => {
  const { scope } = useHealthScope();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Загрузка асинхронная — новые документы добавляем к актуальному списку.
  const latest = React.useRef(value);
  latest.current = value;

  const setBusyState = (next: boolean) => {
    setBusy(next);
    onBusyChange?.(next);
  };

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = HEALTH_FILES_MAX - latest.current.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    setError(files.length > room ? `Не больше ${HEALTH_FILES_MAX} документов` : null);
    if (!chosen.length) return;
    setBusyState(true);
    try {
      for (const file of chosen) {
        const uploaded = await uploadHealthFile(scope, patientId, file);
        onChange([...latest.current, { url: uploaded.url, name: uploaded.name || file.name, kind: defaultKind }]);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось загрузить документ"));
    } finally {
      setBusyState(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Stack gap={1}>
      {value.map((attachment, index) => (
        <Stack
          key={`${attachment.url}-${index}`}
          direction="row"
          gap={1.25}
          alignItems="center"
          sx={(theme) => ({ p: 1, borderRadius: "12px", border: `1px solid ${theme.palette.divider}` })}
        >
          <AttachmentThumb attachment={attachment} size={48} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {attachment.name || "Документ"}
            </Typography>
            <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
              {kinds.map((kind) => {
                const active = attachment.kind === kind;
                return (
                  <Chip
                    key={kind}
                    size="small"
                    clickable
                    label={KIND_LABELS[kind]}
                    color={active ? "primary" : "default"}
                    variant={active ? "filled" : "outlined"}
                    aria-pressed={active}
                    onClick={() => onChange(value.map((item, at) => (at === index ? { ...item, kind } : item)))}
                    sx={{ height: 24, borderRadius: "7px" }}
                  />
                );
              })}
            </Stack>
          </Box>
          <IconButton
            size="small"
            aria-label={`Убрать документ «${attachment.name || KIND_LABELS[attachment.kind]}»`}
            onClick={() => onChange(value.filter((_, at) => at !== index))}
            disabled={busy}
          >
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      {error && (
        <Alert severity="warning" onClose={() => setError(null)} sx={{ py: 0 }}>
          {error}
        </Alert>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={HEALTH_FILE_ACCEPT}
        multiple
        hidden
        onChange={(event) => void pick(event.target.files)}
      />
      {value.length < HEALTH_FILES_MAX && (
        <AppButton
          variant="outlined"
          size="small"
          startIcon={<AttachFileOutlined />}
          loading={busy}
          onClick={() => inputRef.current?.click()}
          sx={{ alignSelf: "flex-start" }}
        >
          {busy ? "Загрузка…" : value.length ? "Ещё документ" : "Приложить документ"}
        </AppButton>
      )}
      <Typography variant="caption" color="text.secondary">
        Фото или PDF до 10 МБ, не больше {HEALTH_FILES_MAX}. Документ откроется в новой вкладке.
      </Typography>
    </Stack>
  );
};
