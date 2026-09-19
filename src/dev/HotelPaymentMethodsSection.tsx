/**
 * «Способы оплаты» в «Настройках» → «Номера» (HotelRoomsSettingsPage.tsx) —
 * справочник объекта, как характеристики номера, только без цены (контракт
 * v2.2, §3.4). Четыре платформенных способа (наличные, карта, перевод,
 * онлайн) есть у всех и не редактируются; объект добавляет свои — QR-код,
 * конкретный банк, ваучер: они сразу появляются в списке «Способ оплаты» при
 * приёме оплаты (ReservationDetailsDialog, GuestPaymentDialog).
 *
 * Список — из catalogs.paymentMethods (его уже загрузила страница): именно для
 * этого экрана в строке есть isCustom/id. После любой правки перечитываем
 * каталог — тем же ключом, что читают формы оплаты.
 *
 * Переименование меняет название и у старых оплат (в них хранится ключ, не
 * название). Способ, которым уже принимали оплату, удалить нельзя — 409
 * HAS_DEPENDENTS: история не должна терять название, остаётся переименовать.
 * Название уникально в объекте без учёта регистра и не может совпадать с
 * платформенным («Наличные» → 400).
 */
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
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import { useQueryClient } from "@tanstack/react-query";

import {
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  type HotelPaymentMethodChoice,
} from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";

/** Максимальная длина названия — по контракту (PaymentMethodOptionCreatePayload.label: 1..120). */
const MAX_LABEL_LENGTH = 120;

export interface HotelPaymentMethodsSectionProps {
  propertyId: number;
  /** catalogs.paymentMethods объекта: платформенные + свои. */
  methods: HotelPaymentMethodChoice[];
}

export const HotelPaymentMethodsSection: React.FC<HotelPaymentMethodsSectionProps> = ({ propertyId, methods }) => {
  const queryClient = useQueryClient();
  const refreshCatalogs = () => queryClient.invalidateQueries({ queryKey: ["hotel", "catalogs", propertyId] });

  const [newLabel, setNewLabel] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);

  // Переименование — прямо в строке списка; null — никто не правится.
  const [renaming, setRenaming] = React.useState<{ id: number; label: string } | null>(null);
  const [renameSaving, setRenameSaving] = React.useState(false);
  const [renameError, setRenameError] = React.useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<HotelPaymentMethodChoice | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    setAddError(null);
    try {
      await createPaymentMethod({ propertyId, label });
      setNewLabel("");
      await refreshCatalogs();
    } catch (err) {
      setAddError(getErrorMessage(err, "Не удалось добавить способ оплаты"));
    } finally {
      setAdding(false);
    }
  };

  const handleRename = async () => {
    if (!renaming) return;
    const label = renaming.label.trim();
    if (!label) return;
    const current = methods.find((m) => m.id === renaming.id);
    if (current && current.label === label) {
      setRenaming(null);
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      await updatePaymentMethod(renaming.id, { label });
      setRenaming(null);
      await refreshCatalogs();
    } catch (err) {
      setRenameError(getErrorMessage(err, "Не удалось переименовать способ оплаты"));
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteTarget.id == null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePaymentMethod(deleteTarget.id);
      setDeleteTarget(null);
      await refreshCatalogs();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError && err.code === "HAS_DEPENDENTS"
          ? "Этим способом уже принимали оплату — удалить его нельзя, но можно переименовать."
          : getErrorMessage(err, "Не удалось удалить способ оплаты"),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" gap={1}>
        <PaymentsOutlined color="action" />
        <Typography variant="h6" fontWeight={600}>
          Способы оплаты
        </Typography>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
        Наличные, карта, перевод и онлайн есть всегда. Добавьте свои — QR-код, конкретный банк, ваучер:
        они появятся в списке «Способ оплаты», когда принимаете оплату за проживание. Способ, которым
        уже принимали оплату, удалить нельзя — его можно только переименовать.
      </Alert>

      {renameError && (
        <Alert severity="error" variant="outlined" sx={{ fontSize: "0.8rem" }} onClose={() => setRenameError(null)}>
          {renameError}
        </Alert>
      )}

      <Stack gap={0.75}>
        {methods.map((m) => {
          const isRenaming = m.id != null && renaming?.id === m.id;
          return (
            <Stack
              key={m.value}
              direction="row"
              alignItems="center"
              gap={0.5}
              sx={{ px: 1.25, py: 0.5, minHeight: 40, borderRadius: "8px", border: 1, borderColor: "divider" }}
            >
              {isRenaming && renaming ? (
                <>
                  <TextField
                    size="small"
                    autoFocus
                    value={renaming.label}
                    onChange={(e) => setRenaming({ ...renaming, label: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRename();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    disabled={renameSaving}
                    slotProps={{ htmlInput: { maxLength: MAX_LABEL_LENGTH } }}
                    sx={{ flex: 1 }}
                  />
                  <Tooltip title="Сохранить">
                    <span>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => void handleRename()}
                        disabled={renameSaving || !renaming.label.trim()}
                        aria-label="Сохранить название"
                      >
                        {renameSaving ? <CircularProgress size={16} /> : <CheckOutlined fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Отмена">
                    <IconButton size="small" onClick={() => setRenaming(null)} disabled={renameSaving} aria-label="Отменить">
                      <CloseOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                    {m.label}
                  </Typography>
                  {m.isCustom && m.id != null ? (
                    <Box sx={{ display: "flex", flexShrink: 0 }}>
                      <Tooltip title="Переименовать">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setRenameError(null);
                            setRenaming({ id: m.id!, label: m.label });
                          }}
                          aria-label={`Переименовать «${m.label}»`}
                        >
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(m);
                          }}
                          aria-label={`Удалить «${m.label}»`}
                        >
                          <DeleteOutlineOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ) : (
                    <Chip label="Встроенный" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                  )}
                </>
              )}
            </Stack>
          );
        })}
      </Stack>

      <Stack direction="row" alignItems="flex-start" gap={1}>
        <TextField
          size="small"
          label="Новый способ оплаты"
          placeholder="Например, QR-код (Элкарт)"
          value={newLabel}
          onChange={(e) => {
            setNewLabel(e.target.value);
            setAddError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd();
          }}
          error={addError != null}
          helperText={addError ?? " "}
          disabled={adding}
          slotProps={{ htmlInput: { maxLength: MAX_LABEL_LENGTH } }}
          sx={{ flex: 1 }}
        />
        <Button
          variant="outlined"
          startIcon={adding ? <CircularProgress size={14} /> : <AddOutlined />}
          onClick={() => void handleAdd()}
          disabled={adding || !newLabel.trim()}
          sx={{ whiteSpace: "nowrap", mt: "1px" }}
        >
          Добавить
        </Button>
      </Stack>

      <Dialog open={deleteTarget != null} onClose={() => !deleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить способ оплаты?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            «{deleteTarget?.label}» пропадёт из списка при приёме оплаты. Если им уже принимали оплату,
            удалить не получится — его можно только переименовать.
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" variant="outlined" sx={{ mt: 1.5, fontSize: "0.8rem" }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Отмена
          </Button>
          <Button color="error" variant="contained" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? "Удаляем…" : "Удалить"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default HotelPaymentMethodsSection;
