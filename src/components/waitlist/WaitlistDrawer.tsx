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
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker, PhoneCountryCodeSelect } from "../ui";
import { useT } from "../../i18n/VerticalProvider";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { useActiveScope } from "../../hooks/useActiveScope";
import { doctorEmployeesOnly, useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
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
import DjangoAddPatientDrawer from "../patients/DjangoAddPatientDrawer";
import type { DjangoEmployeeListItem } from "../../api/staff";
import { DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { getProducts, productAvailableStock, type DjangoProduct } from "../../api/warehouse";
import {
  createWaitlistEntry,
  WAITLIST_VACCINE_LIVE,
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

/**
 * Поиск по пикеру специалистов — локальный: справочник уже загружен целиком
 * (useAllActiveEmployees), а по специальности бэк искать всё равно не умеет.
 * Совпадение ищем в любом месте строки: в регистратуре чаще помнят фамилию, а
 * не имя, с которого начинается fullName.
 */
/**
 * Дефолт «когда удобно»: ближайшая неделя в рабочие часы. Пустые поля читались
 * как «когда угодно», но регистратор почти всегда вписывал одно и то же — проще
 * подставить и дать кнопку «Когда угодно», чтобы снять рамки одним кликом.
 */
const DEFAULT_DATE_RANGE_DAYS = 7;
const DEFAULT_TIME_FROM = "09:00";
const DEFAULT_TIME_TO = "18:00";

const employeeFilter = createFilterOptions<DjangoEmployeeListItem>({
  matchFrom: "any",
  trim: true,
  stringify: (emp) =>
    [emp.fullName, emp.nickname, ...emp.specializations.map((s) => s.name)]
      .filter(Boolean)
      .join(" "),
});

const EMPTY_VACCINES: DjangoProduct[] = [];

const vaccineFilter = createFilterOptions<DjangoProduct>({
  matchFrom: "any",
  trim: true,
  stringify: (product) => product.name,
});

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
  const { hasPermission, isSuperAdmin } = usePermissions();
  const isEdit = entry != null;
  // Заводить карту прямо отсюда может только тот, кому это разрешено вообще:
  // регистратор без patients.create упёрся бы в 403 уже после заполнения формы.
  const canCreatePatient = isSuperAdmin() || hasPermission("patients.create");

  // ── Поля формы ──
  const [patient, setPatient] = React.useState<DjangoPatient | null>(null);
  const [contactName, setContactName] = React.useState("");
  const [countryCode, setCountryCode] = React.useState<PhoneCountryCode>(
    DEFAULT_PHONE_COUNTRY_CODE,
  );
  const [phoneLocal, setPhoneLocal] = React.useState("");
  const [employeeId, setEmployeeId] = React.useState<number | "">("");
  const [vaccineId, setVaccineId] = React.useState<number | "">("");
  /**
   * Своего поля у специальности в форме нет: в CRM ждут конкретного врача.
   * Состояние остаётся ради записей с витрины — там пациент выбирает
   * специальность без врача, и правка из CRM не должна её затирать.
   */
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
    setVaccineId(src?.vaccine?.id ?? "");
    setSpecializationId(src?.specializationId ?? prefill?.specializationId ?? "");
    // У сохранённой записи пустое поле — осознанное «когда угодно», его не
    // трогаем. Дефолты подставляем только новой записи.
    if (src) {
      setDateFrom(src.desiredDateFrom ? dayjs(src.desiredDateFrom) : null);
      setDateTo(src.desiredDateTo ? dayjs(src.desiredDateTo) : null);
      setTimeFrom(src.desiredTimeFrom ?? "");
      setTimeTo(src.desiredTimeTo ?? "");
    } else {
      setDateFrom(prefill?.desiredDateFrom ? dayjs(prefill.desiredDateFrom) : dayjs());
      setDateTo(
        prefill?.desiredDateTo
          ? dayjs(prefill.desiredDateTo)
          : dayjs().add(DEFAULT_DATE_RANGE_DAYS, "day"),
      );
      setTimeFrom(DEFAULT_TIME_FROM);
      setTimeTo(DEFAULT_TIME_TO);
    }
    setWeekdays(src?.desiredWeekdays ?? []);
    setUrgent(src?.priority === "urgent");
    setComment(src?.comment ?? "");
    setError(null);
  }, [open, entry, prefill]);

  // ── Справочники ──
  const { employees, isLoading: employeesLoading } = useAllActiveEmployees(open);
  /**
   * В пикер попадают только врачи: регистраторы и уборщицы стояли вперемешку с
   * врачами, а окон у них не бывает. Сохранённого специалиста подмешиваем, даже
   * если он из списка выпал (уволен, другой филиал) — иначе при правке старой
   * записи поле показало бы пустоту и молча подменило ориентир.
   */
  const employeeOptions = React.useMemo(() => {
    const list = doctorEmployeesOnly(employees);
    if (employeeId !== "" && !list.some((e) => e.id === employeeId)) {
      const current = employees.find((e) => e.id === employeeId);
      if (current) return [current, ...list];
    }
    return list;
  }, [employees, employeeId]);

  /**
   * Вакцины — товары склада с `isVaccine`, а не отдельный справочник: остаток
   * берём тот же, по которому препарат спишется в приёме, поэтому в пикере
   * сразу видно, есть ли чего ждать. `branchId` даёт остаток своего филиала.
   */
  const vaccinesQuery = useQuery({
    queryKey: ["django", "warehouse", "products", "waitlist-vaccine-picker", orgId, scope.branchId],
    queryFn: ({ signal }) =>
      getProducts(signal, {
        organizationId: orgId,
        isVaccine: true,
        branchId: scope.branchId ?? undefined,
      }),
    enabled: open && WAITLIST_VACCINE_LIVE,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const vaccines = vaccinesQuery.data ?? EMPTY_VACCINES;
  const selectedVaccine = React.useMemo(
    () => vaccines.find((v) => v.id === vaccineId) ?? null,
    [vaccines, vaccineId],
  );

  const selectedEmployee = React.useMemo(
    () => employeeOptions.find((e) => e.id === employeeId) ?? null,
    [employeeOptions, employeeId],
  );

  /**
   * Имя и телефон руками больше не вводим: в очередь ставим карту пациента, а
   * если её нет — заводим прямо отсюда. Поля остаются только у записей с
   * витрины: там пациент оставил контакт без карты, и правка из CRM не должна
   * терять возможность его исправить.
   */
  const showContactFields = isEdit && entry?.patientId == null;
  const [addPatientOpen, setAddPatientOpen] = React.useState(false);

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
   * Только что заведённая карта в выдачу поиска не попадает (запрос уже
   * отработал по старой строке), а MUI показывает value, которого нет в
   * options, с предупреждением и не подсвечивает строку в списке. Поэтому
   * выбранную карту всегда держим первой опцией.
   */
  const patientOptions = React.useMemo(() => {
    const found = patientsQuery.data ?? [];
    if (patient && !found.some((p) => p.id === patient.id)) return [patient, ...found];
    return found;
  }, [patientsQuery.data, patient]);

  /**
   * Подсказка «такая карта уже есть». Бэк ищет телефон подстрокой, поэтому
   * сверяем хвост из 9 цифр — иначе на «700» приезжает пол-картотеки и
   * предупреждение становится ложным (грабли модуля пациентов).
   */
  const phoneTail = phoneLocal.replace(/\D/g, "").slice(-9);
  const duplicateQuery = useQuery({
    queryKey: ["django", "patients", "waitlist-dup", phoneTail, scope.organizationId],
    queryFn: ({ signal }) => searchPatients(scope, phoneTail, 5, signal),
    enabled: open && showContactFields && patient == null && phoneTail.length === 9 && scope.orgReady,
    staleTime: 30_000,
  });
  const duplicate = React.useMemo(() => {
    const rows = duplicateQuery.data ?? [];
    return rows.find((p) => p.phone.replace(/\D/g, "").endsWith(phoneTail)) ?? null;
  }, [duplicateQuery.data, phoneTail]);

  const applyPatient = (value: DjangoPatient | null) => {
    setPatient(value);
    if (value) {
      setContactName(value.fullName);
      const parsed = parsePhone(value.phone);
      setCountryCode(parsed.countryCode);
      setPhoneLocal(parsed.local);
    }
  };

  const anyDate = dateFrom == null && dateTo == null;
  const anyTime = !timeFrom && !timeTo;

  /**
   * Кнопка снимает рамки, повторное нажатие возвращает дефолт — чтобы
   * очищенные поля не пришлось заполнять заново вручную.
   */
  const toggleAnyDate = () => {
    if (anyDate) {
      setDateFrom(dayjs());
      setDateTo(dayjs().add(DEFAULT_DATE_RANGE_DAYS, "day"));
    } else {
      setDateFrom(null);
      setDateTo(null);
    }
  };

  const toggleAnyTime = () => {
    if (anyTime) {
      setTimeFrom(DEFAULT_TIME_FROM);
      setTimeTo(DEFAULT_TIME_TO);
    } else {
      setTimeFrom("");
      setTimeTo("");
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
        ...(WAITLIST_VACCINE_LIVE ? { vaccineId: vaccineId === "" ? null : vaccineId } : null),
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
            clearVaccine:
              WAITLIST_VACCINE_LIVE && vaccineId === "" && entry.vaccine != null,
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
    // В очередь ставим карту пациента: без неё некому звонить из карточки и не
    // с чем связать будущий приём. Нет карты — её заводят кнопкой прямо отсюда.
    if (!isEdit && patient == null) return setError(t("form.errorNoPatient"));
    if (!contactName.trim()) return setError(t("form.errorNoName"));
    if (phoneLocal.replace(/\D/g, "").length < 9) return setError(t("form.errorPhone"));
    // Без ориентира запись не с чем сопоставить: matchesSlot ищет по
    // employeeId либо по специальности врача слота, и подсказка «окно
    // освободилось» такую запись никогда не найдёт. Специальность приходит
    // только с витрины — в CRM ориентиром служит выбранный врач.
    if (employeeId === "" && specializationId === "" && vaccineId === "") {
      return setError(t(WAITLIST_VACCINE_LIVE ? "form.errorNoTargetVaccine" : "form.errorNoTarget"));
    }
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
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography sx={SECTION_SX}>{t("form.patientSection")}</Typography>
              {!isEdit && canCreatePatient && (
                <AppButton size="small" onClick={() => setAddPatientOpen(true)}>
                  {t("form.newPatient")}
                </AppButton>
              )}
            </Stack>

            {!isEdit && (
            <Autocomplete<DjangoPatient>
              options={patientOptions}
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
            )}

            {!showContactFields && (contactName || phoneLocal) && (
              <Typography variant="body2">
                {isEdit && contactName}
                {isEdit && contactName && phoneLocal ? " · " : ""}
                {phoneLocal && `${countryCode} ${formatPhoneLocalDisplay(countryCode, phoneLocal)}`}
              </Typography>
            )}

            {showContactFields && (
              <>
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
              </>
            )}

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

            {/* Селект со всем штатом приходилось листать: врачей десятки, а
                искомого помнят по фамилии. Здесь поиск по имени, прозвищу и
                специальности — фильтрация локальная, справочник уже в кэше. */}
            <Autocomplete<DjangoEmployeeListItem>
              options={employeeOptions}
              value={selectedEmployee}
              onChange={(_, value) => setEmployeeId(value ? value.id : "")}
              getOptionLabel={(option) => option.fullName}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={employeeFilter}
              loading={employeesLoading}
              noOptionsText={t("form.employeeNotFound")}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.id}>
                  <Stack spacing={0.25}>
                    <Typography variant="body2">{option.fullName}</Typography>
                    {option.specializations.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {option.specializations.map((spec) => spec.name).join(", ")}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label={t("form.employee")}
                  placeholder={t("form.employeeSearch")}
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <BadgeOutlined sx={{ fontSize: 18, ml: 0.5, mr: 0.5 }} />
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            {WAITLIST_VACCINE_LIVE && (
              <Autocomplete<DjangoProduct>
                options={vaccines}
                value={selectedVaccine}
                onChange={(_, value) => setVaccineId(value ? value.id : "")}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                filterOptions={vaccineFilter}
                loading={vaccinesQuery.isFetching}
                noOptionsText={t("form.vaccineNotFound")}
                renderOption={(props, option) => {
                  const stock = productAvailableStock(option);
                  return (
                    <Box component="li" {...props} key={option.id}>
                      <Stack spacing={0.25}>
                        <Typography variant="body2">{option.name}</Typography>
                        <Typography
                          variant="caption"
                          color={stock > 0 ? "text.secondary" : "error.main"}
                        >
                          {stock > 0
                            ? t("form.vaccineStock", { count: stock })
                            : t("form.vaccineOutOfStock")}
                        </Typography>
                      </Stack>
                    </Box>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    label={t("form.vaccine")}
                    placeholder={t("form.vaccineSearch")}
                    helperText={employeeId === "" && vaccineId !== "" ? t("form.vaccineOnlyHint") : undefined}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <VaccinesOutlined sx={{ fontSize: 18, ml: 0.5, mr: 0.5 }} />
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            )}

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
            <Chip
              size="small"
              variant={anyDate ? "filled" : "outlined"}
              color={anyDate ? "primary" : "default"}
              label={t("form.anyDate")}
              onClick={toggleAnyDate}
              sx={{ alignSelf: "flex-start" }}
            />

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

            <Chip
              size="small"
              variant={anyTime ? "filled" : "outlined"}
              color={anyTime ? "primary" : "default"}
              label={t("form.anyTime")}
              onClick={toggleAnyTime}
              sx={{ alignSelf: "flex-start" }}
            />

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

      <DjangoAddPatientDrawer
        open={addPatientOpen && canCreatePatient}
        onClose={() => setAddPatientOpen(false)}
        onCreated={(created) => {
          applyPatient(created);
          setPatientSearch(created.fullName);
          setAddPatientOpen(false);
        }}
      />
    </Drawer>
  );
};

export default WaitlistDrawer;
