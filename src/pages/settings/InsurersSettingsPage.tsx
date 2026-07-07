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
      setError("Название должно содержать минимум 2 символа");
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
        {isEdit ? "Редактировать страховую" : "Добавить страховую компанию"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Название компании *"
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
            label="Номер договора"
            size="small"
            fullWidth
            value={contractNumber}
            onChange={(e) => {
              setError(null);
              setContractNumber(e.target.value);
            }}
            disabled={busy}
            inputProps={{ maxLength: 64 }}
            helperText="Договор клиники со страховой (необязательно)"
          />
          <TextField
            label="Телефон"
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
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={busy || !nameValid}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Главный компонент ────────────────────────────────────────────────────────

const InsurersSettingsPage: React.FC = () => {
  usePageTitle("Страховые компании");
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
    queryFn: ({ signal }) => getInsurers(signal, { includeInactive: true }),
    enabled: !permLoading && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ((err as ApiError)?.status === 403) return false;
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
              Страховые компании
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Справочник страховых. Используется при оплате приёма способом «страховка».
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
              Добавить страховую
            </Button>
          )}
        </Stack>

        {needsOrg && (
          <Alert severity="info">
            Выберите организацию в контексте, чтобы управлять справочником страховых.
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
              Страховых компаний пока нет
            </Typography>
          </Box>
        )}

        {insurers.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Название</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Договор</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Телефон</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Статус</TableCell>
                  {canManage && <TableCell sx={{ fontWeight: 600 }} align="right">Действия</TableCell>}
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
                        label={insurer.isActive ? "Активна" : "Скрыта"}
                        size="small"
                        color={insurer.isActive ? "success" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <Tooltip title="Редактировать">
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
                        <Tooltip title={insurer.isActive ? "Скрыть из выбора" : "Активировать"}>
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
