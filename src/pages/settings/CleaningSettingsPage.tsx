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
  InputAdornment,
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
import { SettingsLayout } from "./SettingsLayout";
import { ConfirmDialog } from "../../components/ui";
import { formatKGS } from "../../utility/format";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  CLEANING_USE_MOCKS,
  createCleaningType,
  deleteCleaningType,
  getCleaningTypes,
  updateCleaningType,
  type CleaningType,
  type CleaningTypePayload,
} from "../../api/cleaning";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const RATE_RE = /^\d+(\.\d{1,2})?$/;

// ── Диалог типа уборки (создание/редактирование) ──────────────────────────────

interface TypeDialogProps {
  open: boolean;
  type: CleaningType | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: CleaningTypePayload) => void;
}

const TypeDialog: React.FC<TypeDialogProps> = ({ open, type, busy, error, onClose, onSubmit }) => {
  const [name, setName] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(type?.name ?? "");
    setRate(type?.rate ?? "");
    setIsActive(type?.isActive ?? true);
    setTouched(false);
  }, [open, type]);

  const rateValid = RATE_RE.test(rate.trim());
  const valid = name.trim().length > 0 && rateValid;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{type ? "Изменить тип уборки" : "Новый тип уборки"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Название"
            size="small"
            fullWidth
            autoFocus
            placeholder="Например: Генеральная уборка"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <TextField
            label="Ставка"
            size="small"
            fullWidth
            placeholder="150"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              setTouched(true);
            }}
            disabled={busy}
            error={touched && !rateValid}
            helperText={
              touched && !rateValid
                ? "Число, максимум 2 знака после точки"
                : "За одну подтверждённую уборку этого типа"
            }
            InputProps={{
              endAdornment: <InputAdornment position="end">сом</InputAdornment>,
            }}
          />
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="body2">Активен</Typography>
              <Typography variant="caption" color="text.secondary">
                Неактивный тип нельзя выбрать при отметке уборки
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
          onClick={() => onSubmit({ name: name.trim(), rate: rate.trim(), isActive })}
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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.cleaning.all });

  // ── Типы уборки ───────────────────────────────────────────────────────────
  const typesQuery = useQuery({
    queryKey: djangoQueryKeys.cleaning.types({ orgId: orgId ?? null }),
    queryFn: ({ signal }) => getCleaningTypes({ organizationId: orgId }, signal),
  });
  const types = typesQuery.data ?? [];

  const [typeDialogOpen, setTypeDialogOpen] = React.useState(false);
  const [typeEditing, setTypeEditing] = React.useState<CleaningType | null>(null);
  const [typeError, setTypeError] = React.useState<string | null>(null);
  const [typeDeleting, setTypeDeleting] = React.useState<CleaningType | null>(null);

  const typeSaveMutation = useMutation({
    mutationFn: (values: CleaningTypePayload) =>
      typeEditing
        ? updateCleaningType(typeEditing.id, values, orgId)
        : createCleaningType(values, orgId),
    onSuccess: () => {
      notify?.({ type: "success", message: typeEditing ? "Тип обновлён" : "Тип создан" });
      setTypeDialogOpen(false);
      invalidate();
    },
    onError: (e) => setTypeError(errMsg(e, "Не удалось сохранить тип уборки")),
  });

  const typeToggleMutation = useMutation({
    mutationFn: (type: CleaningType) =>
      updateCleaningType(type.id, { isActive: !type.isActive }, orgId),
    onSuccess: () => invalidate(),
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось изменить тип", description: errMsg(e, "") }),
  });

  const typeDeleteMutation = useMutation({
    mutationFn: (type: CleaningType) => deleteCleaningType(type.id, orgId),
    onSuccess: () => {
      notify?.({ type: "success", message: "Тип удалён" });
      setTypeDeleting(null);
      invalidate();
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Не удалось удалить тип", description: errMsg(e, "") }),
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

        {/* Типы уборки */}
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2">Типы уборки</Typography>
              <Typography variant="body2" color="text.secondary">
                Уборщица выбирает тип при отметке. В ЗП попадает сумма ставок типов по
                подтверждённым уборкам за месяц.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddOutlined />}
              onClick={() => {
                setTypeEditing(null);
                setTypeError(null);
                setTypeDialogOpen(true);
              }}
            >
              Добавить
            </Button>
          </Stack>

          {typesQuery.isError && (
            <Alert severity="error">
              {errMsg(typesQuery.error, "Не удалось загрузить типы уборки")}
            </Alert>
          )}

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                  <TableCell align="right">Ставка</TableCell>
                  <TableCell align="center">Активен</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {typesQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={22} />
                    </TableCell>
                  </TableRow>
                )}
                {!typesQuery.isLoading && types.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3, color: "text.secondary" }}>
                      Типов пока нет — добавьте первый
                    </TableCell>
                  </TableRow>
                )}
                {types.map((type) => (
                  <TableRow key={type.id} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{type.name}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatKGS(type.rate)}
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={type.isActive}
                        disabled={typeToggleMutation.isPending}
                        onChange={() => typeToggleMutation.mutate(type)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Изменить">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setTypeEditing(type);
                            setTypeError(null);
                            setTypeDialogOpen(true);
                          }}
                        >
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <IconButton size="small" color="error" onClick={() => setTypeDeleting(type)}>
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

      <TypeDialog
        open={typeDialogOpen}
        type={typeEditing}
        busy={typeSaveMutation.isPending}
        error={typeError}
        onClose={() => setTypeDialogOpen(false)}
        onSubmit={(values) => typeSaveMutation.mutate(values)}
      />

      <ConfirmDialog
        open={typeDeleting !== null}
        title="Удалить тип уборки?"
        message={`Тип «${typeDeleting?.name ?? ""}» будет удалён. История уборок по нему сохранится.`}
        confirmText="Удалить"
        variant="error"
        loading={typeDeleteMutation.isPending}
        onConfirm={() => typeDeleting && typeDeleteMutation.mutate(typeDeleting)}
        onClose={() => setTypeDeleting(null)}
      />
    </SettingsLayout>
  );
};

export default CleaningSettingsPage;
