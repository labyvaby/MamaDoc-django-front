import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Chip,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import SettingsLayout from "./SettingsLayout";
import { AppButton } from "../../components/ui/AppButton";
import { CanAccess } from "../../components/rbac/CanAccess";
import { usePermissions, retryAuth } from "../../hooks/usePermissions";
import {
  getOrganization,
  updateOrganization,
  uploadOrganizationLogo,
  deleteOrganizationLogo,
  type DjangoOrganization,
  type PatientScope,
  type AppointmentOverlapMode,
} from "../../api/organization";
import { ApiError } from "../../api/client";

// ── Error parsing (same shape as RolesSettingsPage) ──────────────────────────

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
  return "Неизвестная ошибка";
}

// ── Patient-scope option descriptions ────────────────────────────────────────

const PATIENT_SCOPE_OPTIONS: {
  value: PatientScope;
  label: string;
  hint: string;
}[] = [
  {
    value: "shared",
    label: "Общая база на все филиалы",
    hint: "Все филиалы видят одних и тех же пациентов. Переключение филиала не фильтрует список.",
  },
  {
    value: "per_branch",
    label: "Отдельная база у каждого филиала",
    hint: "У каждого филиала своя база пациентов. Список фильтруется по выбранному филиалу.",
  },
];

// ── Overlap-mode option descriptions ─────────────────────────────────────────

const OVERLAP_MODE_OPTIONS: {
  value: AppointmentOverlapMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "forbid",
    label: "Запрещать пересечение",
    hint: "Если приём пересекается с другим приёмом сотрудника, сохранить нельзя.",
  },
  {
    value: "warn",
    label: "Разрешать после подтверждения",
    hint: "Система покажет предупреждение со списком пересечений и позволит сохранить после подтверждения. Свободные окна считаются без изменений.",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

const OrganizationSettingsPage: React.FC = () => {
  const { activeOrganization, isSuperAdmin, hasPermission } = usePermissions();
  const canUpdate = isSuperAdmin() || hasPermission("organization.update");

  const orgId = activeOrganization?.id ?? null;

  const [org, setOrg] = React.useState<DjangoOrganization | null>(null);
  const [name, setName] = React.useState("");
  const [scope, setScope] = React.useState<PatientScope>("shared");
  const [overlapMode, setOverlapMode] =
    React.useState<AppointmentOverlapMode>("forbid");
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const [logoBusy, setLogoBusy] = React.useState(false);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    if (orgId == null) {
      setLoading(false);
      setLoadError("Активная организация не выбрана.");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getOrganization(orgId);
      setOrg(data);
      setName(data.name);
      setScope(data.patientScope);
      setOverlapMode(data.appointmentOverlapMode);
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const trimmedName = name.trim();
  const nameDirty = !!org && trimmedName !== "" && trimmedName !== org.name;
  const scopeDirty = !!org && scope !== org.patientScope;
  const overlapDirty = !!org && overlapMode !== org.appointmentOverlapMode;
  const dirty = nameDirty || scopeDirty || overlapDirty;

  const handleSave = async () => {
    if (!org || !dirty) return;
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateOrganization(org.id, {
        ...(nameDirty ? { name: trimmedName } : {}),
        ...(scopeDirty ? { patientScope: scope } : {}),
        ...(overlapDirty ? { appointmentOverlapMode: overlapMode } : {}),
      });
      setOrg(updated);
      setName(updated.name);
      setScope(updated.patientScope);
      setOverlapMode(updated.appointmentOverlapMode);
      setSaved(true);
      // Название организации показывается в переключателе контекста в сайдбаре —
      // перечитываем /auth/me/, чтобы оно обновилось без перезагрузки страницы.
      if (nameDirty) retryAuth();
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLogoSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    // Сбрасываем value, иначе повторный выбор того же файла не вызовет onChange.
    e.target.value = "";
    if (!file || !org) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Можно загрузить только изображение (PNG, JPG, SVG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("Файл слишком большой — максимум 5 МБ.");
      return;
    }
    setLogoBusy(true);
    setLogoError(null);
    try {
      const updated = await uploadOrganizationLogo(org.id, file);
      setOrg(updated);
      retryAuth();
    } catch (err) {
      setLogoError(extractErrorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!org?.logoUrl) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      await deleteOrganizationLogo(org.id);
      setOrg({ ...org, logoUrl: null });
      retryAuth();
    } catch (err) {
      setLogoError(extractErrorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <SettingsLayout>
      <Stack spacing={2.5} sx={{ maxWidth: 640 }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" gap={1}>
          <BusinessOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            Организация
          </Typography>
        </Stack>

        {loading && (
          <Stack spacing={1.5}>
            <Skeleton variant="text" width={240} height={28} />
            <Skeleton variant="rounded" height={120} />
          </Stack>
        )}

        {!loading && loadError && (
          <Alert
            severity="error"
            action={
              <AppButton size="small" color="inherit" onClick={load}>
                Повторить
              </AppButton>
            }
          >
            {loadError}
          </Alert>
        )}

        {!loading && !loadError && org && (
          <>
            {/* Logo */}
            <Stack direction="row" alignItems="center" gap={2}>
              <Avatar
                variant="rounded"
                src={org.logoUrl ?? undefined}
                alt={org.name}
                sx={{
                  width: 64,
                  height: 64,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.default",
                  color: "text.secondary",
                }}
              >
                <BusinessOutlined />
              </Avatar>
              <Box>
                <Stack direction="row" gap={1}>
                  <AppButton
                    size="small"
                    variant="outlined"
                    startIcon={<FileUploadOutlined />}
                    disabled={!canUpdate || logoBusy}
                    loading={logoBusy}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {org.logoUrl ? "Заменить логотип" : "Загрузить логотип"}
                  </AppButton>
                  {org.logoUrl && (
                    <AppButton
                      size="small"
                      color="error"
                      startIcon={<DeleteOutlineOutlined />}
                      disabled={!canUpdate || logoBusy}
                      onClick={handleLogoDelete}
                    >
                      Удалить
                    </AppButton>
                  )}
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5 }}
                >
                  PNG, JPG, SVG или WebP, до 5 МБ.
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

            {logoError && (
              <Alert severity="error" onClose={() => setLogoError(null)}>
                {logoError}
              </Alert>
            )}

            {/* Name */}
            <TextField
              label="Название организации"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              disabled={!canUpdate || busy}
              size="small"
              fullWidth
              error={trimmedName === ""}
              helperText={
                trimmedName === ""
                  ? "Название не может быть пустым"
                  : org.slug
              }
              FormHelperTextProps={
                trimmedName === ""
                  ? undefined
                  : { sx: { fontFamily: "monospace" } }
              }
            />

            {/* Patient registry scope */}
            <FormControl disabled={!canUpdate || busy}>
              <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                <GroupsOutlined fontSize="small" color="action" />
                <FormLabel sx={{ fontWeight: 600 }}>База пациентов</FormLabel>
              </Stack>
              <Typography variant="caption" color="text.secondary" mb={1}>
                Определяет, видят ли филиалы общий список пациентов или
                у каждого филиала своя база.
              </Typography>
              <RadioGroup
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as PatientScope);
                  setSaved(false);
                }}
              >
                {PATIENT_SCOPE_OPTIONS.map((opt) => (
                  <FormControlLabel
                    key={opt.value}
                    value={opt.value}
                    control={<Radio size="small" />}
                    sx={{ alignItems: "flex-start", mt: 0.5 }}
                    label={
                      <Box sx={{ py: 0.25 }}>
                        <Typography variant="body2" fontWeight={500}>
                          {opt.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {opt.hint}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            </FormControl>

            {/* Appointment overlap policy */}
            <FormControl disabled={!canUpdate || busy}>
              <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                <LayersOutlined fontSize="small" color="action" />
                <FormLabel sx={{ fontWeight: 600 }}>
                  Пересечение приёмов
                </FormLabel>
              </Stack>
              <Typography variant="caption" color="text.secondary" mb={1}>
                Как поступать, когда новый приём пересекается по времени
                с другим приёмом сотрудника.
              </Typography>
              <RadioGroup
                value={overlapMode}
                onChange={(e) => {
                  setOverlapMode(e.target.value as AppointmentOverlapMode);
                  setSaved(false);
                }}
              >
                {OVERLAP_MODE_OPTIONS.map((opt) => (
                  <FormControlLabel
                    key={opt.value}
                    value={opt.value}
                    control={<Radio size="small" />}
                    sx={{ alignItems: "flex-start", mt: 0.5 }}
                    label={
                      <Box sx={{ py: 0.25 }}>
                        <Typography variant="body2" fontWeight={500}>
                          {opt.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {opt.hint}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            </FormControl>

            {!canUpdate && (
              <Chip
                label="Только просмотр — нет прав на изменение"
                size="small"
                variant="outlined"
              />
            )}

            {saveError && (
              <Alert severity="error" onClose={() => setSaveError(null)}>
                {saveError}
              </Alert>
            )}
            {saved && !dirty && (
              <Alert severity="success" onClose={() => setSaved(false)}>
                Настройки сохранены.
              </Alert>
            )}

            <CanAccess permissions="organization.update">
              <Box>
                <AppButton
                  variant="contained"
                  onClick={handleSave}
                  disabled={!dirty || trimmedName === ""}
                  loading={busy}
                >
                  {busy ? "Сохранение…" : "Сохранить"}
                </AppButton>
              </Box>
            </CanAccess>
          </>
        )}
      </Stack>
    </SettingsLayout>
  );
};

export default OrganizationSettingsPage;
