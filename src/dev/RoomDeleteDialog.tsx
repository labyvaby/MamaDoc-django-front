/**
 * Удаление номера — только из карточки номера (HotelRoomFormPage), не с
 * плитки на «Номерах»: корзина на плитке проявлялась при наведении и
 * срабатывала по клавише Delete — номер легко было удалить случайно.
 *
 * Сначала подтверждение. Если номер уже фигурировал в бронях (HAS_DEPENDENTS),
 * второй шаг предлагает снять его с продажи — раньше это делалось молча, хотя
 * человек нажал «удалить». Ошибки показываем внутри диалога, рядом с действием.
 */
import React from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { deleteRoom, updateRoom, type HotelRoom } from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";

type DeleteStep = "confirm" | "deactivate" | "blocked";

export interface RoomDeleteDialogProps {
  /** Номер, который удаляем; null — диалог закрыт. */
  room: HotelRoom | null;
  onClose: () => void;
  /** Номер удалён (не снят с продажи) — например, уйти со страницы номера. */
  onDeleted?: () => void;
}

export const RoomDeleteDialog: React.FC<RoomDeleteDialogProps> = ({ room, onClose, onDeleted }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [step, setStep] = React.useState<DeleteStep>("confirm");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Новый номер — с первого шага и без старой ошибки.
  React.useEffect(() => {
    if (room) {
      setStep("confirm");
      setError(null);
    }
  }, [room]);

  const close = () => {
    if (!busy) onClose();
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "rooms"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "roomTypes"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
  };

  const confirmDelete = async () => {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      await deleteRoom(room.id);
      invalidate();
      enqueueSnackbar(`Номер ${room.number} удалён`, { variant: "success" });
      onClose();
      onDeleted?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === "HAS_DEPENDENTS") {
        // Номер уже в бронях — удалить нельзя. Уже снятому с продажи предлагать нечего.
        setStep(room.status === "out_of_service" ? "blocked" : "deactivate");
      } else {
        setError(getErrorMessage(err, "Не удалось удалить номер"));
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!room) return;
    setBusy(true);
    setError(null);
    try {
      await updateRoom(room.id, { status: "out_of_service" });
      invalidate();
      enqueueSnackbar(`Номер ${room.number} снят с продажи`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось снять номер с продажи"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={room != null} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>
        {step === "confirm" && `Удалить номер ${room?.number ?? ""}?`}
        {step === "deactivate" && `Номер ${room?.number ?? ""} есть в бронях`}
        {step === "blocked" && `Номер ${room?.number ?? ""} нельзя удалить`}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {step === "confirm" &&
            "Номер будет удалён из объекта и пропадёт из шахматки. Если он уже фигурирует в бронях, удалить его нельзя — тогда вам предложат снять его с продажи."}
          {step === "deactivate" &&
            "Удалить нельзя: номер уже фигурирует в бронях. Снять его с продажи вместо удаления? Существующие брони не пострадают, вернуть номер в продажу можно на странице номера."}
          {step === "blocked" && "Номер уже фигурирует в бронях, поэтому удалить его нельзя. Он уже снят с продажи."}
        </Typography>
        {error && (
          <Alert severity="error" variant="outlined" sx={{ mt: 2, fontSize: "0.8rem" }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={busy}>
          {step === "blocked" ? "Закрыть" : "Отмена"}
        </Button>
        {step === "confirm" && (
          <Button color="error" variant="contained" disabled={busy} onClick={() => void confirmDelete()}>
            {busy ? "Удаляем…" : "Удалить"}
          </Button>
        )}
        {step === "deactivate" && (
          <Button variant="contained" disabled={busy} onClick={() => void confirmDeactivate()}>
            {busy ? "Снимаем…" : "Снять с продажи"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RoomDeleteDialog;
