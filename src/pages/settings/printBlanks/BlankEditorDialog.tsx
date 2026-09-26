import React from "react";
import {
  Alert,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../../api/client";
import { createPrintTemplate, updatePrintTemplate, type PrintTemplate } from "../../../api/printforms";
import { AppButton } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import {
  BLANK_PLACEHOLDERS,
  SAMPLE_BLANK_DATA,
  SAMPLE_OBLIGATION_TEXT,
  fillBlank,
  hasBrokenBraces,
  unknownPlaceholders,
} from "../../../utils/blankText";

const NAME_MAX_LENGTH = 160;

interface BlankEditorDialogProps {
  scope: ActiveScope;
  /** `null` — новый бланк. */
  template: PrintTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Название и текст бланка: подстановки кнопками, образец расписки, предпросмотр. */
export const BlankEditorDialog: React.FC<BlankEditorDialogProps> = ({ scope, template, onClose, onSaved }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [name, setName] = React.useState(template?.name ?? "");
  const [body, setBody] = React.useState(template?.body ?? "");
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const broken = hasBrokenBraces(body);
  const unknown = unknownPlaceholders(body);

  const save = useMutation({
    mutationFn: () =>
      template
        ? updatePrintTemplate(scope, template.id, { name: name.trim(), body })
        : createPrintTemplate(scope, { name: name.trim(), kind: "blank", body }),
    onSuccess: () => {
      enqueueSnackbar("Бланк сохранён", { variant: "success" });
      onSaved();
    },
  });

  // Подстановка встаёт на место курсора (или заменяет выделение), курсор — за ней.
  const insert = (token: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const applySample = () => {
    if (body.trim() && !window.confirm("Заменить текст образцом расписки?")) return;
    setBody(SAMPLE_OBLIGATION_TEXT);
    if (!name.trim()) setName("Расписка-обязательство");
  };

  return (
    <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{template ? "Бланк" : "Новый бланк"}</DialogTitle>
      <DialogContent>
        <Stack gap={1.5} sx={{ mt: 0.5 }}>
          <TextField
            size="small"
            label="Название"
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, NAME_MAX_LENGTH))}
            autoFocus
          />
          <Stack gap={0.5}>
            <Typography variant="caption" color="text.secondary">
              Подстановки — нажмите, чтобы вставить в текст
            </Typography>
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {BLANK_PLACEHOLDERS.map((item) => (
                <Chip key={item.path} size="small" label={item.label} onClick={() => insert(`{${item.path}}`)} />
              ))}
            </Stack>
          </Stack>
          <TextField
            label="Текст бланка"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            inputRef={inputRef}
            multiline
            minRows={12}
            error={broken}
            helperText={
              broken
                ? "Подстановка пишется фигурными скобками без пробелов: {child.fullName}"
                : "Пусто — бланк печатается таблицей полей"
            }
          />
          {unknown.length > 0 && (
            <Alert severity="warning">
              Незнакомые подстановки напечатаются пустыми: {unknown.map((path) => `{${path}}`).join(", ")}
            </Alert>
          )}
          <AppButton variant="text" size="small" onClick={applySample} sx={{ alignSelf: "flex-start" }}>
            Вставить образец расписки
          </AppButton>
          {body.trim() && (
            <>
              <Typography variant="caption" color="text.secondary">
                Предпросмотр на образце
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, whiteSpace: "pre-wrap", fontFamily: "Arial, sans-serif", fontSize: 14 }}>
                {fillBlank(body, SAMPLE_BLANK_DATA)}
              </Paper>
            </>
          )}
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={save.isPending}>
          Закрыть
        </AppButton>
        <AppButton
          variant="contained"
          onClick={() => save.mutate()}
          disabled={save.isPending || broken || !name.trim()}
        >
          Сохранить
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
