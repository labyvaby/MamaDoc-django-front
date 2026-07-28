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
import TranslateOutlined from "@mui/icons-material/TranslateOutlined";
import FileUploadOutlined from "@mui/icons-material/FileUploadOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import SettingsLayout from "./SettingsLayout";
import { AppButton } from "../../components/ui/AppButton";
import { CanAccess } from "../../components/rbac/CanAccess";
import { usePermissions, retryAuth } from "../../hooks/usePermissions";
import { useFormValidation } from "../../hooks/useFormValidation";
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
import { useT } from "../../i18n/VerticalProvider";
import { SUPPORTED_VERTICALS } from "../../i18n/glossary";
import type { Vertical } from "../../i18n/types";

// ── Page ──────────────────────────────────────────────────────────────────────

const OrganizationSettingsPage: React.FC = () => {
  const { t } = useT("settings");

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
    return t("organization.unknownError");
  }

  const PATIENT_SCOPE_OPTIONS: {
    value: PatientScope;
    label: string;
    hint: string;
  }[] = [
    {
      value: "shared",
      label: t("organization.patientScope.shared.label"),
      hint: t("organization.patientScope.shared.hint"),
    },
    {
      value: "per_branch",
      label: t("organization.patientScope.perBranch.label"),
      hint: t("organization.patientScope.perBranch.hint"),
    },
  ];

  const OVERLAP_MODE_OPTIONS: {
    value: AppointmentOverlapMode;
    label: string;
    hint: string;
  }[] = [
    {
      value: "forbid",
      label: t("organization.overlapMode.forbid.label"),
      hint: t("organization.overlapMode.forbid.hint"),
    },
    {
      value: "warn",
      label: t("organization.overlapMode.warn.label"),
      hint: t("organization.overlapMode.warn.hint"),
    },
  ];

  const VERTICAL_OPTIONS: { value: Vertical; label: string; hint: string }[] =
    SUPPORTED_VERTICALS.map((value) => ({
      value,
      label: t(`organization.vertical.${value}.label`),
      hint: t(`organization.vertical.${value}.hint`),
    }));

  const { activeOrganization, isSuperAdmin, hasPermission } = usePermissions();
  const canUpdate = isSuperAdmin() || hasPermission("organization.update");
  // Терминология переведена под вертикаль только частично (см. settings.json
  // organization.vertical.superadminOnlyNote) — переключатель пока виден
  // только суперадмину, не самой организации.
  const canEditVertical = isSuperAdmin();

  const orgId = activeOrganization?.id ?? null;

  const [org, setOrg] = React.useState<DjangoOrganization | null>(null);
  const [name, setName] = React.useState("");
  const [scope, setScope] = React.useState<PatientScope>("shared");
  const [overlapMode, setOverlapMode] =
    React.useState<AppointmentOverlapMode>("forbid");
  const [vertical, setVertical] = React.useState<Vertical>("clinic");
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
      setLoadError(t("organization.noOrgSelected"));
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
      setVertical(data.vertical);
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
  const verticalDirty = !!org && canEditVertical && vertical !== org.vertical;
  const dirty = nameDirty || scopeDirty || overlapDirty || verticalDirty;

  // Название обязательно: пустое поле блокирует сохранение и получает фокус.
  const form = useFormValidation({
    name: trimmedName ? null : t("organization.nameRequired"),
  });

  const handleSave = async () => {
    if (!org || !dirty) return;
    if (!form.validate()) return;
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateOrganization(org.id, {
        ...(nameDirty ? { name: trimmedName } : {}),
        ...(scopeDirty ? { patientScope: scope } : {}),
        ...(overlapDirty ? { appointmentOverlapMode: overlapMode } : {}),
        ...(verticalDirty ? { vertical } : {}),
      });
      setOrg(updated);
      setName(updated.name);
      setScope(updated.patientScope);
      setOverlapMode(updated.appointmentOverlapMode);
      setVertical(updated.vertical);
      setSaved(true);
      // Название организации показывается в переключателе контекста в сайдбаре,
      // а вертикаль меняет глоссарий по всему приложению — перечитываем
      // /auth/me/, чтобы обновилось без перезагрузки страницы.
      if (nameDirty || verticalDirty) retryAuth();
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
      setLogoError(t("organization.logoTypeError"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError(t("organization.logoSizeError"));
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
            {t("organization.title")}
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
                {t("common:actions.retry")}
              </AppButton>
            }
          >
            {loadError}
          </Alert>
        )}

        {!loading && !loadError && org && (
          <>
            {/* Logo */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              alignItems={{ xs: "flex-start", sm: "center" }}
              gap={2}
            >
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
              <Box sx={{ width: { xs: "100%", sm: "auto" } }}>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <AppButton
                    size="small"
                    variant="outlined"
                    startIcon={<FileUploadOutlined />}
                    disabled={!canUpdate || logoBusy}
                    loading={logoBusy}
                    onClick={() => logoInputRef.current?.click()}
                    sx={{ flex: { xs: "1 1 auto", sm: "0 0 auto" } }}
                  >
                    {org.logoUrl ? t("organization.logoReplace") : t("organization.logoUpload")}
                  </AppButton>
                  {org.logoUrl && (
                    <AppButton
                      size="small"
                      color="error"
                      startIcon={<DeleteOutlineOutlined />}
                      disabled={!canUpdate || logoBusy}
                      onClick={handleLogoDelete}
                    >
                      {t("common:actions.delete")}
                    </AppButton>
                  )}
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5 }}
                >
                  {t("organization.logoHint")}
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
              label={t("organization.nameLabel")}
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
                  ? t("organization.nameRequired")
                  : org.slug
              }
              ref={form.anchor("name")}
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
                <FormLabel sx={{ fontWeight: 600 }}>{t("organization.patientScope.sectionTitle")}</FormLabel>
              </Stack>
              <Typography variant="caption" color="text.secondary" mb={1}>
                {t("organization.patientScope.sectionHint")}
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
                  {t("organization.overlapMode.sectionTitle")}
                </FormLabel>
              </Stack>
              <Typography variant="caption" color="text.secondary" mb={1}>
                {t("organization.overlapMode.sectionHint")}
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

            {/* Vertical (terminology) — superadmin only, see canEditVertical */}
            {canEditVertical && (
              <FormControl disabled={busy}>
                <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                  <TranslateOutlined fontSize="small" color="action" />
                  <FormLabel sx={{ fontWeight: 600 }}>
                    {t("organization.vertical.sectionTitle")}
                  </FormLabel>
                </Stack>
                <Typography variant="caption" color="text.secondary" mb={1}>
                  {t("organization.vertical.sectionHint")}
                </Typography>
                <Alert severity="warning" sx={{ mb: 1 }}>
                  {t("organization.vertical.superadminOnlyNote")}
                </Alert>
                <RadioGroup
                  value={vertical}
                  onChange={(e) => {
                    setVertical(e.target.value as Vertical);
                    setSaved(false);
                  }}
                >
                  {VERTICAL_OPTIONS.map((opt) => (
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
            )}

            {!canUpdate && (
              <Chip
                label={t("organization.viewOnlyChip")}
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
                {t("organization.saveSuccess")}
              </Alert>
            )}

            <CanAccess permissions="organization.update">
              <Box>
                <AppButton
                  variant="contained"
                  onClick={handleSave}
                  disabled={!dirty}
                  loading={busy}
                  sx={{ width: { xs: "100%", sm: "auto" }, minHeight: { xs: 48, sm: 36 } }}
                >
                  {busy ? t("common:state.saving") : t("common:actions.save")}
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
