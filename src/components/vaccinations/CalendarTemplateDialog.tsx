import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppButton } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useT } from "../../i18n/VerticalProvider";
import { useFormValidation } from "../../hooks/useFormValidation";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import {
  createCalendarTemplate,
  getVaccines,
  updateCalendarTemplate,
  type CalendarTemplateRow,
  type CalendarSex,
  type CreateCalendarTemplatePayload,
} from "../../api/vaccinations";
import {
  EMPTY_AGE,
  ageFromRow,
  ageToPayload,
  defaultGroupLabel,
  maxAgeFromRow,
  maxAgeToPayload,
  rowSummary,
  toNumber,
  type AgeValue,
} from "./calendarRowForm";

type CalendarTemplateDialogProps = {
  open: boolean;
  onClose: () => void;
  /** null — создание, иначе редактирование. */
  row: CalendarTemplateRow | null;
  /** Для новой строки: заранее выбранная вакцина и номер дозы («+ доза»). */
  preset?: { vaccineId: number; doseNumber: number } | null;
};

const digits = (v: string) => v.replace(/[^\d]/g, "");

/** Заголовок смыслового блока окна. */
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5, letterSpacing: 0.6 }}>
    {children}
  </Typography>
);

/**
 * Возраст: «лет» + «мес.» рядом; при allowDays можно переключиться на точный
 * возраст в днях (для доз вроде «4,5 месяца» = 135 дней).
 */
const AgeField: React.FC<{
  label: string;
  value: AgeValue;
  onChange: (v: AgeValue) => void;
  allowDays?: boolean;
  helperText?: React.ReactNode;
  error?: boolean;
  anchorRef?: (el: HTMLElement | null) => void;
}> = ({ label, value, onChange, allowDays, helperText, error, anchorRef }) => (
  <Box ref={anchorRef}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
      <Typography variant="body2" fontWeight={500}>
        {label}
      </Typography>
      {allowDays && (
        <Typography
          component="button"
          type="button"
          variant="caption"
          onClick={() => onChange(value.mode === "days" ? { mode: "ym", years: "", months: "" } : { mode: "days", days: "" })}
          sx={{ border: 0, background: "none", p: 0, cursor: "pointer", color: "primary.main", fontFamily: "inherit" }}
        >
          {value.mode === "days" ? "указать в годах и месяцах" : "указать в днях"}
        </Typography>
      )}
    </Stack>
    {value.mode === "days" ? (
      <TextField
        size="small"
        fullWidth
        value={value.days}
        onChange={(e) => onChange({ mode: "days", days: digits(e.target.value) })}
        error={error}
        inputProps={{ inputMode: "numeric", "aria-label": label + ", дней" }}
        InputProps={{ endAdornment: <InputAdornment position="end">дней</InputAdornment> }}
      />
    ) : (
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          fullWidth
          value={value.years}
          onChange={(e) => onChange({ ...value, years: digits(e.target.value) })}
          error={error}
          inputProps={{ inputMode: "numeric", "aria-label": label + ", лет" }}
          InputProps={{ endAdornment: <InputAdornment position="end">лет</InputAdornment> }}
        />
        <TextField
          size="small"
          fullWidth
          value={value.months}
          onChange={(e) => onChange({ ...value, months: digits(e.target.value) })}
          error={error}
          inputProps={{ inputMode: "numeric", "aria-label": label + ", месяцев" }}
          InputProps={{ endAdornment: <InputAdornment position="end">мес.</InputAdornment> }}
        />
      </Stack>
    )}
    {helperText && (
      <Typography variant="caption" color={error ? "error" : "text.secondary"} sx={{ display: "block", mt: 0.5, mx: 1.75 }}>
        {helperText}
      </Typography>
    )}
  </Box>
);

const CalendarTemplateDialog: React.FC<CalendarTemplateDialogProps> = ({ open, onClose, row, preset }) => {
  const { t } = useT("vaccinations");
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const [vaccineId, setVaccineId] = React.useState<number | null>(null);
  const [doseNumber, setDoseNumber] = React.useState("1");
  const [age, setAge] = React.useState<AgeValue>(EMPTY_AGE);
  const [maxAge, setMaxAge] = React.useState<AgeValue>(EMPTY_AGE);
  const [dueWindowDays, setDueWindowDays] = React.useState("30");
  const [mandatory, setMandatory] = React.useState(true);
  const [label, setLabel] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [sex, setSex] = React.useState<CalendarSex>("any");
  const [moreOpen, setMoreOpen] = React.useState(false);

  const isEdit = row != null;

  const vaccinesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.vaccines({ orgId, picker: "calendar-template" }),
    queryFn: ({ signal }) => getVaccines({ organizationId: orgId }, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const vaccines = vaccinesQuery.data ?? [];
  const selectedVaccine = vaccines.find((v) => v.id === vaccineId) ?? null;

  React.useEffect(() => {
    if (!open) return;
    setVaccineId(row?.vaccineId ?? preset?.vaccineId ?? null);
    setDoseNumber(row ? String(row.doseNumber) : String(preset?.doseNumber ?? 1));
    setAge(ageFromRow(row));
    setMaxAge(maxAgeFromRow(row));
    setDueWindowDays(row ? String(row.dueWindowDays) : "30");
    setMandatory(row?.mandatory ?? true);
    setSex(row?.sex ?? "any");
    setLabel(row?.label ?? "");
    setIsActive(row?.isActive ?? true);
    setMoreOpen(false);
    setError(null);
  }, [open, row, preset]);

  const autoLabel = defaultGroupLabel(age);

  const mutation = useMutation({
    mutationFn: () => {
      const ages = ageToPayload(age) ?? { ageMonths: 0, ageDays: null };
      const payload: CreateCalendarTemplatePayload = {
        vaccineId: vaccineId as number,
        doseNumber: toNumber(doseNumber) ?? 1,
        ageMonths: ages.ageMonths,
        ageDays: ages.ageDays,
        maxAgeMonths: maxAgeToPayload(maxAge),
        dueWindowDays: toNumber(dueWindowDays) ?? 0,
        mandatory,
        label: label.trim() || autoLabel,
        isActive,
        sex,
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

  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    vaccineId: vaccineId != null ? null : "Выберите вакцину",
    doseNumber: toNumber(doseNumber) ? null : "Укажите номер дозы",
    age: ageToPayload(age) != null ? null : "Укажите возраст",
    dueWindowDays: toNumber(dueWindowDays) != null ? null : "Укажите, сколько дней есть на прививку",
  });

  const summary = rowSummary({
    vaccineName: selectedVaccine?.name ?? null,
    doseNumber,
    age,
    windowDays: dueWindowDays,
    maxAge,
    sex,
  });

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>{isEdit ? "Строка календаря" : "Новая строка календаря"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack spacing={1.25}>
            <SectionTitle>Прививка</SectionTitle>
            <Stack direction="row" spacing={1.5}>
              <Autocomplete
                fullWidth
                size="small"
                options={vaccines}
                value={selectedVaccine}
                loading={vaccinesQuery.isLoading}
                onChange={(_, v) => setVaccineId(v?.id ?? null)}
                getOptionLabel={(v) => v.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                noOptionsText="Ничего не найдено"
                loadingText="Загрузка…"
                renderOption={(props, v) => (
                  <li {...props} key={v.id}>
                    <Box>
                      <Typography variant="body2">{v.name}</Typography>
                      {(v.manufacturer || v.funding === "state") && (
                        <Typography variant="caption" color="text.secondary">
                          {[v.funding === "state" ? "госвакцина" : null, v.manufacturer || null]
                            .filter(Boolean)
                            .join(" · ")}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                renderInput={(params) => {
                  const f = form.field("vaccineId");
                  return (
                    <TextField
                      {...params}
                      label="Вакцина"
                      placeholder="Начните вводить название"
                      error={f.error}
                      helperText={f.helperText}
                      ref={f.ref}
                    />
                  );
                }}
              />
              <TextField
                label="Доза №"
                size="small"
                value={doseNumber}
                onChange={(e) => setDoseNumber(digits(e.target.value))}
                inputProps={{ inputMode: "numeric" }}
                sx={{ width: 96, flexShrink: 0 }}
                {...form.field("doseNumber")}
              />
            </Stack>
          </Stack>

          <Stack spacing={1.25}>
            <SectionTitle>Когда делать</SectionTitle>
            <AgeField
              label="Возраст ребёнка"
              value={age}
              onChange={setAge}
              allowDays
              error={form.errorOf("age") != null}
              anchorRef={form.anchor("age")}
              helperText={form.errorOf("age") ?? "При рождении — 0 мес. «4,5 месяца» — укажите в днях: 135"}
            />
            <TextField
              label="Срок на прививку"
              size="small"
              fullWidth
              value={dueWindowDays}
              onChange={(e) => setDueWindowDays(digits(e.target.value))}
              inputProps={{ inputMode: "numeric" }}
              InputProps={{ endAdornment: <InputAdornment position="end">дней</InputAdornment> }}
              {...form.field("dueWindowDays", "Столько дней после наступления возраста прививка считается «в срок»")}
            />
            <AgeField
              label="Не назначать старше"
              value={maxAge}
              onChange={setMaxAge}
              helperText="Пусто — без ограничения по возрасту"
            />
          </Stack>

          <Stack spacing={1.25}>
            <SectionTitle>Кому</SectionTitle>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={sex}
              onChange={(_, v) => v && setSex(v as CalendarSex)}
            >
              <ToggleButton value="any" sx={{ textTransform: "none" }}>
                Всем
              </ToggleButton>
              <ToggleButton value="female" sx={{ textTransform: "none" }}>
                Девочкам
              </ToggleButton>
              <ToggleButton value="male" sx={{ textTransform: "none" }}>
                Мальчикам
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Box
            sx={(th) => ({
              p: 1.5,
              borderRadius: "10px",
              bgcolor: alpha(th.palette.primary.main, 0.08),
              border: 1,
              borderColor: alpha(th.palette.primary.main, 0.24),
            })}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Как это будет работать
            </Typography>
            {summary.map((line) => (
              <Typography key={line} variant="body2">
                {line}
              </Typography>
            ))}
            {!isActive && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
                Строка выключена — в планы детей не попадает.
              </Typography>
            )}
          </Box>

          <Box>
            <AppButton
              variant="text"
              size="small"
              onClick={() => setMoreOpen((v) => !v)}
              endIcon={
                <ExpandMoreRounded
                  sx={{ transform: moreOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}
                />
              }
              sx={{ px: 0.5 }}
            >
              Дополнительно
            </AppButton>
            <Collapse in={moreOpen}>
              <Stack spacing={1} sx={{ pt: 1.5 }}>
                <TextField
                  label="Название возрастной группы"
                  size="small"
                  fullWidth
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={autoLabel || "Например: 3 месяца"}
                  helperText={`${t("calendarTemplate.labelHelper")}. Пусто — «${autoLabel || "по возрасту"}»`}
                />
                <FormControlLabel
                  control={<Switch checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />}
                  label={
                    <Box>
                      <Typography variant="body2">Обязательная</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Выключите для прививок «по желанию»
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                  label={
                    <Box>
                      <Typography variant="body2">Строка включена</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Выключенная не попадает в планы детей
                      </Typography>
                    </Box>
                  }
                />
              </Stack>
            </Collapse>
          </Box>
        </Stack>
      </DialogContent>
      <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, pt: 1, justifyContent: "flex-end" }}>
        <AppButton variant="outlined" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          onClick={() => {
            if (form.validate()) mutation.mutate();
          }}
          disabled={mutation.isPending}
        >
          Сохранить
        </AppButton>
      </Stack>
    </Dialog>
  );
};

export default CalendarTemplateDialog;
