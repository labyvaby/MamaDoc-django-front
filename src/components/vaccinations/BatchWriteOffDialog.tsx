import React from "react";
import {
  Alert,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useFormValidation } from "../../hooks/useFormValidation";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  getBatchWriteOffs,
  writeOffBatch,
  type BatchWriteOffReason,
  type VaccineBatch,
} from "../../api/vaccinations";
import {
  BATCH_WRITEOFF_REASON_OPTIONS,
  batchWriteOffReasonLabel,
  pluralDoses,
} from "../../pages/vaccinations/meta";

type BatchWriteOffDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Партия, с которой списываем дозы (null — диалог закрыт). */
  batch: VaccineBatch | null;
};

/**
 * Списание доз партии: порча, истёк срок, нарушение холодовой цепи. Отдельное
 * действие, а не правка «поступило» — количество прихода остаётся историческим
 * фактом, а выбывшие дозы фиксируются с причиной и датой.
 *
 * Эндпоинт бэком пока не реализован (тикет
 * `MamaDoc/backend_ticket_vaccinations_batch_writeoff.md`), поэтому вызывающая
 * страница открывает диалог только под флагом
 * `VACCINATION_BATCH_WRITEOFF_ENABLED`.
 */
const BatchWriteOffDialog: React.FC<BatchWriteOffDialogProps> = ({ open, onClose, batch }) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const remaining = batch?.remaining ?? 0;
  const expired = batch ? dayjs(batch.expiresAt).isBefore(dayjs(), "day") : false;

  const [quantity, setQuantity] = React.useState("");
  const [reason, setReason] = React.useState<BatchWriteOffReason | "">("");
  const [occurredAt, setOccurredAt] = React.useState<Dayjs | null>(dayjs());
  const [notes, setNotes] = React.useState("");

  // По умолчанию списываем весь остаток и, если срок истёк, сразу подставляем
  // самую частую причину — так закрытие просроченной партии в один клик.
  React.useEffect(() => {
    if (!open || !batch) return;
    setQuantity(String(batch.remaining));
    setReason(dayjs(batch.expiresAt).isBefore(dayjs(), "day") ? "expired" : "");
    setOccurredAt(dayjs());
    setNotes("");
    setError(null);
  }, [open, batch]);

  const historyQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.batchWriteOffs(batch?.id ?? 0),
    queryFn: ({ signal }) => getBatchWriteOffs(batch!.id, orgId, signal),
    enabled: open && batch != null,
  });

  const mutation = useMutation({
    mutationFn: () =>
      writeOffBatch(
        batch!.id,
        {
          quantity: Number(quantity),
          reason: reason as BatchWriteOffReason,
          occurredAt: occurredAt ? occurredAt.format("YYYY-MM-DD") : undefined,
          notes: notes.trim() || undefined,
        },
        orgId,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      // Остаток товара на складе меняется вместе со списанием — обновляем и его.
      void queryClient.invalidateQueries({ queryKey: ["django", "warehouse"] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось списать дозы"),
  });

  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const quantityNum = Number(quantity);
  const form = useFormValidation({
    quantity:
      Number.isInteger(quantityNum) && quantityNum > 0
        ? quantityNum <= remaining
          ? null
          : `В партии осталось ${pluralDoses(remaining)}`
        : "Укажите количество доз больше нуля",
    reason: reason === "" ? "Выберите причину списания" : null,
  });

  const handleSubmit = () => {
    if (!batch) return;
    if (!form.validate()) return;
    setError(null);
    mutation.mutate();
  };

  const history = historyQuery.data ?? [];

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Списать дозы</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {batch && (
            <Stack spacing={0.25}>
              <Typography variant="body2" fontWeight={600}>
                {batch.vaccineName} · №{batch.batchNumber}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Остаток {remaining} из {batch.quantityInitial}
                {batch.writtenOff ? ` · уже списано ${batch.writtenOff}` : ""} · годен до{" "}
                {dayjs(batch.expiresAt).format("DD.MM.YYYY")}
              </Typography>
            </Stack>
          )}

          {expired && (
            <Alert severity="warning" sx={{ py: 0.25 }}>
              Срок годности истёк — дозы нельзя использовать, спишите весь остаток.
            </Alert>
          )}
          {batch?.productId == null && (
            <Alert severity="info" sx={{ py: 0.25 }}>
              Партия без товара склада — списание изменит только учёт прививок, остаток товара
              не поменяется.
            </Alert>
          )}

          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              label="Доз к списанию *"
              size="small"
              fullWidth
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
              inputProps={{ inputMode: "numeric" }}
              {...form.field("quantity")}
            />
            <Chip
              label="Весь остаток"
              size="small"
              variant={quantityNum === remaining && remaining > 0 ? "filled" : "outlined"}
              color={quantityNum === remaining && remaining > 0 ? "primary" : "default"}
              onClick={() => setQuantity(String(remaining))}
              sx={{ borderRadius: "7px", mt: 1 }}
            />
          </Stack>

          <TextField
            select
            label="Причина *"
            size="small"
            fullWidth
            value={reason === "" ? "" : String(reason)}
            onChange={(e) => setReason(e.target.value as BatchWriteOffReason)}
            {...form.field("reason")}
          >
            {BATCH_WRITEOFF_REASON_OPTIONS.map((o) => (
              <MenuItem key={String(o.value)} value={String(o.value)}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>

          <CustomDatePicker
            label="Дата списания"
            value={occurredAt}
            onChange={(v) => setOccurredAt(v as Dayjs | null)}
            format="DD.MM.YYYY"
            maxDate={dayjs()}
            slotProps={{ textField: { size: "small", fullWidth: true } }}
          />

          <TextField
            label="Комментарий"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Например: отключение света 24.07, холодильник №2"
          />

          {history.length > 0 && (
            <>
              <Divider />
              <Stack spacing={0.5}>
                <Typography variant="caption" color="text.secondary">
                  Ранее списано
                </Typography>
                {history.map((w) => (
                  <Typography key={w.id} variant="body2" color="text.secondary">
                    {dayjs(w.occurredAt).format("DD.MM.YYYY")} · {pluralDoses(w.quantity)} ·{" "}
                    {batchWriteOffReasonLabel(w.reason)}
                    {w.createdByName ? ` · ${w.createdByName}` : ""}
                  </Typography>
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, pt: 1, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          color="error"
          onClick={handleSubmit}
          disabled={mutation.isPending || remaining === 0}
        >
          Списать
        </AppButton>
      </Stack>
    </Dialog>
  );
};

export default BatchWriteOffDialog;
