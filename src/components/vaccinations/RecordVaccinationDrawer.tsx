import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import {
  createRecord,
  getBatches,
  getVaccines,
  type CreateRecordPayload,
} from "../../api/vaccinations";
import { searchPatients, type DjangoPatient } from "../../api/patients";
import { getDjangoEmployees } from "../../api/staff";
import { INJECTION_SITE_OPTIONS } from "../../pages/vaccinations/meta";

type Scenario = "ours" | "external";

type RecordVaccinationDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Предвыбранный пациент (например, из карточки пациента). */
  initialPatient?: DjangoPatient | null;
  /** Привязка к приёму (строка счёта появится в этом приёме). */
  initialAppointmentId?: number | null;
};

const RecordVaccinationDrawer: React.FC<RecordVaccinationDrawerProps> = ({
  open,
  onClose,
  initialPatient = null,
  initialAppointmentId = null,
}) => {
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { activeBranch, activeEmployee } = usePermissions();
  const branchId = activeBranch?.id ?? null;
  const meEmployeeId = (activeEmployee as { id?: number } | null | undefined)?.id ?? null;

  const [error, setError] = React.useState<string | null>(null);
  const [scenario, setScenario] = React.useState<Scenario>("ours");

  // ── Форма ──
  const [patient, setPatient] = React.useState<DjangoPatient | null>(initialPatient);
  const [patientSearch, setPatientSearch] = React.useState("");
  const [vaccineId, setVaccineId] = React.useState<number | "">("");
  const [batchId, setBatchId] = React.useState<number | "">("");
  const [doseNumber, setDoseNumber] = React.useState("1");
  const [administeredAt, setAdministeredAt] = React.useState<Dayjs | null>(dayjs());
  const [injectionSite, setInjectionSite] = React.useState("left_arm");
  const [administeredById, setAdministeredById] = React.useState<number | "">("");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [batchNumberManual, setBatchNumberManual] = React.useState("");
  const [expiresAtManual, setExpiresAtManual] = React.useState<Dayjs | null>(null);
  const [appointmentId, setAppointmentId] = React.useState(
    initialAppointmentId != null ? String(initialAppointmentId) : "",
  );
  const [notes, setNotes] = React.useState("");

  const resetForm = React.useCallback(() => {
    setScenario("ours");
    setPatient(initialPatient);
    setPatientSearch("");
    setVaccineId("");
    setBatchId("");
    setDoseNumber("1");
    setAdministeredAt(dayjs());
    setInjectionSite("left_arm");
    setAdministeredById(meEmployeeId ?? "");
    setUnitPrice("");
    setBatchNumberManual("");
    setExpiresAtManual(null);
    setAppointmentId(initialAppointmentId != null ? String(initialAppointmentId) : "");
    setNotes("");
    setError(null);
  }, [initialPatient, initialAppointmentId, meEmployeeId]);

  React.useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  // ── Поиск пациента (серверный, дебаунс) ──
  const [patientOptions, setPatientOptions] = React.useState<DjangoPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      setPatientsLoading(true);
      searchPatients(patientSearch.trim(), 30, ctrl.signal)
        .then((rows) => {
          if (!ctrl.signal.aborted) setPatientOptions(rows);
        })
        .catch(() => {})
        .finally(() => {
          if (!ctrl.signal.aborted) setPatientsLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [open, patientSearch]);

  const patientChoices = React.useMemo<DjangoPatient[]>(() => {
    if (!patient) return patientOptions;
    return patientOptions.some((p) => p.id === patient.id)
      ? patientOptions
      : [patient, ...patientOptions];
  }, [patientOptions, patient]);

  // ── Справочник вакцин ──
  const vaccinesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.vaccines({ orgId }),
    queryFn: ({ signal }) => getVaccines({ organizationId: orgId }, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  // ── Партии выбранной вакцины (сценарий «у нас») ──
  const batchesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.batches({ vaccineId, branchId, orgId }),
    queryFn: ({ signal }) =>
      getBatches(
        {
          vaccineId: vaccineId === "" ? undefined : vaccineId,
          branchId: branchId ?? undefined,
          organizationId: orgId,
        },
        signal,
      ),
    enabled: open && scenario === "ours" && vaccineId !== "",
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const employeesQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, "vaccinations-administered-by"],
    queryFn: ({ signal }) => getDjangoEmployees({ status: "active", pageSize: 200 }, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CreateRecordPayload = {
        patientId: patient!.id,
        branchId: branchId!,
        vaccineId: vaccineId as number,
        administeredAt: (administeredAt ?? dayjs()).toISOString(),
        doseNumber: Number(doseNumber) || 1,
        injectionSite,
        administeredById: administeredById === "" ? undefined : (administeredById as number),
        appointmentId: appointmentId.trim() === "" ? undefined : Number(appointmentId),
        notes: notes.trim() || undefined,
      };
      if (scenario === "ours") {
        payload.batchId = batchId === "" ? undefined : (batchId as number);
        payload.unitPrice = unitPrice.trim() === "" ? undefined : unitPrice.trim();
      } else {
        payload.isExternal = true;
        payload.batchNumberManual = batchNumberManual.trim() || undefined;
        payload.expiresAtManual = expiresAtManual ? expiresAtManual.format("YYYY-MM-DD") : undefined;
        payload.unitPrice = "0";
      }
      return createRecord(payload, orgId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось сохранить прививку"),
  });

  const canSubmit =
    branchId != null &&
    patient != null &&
    vaccineId !== "" &&
    (scenario === "external" || batchId !== "") &&
    !mutation.isPending;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 480, md: 540 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="h6" fontWeight={600} sx={{ flex: 1, letterSpacing: -0.15 }}>
          Ввод прививки
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Закрыть" disabled={mutation.isPending}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {branchId == null && (
          <Alert severity="warning">
            Не выбран активный филиал — ввод прививки недоступен. Переключите филиал вверху.
          </Alert>
        )}

        {/* ── Сценарий ── */}
        <ToggleButtonGroup
          exclusive
          size="small"
          value={scenario}
          onChange={(_, v) => v && setScenario(v)}
          fullWidth
        >
          <ToggleButton value="ours" sx={{ textTransform: "none" }}>
            У нас (со склада)
          </ToggleButton>
          <ToggleButton value="external" sx={{ textTransform: "none" }}>
            Внешняя (со слов)
          </ToggleButton>
        </ToggleButtonGroup>

        {/* ── Пациент ── */}
        <Autocomplete<DjangoPatient>
          options={patientChoices}
          value={patient}
          loading={patientsLoading}
          filterOptions={(x) => x}
          onChange={(_, v) => setPatient(v)}
          inputValue={patientSearch}
          onInputChange={(_, v) => setPatientSearch(v)}
          getOptionLabel={(p) => `${p.fullName} — ${p.phone}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => (
            <TextField {...params} label="Пациент" required placeholder="ФИО или телефон" />
          )}
        />

        {/* ── Вакцина ── */}
        <TextField
          select
          label="Вакцина"
          required
          fullWidth
          value={vaccineId === "" ? "" : String(vaccineId)}
          onChange={(e) => {
            setVaccineId(e.target.value === "" ? "" : Number(e.target.value));
            setBatchId("");
          }}
        >
          {(vaccinesQuery.data ?? []).map((v) => (
            <MenuItem key={v.id} value={String(v.id)}>
              {v.name}
              {v.manufacturer ? ` · ${v.manufacturer}` : ""}
            </MenuItem>
          ))}
        </TextField>

        {/* ── Доза / дата ── */}
        <Stack direction="row" gap={2}>
          <TextField
            label="Доза №"
            type="number"
            value={doseNumber}
            onChange={(e) => setDoseNumber(e.target.value)}
            sx={{ width: 120 }}
            inputProps={{ min: 1 }}
          />
          <CustomDatePicker
            label="Дата введения"
            value={administeredAt}
            onChange={(v) => setAdministeredAt(v as Dayjs | null)}
            format="DD.MM.YYYY"
            maxDate={dayjs()}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </Stack>

        {/* ── Сценарий «у нас» ── */}
        {scenario === "ours" && (
          <>
            <TextField
              select
              label="Партия"
              required
              fullWidth
              value={batchId === "" ? "" : String(batchId)}
              onChange={(e) => setBatchId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={vaccineId === ""}
              helperText={
                vaccineId === ""
                  ? "Сначала выберите вакцину"
                  : (batchesQuery.data ?? []).length === 0
                  ? "Нет партий этой вакцины на складе филиала"
                  : undefined
              }
            >
              {(batchesQuery.data ?? []).map((b) => (
                <MenuItem key={b.id} value={String(b.id)} disabled={b.remaining <= 0}>
                  №{b.batchNumber} · остаток {b.remaining} · до {dayjs(b.expiresAt).format("DD.MM.YYYY")}
                  {b.productId == null ? " · без склада" : ""}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Цена, KGS"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value.replace(/[^\d.]/g, ""))}
              fullWidth
              helperText="Пусто — цена по умолчанию с бэка; строка появится в счёте приёма"
              InputProps={{ endAdornment: <InputAdornment position="end">сом</InputAdornment> }}
            />
          </>
        )}

        {/* ── Сценарий «внешняя» ── */}
        {scenario === "external" && (
          <>
            <TextField
              label="Номер партии (со слов)"
              value={batchNumberManual}
              onChange={(e) => setBatchNumberManual(e.target.value)}
              fullWidth
              helperText="Можно оставить пустым, если не помнят"
            />
            <CustomDatePicker
              label="Срок годности (со слов)"
              value={expiresAtManual}
              onChange={(v) => setExpiresAtManual(v as Dayjs | null)}
              format="DD.MM.YYYY"
              slotProps={{ textField: { fullWidth: true } }}
            />
            <Alert severity="info" sx={{ py: 0.5 }}>
              Внешняя прививка: склад не трогается, строка в счёт не добавляется.
            </Alert>
          </>
        )}

        {/* ── Общие поля ── */}
        <TextField
          select
          label="Место укола"
          fullWidth
          value={injectionSite}
          onChange={(e) => setInjectionSite(e.target.value)}
        >
          {INJECTION_SITE_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Кто вводил"
          fullWidth
          value={administeredById === "" ? "" : String(administeredById)}
          onChange={(e) => setAdministeredById(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <MenuItem value="">Не указывать</MenuItem>
          {(employeesQuery.data?.results ?? []).map((e) => (
            <MenuItem key={e.id} value={String(e.id)}>
              {e.fullName}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="ID приёма (необязательно)"
          value={appointmentId}
          onChange={(e) => setAppointmentId(e.target.value.replace(/[^\d]/g, ""))}
          fullWidth
          helperText={
            scenario === "ours"
              ? "Указан — строка вакцины попадёт в счёт этого приёма"
              : "Для внешней прививки необязателен"
          }
        />

        <TextField
          label="Заметка"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          multiline
          minRows={2}
        />
      </Box>

      <Box sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 1.5 }}>
        <AppButton variant="outlined" onClick={onClose} sx={{ flex: 1 }} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          sx={{ flex: 1 }}
          disabled={!canSubmit}
          onClick={() => mutation.mutate()}
        >
          Сохранить
        </AppButton>
      </Box>
    </Drawer>
  );
};

export default RecordVaccinationDrawer;
