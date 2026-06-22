import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import { useSnackbar } from "notistack";

import { useCloseGuard } from "../../hooks/useCloseGuard";
import { CloseGuardDialog } from "../../components/common/CloseGuardDialog";
import { ApiError, extractErrorMessage as extractApiError } from "../../api/client";
import {
  createBranch,
  updateBranch,
  type DjangoBranch,
} from "../../api/organization";

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return extractApiError(err.payload, err.status);
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
}

const NAME_MAX = 255;

// Часовые пояса, актуальные для региона. Значение по умолчанию совпадает с
// серверным (Asia/Bishkek).
const TIMEZONES = [
  "Asia/Bishkek",
  "Asia/Almaty",
  "Asia/Tashkent",
  "Asia/Dushanbe",
  "Asia/Yekaterinburg",
  "Europe/Moscow",
] as const;
const DEFAULT_TZ = "Asia/Bishkek";

/** Target opening the drawer: a branch to edit, or "new" to create one. */
export type BranchFormTarget = DjangoBranch | "new" | null;

export interface BranchFormDrawerProps {
  target: BranchFormTarget;
  /** Organization the new branch belongs to (required for multi-org users). */
  organizationId?: number;
  onClose: () => void;
  onSaved: (branch: DjangoBranch) => void;
}

const FieldLabel: React.FC<{ children: React.ReactNode; counter?: string }> = ({
  children,
  counter,
}) => (
  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
    <Typography variant="body2" color="text.secondary" fontWeight={600}>
      {children}
    </Typography>
    {counter && (
      <Typography variant="caption" color="text.disabled">
        {counter}
      </Typography>
    )}
  </Stack>
);

export const BranchFormDrawer: React.FC<BranchFormDrawerProps> = ({
  target,
  organizationId,
  onClose,
  onSaved,
}) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const open = target !== null;
  const editing: DjangoBranch | null =
    target !== null && target !== "new" ? target : null;
  const isEdit = editing !== null;

  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [timezone, setTimezone] = React.useState<string>(DEFAULT_TZ);
  const [isActive, setIsActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState(false);

  const nameRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setTouched(false);
    if (editing) {
      setName(editing.name);
      setAddress(editing.address);
      setPhone(editing.phone);
      setTimezone(editing.timezone || DEFAULT_TZ);
      setIsActive(editing.isActive);
    } else {
      setName("");
      setAddress("");
      setPhone("");
      setTimezone(DEFAULT_TZ);
      setIsActive(true);
    }
    const t = setTimeout(() => nameRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, editing]);

  const trimmedName = name.trim();

  const isDirty = isEdit
    ? trimmedName !== editing!.name ||
      address.trim() !== editing!.address ||
      phone.trim() !== editing!.phone ||
      timezone !== editing!.timezone ||
      isActive !== editing!.isActive
    : Boolean(trimmedName || address.trim() || phone.trim());

  const { guardedClose, confirmOpen, confirmClose, cancelClose } = useCloseGuard({
    isDirty,
    isOpen: open,
    onClose,
  });

  const nameError = touched && !trimmedName ? "Укажите название филиала" : "";
  const canSubmit = !busy && Boolean(trimmedName);

  const handleSubmit = async () => {
    setTouched(true);
    if (!trimmedName) return;
    setError(null);
    setBusy(true);
    try {
      let saved: DjangoBranch;
      if (editing) {
        saved = await updateBranch(editing.id, {
          name: trimmedName,
          address: address.trim(),
          phone: phone.trim(),
          timezone,
          isActive,
        });
      } else {
        saved = await createBranch({
          name: trimmedName,
          organizationId,
          address: address.trim(),
          phone: phone.trim(),
          timezone,
          isActive,
        });
      }
      onSaved(saved);
      enqueueSnackbar(isEdit ? "Филиал обновлён" : "Филиал создан", {
        variant: "success",
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const content = (
    <>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          flexShrink: 0,
        }}
      >
        <Stack direction="row" alignItems="center" gap={1.25}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: "primary.main",
            }}
          >
            <StoreOutlined fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={600} lineHeight={1.2}>
              {isEdit ? "Редактирование филиала" : "Новый филиал"}
            </Typography>
            {isEdit && (
              <Typography variant="caption" color="text.secondary">
                {editing!.name}
              </Typography>
            )}
          </Box>
        </Stack>
        <IconButton
          onClick={busy ? undefined : guardedClose}
          aria-label="Закрыть"
          edge="end"
        >
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />

      {/* Body */}
      <Box
        sx={{
          p: 2.5,
          flex: 1,
          overflowY: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack spacing={2.5}>
          {/* Название */}
          <Stack spacing={0.5}>
            <FieldLabel counter={`${name.length}/${NAME_MAX}`}>Название *</FieldLabel>
            <TextField
              inputRef={nameRef}
              size="small"
              fullWidth
              value={name}
              onChange={(e) => {
                setError(null);
                setName(e.target.value);
              }}
              onKeyDown={handleNameKeyDown}
              disabled={busy}
              placeholder="Например: Центральный филиал"
              error={Boolean(nameError)}
              helperText={nameError || " "}
              inputProps={{ maxLength: NAME_MAX }}
            />
          </Stack>

          {/* Адрес */}
          <Stack spacing={0.5}>
            <FieldLabel>Адрес</FieldLabel>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={busy}
              placeholder="Город, улица, дом"
            />
          </Stack>

          {/* Телефон */}
          <Stack spacing={0.5}>
            <FieldLabel>Телефон</FieldLabel>
            <TextField
              size="small"
              fullWidth
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              placeholder="+996 700 000 000"
              inputProps={{ inputMode: "tel" }}
            />
          </Stack>

          {/* Часовой пояс */}
          <Stack spacing={0.5}>
            <FieldLabel>Часовой пояс</FieldLabel>
            <TextField
              select
              size="small"
              fullWidth
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={busy}
            >
              {/* На случай, если у филиала редкий пояс не из списка — добавим его. */}
              {(TIMEZONES.includes(timezone as (typeof TIMEZONES)[number])
                ? TIMEZONES
                : [timezone, ...TIMEZONES]
              ).map((tz) => (
                <MenuItem key={tz} value={tz}>
                  {tz}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* Активность */}
          <Box
            sx={{
              p: 1.75,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: alpha(theme.palette.primary.main, 0.03),
            }}
          >
            <FormControlLabel
              sx={{ m: 0, alignItems: "flex-start", gap: 1 }}
              control={
                <Switch
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={busy}
                />
              }
              label={
                <Box>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Typography variant="body2" fontWeight={600}>
                      Активен
                    </Typography>
                    <Chip
                      size="small"
                      label={isActive ? "Работает" : "Отключён"}
                      color={isActive ? "success" : "default"}
                      variant={isActive ? "filled" : "outlined"}
                      sx={{ height: 20 }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {isActive
                      ? "Филиал доступен для записи, продаж и выбора в интерфейсе."
                      : "Филиал скрыт из выбора; существующие данные сохраняются."}
                  </Typography>
                </Box>
              }
            />
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Box>

      {/* Footer */}
      <Divider />
      <Box sx={{ px: 2.5, py: 1.5, flexShrink: 0 }}>
        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={guardedClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!canSubmit}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
          </Button>
        </Stack>
      </Box>
    </>
  );

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={busy ? undefined : guardedClose}
        PaperProps={{
          sx: {
            width: { xs: 320, sm: 440 },
            maxWidth: "100vw",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {content}
      </Drawer>

      <CloseGuardDialog
        open={confirmOpen}
        title={isEdit ? "редактирование филиала" : "новый филиал"}
        onConfirm={confirmClose}
        onCancel={cancelClose}
      />
    </>
  );
};

export default BranchFormDrawer;
