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
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppButton } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import {
  createCalendarTemplate,
  getVaccines,
  updateCalendarTemplate,
  type CalendarTemplateRow,
  type CreateCalendarTemplatePayload,
} from "../../api/vaccinations";

type CalendarTemplateDialogProps = {
  open: boolean;
  onClose: () => void;
  /** null — создание, иначе редактирование. */
  row: CalendarTemplateRow | null;
};

/** Пустая строка/невалидное → null; иначе неотрицательное число. */
function numOrNull(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const CalendarTemplateDialog: React.FC<CalendarTemplateDialogProps> = ({ open, onClose, row }) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const [vaccineId, setVaccineId] = React.useState<number | "">("");
  const [doseNumber, setDoseNumber] = React.useState("1");
  const [ageMonths, setAgeMonths] = React.useState("");
  const [dueWindowDays, setDueWindowDays] = React.useState("30");
  const [mandatory, setMandatory] = React.useState(true);
  const [label, setLabel] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);

  const isEdit = row != null;

  const vaccinesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.vaccines({ orgId, picker: "calendar-template" }),
    queryFn: ({ signal }) => getVaccines({ organizationId: orgId }, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  React.useEffect(() => {
    if (!open) return;
    setVaccineId(row?.vaccineId ?? "");
    setDoseNumber(row ? String(row.doseNumber) : "1");
    setAgeMonths(row ? String(row.ageMonths) : "");
    setDueWindowDays(row ? String(row.dueWindowDays) : "30");
    setMandatory(row?.mandatory ?? true);
    setLabel(row?.label ?? "");
    setIsActive(row?.isActive ?? true);
    setError(null);
  }, [open, row]);

  const mutation = useMutation({
    mutationFn: () => {
      const age = numOrNull(ageMonths);
      const due = numOrNull(dueWindowDays);
      const payload: CreateCalendarTemplatePayload = {
        vaccineId: vaccineId as number,
        doseNumber: numOrNull(doseNumber) ?? 1,
        ageMonths: age ?? 0,
        dueWindowDays: due ?? 0,
        mandatory,
        label: label.trim(),
        isActive,
      };
      if (isEdit && row) return updateCalendarTemplate(row.id, payload, orgId);
      return createCalendarTemplate(payload, orgId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось сохранить строку календаря"),
  });

  const valid = vaccineId !== "" && numOrNull(ageMonths) != null && numOrNull(dueWindowDays) != null;

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEdit ? "Изменить строку календаря" : "Новая строка календаря"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            label="Вакцина *"
            size="small"
            fullWidth
            value={vaccineId === "" ? "" : String(vaccineId)}
            onChange={(e) => setVaccineId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            {(vaccinesQuery.data ?? []).map((v) => (
              <MenuItem key={v.id} value={String(v.id)}>
                {v.name}
                {v.manufacturer ? ` · ${v.manufacturer}` : ""}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Доза № *"
              size="small"
              fullWidth
              value={doseNumber}
              onChange={(e) => setDoseNumber(e.target.value.replace(/[^\d]/g, ""))}
              inputProps={{ inputMode: "numeric" }}
              helperText="Одна строка на вакцину+дозу"
            />
            <TextField
              label="Возраст, мес *"
              size="small"
              fullWidth
              value={ageMonths}
              onChange={(e) => setAgeMonths(e.target.value.replace(/[^\d]/g, ""))}
              inputProps={{ inputMode: "numeric" }}
              helperText="0 — при рождении"
            />
          </Stack>
          <TextField
            label="Окно до просрочки, дней *"
            size="small"
            fullWidth
            value={dueWindowDays}
            onChange={(e) => setDueWindowDays(e.target.value.replace(/[^\d]/g, ""))}
            inputProps={{ inputMode: "numeric" }}
          />
          <TextField
            label="Подпись"
            size="small"
            fullWidth
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Например: 3 месяца"
            helperText="Показывается пациенту как заголовок возрастной группы"
          />
          <FormControlLabel
            control={<Switch checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />}
            label="Обязательная"
          />
          <FormControlLabel
            control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
            label="Активна"
          />
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

export default CalendarTemplateDialog;
