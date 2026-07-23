import React from "react";
import {
  Alert,
  Box,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { AppButton, CustomDatePicker } from "../ui";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { createRecord, getBatches, type VaccineBatch } from "../../api/vaccinations";
import type { DjangoPatient } from "../../api/patients";
import { getDjangoEmployees } from "../../api/staff";
import { INJECTION_SITE_OPTIONS } from "../../pages/vaccinations/meta";

/** Одна доза для группового ввода (из прогноза календаря). */
export type BatchDoseInput = { vaccineId: number; vaccineName: string; doseNumber: number };

type BatchRecordVaccinationDrawerProps = {
  open: boolean;
  onClose: () => void;
  patient: DjangoPatient | null;
  /** Приём, к которому привяжутся строки вакцин (счёт). */
  appointmentId?: number | null;
  doses: BatchDoseInput[];
};

type Row = BatchDoseInput & { batchId: number | "" };

/**
 * Групповой ввод прививок за один визит («Ввести выбранные»): N положенных доз
 * ребёнку вводятся одним экраном и одним сохранением (N POST /records/ с общим
 * appointmentId). Партия по каждой вакцине выбирается сама (FEFO), общие поля —
 * дата, кто вводил, место укола. Цену не шлём — бэк снимает snapshot.
 */
const BatchRecordVaccinationDrawer: React.FC<BatchRecordVaccinationDrawerProps> = ({
  open,
  onClose,
  patient,
  appointmentId = null,
  doses,
}) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const { activeBranch, activeEmployee } = usePermissions();
  const branchId = activeBranch?.id ?? null;
  const meEmployeeId = (activeEmployee as { id?: number } | null | undefined)?.id ?? null;

  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [administeredAt, setAdministeredAt] = React.useState<Dayjs | null>(dayjs());
  const [administeredById, setAdministeredById] = React.useState<number | "">("");
  const [injectionSite, setInjectionSite] = React.useState("left_arm");
  const [rows, setRows] = React.useState<Row[]>([]);

  // Все партии филиала одним запросом → группируем по вакцине, годные, FEFO.
  const batchesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.batches({ branchId, orgId, multi: true }),
    queryFn: ({ signal }) =>
      getBatches({ branchId: branchId ?? undefined, organizationId: orgId }, signal),
    enabled: open && branchId != null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const batchesByVaccine = React.useMemo(() => {
    const map = new Map<number, VaccineBatch[]>();
    const today = dayjs();
    for (const b of batchesQuery.data ?? []) {
      if (b.remaining <= 0 || dayjs(b.expiresAt).isBefore(today, "day")) continue;
      const arr = map.get(b.vaccineId) ?? [];
      arr.push(b);
      map.set(b.vaccineId, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    return map;
  }, [batchesQuery.data]);
  // Ссылка на последнюю группировку — чтобы reset-эффект брал FEFO без ре-запуска
  // при асинхронной догрузке партий (иначе перетирал бы правки общих полей).
  const byVaccineRef = React.useRef(batchesByVaccine);
  byVaccineRef.current = batchesByVaccine;

  const employeesQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, "vacc-batch-administered-by"],
    queryFn: ({ signal }) => getDjangoEmployees({ status: "active", pageSize: 200 }, signal),
    enabled: open,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  // Сброс формы при открытии: строки из доз с FEFO-партией, общие поля.
  React.useEffect(() => {
    if (!open) return;
    const bv = byVaccineRef.current;
    setRows(
      doses.map((d) => {
        const fefo = bv.get(d.vaccineId)?.[0];
        return { ...d, batchId: fefo ? fefo.id : ("" as number | "") };
      }),
    );
    setAdministeredAt(dayjs());
    setAdministeredById(meEmployeeId ?? "");
    setInjectionSite("left_arm");
    setError(null);
  }, [open, doses, meEmployeeId]);

  // Догрузились партии (первое открытие без кэша) — дозаполняем пустые FEFO,
  // ручной выбор не трогаем.
  React.useEffect(() => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.batchId !== "") return r;
        const fefo = batchesByVaccine.get(r.vaccineId)?.[0];
        return fefo ? { ...r, batchId: fefo.id } : r;
      }),
    );
  }, [batchesByVaccine]);

  const priceForBatch = (vaccineId: number, batchId: number | ""): string | null => {
    if (batchId === "") return null;
    const b = (batchesByVaccine.get(vaccineId) ?? []).find((x) => x.id === batchId);
    return b?.productPrice ?? null;
  };

  const setRowBatch = (idx: number, batchId: number | "") =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, batchId } : r)));
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const allHaveBatch = rows.length > 0 && rows.every((r) => r.batchId !== "");
  const canSave = branchId != null && patient != null && allHaveBatch && !busy;

  const submit = async () => {
    if (!patient || branchId == null) return;
    setBusy(true);
    setError(null);
    const iso = (administeredAt ?? dayjs()).toISOString();
    const snapshot = rows;
    const results = await Promise.allSettled(
      snapshot.map((r) =>
        createRecord(
          {
            patientId: patient.id,
            branchId,
            vaccineId: r.vaccineId,
            administeredAt: iso,
            doseNumber: r.doseNumber,
            batchId: r.batchId as number,
            injectionSite,
            administeredById: administeredById === "" ? undefined : (administeredById as number),
            appointmentId: appointmentId ?? undefined,
          },
          orgId,
        ),
      ),
    );
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
    const failedIdx = results
      .map((res, k) => (res.status === "rejected" ? k : -1))
      .filter((i) => i >= 0);
    setBusy(false);
    if (failedIdx.length === 0) {
      onClose();
    } else {
      // Успешные сохранены — оставляем только неудавшиеся, чтобы повтор не задвоил.
      setRows(snapshot.filter((_, i) => failedIdx.includes(i)));
      setError(`Сохранено ${snapshot.length - failedIdx.length} из ${snapshot.length}. Повторите для оставшихся.`);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
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
          Ввод прививок{rows.length ? ` (${rows.length})` : ""}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Закрыть" disabled={busy}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
        {error && <Alert severity="warning">{error}</Alert>}
        {branchId == null && <Alert severity="warning">Не выбран активный филиал.</Alert>}
        {patient && (
          <Typography variant="body2" color="text.secondary">
            Пациент: <b>{patient.fullName}</b>
          </Typography>
        )}

        {/* ── Общие поля ── */}
        <Stack direction="row" gap={2}>
          <CustomDatePicker
            label="Дата введения"
            value={administeredAt}
            onChange={(v) => setAdministeredAt(v as Dayjs | null)}
            format="DD.MM.YYYY"
            maxDate={dayjs()}
            slotProps={{ textField: { fullWidth: true } }}
          />
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
        </Stack>
        <TextField
          select
          label="Место укола"
          fullWidth
          value={injectionSite}
          onChange={(e) => setInjectionSite(e.target.value)}
          helperText="Применяется ко всем прививкам ниже"
        >
          {INJECTION_SITE_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>

        {/* ── Список доз ── */}
        <Typography variant="caption" color="text.secondary">
          Прививки
        </Typography>
        <Stack spacing={1.25}>
          {rows.map((r, idx) => {
            const list = batchesByVaccine.get(r.vaccineId) ?? [];
            const noBatch = list.length === 0;
            const price = priceForBatch(r.vaccineId, r.batchId);
            return (
              <Box
                key={`${r.vaccineId}-${r.doseNumber}`}
                sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: "10px" }}
              >
                <Stack direction="row" alignItems="center" gap={1} mb={noBatch ? 0 : 1}>
                  <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }} noWrap>
                    {r.vaccineName} · доза {r.doseNumber}
                  </Typography>
                  {price != null && (
                    <Typography variant="caption" color="text.secondary">
                      {price} сом
                    </Typography>
                  )}
                  <IconButton size="small" onClick={() => removeRow(idx)} aria-label="Убрать">
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </Stack>
                {noBatch ? (
                  <Typography variant="caption" color="error.main">
                    Нет партий на складе — уберите строку
                  </Typography>
                ) : (
                  <TextField
                    select
                    size="small"
                    label="Партия"
                    fullWidth
                    value={r.batchId === "" ? "" : String(r.batchId)}
                    onChange={(e) => setRowBatch(idx, e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    {list.map((b) => (
                      <MenuItem key={b.id} value={String(b.id)}>
                        №{b.batchNumber} · остаток {b.remaining} · до {dayjs(b.expiresAt).format("DD.MM.YYYY")}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </Box>
            );
          })}
          {rows.length === 0 && (
            <Typography variant="body2" color="text.disabled">
              Нет доз для ввода
            </Typography>
          )}
        </Stack>
      </Box>

      <Box sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 1.5 }}>
        <AppButton variant="outlined" onClick={onClose} sx={{ flex: 1 }} disabled={busy}>
          Отмена
        </AppButton>
        <AppButton variant="contained" sx={{ flex: 1 }} disabled={!canSave} onClick={submit}>
          Сохранить{rows.length ? ` (${rows.length})` : ""}
        </AppButton>
      </Box>
    </Drawer>
  );
};

export default BatchRecordVaccinationDrawer;
