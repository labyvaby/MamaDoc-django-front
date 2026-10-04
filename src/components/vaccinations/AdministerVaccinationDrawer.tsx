import React from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import {
  administerRecord,
  getBatches,
  getPatientHistory,
  getRecord,
  type RecordWarning,
} from "../../api/vaccinations";
import { getDjangoEmployees } from "../../api/staff";
import { INJECTION_SITE_OPTIONS, MISSING_FIELD_LABELS } from "../../pages/vaccinations/meta";
import VaccinationPatientFields from "./VaccinationPatientFields";
import {
  buildAdministerPayload,
  missingFromError,
  nextDoseNumber,
  patientDraftFromRecord,
} from "./administerPayload";
import type { PatientDraft } from "./patientGaps";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Черновик (или проведённая запись для исправления). */
  recordId: number | null;
  /** Номер дозы из прогноза календаря, если известен. */
  suggestedDoseNumber?: number | null;
  /** Сообщить вызывающему замечания (например, «возраст вне срока»). */
  onDone?: (warnings: RecordWarning[]) => void;
};

/**
 * Оформление прививки: партия (сначала ближайший срок годности), доза, место,
 * кто ввёл — и недостающие пол, дата рождения, ИНН пациента. Всё уходит одним
 * запросом `administer/`; недостающее бэк возвращает списком — подсвечиваем разом.
 */
const AdministerVaccinationDrawer: React.FC<Props> = ({
  open,
  onClose,
  recordId,
  suggestedDoseNumber,
  onDone,
}) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const { activeEmployee } = usePermissions();
  const meEmployeeId = (activeEmployee as { id?: number } | null | undefined)?.id ?? null;

  const recordQuery = useQuery({
    queryKey: [...djangoQueryKeys.vaccinations.record(recordId ?? 0), orgId],
    queryFn: ({ signal }) => getRecord(recordId!, orgId, signal),
    enabled: open && recordId != null,
  });
  const record = recordQuery.data ?? null;

  const historyQuery = useQuery({
    queryKey: [...djangoQueryKeys.vaccinations.patientHistory(record?.patientId ?? 0), orgId],
    queryFn: ({ signal }) => getPatientHistory(record!.patientId, orgId, signal),
    enabled: open && record != null,
  });

  const batchesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.batches({
      vaccineId: record?.vaccineId,
      branchId: record?.branchId,
      orgId,
    }),
    queryFn: ({ signal }) =>
      getBatches(
        { vaccineId: record!.vaccineId, branchId: record!.branchId, organizationId: orgId },
        signal,
      ),
    enabled: open && record != null && !record.isExternal,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const employeesQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, "vaccinations-administered-by", orgId],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ status: "active", pageSize: 200, organizationId: orgId }, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const originalPatient = React.useMemo(() => patientDraftFromRecord(record), [record]);
  const [patient, setPatient] = React.useState<PatientDraft>(originalPatient);
  const [batchId, setBatchId] = React.useState<number | "">("");
  const [batchNumberManual, setBatchNumberManual] = React.useState("");
  const [doseNumber, setDoseNumber] = React.useState("");
  const [injectionSite, setInjectionSite] = React.useState("thigh");
  const [administeredById, setAdministeredById] = React.useState<number | "">("");
  const [administeredAt, setAdministeredAt] = React.useState<Dayjs | null>(dayjs());
  const [highlight, setHighlight] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Начальные значения — один раз на открытую запись.
  const initializedFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!open) {
      initializedFor.current = null;
      return;
    }
    if (!record || initializedFor.current === record.id) return;
    initializedFor.current = record.id;
    setPatient(patientDraftFromRecord(record));
    setBatchId(record.batchId ?? "");
    setBatchNumberManual(record.batchNumberManual ?? "");
    setDoseNumber(record.doseNumber != null ? String(record.doseNumber) : "");
    setInjectionSite(record.injectionSite || "thigh");
    setAdministeredById(record.administeredBy?.id ?? meEmployeeId ?? "");
    setAdministeredAt(record.administeredAt ? dayjs(record.administeredAt) : dayjs());
    setHighlight(record.missing?.filter((k) => !k.startsWith("patient.")) ?? []);
    setError(null);
  }, [open, record, meEmployeeId]);

  // Номер дозы: прогноз календаря, иначе следующий по истории.
  React.useEffect(() => {
    if (!record || doseNumber !== "" || !historyQuery.data) return;
    setDoseNumber(
      String(suggestedDoseNumber ?? nextDoseNumber(historyQuery.data, record.vaccineId, record.id)),
    );
  }, [record, doseNumber, historyQuery.data, suggestedDoseNumber]);

  // Партия: годная с ближайшим сроком (FEFO), пока не выбрали вручную.
  React.useEffect(() => {
    if (batchId !== "" || !batchesQuery.data) return;
    const today = dayjs();
    const fefo = batchesQuery.data
      .filter((b) => b.remaining > 0 && !dayjs(b.expiresAt).isBefore(today, "day"))
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))[0];
    if (fefo) setBatchId(fefo.id);
  }, [batchId, batchesQuery.data]);

  const mutation = useMutation({
    mutationFn: () =>
      administerRecord(
        record!.id,
        buildAdministerPayload(
          {
            isExternal: record!.isExternal,
            batchId,
            batchNumberManual,
            doseNumber,
            injectionSite,
            administeredById,
            administeredAt: (administeredAt ?? dayjs()).toISOString(),
            notes: "",
          },
          patient,
          originalPatient,
        ),
        orgId,
      ),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
      void queryClient.invalidateQueries({ queryKey: ["django", "appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["django", "patients"] });
      onDone?.(saved.warnings ?? []);
      onClose();
    },
    onError: (e) => {
      const keys = missingFromError(e);
      setHighlight(keys);
      setError(
        keys.length
          ? `Не хватает: ${keys.map((k) => MISSING_FIELD_LABELS[k] ?? k).join(", ")}`
          : e instanceof Error
            ? e.message
            : "Не удалось оформить прививку",
      );
    },
  });

  const flagged = (key: string) => highlight.includes(key);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: 320, sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
          {record?.status === "pending" ? "Исправить прививку" : "Оформить прививку"}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Закрыть" disabled={mutation.isPending}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5 }}>
        {!record ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            {recordQuery.isError ? (
              <Alert severity="error">Не удалось загрузить запись</Alert>
            ) : (
              <CircularProgress size={28} />
            )}
          </Box>
        ) : (
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <Typography variant="subtitle2">{record.patient?.fullName ?? `Пациент #${record.patientId}`}</Typography>
              <Typography variant="body2" color="text.secondary">
                {record.vaccineName}
                {record.isExternal ? " · внешняя" : ""}
              </Typography>
            </Box>
            <VaccinationPatientFields value={patient} onChange={setPatient} highlight={highlight} />
            <Divider />
            {record.isExternal ? (
              <TextField
                label="Серия"
                size="small"
                fullWidth
                value={batchNumberManual}
                onChange={(e) => setBatchNumberManual(e.target.value)}
                error={flagged("batchNumberManual")}
              />
            ) : (
              <TextField
                select
                label="Партия"
                size="small"
                fullWidth
                value={batchId}
                onChange={(e) => setBatchId(Number(e.target.value))}
                error={flagged("batch")}
                helperText={
                  batchesQuery.data && batchesQuery.data.length === 0
                    ? "В филиале нет партий этой вакцины — сначала оформите приход"
                    : undefined
                }
              >
                {(batchesQuery.data ?? []).map((b) => (
                  <MenuItem key={b.id} value={b.id} disabled={b.remaining <= 0}>
                    {b.batchNumber} · до {dayjs(b.expiresAt).format("DD.MM.YYYY")} · осталось {b.remaining}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Доза №"
                size="small"
                type="number"
                value={doseNumber}
                onChange={(e) => setDoseNumber(e.target.value)}
                error={flagged("doseNumber")}
                inputProps={{ min: 1 }}
                sx={{ width: 110 }}
              />
              <TextField
                select
                label="Место введения"
                size="small"
                fullWidth
                value={injectionSite}
                onChange={(e) => setInjectionSite(e.target.value)}
                error={flagged("injectionSite")}
              >
                {INJECTION_SITE_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField
              select
              label="Кто ввёл"
              size="small"
              fullWidth
              value={administeredById}
              onChange={(e) => setAdministeredById(Number(e.target.value))}
              error={flagged("administeredBy")}
            >
              {(employeesQuery.data?.results ?? []).map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  {emp.fullName}
                </MenuItem>
              ))}
            </TextField>
            <CustomDatePicker
              label="Дата введения"
              value={administeredAt}
              onChange={(v) => setAdministeredAt(v as Dayjs | null)}
              maxDate={dayjs()}
              slotProps={{
                textField: { fullWidth: true, size: "small", error: flagged("administeredAt") },
              }}
            />
          </Stack>
        )}
      </Box>

      <Box sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider", display: "flex", justifyContent: "flex-end", gap: 1 }}>
        <AppButton variant="text" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={!record || mutation.isPending}
        >
          {record?.status === "pending" ? "Сохранить" : "Провести"}
        </AppButton>
      </Box>
    </Drawer>
  );
};

export default AdministerVaccinationDrawer;
