import React from "react";
import {
  Alert,
  Box,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { AppButton } from "../../components/ui/AppButton";
import {
  updateProfile,
  type ProfileUpdatePayload,
} from "../../api/auth";
import { ApiError } from "../../api/client";

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
  return "Не удалось сохранить профиль.";
}

/** Initial values the drawer is seeded with (current profile). */
export type ProfileFormValues = {
  fullName: string;
  phone: string;
  email: string;
  telegramId: string;
  nickname: string;
  birthDate: string; // YYYY-MM-DD or ""
  bankAccountNumber: string;
  inn: string;
};

type Props = {
  open: boolean;
  initial: ProfileFormValues;
  /** Whether private fields (bank account, INN) may be edited. */
  canEditPrivate: boolean;
  onClose: () => void;
  onSaved: (values: ProfileFormValues) => void;
};

const EditProfileDrawer: React.FC<Props> = ({
  open,
  initial,
  canEditPrivate,
  onClose,
  onSaved,
}) => {
  const [values, setValues] = React.useState<ProfileFormValues>(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reseed when (re)opened with fresh data.
  React.useEffect(() => {
    if (open) {
      setValues(initial);
      setError(null);
      setBusy(false);
    }
  }, [open, initial]);

  const set = (key: keyof ProfileFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    // Send empty strings as null so the backend clears the field.
    const toNullable = (s: string) => (s.trim() === "" ? null : s.trim());
    const payload: ProfileUpdatePayload = {
      fullName: values.fullName.trim(),
      phone: toNullable(values.phone),
      email: toNullable(values.email),
      telegramId: toNullable(values.telegramId),
      nickname: toNullable(values.nickname),
      birthDate: toNullable(values.birthDate),
      ...(canEditPrivate
        ? {
            bankAccountNumber: toNullable(values.bankAccountNumber),
            inn: toNullable(values.inn),
          }
        : {}),
    };

    try {
      await updateProfile(payload);
      onSaved(values);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 460 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        px={2.5}
        py={1.5}
      >
        <Typography variant="h6" fontWeight={600}>
          Редактировать профиль
        </Typography>
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2.5 }}>
          <Stack spacing={2}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <TextField
              label="ФИО"
              value={values.fullName}
              onChange={set("fullName")}
              fullWidth
              size="small"
              required
              disabled={busy}
            />
            <TextField
              label="Телефон"
              value={values.phone}
              onChange={set("phone")}
              fullWidth
              size="small"
              disabled={busy}
              placeholder="+996700000000"
            />
            <TextField
              label="Email"
              type="email"
              value={values.email}
              onChange={set("email")}
              fullWidth
              size="small"
              disabled={busy}
            />
            <TextField
              label="Telegram ID"
              value={values.telegramId}
              onChange={set("telegramId")}
              fullWidth
              size="small"
              disabled={busy}
              helperText="Только цифры (числовой Telegram ID)"
            />
            <TextField
              label="Псевдоним"
              value={values.nickname}
              onChange={set("nickname")}
              fullWidth
              size="small"
              disabled={busy}
            />
            <TextField
              label="Дата рождения"
              type="date"
              value={values.birthDate}
              onChange={set("birthDate")}
              fullWidth
              size="small"
              disabled={busy}
              InputLabelProps={{ shrink: true }}
            />

            {canEditPrivate && (
              <>
                <TextField
                  label="Банковский счёт"
                  value={values.bankAccountNumber}
                  onChange={set("bankAccountNumber")}
                  fullWidth
                  size="small"
                  disabled={busy}
                />
                <TextField
                  label="ИНН"
                  value={values.inn}
                  onChange={set("inn")}
                  fullWidth
                  size="small"
                  disabled={busy}
                />
              </>
            )}
          </Stack>
        </Box>

        <Divider />
        <Box px={2.5} py={1.5} display="flex" justifyContent="flex-end" gap={1.5}>
          <AppButton onClick={onClose} disabled={busy}>
            Отмена
          </AppButton>
          <AppButton
            type="submit"
            variant="contained"
            loading={busy}
            disabled={busy || values.fullName.trim().length === 0}
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </AppButton>
        </Box>
      </Box>
    </Drawer>
  );
};

export default EditProfileDrawer;
