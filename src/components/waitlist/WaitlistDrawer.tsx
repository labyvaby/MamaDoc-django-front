import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker, PhoneCountryCodeSelect } from "../ui";
import { useT } from "../../i18n/VerticalProvider";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useActiveScope } from "../../hooks/useActiveScope";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { usePhoneLocalInput } from "../../hooks/usePhoneLocalInput";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  composePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  formatPhoneLocalDisplay,
  parsePhone,
  phonePlaceholder,
  type PhoneCountryCode,
} from "../../utility/phone";
import { searchPatients, type DjangoPatient } from "../../api/patients";
import { getSpecializations } from "../../api/staff";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import {
  createWaitlistEntry,
  updateWaitlistEntry,
  type CreateWaitlistPayload,
  type WaitlistEntry,
} from "../../api/waitlist";
import { WEEKDAY_OPTIONS, waitlistErrorMessage } from "../../pages/waitlist/meta";

/** Предзаполнение из точки входа: «нет окон у этого врача», «занято это время». */
export interface WaitlistPrefill {
  patientId?: number | null;
  patientName?: string | null;
  phone?: string | null;
  employeeId?: number | null;
  specializationId?: number | null;
  serviceIds?: number[];
  desiredDateFrom?: string | null;
  desiredDateTo?: string | null;
}

export interface WaitlistDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Правка существующей записи; без неё — создание. */
  entry?: WaitlistEntry | null;
  prefill?: WaitlistPrefill;
  onSaved?: (entry: WaitlistEntry) => void;
}

const SECTION_SX = { fontWeight: 600, fontSize: "0.8125rem", color: "text.secondary" } as const;

const WaitlistDrawer: React.FC<WaitlistDrawerProps> = ({
  open,
  onClose,
  entry = null,
  prefill,
  onSaved,
}) => {
  const { t } = useT("waitlist");
  const orgId = useApiOrgId();
  const scope = useActiveScope();
  const isEdit = entry != null;

  // ── Поля формы ──
  const [patient, setPatient] = React.useState<DjangoPatient | null>(null);
  const [contactName, setContactName] = React.useState("");
  const [countryCode, setCountryCode] = React.useState<PhoneCountryCode>(
    DEFAULT_PHONE_COUNTRY_CODE,
  );
  const [phoneLocal, setPhoneLocal] = React.useState("");
  const [employeeId, setEmployeeId] = React.useState<number | "">("");
  const [specializationId, setSpecializationId] = React.useState<number | "">("");
  const [dateFrom, setDateFrom] = React.useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = React.useState<Dayjs | null>(null);
  const [timeFrom, setTimeFrom] = React.useState("");
  const [timeTo, setTimeTo] = React.useState("");
  const [weekdays, setWeekdays] = React.useState<number[]>([]);
  const [urgent, setUrgent] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const phoneInput = usePhoneLocalInput(countryCode, phoneLocal, setPhoneLocal, setCountryCode);

  // ── Заполнение при открытии ──
  React.useEffect(() => {
    if (!open) return;
    const src = entry;
    const phoneRaw = src?.phone ?? prefill?.phone ?? "";
    const parsed = parsePhone(phoneRaw);
    setPatient(null);
    setContactName(src?.contactName ?? prefill?.patientName ?? "");
    setCountryCode(parsed.countryCode);
    setPhoneLocal(parsed.local);
    setEmployeeId(src?.employeeId ?? prefill?.employeeId ?? "");
    setSpecializationId(src?.specializationId ?? prefill?.specializationId ?? "");
    setDateFrom(
      src?.desiredDateFrom
        ? dayjs(src.desiredDateFrom)
        : prefill?.desiredDateFrom
          ? dayjs(prefill.desiredDateFrom)
          : null,
    );
    setDateTo(
      src?.desiredDateTo
        ? dayjs(src.desiredDateTo)
        : prefill?.desiredDateTo
          ? dayjs(prefill.desiredDateTo)
          : null,
    );
    setTimeFrom(src?.desiredTimeFrom ?? "");
    setTimeTo(src?.desiredTimeTo ?? "");
    setWeekdays(src?.desiredWeekdays ?? []);
    setUrgent(src?.priority === "urgent");
    setComment(src?.comment ?? "");
    setError(null);
  }, [open, entry, prefill]);

  // ── Справочники ──
  const { employees } = useAllActiveEmployees(open);
  const specializationsQuery = useQuery({
    queryKey: djangoQueryKeys.staff.specializations(orgId),
    queryFn: ({ signal }) => getSpecializations(signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const specializations = specializationsQuery.data ?? [];

  // ── Поиск пациента в базе ──
  const [patientSearch, setPatientSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(patientSearch, 350);
  const patientsQuery = useQuery({
    queryKey: ["django", "patients", "waitlist-search", debouncedSearch, scope.organizationId],
    queryFn: ({ signal }) => searchPatients(scope, debouncedSearch, 10, signal),
    enabled: open && debouncedSearch.trim().length >= 2 && scope.orgReady,
    staleTime: 30_000,
  });

  /**
   * Подсказка «такая карта уже есть». Бэк ищет телефон подстрокой, поэтому
   * сверяем хвост из 9 цифр — иначе на «700» приезжает пол-картотеки и
   * предупреждение становится ложным (грабли модуля пациентов).
   */
  const phoneTail = phoneLocal.replace(/\D/g, "").slice(-9);
  const duplicateQuery = useQuery({
    queryKey: ["django", "patients", "waitlist-dup", phoneTail, scope.organizationId],
    queryFn: ({ signal }) => searchPatients(scope, phoneTail, 5, signal),
    enabled: open && !isEdit && patient == null && phoneTail.length === 9 && scope.orgReady,
    staleTime: 30_000,
  });
  const duplicate = React.useMemo(() => {
    const rows = duplicateQuery.data ?? [];
    return rows.find((p) => p.phone.replace(/\D/g, "").endsWith(phoneTail)) ?? null;
  }, [duplicateQuery.data, phoneTail]);

  const selectedEmployee = employees.find((e) => e.id === employeeId) ?? null;

  const applyPatient = (value: DjangoPatient | null) => {
    setPatient(value);
    if (value) {
      setContactName(value.fullName);
      const parsed = parsePhone(value.phone);
      setCountryCode(parsed.countryCode);
      setPhoneLocal(parsed.local);
    }
  };

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const saveMutation = useMutation({
    mutationFn: async (): Promise<WaitlistEntry> => {
      const payload: CreateWaitlistPayload = {
        patientId: patient?.id ?? entry?.patientId ?? null,
        contactName: contactName.trim(),
        phone: composePhone(countryCode, phoneLocal) ?? "",
        employeeId: employeeId === "" ? null : employeeId,
        specializationId: specializationId === "" ? null : specializationId,
        branchId: entry?.branchId ?? scope.branchId ?? null,
        desiredDateFrom: dateFrom ? dateFrom.format("YYYY-MM-DD") : null,
        desiredDateTo: dateTo ? dateTo.format("YYYY-MM-DD") : null,
        desiredTimeFrom: timeFrom || null,
        desiredTimeTo: timeTo || null,
        desiredWeekdays: weekdays,
        priority: urgent ? "urgent" : "normal",
        comment: comment.trim(),
      };
      if (entry) {
        // Очистка полей — только явными флагами: null в JSON бэк игнорирует
        // (tri-state, конвенция модуля задач).
        return updateWaitlistEntry(
          entry.id,
          {
            ...payload,
            clearEmployee: payload.employeeId == null && entry.employeeId != null,
            clearSpecialization:
              payload.specializationId == null && entry.specializationId != null,
            clearDesiredDates:
              payload.desiredDateFrom == null &&
              payload.desiredDateTo == null &&
              (entry.desiredDateFrom != null || entry.desiredDateTo != null),
            clearDesiredTimes:
              payload.desiredTimeFrom == null &&
              payload.desiredTimeTo == null &&
              (entry.desiredTimeFrom != null || entry.desiredTimeTo != null),
          },
          orgId,
        );
      }
      return createWaitlistEntry(payload, orgId);
    },
    onSuccess: (saved) => {
      onSaved?.(saved);
      onClose();
    },
    onError: (e) => setError(waitlistErrorMessage(e, "Не удалось сохранить запись")),
  });

  const handleSubmit = () => {
    setError(null);
    if (!contactName.trim()) return setError(t("form.errorNoName"));
    if (phoneLocal.replace(/\D/g, "").length < 9) return setError(t("form.errorPhone"));
    // Без врача и без специальности запись не с чем сопоставить: подсказка
    // «окно освободилось» никогда её не найдёт.
    if (employeeId === "" && specializationId === "") return setError(t("form.errorNoTarget"));
    if (dateFrom && dateTo && dateFrom.isAfter(dateTo)) return setError(t("form.errorDates"));
    if (timeFrom && timeTo && timeFrom > timeTo) return setError(t("form.errorTimes"));
    saveMutation.mutate();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 460 }, maxWidth: "100%" } } }}
    >
      <Stack sx={{ height: "100%" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.5 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {isEdit ? t("form.editTitle") : t("form.createTitle")}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />

        <Stack spacing={2.5} sx={{ p: 2, overflowY: "auto", flex: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* ── Кто ждёт ── */}
          <Stack spacing={1.5}>
            <Typography sx={SECTION_SX}>{t("form.patientSection")}</Typography>

            <Autocomplete<DjangoPatient>
              options={patientsQuery.data ?? []}
              value={patient}
              onChange={(_, value) => applyPatient(value)}
              onInputChange={(_, value) => setPatientSearch(value)}
              getOptionLabel={(option) => option.fullName}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              loading={patientsQuery.isFetching}
              noOptionsText={patientSearch.length < 2 ? "Начните вводить имя" : "Ничего не найдено"}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label={t("form.existingPatient")}
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <PersonSearchOutlined sx={{ fontSize: 18, ml: 0.5, mr: 0.5 }} />
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            <TextField
              size="small"
              label={t("form.contactName")}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              fullWidth
            />

            <Stack direction="row" spacing={1}>
              <PhoneCountryCodeSelect value={countryCode} onChange={setCountryCode} />
              <TextField
                size="small"
                label={t("form.phone")}
                value={formatPhoneLocalDisplay(countryCode, phoneLocal)}
                onChange={phoneInput.onChange}
                onKeyDown={phoneInput.onKeyDown}
                inputRef={phoneInput.inputRef}
                placeholder={phonePlaceholder(countryCode)}
                fullWidth
              />
            </Stack>

            {duplicate && (
              <Alert
                severity="info"
                action={
                  <AppButton size="small" onClick={() => applyPatient(duplicate)}>
                    {t("form.duplicateLink")}
                  </AppButton>
                }
              >
                {t("form.duplicateHint")} {duplicate.fullName}
              </Alert>
            )}
          </Stack>

          {/* ── Чего ждёт ── */}
          <Stack spacing={1.5}>
            <Typography sx={SECTION_SX}>{t("form.wishSection")}</Typography>

            <TextField
              select
              size="small"
              label={t("form.employee")}
              value={employeeId}
              onChange={(e) => {
                const value = e.target.value === "" ? "" : Number(e.target.value);
                setEmployeeId(value);
                // Специальность подставляем от выбранного специалиста — на неё
                // матчатся окна его коллег, если человек согласен на любого.
                const emp = employees.find((x) => x.id === value);
                if (emp?.specializations?.[0] && specializationId === "") {
                  setSpecializationId(emp.specializations[0].id);
                }
              }}
              fullWidth
            >
              <MenuItem value="">{t("form.employeeAny")}</MenuItem>
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  {emp.fullName}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label={t("form.specialization")}
              value={specializationId}
              onChange={(e) =>
                setSpecializationId(e.target.value === "" ? "" : Number(e.target.value))
              }
              helperText={
                selectedEmployee && specializationId !== ""
                  ? "Подойдут и окна коллег этой специальности"
                  : undefined
              }
              fullWidth
            >
              <MenuItem value="">—</MenuItem>
              {specializations.map((spec) => (
                <MenuItem key={spec.id} value={spec.id}>
                  {spec.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              size="small"
              label={t("form.comment")}
              placeholder={t("form.commentPlaceholder")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />

            <FormControlLabel
              control={<Switch checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />}
              label={
                <Stack>
                  <Typography variant="body2">{t("form.priority")}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("form.priorityHint")}
                  </Typography>
                </Stack>
              }
            />
          </Stack>

          {/* ── Когда удобно ── */}
          <Stack spacing={1.5}>
            <Typography sx={SECTION_SX}>{t("form.whenSection")}</Typography>

            <Stack direction="row" spacing={1}>
              <CustomDatePicker
                label={t("form.dateFrom")}
                value={dateFrom}
                onChange={(v) => setDateFrom(v as Dayjs | null)}
                disablePast
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
              <CustomDatePicker
                label={t("form.dateTo")}
                value={dateTo}
                onChange={(v) => setDateTo(v as Dayjs | null)}
                disablePast
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </Stack>
            {!dateFrom && !dateTo && (
              <Typography variant="caption" color="text.secondary">
                {t("form.anyDate")}
              </Typography>
            )}

            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                type="time"
                label={t("form.timeFrom")}
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                type="time"
                label={t("form.timeTo")}
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>

            <Box>
              <Typography variant="caption" color="text.secondary">
                {t("form.weekdays")}
              </Typography>
              <ToggleButtonGroup size="small" sx={{ mt: 0.5, flexWrap: "wrap" }}>
                {WEEKDAY_OPTIONS.map((day) => (
                  <ToggleButton
                    key={day.value}
                    value={day.value}
                    selected={weekdays.includes(day.value)}
                    onClick={() => toggleWeekday(day.value)}
                  >
                    {day.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {weekdays.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {t("form.anyWeekday")}
                </Typography>
              )}
            </Box>
          </Stack>

          {entry?.source === "public" && (
            <Chip size="small" label={t("source.public")} sx={{ alignSelf: "flex-start" }} />
          )}
        </Stack>

        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 2 }}>
          <AppButton
            variant="contained"
            fullWidth
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
          >
            {isEdit ? t("form.save") : t("form.create")}
          </AppButton>
        </Stack>
      </Stack>
    </Drawer>
  );
};

export default WaitlistDrawer;
