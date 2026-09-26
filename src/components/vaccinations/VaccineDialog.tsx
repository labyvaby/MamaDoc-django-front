import React from "react";
import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppButton } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useFormValidation } from "../../hooks/useFormValidation";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import {
  createVaccine,
  getForm5Rows,
  updateVaccine,
  type Form5RowRef,
  type VaccineFunding,
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
  const [funding, setFunding] = React.useState<VaccineFunding>("commercial");
  /** dose → код строки формы 5 ("" — не сопоставлено). */
  const [rowByDose, setRowByDose] = React.useState<Record<number, string>>({});

  const form5RowsQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.form5Rows(orgId),
    queryFn: ({ signal }) => getForm5Rows(orgId, signal),
    enabled: open && funding === "state",
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

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
    setFunding(vaccine?.funding ?? "commercial");
    setRowByDose(
      Object.fromEntries((vaccine?.form5Rows ?? []).map((r) => [r.dose, r.row])),
    );
    setError(null);
  }, [open, vaccine]);

  const mutation = useMutation({
    mutationFn: () => {
      const doses = numOrUndef(dosesRequired) ?? 1;
      const form5Rows: Form5RowRef[] =
        funding === "state"
          ? Object.entries(rowByDose)
              .map(([dose, row]) => ({ dose: Number(dose), row }))
              .filter((r) => r.row && r.dose <= doses)
          : [];
      // При правке пустое поле шлём "", чтобы его можно было очистить.
      const text = (v: string) => (vaccine ? v.trim() : v.trim() || undefined);
      const base: CreateVaccinePayload = {
        name: name.trim(),
        manufacturer: text(manufacturer),
        targetDisease: text(targetDisease),
        dosesRequired: numOrUndef(dosesRequired) ?? 1,
        intervalDays: intervalDays.trim() === "" ? null : numOrUndef(intervalDays) ?? null,
        recommendedAgeMonths:
          recommendedAgeMonths.trim() === "" ? null : numOrUndef(recommendedAgeMonths) ?? null,
        notes: text(notes),
        funding,
        form5Rows,
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

  const form = useFormValidation({
    name: name.trim() ? null : "Введите название вакцины",
  });
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
            {...form.field(
              "name",
              nameLocked ? "Синхронизируется с названием товара склада" : undefined,
            )}
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
          <ToggleButtonGroup
            exclusive
            size="small"
            fullWidth
            value={funding}
            onChange={(_, v) => v && setFunding(v)}
          >
            <ToggleButton value="commercial" sx={{ textTransform: "none" }}>
              Платная
            </ToggleButton>
            <ToggleButton value="state" sx={{ textTransform: "none" }}>
              Государственная
            </ToggleButton>
          </ToggleButtonGroup>
          {funding === "state" && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Строки формы 5: какую строку закрывает каждая доза
              </Typography>
              {Array.from({ length: numOrUndef(dosesRequired) ?? 1 }, (_, i) => i + 1).map(
                (dose) => (
                  <TextField
                    key={dose}
                    select
                    size="small"
                    fullWidth
                    label={`Доза ${dose}`}
                    value={rowByDose[dose] ?? ""}
                    onChange={(e) => setRowByDose((m) => ({ ...m, [dose]: e.target.value }))}
                  >
                    <MenuItem value="">
                      <em>Не считается в форме 5</em>
                    </MenuItem>
                    {(form5RowsQuery.data ?? []).map((row) => (
                      <MenuItem key={row.code} value={row.code}>
                        {row.code} · {row.label}
                      </MenuItem>
                    ))}
                  </TextField>
                ),
              )}
            </Stack>
          )}
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
        <AppButton variant="contained" onClick={() => { if (form.validate()) mutation.mutate(); }} disabled={mutation.isPending}>
          Сохранить
        </AppButton>
      </Stack>
    </Dialog>
  );
};

export default VaccineDialog;
