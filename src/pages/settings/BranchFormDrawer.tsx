import React from "react";
import {
  Alert,
  Avatar,
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
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import MapOutlined from "@mui/icons-material/MapOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import { useSnackbar } from "notistack";

import { useFormValidation } from "../../hooks/useFormValidation";
import { retryAuth } from "../../hooks/usePermissions";
import { ApiError, extractErrorMessage as extractApiError } from "../../api/client";
import {
  createBranch,
  updateBranch,
  uploadBranchLogo,
  deleteBranchLogo,
  type DjangoBranch,
} from "../../api/organization";
import { useT } from "../../i18n/VerticalProvider";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../utility/formDraft";

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

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Защита от случайной потери введённых данных при закрытии дровера (крестик,
// клик по фону, Esc). Создание использует один общий ключ (isDraftEmpty решает,
// когда черновик пуст), редактирование — ключ с id филиала и сравнение с
// исходными данными (baseline-diff), иначе «черновиком» считалась бы любая
// просто открытая карточка. Логотип не входит в черновик — он уходит на бэк
// отдельным запросом сразу при выборе файла.

const DRAFT_ADD_KEY = "mamadoc:settings:branch-add-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type BranchDraft = {
  savedAt: number;
  name: string;
  address: string;
  phones: string[];
  mapLinks: MapLinks;
  timezone: string;
  isActive: boolean;
};

function draftKeyFor(branchId: number): string {
  return `mamadoc:settings:branch-edit-draft:${branchId}`;
}

function sameAsBaseline(
  a: Omit<BranchDraft, "savedAt">,
  b: Omit<BranchDraft, "savedAt">,
): boolean {
  return (
    a.name === b.name &&
    a.address === b.address &&
    a.phones.join("\n") === b.phones.join("\n") &&
    MAP_LINKS.every(({ key }) => a.mapLinks[key] === b.mapLinks[key]) &&
    a.timezone === b.timezone &&
    a.isActive === b.isActive
  );
}

function isDraftEmpty(d: Omit<BranchDraft, "savedAt">): boolean {
  return (
    !d.name.trim() &&
    !d.address.trim() &&
    normalizePhones(d.phones).length === 0 &&
    MAP_LINKS.every(({ key }) => !d.mapLinks[key].trim()) &&
    d.timezone === DEFAULT_TZ &&
    d.isActive === true
  );
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
  const { t } = useT("settings");

  function extractErrorMessage(err: unknown): string {
    if (err instanceof ApiError) return extractApiError(err.payload, err.status);
    if (err instanceof Error) return err.message;
    return t("branchForm.unknownError");
  }

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

  // Логотип живёт отдельно от формы: загрузка/удаление уходят на бэк сразу
  // (PUT/DELETE .../logo/), поэтому в черновике/handleSubmit не участвуют.
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [logoBusy, setLogoBusy] = React.useState(false);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);

  const nameRef = React.useRef<HTMLInputElement>(null);
  const baselineRef = React.useRef<Omit<BranchDraft, "savedAt"> | null>(null);

  // ── загрузка данных филиала + восстановление черновика ──────────────────────
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    form.reset();
    setLogoUrl(editing?.logoUrl ?? null);
    setLogoBusy(false);
    setLogoError(null);
    setDraftRestored(false);

    if (editing) {
      const baseline: Omit<BranchDraft, "savedAt"> = {
        name: editing.name,
        address: editing.address,
        phones: editing.phones.length > 0 ? editing.phones : [""],
        mapLinks: {
          twoGisUrl: editing.twoGisUrl,
          yandexMapsUrl: editing.yandexMapsUrl,
          googleMapsUrl: editing.googleMapsUrl,
        },
        timezone: editing.timezone || DEFAULT_TZ,
        isActive: editing.isActive,
      };
      baselineRef.current = baseline;
      const draft = readFormDraft<BranchDraft>(draftKeyFor(editing.id), DRAFT_TTL_MS);
      const next = draft ?? baseline;
      setName(next.name);
      setAddress(next.address);
      setPhones(next.phones);
      setMapLinks(next.mapLinks);
      setTimezone(next.timezone);
      setIsActive(next.isActive);
      setDraftRestored(Boolean(draft));
    } else {
      baselineRef.current = null;
      const draft = readFormDraft<BranchDraft>(DRAFT_ADD_KEY, DRAFT_TTL_MS);
      if (draft) {
        setName(draft.name);
        setAddress(draft.address);
        setPhones(draft.phones.length > 0 ? draft.phones : [""]);
        setMapLinks(draft.mapLinks);
        setTimezone(draft.timezone);
        setIsActive(draft.isActive);
        setDraftRestored(true);
      } else {
        setName("");
        setAddress("");
        setPhones([""]);
        setMapLinks(EMPTY_MAP_LINKS);
        setTimezone(DEFAULT_TZ);
        setIsActive(true);
      }
    }
    const t = setTimeout(() => nameRef.current?.focus(), 120);
    return () => clearTimeout(t);
    // form.reset стабилен — эффект перезапускается только на открытии/смене цели.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const trimmedName = name.trim();
  const cleanPhones = normalizePhones(phones);
  const invalidMapLinks = MAP_LINKS.filter(
    ({ key }) => !isValidMapUrl(mapLinks[key]),
  ).map(({ key }) => key);

  // ── сохранение черновика в localStorage (защита от случайного закрытия) ────
  // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
  // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
  // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    const current: Omit<BranchDraft, "savedAt"> = {
      name,
      address,
      phones,
      mapLinks,
      timezone,
      isActive,
    };
    if (editing) {
      const key = draftKeyFor(editing.id);
      if (baselineRef.current && sameAsBaseline(current, baselineRef.current)) {
        clearFormDraft(key);
      } else {
        writeFormDraft(key, current);
      }
    } else if (isDraftEmpty(current)) {
      clearFormDraft(DRAFT_ADD_KEY);
    } else {
      writeFormDraft(DRAFT_ADD_KEY, current);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [open, editing, name, address, phones, mapLinks, timezone, isActive]);

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    if (editing) {
      clearFormDraft(draftKeyFor(editing.id));
      const b = baselineRef.current;
      if (b) {
        setName(b.name);
        setAddress(b.address);
        setPhones(b.phones);
        setMapLinks(b.mapLinks);
        setTimezone(b.timezone);
        setIsActive(b.isActive);
      }
    } else {
      clearFormDraft(DRAFT_ADD_KEY);
      setName("");
      setAddress("");
      setPhones([""]);
      setMapLinks(EMPTY_MAP_LINKS);
      setTimezone(DEFAULT_TZ);
      setIsActive(true);
    }
    setDraftRestored(false);
  };

  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const schema: Record<string, string | null> = {
    name: trimmedName ? null : t("branchForm.nameRequired"),
  };
  MAP_LINKS.forEach(({ key, label }) => {
    schema[`map-${key}`] = invalidMapLinks.includes(key)
      ? t("branchForm.mapLinkInvalid", { label })
      : null;
  });
  const form = useFormValidation(schema);

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
    if (busy) return;
    if (!form.validate()) return;
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
      clearFormDraft(editing ? draftKeyFor(editing.id) : DRAFT_ADD_KEY);
      onSaved(saved);
      enqueueSnackbar(isEdit ? t("branchForm.updated") : t("branchForm.created"), {
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

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Сбрасываем value, иначе повторный выбор того же файла не вызовет onChange.
    e.target.value = "";
    if (!file || !editing) return;
    if (!file.type.startsWith("image/")) {
      setLogoError(t("branchForm.logoTypeError"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError(t("branchForm.logoSizeError"));
      return;
    }
    setLogoBusy(true);
    setLogoError(null);
    try {
      const updated = await uploadBranchLogo(editing.id, file);
      setLogoUrl(updated.logoUrl);
      onSaved(updated);
      // Логотип филиала показывается в сайдбаре и переключателе контекста —
      // перечитываем /auth/me/, чтобы он обновился без перезагрузки страницы.
      retryAuth();
    } catch (err) {
      setLogoError(extractErrorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!editing || !logoUrl) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      await deleteBranchLogo(editing.id);
      setLogoUrl(null);
      onSaved({ ...editing, logoUrl: null });
      retryAuth();
    } catch (err) {
      setLogoError(extractErrorMessage(err));
    } finally {
      setLogoBusy(false);
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
              {isEdit ? t("branchForm.editTitle") : t("branchForm.createTitle")}
            </Typography>
            {isEdit && (
              <Typography variant="caption" color="text.secondary">
                {editing!.name}
              </Typography>
            )}
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5}>
          {draftRestored && (
            <Tooltip
              title={`${t("branchForm.draftRestored")} — ${t("branchForm.draftDiscard").toLowerCase()}?`}
            >
              <IconButton onClick={handleDiscardDraft} aria-label={t("branchForm.draftDiscard")}>
                <RestoreOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton
            onClick={busy ? undefined : handleClose}
            aria-label={t("common:actions.close")}
            edge="end"
          >
            <CloseOutlined />
          </IconButton>
        </Stack>
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
          {/* Логотип — только при редактировании: файл уходит на бэк сразу,
              новому филиалу сначала нужен id. */}
          {isEdit && (
            <Stack spacing={0.5}>
              <FieldLabel>{t("branchForm.logoLabel")}</FieldLabel>
              <Stack direction="row" alignItems="center" gap={2}>
                <Avatar
                  variant="rounded"
                  src={logoUrl ?? undefined}
                  alt={editing!.name}
                  sx={{
                    width: 56,
                    height: 56,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.default",
                    color: "text.secondary",
                  }}
                >
                  <StoreOutlined />
                </Avatar>
                <Box>
                  <Stack direction="row" gap={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={
                        logoBusy ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <FileUploadOutlined />
                        )
                      }
                      disabled={logoBusy || busy}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {logoUrl ? t("branchForm.logoReplace") : t("branchForm.logoUpload")}
                    </Button>
                    {logoUrl && (
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteOutlineOutlined />}
                        disabled={logoBusy || busy}
                        onClick={handleLogoDelete}
                      >
                        {t("common:actions.delete")}
                      </Button>
                    )}
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    {t("branchForm.logoHint")}
                  </Typography>
                </Box>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleLogoSelect}
                />
              </Stack>
              {logoError && <Alert severity="error">{logoError}</Alert>}
            </Stack>
          )}

          {/* Название */}
          <Stack spacing={0.5}>
            <FieldLabel counter={`${name.length}/${NAME_MAX}`}>{t("branchForm.nameLabel")}</FieldLabel>
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
              placeholder={t("branchForm.namePlaceholder")}
              {...form.field("name", " ")}
              inputProps={{ maxLength: NAME_MAX }}
            />
          </Stack>

          {/* Адрес */}
          <Stack spacing={0.5}>
            <FieldLabel>{t("branchForm.addressLabel")}</FieldLabel>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={busy}
              placeholder={t("branchForm.addressPlaceholder")}
            />
          </Stack>

          {/* Телефоны */}
          <Stack spacing={0.5}>
            <FieldLabel>{t("branchForm.phonesLabel")}</FieldLabel>
            <Stack spacing={1}>
              {phones.map((p, index) => (
                <Stack key={index} direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    fullWidth
                    value={p}
                    onChange={(e) => setPhoneAt(index, e.target.value)}
                    disabled={busy}
                    placeholder={t("branchForm.phonePlaceholder")}
                    inputProps={{ inputMode: "tel", maxLength: PHONE_MAX }}
                  />
                  {(phones.length > 1 || p.trim()) && (
                    <IconButton
                      size="small"
                      onClick={() => removePhoneAt(index)}
                      disabled={busy}
                      aria-label={t("branchForm.removePhoneAria")}
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
                {t("branchForm.addPhone")}
              </Button>
            </Stack>
          </Stack>

          {/* Ссылки на карты */}
          <Stack spacing={0.5}>
            <Stack direction="row" alignItems="center" gap={0.75}>
              <MapOutlined fontSize="small" sx={{ color: "text.secondary" }} />
              <FieldLabel>{t("branchForm.mapLinksLabel")}</FieldLabel>
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
                  error={Boolean(form.errorOf(`map-${key}`))}
                  helperText={
                    form.errorOf(`map-${key}`)
                      ? t("branchForm.mapLinkInvalidShort")
                      : undefined
                  }
                  ref={form.anchor(`map-${key}`)}
                  inputProps={{ inputMode: "url" }}
                />
              ))}
            </Stack>
          </Stack>

          {/* Часовой пояс */}
          <Stack spacing={0.5}>
            <FieldLabel>{t("branchForm.timezoneLabel")}</FieldLabel>
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
                      {t("branchForm.activeLabel")}
                    </Typography>
                    <Chip
                      size="small"
                      label={isActive ? t("branchForm.activeStatus") : t("branchForm.inactiveStatus")}
                      color={isActive ? "success" : "default"}
                      variant={isActive ? "filled" : "outlined"}
                      sx={{ height: 20 }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {isActive
                      ? t("branchForm.activeCaption")
                      : t("branchForm.inactiveCaption")}
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
          <Button variant="outlined" onClick={handleClose} disabled={busy}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy ? t("common:state.saving") : isEdit ? t("common:actions.save") : t("common:actions.create")}
          </Button>
        </Stack>
      </Box>
    </>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : handleClose}
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
  );
};

export default BranchFormDrawer;
