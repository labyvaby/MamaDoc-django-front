import React from "react";
import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { AppButton } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  createVaccine,
  updateVaccine,
  type CreateVaccinePayload,
  type UpdateVaccinePayload,
  type Vaccine,
} from "../../api/vaccinations";

type VaccineDialogProps = {
  open: boolean;
  onClose: () => void;
  /** null — создание, иначе редактирование. */
  vaccine: Vaccine | null;
};

/** Пустая строка/невалидное → undefined; иначе число. */
function numOrUndef(v: string): number | undefined {
  const s = v.trim();
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const VaccineDialog: React.FC<VaccineDialogProps> = ({ open, onClose, vaccine }) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [manufacturer, setManufacturer] = React.useState("");
  const [targetDisease, setTargetDisease] = React.useState("");
  const [dosesRequired, setDosesRequired] = React.useState("1");
  const [intervalDays, setIntervalDays] = React.useState("");
  const [recommendedAgeMonths, setRecommendedAgeMonths] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setName(vaccine?.name ?? "");
    setManufacturer(vaccine?.manufacturer ?? "");
    setTargetDisease(vaccine?.targetDisease ?? "");
    setDosesRequired(vaccine ? String(vaccine.dosesRequired) : "1");
    setIntervalDays(vaccine?.intervalDays != null ? String(vaccine.intervalDays) : "");
    setRecommendedAgeMonths(
      vaccine?.recommendedAgeMonths != null ? String(vaccine.recommendedAgeMonths) : "",
    );
    setNotes(vaccine?.notes ?? "");
    setIsActive(vaccine?.isActive ?? true);
    setError(null);
  }, [open, vaccine]);

  const mutation = useMutation({
    mutationFn: () => {
      const base: CreateVaccinePayload = {
        name: name.trim(),
        manufacturer: manufacturer.trim() || undefined,
        targetDisease: targetDisease.trim() || undefined,
        dosesRequired: numOrUndef(dosesRequired) ?? 1,
        intervalDays: intervalDays.trim() === "" ? null : numOrUndef(intervalDays) ?? null,
        recommendedAgeMonths:
          recommendedAgeMonths.trim() === "" ? null : numOrUndef(recommendedAgeMonths) ?? null,
        notes: notes.trim() || undefined,
      };
      if (vaccine) {
        const payload: UpdateVaccinePayload = { ...base, isActive };
        return updateVaccine(vaccine.id, payload, orgId);
      }
      return createVaccine(base, orgId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось сохранить вакцину"),
  });

  const valid = name.trim() !== "";
  // Имя карточки синхронизируется с товаром — при наличии productId правится
  // через товар склада, не здесь (бэк перетрёт).
  const nameLocked = vaccine?.productId != null;

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{vaccine ? "Изменить вакцину" : "Новая вакцина"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {!vaccine && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              Рекомендуемый способ завести вакцину — отметить товар склада флагом
              «Вакцина»: карточка создастся автоматически, с ценой и остатком.
            </Alert>
          )}
          {vaccine && vaccine.productId != null && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              Товар: {vaccine.productName ?? `#${vaccine.productId}`}
              {vaccine.price != null ? ` · ${vaccine.price} сом` : ""} · остаток {vaccine.stock}
            </Alert>
          )}
          <TextField
            label="Название *"
            size="small"
            fullWidth
            autoFocus={!nameLocked}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={nameLocked}
            helperText={nameLocked ? "Синхронизируется с названием товара склада" : undefined}
          />
          <TextField
            label="Производитель"
            size="small"
            fullWidth
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
          />
          <TextField
            label="От заболевания"
            size="small"
            fullWidth
            value={targetDisease}
            onChange={(e) => setTargetDisease(e.target.value)}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Доз в курсе"
              size="small"
              fullWidth
              value={dosesRequired}
              onChange={(e) => setDosesRequired(e.target.value.replace(/[^\d]/g, ""))}
              inputProps={{ inputMode: "numeric" }}
            />
            <TextField
              label="Интервал, дней"
              size="small"
              fullWidth
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value.replace(/[^\d]/g, ""))}
              inputProps={{ inputMode: "numeric" }}
              helperText="Пусто — календарь не считается"
            />
          </Stack>
          <TextField
            label="Рекоменд. возраст, мес"
            size="small"
            fullWidth
            value={recommendedAgeMonths}
            onChange={(e) => setRecommendedAgeMonths(e.target.value.replace(/[^\d]/g, ""))}
            inputProps={{ inputMode: "numeric" }}
          />
          <TextField
            label="Заметка"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {vaccine && (
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
              label="Активна"
            />
          )}
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, pt: 1, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton variant="contained" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
          Сохранить
        </AppButton>
      </Stack>
    </Dialog>
  );
};

export default VaccineDialog;
