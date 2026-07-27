import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { SettingsLayout } from "./SettingsLayout";
import {
  getSpecializations,
  createSpecialization,
  updateSpecialization,
  type DjangoSpecialization,
} from "../../api/staff";
import { parseBackendError } from "../../api/expenses";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

// ── Диалог создания / переименования ─────────────────────────────────────────

type EditDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Редактируемая специализация; null → режим создания. */
  specialization: DjangoSpecialization | null;
  organizationId?: number;
  onSaved: () => void;
};

const SpecializationDialog: React.FC<EditDialogProps> = ({
  open,
  onClose,
  specialization,
  organizationId,
  onSaved,
}) => {
  const { t } = useT("settings");
  const isEdit = specialization !== null;
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(specialization?.name ?? "");
      setError(null);
      setBusy(false);
    }
  }, [open, specialization]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(t("specializations.dialog.nameTooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit) {
        await updateSpecialization(specialization.id, { name: trimmed });
      } else {
        await createSpecialization({ name: trimmed, organizationId });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !busy) handleSubmit();
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEdit ? t("specializations.dialog.editTitle") : t("specializations.dialog.createTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("specializations.dialog.nameLabel")}
            size="small"
            fullWidth
            autoFocus
            value={name}
            onChange={(e) => {
              setError(null);
              setName(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            disabled={busy}
            inputProps={{ maxLength: 200 }}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("common:actions.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || name.trim().length < 2}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? t("common:state.saving") : isEdit ? t("common:actions.save") : t("common:actions.add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ────────────────────────────────────────────────────────

const SpecializationsSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("specializations.title"));
  const { isSuperAdmin, activeOrganization, memberships, loading: permLoading } = usePermissions();
  const canManage = useCan("staff.specializations.manage");
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DjangoSpecialization | null>(null);
  const [togglingId, setTogglingId] = React.useState<number | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;
  const orgId = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;

  const specsQuery = useQuery({
    queryKey: djangoQueryKeys.staff.specializations(orgId ?? null),
    queryFn: ({ signal }) => getSpecializations(signal, { includeInactive: true }),
    enabled: !permLoading && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  const specializations = specsQuery.data ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.staff.specializations(orgId ?? null),
    });
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (spec: DjangoSpecialization) => {
    setEditing(spec);
    setDialogOpen(true);
  };

  const handleToggleActive = async (spec: DjangoSpecialization) => {
    setTogglingId(spec.id);
    setToggleError(null);
    try {
      await updateSpecialization(spec.id, { isActive: !spec.isActive });
      invalidate();
    } catch (e) {
      setToggleError(parseBackendError(e));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        {/* Заголовок + кнопка */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box>
            <Typography variant="h6" fontWeight={600}>
              {t("specializations.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("specializations.description")}
            </Typography>
          </Box>
          {canManage && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddOutlined />}
              onClick={openCreate}
              disabled={needsOrg || permLoading}
            >
              {t("specializations.addButton")}
            </Button>
          )}
        </Stack>

        {/* Требуется выбор организации */}
        {needsOrg && (
          <Alert severity="info">
            {t("specializations.needsOrg")}
          </Alert>
        )}

        {toggleError && (
          <Alert severity="error" onClose={() => setToggleError(null)}>
            {toggleError}
          </Alert>
        )}

        {/* Ошибка загрузки */}
        {specsQuery.error && !needsOrg && (
          <Alert severity="error">{parseBackendError(specsQuery.error)}</Alert>
        )}

        {/* Загрузка */}
        {specsQuery.isLoading && !needsOrg && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {/* Пустое состояние */}
        {!specsQuery.isLoading && !needsOrg && specializations.length === 0 && !specsQuery.error && (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.disabled">
              {t("specializations.empty")}
            </Typography>
          </Box>
        )}

        {/* Таблица */}
        {specializations.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t("specializations.columns.name")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("specializations.columns.status")}</TableCell>
                  {canManage && <TableCell sx={{ fontWeight: 600 }} align="right">{t("specializations.columns.actions")}</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {specializations.map((spec) => (
                  <TableRow key={spec.id} hover>
                    <TableCell>{spec.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={spec.isActive ? t("specializations.status.active") : t("specializations.status.inactive")}
                        size="small"
                        color={spec.isActive ? "success" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Tooltip title={t("specializations.tooltips.rename")}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => openEdit(spec)}
                              disabled={togglingId === spec.id}
                            >
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={spec.isActive ? t("specializations.tooltips.deactivate") : t("specializations.tooltips.activate")}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleActive(spec)}
                              disabled={togglingId === spec.id}
                            >
                              {togglingId === spec.id ? (
                                <CircularProgress size={16} />
                              ) : spec.isActive ? (
                                <VisibilityOffOutlined fontSize="small" />
                              ) : (
                                <VisibilityOutlined fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      <SpecializationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        specialization={editing}
        organizationId={orgId}
        onSaved={invalidate}
      />
    </SettingsLayout>
  );
};

export default SpecializationsSettingsPage;
