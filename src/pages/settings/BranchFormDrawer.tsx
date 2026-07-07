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
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import MapOutlined from "@mui/icons-material/MapOutlined";
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
const PHONE_MAX = 50;

// Ссылки на страницу филиала в картографических сервисах. Порядок полей в
// форме и подписи должны совпадать с колонкой «Карты» в таблице филиалов.
const MAP_LINKS = [
  { key: "twoGisUrl", label: "2ГИС", placeholder: "https://2gis.kg/..." },
  { key: "yandexMapsUrl", label: "Яндекс Карты", placeholder: "https://yandex.ru/maps/..." },
  { key: "googleMapsUrl", label: "Google Maps", placeholder: "https://maps.google.com/..." },
] as const;

type MapLinkKey = (typeof MAP_LINKS)[number]["key"];
type MapLinks = Record<MapLinkKey, string>;

const EMPTY_MAP_LINKS: MapLinks = {
  twoGisUrl: "",
  yandexMapsUrl: "",
  googleMapsUrl: "",
};

/** Бэкенд валидирует URLField; здесь только быстрая проверка для UX. */
function isValidMapUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return /^https?:\/\/\S+\.\S+/.test(v);
}

/** Убирает пустые строки и лишние пробелы, сохраняя порядок. */
function normalizePhones(phones: string[]): string[] {
  return phones.map((p) => p.trim()).filter(Boolean);
}

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
  // Всегда держим минимум одно поле телефона, чтобы форма не была пустой.
  const [phones, setPhones] = React.useState<string[]>([""]);
  const [mapLinks, setMapLinks] = React.useState<MapLinks>(EMPTY_MAP_LINKS);
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
      setPhones(editing.phones.length > 0 ? editing.phones : [""]);
      setMapLinks({
        twoGisUrl: editing.twoGisUrl,
        yandexMapsUrl: editing.yandexMapsUrl,
        googleMapsUrl: editing.googleMapsUrl,
      });
      setTimezone(editing.timezone || DEFAULT_TZ);
      setIsActive(editing.isActive);
    } else {
      setName("");
      setAddress("");
      setPhones([""]);
      setMapLinks(EMPTY_MAP_LINKS);
      setTimezone(DEFAULT_TZ);
      setIsActive(true);
    }
    const t = setTimeout(() => nameRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, editing]);

  const trimmedName = name.trim();
  const cleanPhones = normalizePhones(phones);
  const invalidMapLinks = MAP_LINKS.filter(
    ({ key }) => !isValidMapUrl(mapLinks[key]),
  ).map(({ key }) => key);

  const isDirty = isEdit
    ? trimmedName !== editing!.name ||
      address.trim() !== editing!.address ||
      cleanPhones.join("\n") !== editing!.phones.join("\n") ||
      MAP_LINKS.some(({ key }) => mapLinks[key].trim() !== editing![key]) ||
      timezone !== editing!.timezone ||
      isActive !== editing!.isActive
    : Boolean(
        trimmedName ||
          address.trim() ||
          cleanPhones.length > 0 ||
          MAP_LINKS.some(({ key }) => mapLinks[key].trim()),
      );

  const { guardedClose, confirmOpen, confirmClose, cancelClose } = useCloseGuard({
    isDirty,
    isOpen: open,
    onClose,
  });

  const nameError = touched && !trimmedName ? "Укажите название филиала" : "";
  const canSubmit = !busy && Boolean(trimmedName) && invalidMapLinks.length === 0;

  const setPhoneAt = (index: number, value: string) => {
    setPhones((prev) => prev.map((p, i) => (i === index ? value : p)));
  };

  const removePhoneAt = (index: number) => {
    setPhones((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const setMapLink = (key: MapLinkKey, value: string) => {
    setMapLinks((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (!trimmedName || invalidMapLinks.length > 0) return;
    setError(null);
    setBusy(true);
    try {
      const contacts = {
        phones: cleanPhones,
        twoGisUrl: mapLinks.twoGisUrl.trim(),
        yandexMapsUrl: mapLinks.yandexMapsUrl.trim(),
        googleMapsUrl: mapLinks.googleMapsUrl.trim(),
      };
      let saved: DjangoBranch;
      if (editing) {
        saved = await updateBranch(editing.id, {
          name: trimmedName,
          address: address.trim(),
          ...contacts,
          timezone,
          isActive,
        });
      } else {
        saved = await createBranch({
          name: trimmedName,
          organizationId,
          address: address.trim(),
          ...contacts,
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

          {/* Телефоны */}
          <Stack spacing={0.5}>
            <FieldLabel>Телефоны</FieldLabel>
            <Stack spacing={1}>
              {phones.map((p, index) => (
                <Stack key={index} direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    fullWidth
                    value={p}
                    onChange={(e) => setPhoneAt(index, e.target.value)}
                    disabled={busy}
                    placeholder="+996 700 000 000"
                    inputProps={{ inputMode: "tel", maxLength: PHONE_MAX }}
                  />
                  {(phones.length > 1 || p.trim()) && (
                    <IconButton
                      size="small"
                      onClick={() => removePhoneAt(index)}
                      disabled={busy}
                      aria-label="Удалить телефон"
                    >
                      <DeleteOutlineOutlined fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              ))}
              <Button
                size="small"
                startIcon={<AddOutlined />}
                onClick={() => setPhones((prev) => [...prev, ""])}
                disabled={busy}
                sx={{ alignSelf: "flex-start" }}
              >
                Добавить номер
              </Button>
            </Stack>
          </Stack>

          {/* Ссылки на карты */}
          <Stack spacing={0.5}>
            <Stack direction="row" alignItems="center" gap={0.75}>
              <MapOutlined fontSize="small" sx={{ color: "text.secondary" }} />
              <FieldLabel>Ссылки на карты</FieldLabel>
            </Stack>
            <Stack spacing={1.25}>
              {MAP_LINKS.map(({ key, label, placeholder }) => (
                <TextField
                  key={key}
                  size="small"
                  fullWidth
                  label={label}
                  value={mapLinks[key]}
                  onChange={(e) => setMapLink(key, e.target.value)}
                  disabled={busy}
                  placeholder={placeholder}
                  error={touched && invalidMapLinks.includes(key)}
                  helperText={
                    touched && invalidMapLinks.includes(key)
                      ? "Ссылка должна начинаться с http:// или https://"
                      : undefined
                  }
                  inputProps={{ inputMode: "url" }}
                />
              ))}
            </Stack>
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
