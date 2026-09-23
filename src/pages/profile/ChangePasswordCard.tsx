import React from "react";
import {
  Alert,
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";

import { AppCard } from "../../components/ui";
import { AppButton } from "../../components/ui/AppButton";
import { changePassword } from "../../api/auth";
import { markPasswordSet, usePermissions } from "../../hooks/usePermissions";
import PasswordLoginHint from "./PasswordLoginHint";
import { useFormValidation } from "../../hooks/useFormValidation";
import { ApiError } from "../../api/client";

const MIN_LENGTH = 8;

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.payload && typeof err.payload === "object" && "error" in err.payload) {
      const e = (err.payload as Record<string, unknown>).error;
      if (typeof e === "string") return e;
      if (typeof e === "object" && e !== null && "message" in e) {
        return String((e as Record<string, unknown>).message);
      }
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Не удалось изменить пароль.";
}

const ChangePasswordCard: React.FC = () => {
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showNext, setShowNext] = React.useState(false);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Текст успеха фиксируем в момент отправки: после markPasswordSet() режим
  // «первая установка» сразу сменится на «изменение».
  const [success, setSuccess] = React.useState<string | null>(null);
  const { hasPassword } = usePermissions();
  const firstTime = hasPassword === false;

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    next: next.length >= MIN_LENGTH ? null : `Минимум ${MIN_LENGTH} символов`,
    confirm: next === confirm ? null : "Пароли не совпадают",
  });

  const reset = () => {
    setNext("");
    setConfirm("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!form.validate()) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await changePassword(next);
      setSuccess(firstTime ? "Пароль установлен." : "Пароль изменён.");
      markPasswordSet();
      reset();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppCard variant="outlined" title="Безопасность">
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          )}

          <TextField
            label="Новый пароль"
            type={showNext ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            fullWidth
            size="small"
            autoComplete="new-password"
            disabled={busy}
            error={tooShort || Boolean(form.errorOf("next"))}
            helperText={
              tooShort || form.errorOf("next")
                ? `Минимум ${MIN_LENGTH} символов`
                : "Минимум 8 символов"
            }
            ref={form.anchor("next")}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowNext((v) => !v)}
                    edge="end"
                    size="small"
                    aria-label="Показать пароль"
                  >
                    {showNext ? (
                      <VisibilityOffOutlined fontSize="small" />
                    ) : (
                      <VisibilityOutlined fontSize="small" />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Повторите новый пароль"
            type={showNext ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            fullWidth
            size="small"
            autoComplete="new-password"
            disabled={busy}
            error={mismatch || Boolean(form.errorOf("confirm"))}
            helperText={mismatch || form.errorOf("confirm") ? "Пароли не совпадают" : " "}
            ref={form.anchor("confirm")}
          />

          <Box>
            <AppButton
              type="submit"
              variant="contained"
              disabled={busy}
              loading={busy}
            >
              {busy ? "Сохранение…" : firstTime ? "Установить пароль" : "Изменить пароль"}
            </AppButton>
          </Box>
        </Stack>
      </Box>

      {/* Зачем пароль и как им входить — сюда ведёт кнопка из шапки. */}
      <Box sx={{ mt: 3 }}>
        <PasswordLoginHint />
      </Box>
    </AppCard>
  );
};

export default ChangePasswordCard;
