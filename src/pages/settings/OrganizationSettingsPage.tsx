import React from "react";
import {
  Alert,
  Box,
  Chip,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";

import SettingsLayout from "./SettingsLayout";
import { AppButton } from "../../components/ui/AppButton";
import { CanAccess } from "../../components/rbac/CanAccess";
import { usePermissions } from "../../hooks/usePermissions";
import {
  getOrganization,
  updateOrganization,
  type DjangoOrganization,
  type PatientScope,
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

// ── Page ──────────────────────────────────────────────────────────────────────

const OrganizationSettingsPage: React.FC = () => {
  const { activeOrganization, isSuperAdmin, hasPermission } = usePermissions();
  const canUpdate = isSuperAdmin() || hasPermission("organization.update");

  const orgId = activeOrganization?.id ?? null;

  const [org, setOrg] = React.useState<DjangoOrganization | null>(null);
  const [scope, setScope] = React.useState<PatientScope>("shared");
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

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
      setScope(data.patientScope);
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const dirty = !!org && scope !== org.patientScope;

  const handleSave = async () => {
    if (!org || !dirty) return;
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateOrganization(org.id, { patientScope: scope });
      setOrg(updated);
      setScope(updated.patientScope);
      setSaved(true);
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setBusy(false);
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
            {/* Read-only profile summary */}
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                {org.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: "monospace" }}
              >
                {org.slug}
              </Typography>
            </Box>

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
                  disabled={!dirty}
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
