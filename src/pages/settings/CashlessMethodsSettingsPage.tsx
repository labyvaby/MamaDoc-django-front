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
  MenuItem,
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
  getCashlessMethods,
  createCashlessMethod,
  updateCashlessMethod,
  type DjangoCashlessMethod,
} from "../../api/cashlessMethods";
import { getBranches, type DjangoBranch } from "../../api/organization";
import { parseBackendError } from "../../api/expenses";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

// ── Диалог создания / редактирования ─────────────────────────────────────────

type EditDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Редактируемый способ; null → режим создания. */
  method: DjangoCashlessMethod | null;
  organizationId?: number;
  /** Филиалы организации для выбора скоупа при создании. */
  branches: DjangoBranch[];
  onSaved: () => void;
};

const CashlessMethodDialog: React.FC<EditDialogProps> = ({
  open,
  onClose,
  method,
  organizationId,
  branches,
  onSaved,
}) => {
  const { t } = useT("settings");
  const isEdit = method !== null;
  const [name, setName] = React.useState("");
  const [branchId, setBranchId] = React.useState<number | "">("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(method?.name ?? "");
      setBranchId(method?.branchId ?? "");
      setError(null);
      setBusy(false);
    }
  }, [open, method]);

  const nameValid = name.trim().length >= 2;

  const handleSubmit = async () => {
    if (!nameValid) {
      setError(t("cashlessMethods.dialog.nameTooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isEdit) {
        // branchId не отправляем: бэк отвечает 400 на перенос способа между
        // филиалами — прошлые операции остались бы с недоступным способом.
        await updateCashlessMethod(method.id, { name: name.trim() });
      } else {
        await createCashlessMethod({
          name: name.trim(),
          branchId: branchId === "" ? null : Number(branchId),
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
        {isEdit
          ? t("cashlessMethods.dialog.editTitle")
          : t("cashlessMethods.dialog.createTitle")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("cashlessMethods.dialog.nameLabel")}
            size="small"
            fullWidth
            autoFocus
            value={name}
            onChange={(e) => {
              setError(null);
              setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nameValid && !busy) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            disabled={busy}
            inputProps={{ maxLength: 128 }}
            helperText={t("cashlessMethods.dialog.nameHelper")}
          />
          {/* Скоуп задаётся только при создании: перенос между филиалами
              не поддерживается (см. handleSubmit). */}
          {isEdit ? (
            <TextField
              label={t("cashlessMethods.dialog.branchLabel")}
              size="small"
              fullWidth
              value={method.branchName ?? t("cashlessMethods.allBranches")}
              disabled
              helperText={t("cashlessMethods.dialog.branchLocked")}
            />
          ) : (
            <TextField
              select
              label={t("cashlessMethods.dialog.branchLabel")}
              size="small"
              fullWidth
              value={branchId}
              onChange={(e) => {
                setError(null);
                setBranchId(e.target.value === "" ? "" : Number(e.target.value));
              }}
              disabled={busy}
              helperText={t("cashlessMethods.dialog.branchHelper")}
            >
              <MenuItem value="">{t("cashlessMethods.allBranches")}</MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          )}
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
          {busy
            ? t("common:state.saving")
            : isEdit
              ? t("common:actions.save")
              : t("common:actions.add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ────────────────────────────────────────────────────────

const CashlessMethodsSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("cashlessMethods.title"));
  const { isSuperAdmin, activeOrganization, memberships, loading: permLoading } = usePermissions();
  const canManage = useCan("finance.manage");
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DjangoCashlessMethod | null>(null);
  const [togglingId, setTogglingId] = React.useState<number | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;
  const orgId = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;

  const methodsQuery = useQuery({
    queryKey: djangoQueryKeys.cashlessMethods.list(orgId ?? null),
    queryFn: ({ signal }) =>
      getCashlessMethods(signal, {
        includeInactive: true,
        organizationId: orgId,
      }),
    enabled: !permLoading && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 404, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  // Филиалы нужны только для выбора скоупа при создании; сам список способов
  // приходит с branchName джойном, так что таблица от этого запроса не зависит.
  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, orgId ?? null],
    queryFn: () => getBranches(orgId),
    enabled: !permLoading && !needsOrg && canManage,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const methods = methodsQuery.data ?? [];
  // 404 = эндпоинта ещё нет на бэке (тикет backend_ticket_cashless_methods.md).
  // Сырое «Page not found» ничего не объясняет — показываем причину словами.
  const notImplemented = (methodsQuery.error as ApiError)?.status === 404;

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["django", "cashless-methods"],
    });
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (method: DjangoCashlessMethod) => {
    setEditing(method);
    setDialogOpen(true);
  };

  const handleToggleActive = async (method: DjangoCashlessMethod) => {
    setTogglingId(method.id);
    setToggleError(null);
    try {
      await updateCashlessMethod(method.id, { isActive: !method.isActive });
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
              {t("cashlessMethods.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("cashlessMethods.description")}
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
              {t("cashlessMethods.addButton")}
            </Button>
          )}
        </Stack>

        {needsOrg && <Alert severity="info">{t("cashlessMethods.needsOrg")}</Alert>}

        {toggleError && (
          <Alert severity="error" onClose={() => setToggleError(null)}>
            {toggleError}
          </Alert>
        )}

        {methodsQuery.error && !needsOrg && (
          <Alert severity={notImplemented ? "info" : "error"}>
            {notImplemented
              ? t("cashlessMethods.notImplemented")
              : parseBackendError(methodsQuery.error)}
          </Alert>
        )}

        {methodsQuery.isLoading && !needsOrg && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {!methodsQuery.isLoading && !needsOrg && methods.length === 0 && !methodsQuery.error && (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.disabled">
              {t("cashlessMethods.empty")}
            </Typography>
          </Box>
        )}

        {methods.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t("cashlessMethods.columns.name")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("cashlessMethods.columns.branch")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t("cashlessMethods.columns.status")}</TableCell>
                  {canManage && (
                    <TableCell sx={{ fontWeight: 600 }} align="right">
                      {t("cashlessMethods.columns.actions")}
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {methods.map((method) => (
                  <TableRow key={method.id} hover>
                    <TableCell>{method.name}</TableCell>
                    <TableCell>
                      {method.branchName ?? (
                        <Typography component="span" variant="body2" color="text.secondary">
                          {t("cashlessMethods.allBranches")}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={
                          method.isActive
                            ? t("cashlessMethods.status.active")
                            : t("cashlessMethods.status.hidden")
                        }
                        size="small"
                        color={method.isActive ? "success" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Tooltip title={t("cashlessMethods.tooltips.edit")}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => openEdit(method)}
                              disabled={togglingId === method.id}
                            >
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip
                          title={
                            method.isActive
                              ? t("cashlessMethods.tooltips.hide")
                              : t("cashlessMethods.tooltips.activate")
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleActive(method)}
                              disabled={togglingId === method.id}
                            >
                              {togglingId === method.id ? (
                                <CircularProgress size={16} />
                              ) : method.isActive ? (
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

      <CashlessMethodDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        method={editing}
        organizationId={orgId}
        branches={branchesQuery.data ?? []}
        onSaved={invalidate}
      />
    </SettingsLayout>
  );
};

export default CashlessMethodsSettingsPage;
