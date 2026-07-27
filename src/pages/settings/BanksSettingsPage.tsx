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
  getBanks,
  createBank,
  updateBank,
  type DjangoBank,
} from "../../api/staff";
import { parseBackendError } from "../../api/expenses";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

// ── Диалог создания / редактирования ─────────────────────────────────────────

type EditDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Редактируемый банк; null → режим создания. */
  bank: DjangoBank | null;
  organizationId?: number;
  onSaved: () => void;
};

const BankDialog: React.FC<EditDialogProps> = ({
  open,
  onClose,
  bank,
  organizationId,
  onSaved,
}) => {
  const { t } = useT("settings");
  const isEdit = bank !== null;
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(bank?.name ?? "");
      setError(null);
      setBusy(false);
    }
  }, [open, bank]);

  const nameValid = name.trim().length >= 2;

  const handleSubmit = async () => {
    if (!nameValid) {
      setError(t("banks.dialog.nameTooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit) {
        await updateBank(bank.id, { name: name.trim() });
      } else {
        await createBank({ name: name.trim(), organizationId });
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
      <DialogTitle>{isEdit ? t("banks.dialog.editTitle") : t("banks.dialog.createTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("banks.dialog.nameLabel")}
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

const BanksSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("banks.title"));
  const { isSuperAdmin, activeOrganization, memberships, loading: permLoading } = usePermissions();
  const canManage = useCan("staff.private.manage");
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DjangoBank | null>(null);
  const [togglingId, setTogglingId] = React.useState<number | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;
  const orgId = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;

  const banksQuery = useQuery({
    queryKey: djangoQueryKeys.staff.banks(orgId ?? null),
    queryFn: ({ signal }) => getBanks(signal, { includeInactive: true }),
    enabled: !permLoading && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  const banks = banksQuery.data ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.staff.banks(orgId ?? null),
    });
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (bank: DjangoBank) => {
    setEditing(bank);
    setDialogOpen(true);
  };

  const handleToggleActive = async (bank: DjangoBank) => {
    setTogglingId(bank.id);
    setToggleError(null);
    try {
      await updateBank(bank.id, { isActive: !bank.isActive });
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
              {t("banks.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("banks.description")}
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
              {t("banks.addButton")}
            </Button>
          )}
        </Stack>

        {needsOrg && (
          <Alert severity="info">
            {t("banks.needsOrg")}
          </Alert>
        )}

        {toggleError && (
          <Alert severity="error" onClose={() => setToggleError(null)}>
            {toggleError}
          </Alert>
        )}

        {banksQuery.error && !needsOrg && (
          <Alert severity="error">{parseBackendError(banksQuery.error)}</Alert>
        )}

        {banksQuery.isLoading && !needsOrg && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {!banksQuery.isLoading && !needsOrg && banks.length === 0 && !banksQuery.error && (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.disabled">
              {t("banks.empty")}
            </Typography>
          </Box>
        )}

        {banks.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t("banks.columns.name")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("banks.columns.status")}</TableCell>
                  {canManage && <TableCell sx={{ fontWeight: 600 }} align="right">{t("banks.columns.actions")}</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {banks.map((bank) => (
                  <TableRow key={bank.id} hover>
                    <TableCell>{bank.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={bank.isActive ? t("banks.status.active") : t("banks.status.inactive")}
                        size="small"
                        color={bank.isActive ? "success" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Tooltip title={t("banks.tooltips.edit")}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => openEdit(bank)}
                              disabled={togglingId === bank.id}
                            >
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={bank.isActive ? t("banks.tooltips.deactivate") : t("banks.tooltips.activate")}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleActive(bank)}
                              disabled={togglingId === bank.id}
                            >
                              {togglingId === bank.id ? (
                                <CircularProgress size={16} />
                              ) : bank.isActive ? (
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

      <BankDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        bank={editing}
        organizationId={orgId}
        onSaved={invalidate}
      />
    </SettingsLayout>
  );
};

export default BanksSettingsPage;
