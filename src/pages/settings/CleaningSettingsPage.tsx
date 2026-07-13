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
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
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
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";

import { usePageTitle } from "../../hooks/usePageTitle";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";
import { ConfirmDialog } from "../../components/ui";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  CLEANING_USE_MOCKS,
  createCleaningZone,
  deleteCleaningZone,
  getCleaningSettings,
  getCleaningZones,
  updateCleaningSettings,
  updateCleaningZone,
  type CleaningZone,
} from "../../api/cleaning";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// ── Диалог зоны (создание/редактирование) ─────────────────────────────────────

interface ZoneDialogProps {
  open: boolean;
  zone: CleaningZone | null;
  branches: { id: number; name: string }[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; branchId: number; isActive: boolean }) => void;
}

const ZoneDialog: React.FC<ZoneDialogProps> = ({
  open,
  zone,
  branches,
  busy,
  error,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = React.useState("");
  const [branchId, setBranchId] = React.useState<number | "">("");
  const [isActive, setIsActive] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setName(zone?.name ?? "");
    setBranchId(zone?.branchId ?? (branches.length === 1 ? branches[0].id : ""));
    setIsActive(zone?.isActive ?? true);
  }, [open, zone, branches]);

  const valid = name.trim().length > 0 && branchId !== "";

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{zone ? "Изменить зону" : "Новая зона уборки"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Название"
            size="small"
            fullWidth
            autoFocus
            placeholder="Например: Холл 1 этаж"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <TextField
            select
            label="Филиал"
            size="small"
            fullWidth
            value={branchId === "" ? "" : String(branchId)}
            onChange={(e) => setBranchId(Number(e.target.value))}
            disabled={busy || !!zone}
            helperText={zone ? "Филиал зоны не меняется" : undefined}
          >
            {branches.map((b) => (
              <MenuItem key={b.id} value={String(b.id)}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="body2">Активна</Typography>
              <Typography variant="caption" color="text.secondary">
                По активной зоне ожидается одна уборка в день
              </Typography>
            </Box>
            <Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={busy} />
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disabled={busy || !valid}
          onClick={() => onSubmit({ name: name.trim(), branchId: branchId as number, isActive })}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Страница ──────────────────────────────────────────────────────────────────

const CleaningSettingsPage: React.FC = () => {
  usePageTitle("Настройки · Уборка");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { activeMembership } = usePermissions();

  const branches = React.useMemo(
    () =>
      (activeMembership?.branches ?? [])
        .filter((b) => b.isActive)
        .map((b) => ({ id: b.id, name: b.name })),
    [activeMembership],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.cleaning.all });

  // ── Ставка ────────────────────────────────────────────────────────────────
  const settingsQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.settings,
    queryFn: ({ signal }) => getCleaningSettings(orgId, signal),
  });

  const [rateInput, setRateInput] = React.useState<string | null>(null);
  const rateValue = rateInput ?? settingsQuery.data?.rate ?? "";

  const rateMutation = useMutation({
    mutationFn: (rate: string) => updateCleaningSettings({ rate }, orgId),
    onSuccess: () => {
      notify?.({ type: "success", message: "Ставка сохранена" });
      setRateInput(null);
      invalidate();
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось сохранить ставку", description: errMsg(e, "") }),
  });

  const rateDirty = rateInput != null && rateInput !== (settingsQuery.data?.rate ?? "");
  const rateValid = /^\d+(\.\d{1,2})?$/.test(rateValue.trim());

  // ── Зоны ──────────────────────────────────────────────────────────────────
  const zonesQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.zones({ orgId: orgId ?? null }),
    queryFn: ({ signal }) => getCleaningZones({ organizationId: orgId }, signal),
  });
  const zones = zonesQuery.data ?? [];

  const [zoneDialogOpen, setZoneDialogOpen] = React.useState(false);
  const [zoneEditing, setZoneEditing] = React.useState<CleaningZone | null>(null);
  const [zoneError, setZoneError] = React.useState<string | null>(null);
  const [zoneDeleting, setZoneDeleting] = React.useState<CleaningZone | null>(null);

  const zoneSaveMutation = useMutation({
    mutationFn: (values: { name: string; branchId: number; isActive: boolean }) =>
      zoneEditing
        ? updateCleaningZone(zoneEditing.id, values, orgId)
        : createCleaningZone(values, orgId),
    onSuccess: () => {
      notify?.({ type: "success", message: zoneEditing ? "Зона обновлена" : "Зона создана" });
      setZoneDialogOpen(false);
      invalidate();
    },
    onError: (e) => setZoneError(errMsg(e, "Не удалось сохранить зону")),
  });

  const zoneToggleMutation = useMutation({
    mutationFn: (zone: CleaningZone) =>
      updateCleaningZone(zone.id, { isActive: !zone.isActive }, orgId),
    onSuccess: () => invalidate(),
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось изменить зону", description: errMsg(e, "") }),
  });

  const zoneDeleteMutation = useMutation({
    mutationFn: (zone: CleaningZone) => deleteCleaningZone(zone.id, orgId),
    onSuccess: () => {
      notify?.({ type: "success", message: "Зона удалена" });
      setZoneDeleting(null);
      invalidate();
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось удалить зону", description: errMsg(e, "") }),
  });

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="h6" fontWeight={600}>
            Уборка
          </Typography>
          {CLEANING_USE_MOCKS && (
            <Chip size="small" color="warning" variant="outlined" label="Демо-данные" />
          )}
        </Stack>

        {/* Ставка */}
        <Stack spacing={1}>
          <Typography variant="subtitle2">Ставка за уборку</Typography>
          <Typography variant="body2" color="text.secondary">
            Сумма за одну подтверждённую уборку. В ЗП попадает: ставка × количество
            подтверждённых уборок за месяц.
          </Typography>
          <Stack direction="row" gap={1} alignItems="center">
            <TextField
              size="small"
              value={rateValue}
              onChange={(e) => setRateInput(e.target.value)}
              disabled={settingsQuery.isLoading || rateMutation.isPending}
              error={rateDirty && !rateValid}
              helperText={rateDirty && !rateValid ? "Число, максимум 2 знака после точки" : undefined}
              InputProps={{
                endAdornment: <InputAdornment position="end">сом</InputAdornment>,
              }}
              sx={{ width: 180 }}
            />
            <Button
              variant="contained"
              size="small"
              disabled={!rateDirty || !rateValid || rateMutation.isPending}
              onClick={() => rateMutation.mutate(rateValue.trim())}
              startIcon={rateMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              Сохранить
            </Button>
          </Stack>
        </Stack>

        <Divider />

        {/* Зоны */}
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2">Зоны уборки</Typography>
              <Typography variant="body2" color="text.secondary">
                Активная зона — ожидается одна уборка в день (график v1, без временных слотов).
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddOutlined />}
              onClick={() => {
                setZoneEditing(null);
                setZoneError(null);
                setZoneDialogOpen(true);
              }}
            >
              Добавить
            </Button>
          </Stack>

          {zonesQuery.isError && (
            <Alert severity="error">{errMsg(zonesQuery.error, "Не удалось загрузить зоны")}</Alert>
          )}

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell>Филиал</TableCell>
                  <TableCell align="center">Активна</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {zonesQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={22} />
                    </TableCell>
                  </TableRow>
                )}
                {!zonesQuery.isLoading && zones.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3, color: "text.secondary" }}>
                      Зон пока нет — добавьте первую
                    </TableCell>
                  </TableRow>
                )}
                {zones.map((zone) => (
                  <TableRow key={zone.id} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{zone.name}</TableCell>
                    <TableCell>{zone.branchName}</TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={zone.isActive}
                        disabled={zoneToggleMutation.isPending}
                        onChange={() => zoneToggleMutation.mutate(zone)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Изменить">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setZoneEditing(zone);
                            setZoneError(null);
                            setZoneDialogOpen(true);
                          }}
                        >
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <IconButton size="small" color="error" onClick={() => setZoneDeleting(zone)}>
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </Stack>

      <ZoneDialog
        open={zoneDialogOpen}
        zone={zoneEditing}
        branches={branches}
        busy={zoneSaveMutation.isPending}
        error={zoneError}
        onClose={() => setZoneDialogOpen(false)}
        onSubmit={(values) => zoneSaveMutation.mutate(values)}
      />

      <ConfirmDialog
        open={zoneDeleting !== null}
        title="Удалить зону?"
        message={`Зона «${zoneDeleting?.name ?? ""}» будет удалена. История уборок по ней сохранится.`}
        confirmText="Удалить"
        variant="error"
        loading={zoneDeleteMutation.isPending}
        onConfirm={() => zoneDeleting && zoneDeleteMutation.mutate(zoneDeleting)}
        onClose={() => setZoneDeleting(null)}
      />
    </SettingsLayout>
  );
};

export default CleaningSettingsPage;
