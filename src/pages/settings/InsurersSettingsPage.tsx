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
  getInsurers,
  createInsurer,
  updateInsurer,
  type DjangoInsurer,
} from "../../api/insurers";
import { parseBackendError } from "../../api/expenses";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

// ── Диалог создания / редактирования ─────────────────────────────────────────

type EditDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Редактируемая страховая; null → режим создания. */
  insurer: DjangoInsurer | null;
  organizationId?: number;
  onSaved: () => void;
};

const InsurerDialog: React.FC<EditDialogProps> = ({
  open,
  onClose,
  insurer,
  organizationId,
  onSaved,
}) => {
  const { t } = useT("settings");
  const isEdit = insurer !== null;
  const [name, setName] = React.useState("");
  const [contractNumber, setContractNumber] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(insurer?.name ?? "");
      setContractNumber(insurer?.contractNumber ?? "");
      setPhone(insurer?.phone ?? "");
      setError(null);
      setBusy(false);
    }
  }, [open, insurer]);

  const nameValid = name.trim().length >= 2;

  const handleSubmit = async () => {
    if (!nameValid) {
      setError(t("insurers.dialog.nameTooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit) {
        await updateInsurer(insurer.id, {
          name: name.trim(),
          contractNumber: contractNumber.trim(),
          phone: phone.trim(),
        });
      } else {
        await createInsurer({
          name: name.trim(),
          contractNumber: contractNumber.trim() || undefined,
          phone: phone.trim() || undefined,
          organizationId,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {isEdit ? t("insurers.dialog.editTitle") : t("insurers.dialog.createTitle")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("insurers.dialog.nameLabel")}
            size="small"
            fullWidth
            autoFocus
            value={name}
            onChange={(e) => {
              setError(null);
              setName(e.target.value);
            }}
            disabled={busy}
            inputProps={{ maxLength: 128 }}
          />
          <TextField
            label={t("insurers.dialog.contractLabel")}
            size="small"
            fullWidth
            value={contractNumber}
            onChange={(e) => {
              setError(null);
              setContractNumber(e.target.value);
            }}
            disabled={busy}
            inputProps={{ maxLength: 64 }}
            helperText={t("insurers.dialog.contractHelper")}
          />
          <TextField
            label={t("insurers.dialog.phoneLabel")}
            size="small"
            fullWidth
            value={phone}
            onChange={(e) => {
              setError(null);
              setPhone(e.target.value);
            }}
            disabled={busy}
            inputProps={{ maxLength: 32 }}
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
          disabled={busy || !nameValid}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? t("common:state.saving") : isEdit ? t("common:actions.save") : t("common:actions.add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ────────────────────────────────────────────────────────

const InsurersSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("insurers.title"));
  const { isSuperAdmin, activeOrganization, memberships, loading: permLoading } = usePermissions();
  const canManage = useCan("finance.manage");
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DjangoInsurer | null>(null);
  const [togglingId, setTogglingId] = React.useState<number | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;
  const orgId = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;

  const insurersQuery = useQuery({
    queryKey: djangoQueryKeys.insurers.list(orgId ?? null),
    queryFn: ({ signal }) =>
      getInsurers(signal, {
        includeInactive: true,
        organizationId: orgId,
      }),
    enabled: !permLoading && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  const insurers = insurersQuery.data ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["django", "insurers"],
    });
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (insurer: DjangoInsurer) => {
    setEditing(insurer);
    setDialogOpen(true);
  };

  const handleToggleActive = async (insurer: DjangoInsurer) => {
    setTogglingId(insurer.id);
    setToggleError(null);
    try {
      await updateInsurer(insurer.id, { isActive: !insurer.isActive });
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
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} flexWrap="wrap">
          <Box>
            <Typography variant="h6" fontWeight={600}>
              {t("insurers.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("insurers.description")}
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
              {t("insurers.addButton")}
            </Button>
          )}
        </Stack>

        {needsOrg && (
          <Alert severity="info">
            {t("insurers.needsOrg")}
          </Alert>
        )}

        {toggleError && (
          <Alert severity="error" onClose={() => setToggleError(null)}>
            {toggleError}
          </Alert>
        )}

        {insurersQuery.error && !needsOrg && (
          <Alert severity="error">{parseBackendError(insurersQuery.error)}</Alert>
        )}

        {insurersQuery.isLoading && !needsOrg && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {!insurersQuery.isLoading && !needsOrg && insurers.length === 0 && !insurersQuery.error && (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.disabled">
              {t("insurers.empty")}
            </Typography>
          </Box>
        )}

        {insurers.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t("insurers.columns.name")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("insurers.columns.contract")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("insurers.columns.phone")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("insurers.columns.status")}</TableCell>
                  {canManage && <TableCell sx={{ fontWeight: 600 }} align="right">{t("insurers.columns.actions")}</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {insurers.map((insurer) => (
                  <TableRow key={insurer.id} hover>
                    <TableCell>{insurer.name}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>
                      {insurer.contractNumber || "—"}
                    </TableCell>
                    <TableCell>{insurer.phone || "—"}</TableCell>
                    <TableCell>
                      <Chip
                        label={insurer.isActive ? t("insurers.status.active") : t("insurers.status.hidden")}
                        size="small"
                        color={insurer.isActive ? "success" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Tooltip title={t("insurers.tooltips.edit")}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => openEdit(insurer)}
                              disabled={togglingId === insurer.id}
                            >
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={insurer.isActive ? t("insurers.tooltips.hide") : t("insurers.tooltips.activate")}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleActive(insurer)}
                              disabled={togglingId === insurer.id}
                            >
                              {togglingId === insurer.id ? (
                                <CircularProgress size={16} />
                              ) : insurer.isActive ? (
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

      <InsurerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        insurer={editing}
        organizationId={orgId}
        onSaved={invalidate}
      />
    </SettingsLayout>
  );
};

export default InsurersSettingsPage;
