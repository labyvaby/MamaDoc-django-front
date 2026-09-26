import React from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useSnackbar } from "notistack";

import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";

import { AppButton } from "../../../components/ui";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { useCanChecker } from "../../../hooks/useCan";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import {
  addReactionNote,
  cancelExemption,
  cancelRecord,
  cancelRefusal,
  getExemptions,
  getPatientHistory,
  getPatientSchedule,
  getRecordAudit,
  getRefusals,
  type VaccinationRecord,
  type VaccinationScheduleSlot,
} from "../../../api/vaccinations";
import AdministerVaccinationDrawer from "../../../components/vaccinations/AdministerVaccinationDrawer";
import {
  ExemptionDialog,
  RefusalDialog,
} from "../../../components/vaccinations/ExemptionRefusalDialogs";
import { ageLabel, patientGaps } from "../../../components/vaccinations/patientGaps";
import type { DjangoPatient } from "../../../api/patients";
import {
  RecordStatusChip,
  ScheduleStatusChip,
} from "../../../components/vaccinations/VaccinationChips";
import { printVaccinationCertificate } from "../../../components/vaccinations/vaccinationCertificate";
import {
  EXEMPTION_KIND_OPTIONS,
  INN_ABSENT_REASON_OPTIONS,
  REFUSAL_REASON_OPTIONS,
  injectionSiteLabel,
  scheduleDateInfo,
} from "../../vaccinations/meta";

// Карточка пациента: календарь и история вакцин, медотводы и отказы. Ввод
// («со склада») делается из регистратуры по приёму, внешние — в модуле «Вакцины».
type PatientVaccinationsPanelProps = {
  patient: DjangoPatient | null;
  /** Открыть правку карточки (заполнить пол / дату рождения / ИНН). */
  onEditPatient?: () => void;
};

const GENDER_LABEL: Record<string, string> = { male: "Мужской", female: "Женский" };
const GAP_LABEL: Record<string, string> = {
  gender: "пол",
  birthDate: "дату рождения",
  inn: "ИНН (или причину, почему его нет)",
};
const ACTION_LABEL: Record<string, string> = {
  created: "Создана",
  updated: "Изменена",
  status_changed: "Оформлена",
  canceled: "Отменена",
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.4 }}>
    {children}
  </Typography>
);

type ScheduleGroup = {
  key: string;
  /** Подпись группы возраста («3 месяца»); для внекалендарных — «Вне календаря». */
  title: string;
  ageMonths: number | null;
  slots: VaccinationScheduleSlot[];
};

/**
 * Группировка слотов календаря по ageMonths (с 23.07.2026 слот несёт поля
 * шаблона нац. календаря). Слоты без ageMonths — отдельной группой в конце.
 */
function groupSlotsByAge(slots: VaccinationScheduleSlot[]): ScheduleGroup[] {
  const map = new Map<string, ScheduleGroup>();
  for (const slot of slots) {
    const key = slot.ageMonths == null ? "none" : String(slot.ageMonths);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        title:
          slot.ageMonths == null
            ? "Вне календаря"
            : slot.label || ageMonthsLabel(slot.ageMonths),
        ageMonths: slot.ageMonths,
        slots: [],
      };
      map.set(key, group);
    }
    group.slots.push(slot);
  }
  return [...map.values()].sort((a, b) => {
    if (a.ageMonths == null) return 1;
    if (b.ageMonths == null) return -1;
    return a.ageMonths - b.ageMonths;
  });
}

/** Человекочитаемая подпись возраста в месяцах, если бэк не прислал label. */
function ageMonthsLabel(months: number): string {
  if (months === 0) return "При рождении";
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} ${plural(years, "год", "года", "лет")}`;
  }
  return `${months} ${plural(months, "месяц", "месяца", "месяцев")}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const PatientVaccinationsPanel: React.FC<PatientVaccinationsPanelProps> = ({
  patient,
  onEditPatient,
}) => {
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { can } = useCanChecker();
  const canRecord = can("vaccinations.record");
  const patientId = patient?.id ?? null;

  const [exemptionOpen, setExemptionOpen] = React.useState(false);
  const [refusalOpen, setRefusalOpen] = React.useState(false);
  const [administerId, setAdministerId] = React.useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<VaccinationRecord | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [reactionTarget, setReactionTarget] = React.useState<VaccinationRecord | null>(null);
  const [reactionText, setReactionText] = React.useState("");
  const [auditId, setAuditId] = React.useState<number | null>(null);

  const exemptionsQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.exemptions({ patientId, orgId }),
    queryFn: ({ signal }) => getExemptions(patientId!, orgId, signal),
    enabled: patientId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const refusalsQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.refusals({ patientId, orgId }),
    queryFn: ({ signal }) => getRefusals(patientId!, orgId, signal),
    enabled: patientId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const auditQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.recordAudit(auditId ?? 0, orgId),
    queryFn: ({ signal }) => getRecordAudit(auditId!, orgId, signal),
    enabled: auditId != null,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
  const cancelMutation = useMutation({
    mutationFn: () => cancelRecord(cancelTarget!.id, orgId, cancelReason.trim()),
    onSuccess: () => {
      setCancelTarget(null);
      invalidate();
    },
  });
  const reactionMutation = useMutation({
    mutationFn: () => addReactionNote(reactionTarget!.id, reactionText.trim(), orgId),
    onSuccess: () => {
      setReactionTarget(null);
      invalidate();
    },
  });
  const liftMutation = useMutation({
    mutationFn: async (arg: { kind: "exemption" | "refusal"; id: number }): Promise<void> => {
      if (arg.kind === "exemption") await cancelExemption(arg.id, orgId);
      else await cancelRefusal(arg.id, orgId);
    },
    onSuccess: invalidate,
  });

  const scheduleQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.patientSchedule(patientId ?? 0),
    queryFn: ({ signal }) => getPatientSchedule(patientId!, orgId, signal),
    enabled: patientId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const historyQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.patientHistory(patientId ?? 0),
    queryFn: ({ signal }) => getPatientHistory(patientId!, orgId, signal),
    enabled: patientId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  if (!patient) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper",
        }}
      >
        <Typography color="text.secondary">Выберите пациента</Typography>
      </Box>
    );
  }

  const schedule = scheduleQuery.data ?? [];
  // «План» — ещё не сделанные дозы (planned/overdue/под медотводом); сделанные уходят в историю.
  const planned = schedule.filter(
    (s) => s.status === "planned" || s.status === "overdue" || s.status === "exempt",
  );
  const other = schedule.filter((s) => s.status === "skipped");
  const history = historyQuery.data ?? [];

  const loading = scheduleQuery.isLoading || historyQuery.isLoading;
  const error = scheduleQuery.error ?? historyQuery.error;

  const hasVaccData = history.length > 0 || schedule.length > 0;
  const gaps = patientGaps({
    gender: patient.gender === "male" || patient.gender === "female" ? patient.gender : "unknown",
    birthDate: patient.birthDate,
    inn: patient.inn ?? "",
    innAbsentReason: patient.innAbsentReason ?? "",
  });
  const exemptions = (exemptionsQuery.data ?? []).filter((e) => !e.isCanceled);
  const refusals = (refusalsQuery.data ?? []).filter((r) => !r.isCanceled);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* ── Данные пациента, без которых прививку не оформить ── */}
      <Box sx={{ mb: 1.5, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {GENDER_LABEL[patient.gender] ?? "Пол не указан"}
          {" · "}
          {patient.birthDate
            ? `${dayjs(patient.birthDate).format("DD.MM.YYYY")} (${ageLabel(patient.birthDate)})`
            : "дата рождения не указана"}
          {" · "}
          {patient.inn
            ? `ИНН ${patient.inn}`
            : INN_ABSENT_REASON_OPTIONS.find((o) => o.value === patient.innAbsentReason)?.label ??
              "ИНН не указан"}
        </Typography>
        {gaps.length > 0 && (
          <Alert
            severity="warning"
            sx={{ mt: 1, py: 0.25 }}
            action={
              onEditPatient && (
                <AppButton size="small" color="inherit" onClick={onEditPatient}>
                  Заполнить
                </AppButton>
              )
            }
          >
            Укажите {gaps.map((g) => GAP_LABEL[g]).join(", ")} — без этого прививку не оформить.
          </Alert>
        )}
      </Box>

      <Stack direction="row" gap={1} justifyContent="flex-end" flexWrap="wrap" sx={{ mb: 1.5, flexShrink: 0 }}>
        {canRecord && (
          <>
            <AppButton variant="outlined" size="small" onClick={() => setExemptionOpen(true)}>
              Медотвод
            </AppButton>
            <AppButton variant="outlined" size="small" onClick={() => setRefusalOpen(true)}>
              Отказ
            </AppButton>
          </>
        )}
        {hasVaccData && (
          <AppButton
            variant="outlined"
            size="small"
            startIcon={<PrintOutlined />}
            onClick={() => {
              if (!printVaccinationCertificate(patient, history, planned)) {
                enqueueSnackbar("Разрешите всплывающие окна, чтобы распечатать сертификат", {
                  variant: "warning",
                });
              }
            }}
          >
            Сертификат
          </AppButton>
        )}
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
        {error ? (
          <Alert severity="error">
            {error instanceof Error ? error.message : "Ошибка загрузки вакцин"}
          </Alert>
        ) : loading ? (
          <Stack spacing={1}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={56} />
            ))}
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            {(exemptions.length > 0 || refusals.length > 0) && (
              <Box>
                <SectionTitle>Медотводы и отказы</SectionTitle>
                <Stack spacing={1} sx={{ mt: 0.75 }}>
                  {exemptions.map((e) => (
                    <Stack key={`e${e.id}`} direction="row" alignItems="center" gap={1}>
                      <Chip
                        size="small"
                        color={e.isActive ? "warning" : "default"}
                        label={EXEMPTION_KIND_OPTIONS.find((o) => o.value === e.kind)?.label ?? e.kind}
                      />
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                        {e.vaccineName ?? "Все прививки"} · с {dayjs(e.startsOn).format("DD.MM.YYYY")}
                        {e.endsOn ? ` по ${dayjs(e.endsOn).format("DD.MM.YYYY")}` : ""} · {e.reason}
                      </Typography>
                      {canRecord && (
                        <AppButton
                          size="small"
                          variant="text"
                          onClick={() => liftMutation.mutate({ kind: "exemption", id: e.id })}
                        >
                          Снять
                        </AppButton>
                      )}
                    </Stack>
                  ))}
                  {refusals.map((r) => (
                    <Stack key={`r${r.id}`} direction="row" alignItems="center" gap={1}>
                      <Chip size="small" color="error" variant="outlined" label="Отказ" />
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                        {r.vaccineName ?? "Все прививки"} · {dayjs(r.refusedOn).format("DD.MM.YYYY")} ·{" "}
                        {REFUSAL_REASON_OPTIONS.find((o) => o.value === r.reason)?.label ?? r.reason}
                      </Typography>
                      {canRecord && (
                        <AppButton
                          size="small"
                          variant="text"
                          onClick={() => liftMutation.mutate({ kind: "refusal", id: r.id })}
                        >
                          Снять
                        </AppButton>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}

            {/* ── План ── */}
            <Box>
              <SectionTitle>Календарь вакцин</SectionTitle>
              {planned.length === 0 && other.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {patient.birthDate
                    ? "Нет запланированных вакцин."
                    : "Календарь строится от даты рождения — укажите её."}
                </Typography>
              ) : (
                <Stack spacing={2} sx={{ mt: 0.75 }}>
                  {groupSlotsByAge([...planned, ...other]).map((group) => (
                    <Box key={group.key}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontWeight: 600, display: "block", mb: 0.75, ml: 0.25 }}
                      >
                        {group.title}
                        {group.slots.some((s) => s.mandatory) && " · обязательные"}
                      </Typography>
                      <Stack spacing={1}>
                        {group.slots.map((slot) => {
                          const info = scheduleDateInfo(slot.scheduledDate, slot.status);
                          return (
                            <Stack
                              key={slot.id}
                              direction="row"
                              alignItems="center"
                              gap={1.5}
                              sx={{
                                px: 1.5,
                                py: 1,
                                border: 1,
                                borderColor: "divider",
                                borderRadius: "10px",
                                bgcolor: "background.paper",
                              }}
                            >
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={500} noWrap>
                                  {slot.vaccineName} · доза {slot.doseNumber}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: info.overdue ? "error.main" : info.soon ? "warning.main" : "text.secondary",
                                    fontWeight: info.overdue || info.soon ? 600 : 400,
                                  }}
                                >
                                  {dayjs(slot.scheduledDate).format("DD.MM.YYYY")} · {info.text}
                                  {slot.status === "exempt" &&
                                    ` · медотвод${slot.exemptionUntil ? ` до ${dayjs(slot.exemptionUntil).format("DD.MM.YYYY")}` : ""}`}
                                </Typography>
                              </Box>
                              <ScheduleStatusChip status={slot.status} />
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            <Divider />

            {/* ── История ── */}
            <Box>
              <SectionTitle>История вакцин</SectionTitle>
              {history.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Вакцины ещё не вводились.
                </Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 0.75 }}>
                  {history.map((rec) => (
                    <Stack
                      key={rec.id}
                      direction="row"
                      alignItems="center"
                      gap={1.5}
                      sx={{
                        px: 1.5,
                        py: 1,
                        border: 1,
                        borderColor: "divider",
                        borderRadius: "10px",
                        bgcolor: "background.paper",
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {rec.vaccineName}
                          {rec.doseNumber != null ? ` · доза ${rec.doseNumber}` : ""}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {dayjs(rec.administeredAt).format("DD.MM.YYYY")} ·{" "}
                          {rec.isExternal ? "внешняя" : "со склада"}
                          {rec.injectionSite ? ` · ${injectionSiteLabel(rec.injectionSite)}` : ""}
                          {rec.administeredBy ? ` · ${rec.administeredBy.fullName}` : ""}
                          {rec.reactionNotes ? ` · реакция: ${rec.reactionNotes}` : ""}
                        </Typography>
                      </Box>
                      <RecordStatusChip status={rec.status} />
                      {canRecord && rec.status === "draft" && (
                        <AppButton size="small" variant="contained" onClick={() => setAdministerId(rec.id)}>
                          Оформить
                        </AppButton>
                      )}
                      {canRecord && rec.status === "pending" && (
                        <>
                          <AppButton
                            size="small"
                            variant="text"
                            onClick={() => {
                              setReactionText(rec.reactionNotes ?? "");
                              setReactionTarget(rec);
                            }}
                          >
                            Реакция
                          </AppButton>
                          <AppButton
                            size="small"
                            variant="text"
                            color="error"
                            onClick={() => {
                              setCancelReason("");
                              setCancelTarget(rec);
                            }}
                          >
                            Отменить
                          </AppButton>
                        </>
                      )}
                      <Tooltip title="История правок">
                        <IconButton size="small" onClick={() => setAuditId(rec.id)}>
                          <HistoryOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        )}
      </Box>

      {/* Пустое состояние-иконка, когда совсем нет данных и не грузится */}
      {!loading && !error && schedule.length === 0 && history.length === 0 && (
        <Stack alignItems="center" sx={{ py: 4, opacity: 0.7 }}>
          <VaccinesOutlined sx={{ fontSize: 44, color: "text.disabled" }} />
        </Stack>
      )}

      <ExemptionDialog open={exemptionOpen} onClose={() => setExemptionOpen(false)} patientId={patientId} />
      <RefusalDialog open={refusalOpen} onClose={() => setRefusalOpen(false)} patientId={patientId} />
      <AdministerVaccinationDrawer
        open={administerId != null}
        recordId={administerId}
        onClose={() => setAdministerId(null)}
      />

      <Dialog open={cancelTarget != null} onClose={() => setCancelTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Отменить прививку?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {cancelMutation.isError && <Alert severity="error">Не удалось отменить</Alert>}
            <Typography variant="body2">
              {cancelTarget?.vaccineName} от {cancelTarget ? dayjs(cancelTarget.administeredAt).format("DD.MM.YYYY") : ""}.
              Продажа в приёме останется — её отменяют в самом приёме.
            </Typography>
            <TextField
              size="small"
              label="Причина *"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, justifyContent: "flex-end" }}>
          <AppButton variant="outlined" onClick={() => setCancelTarget(null)}>
            Нет
          </AppButton>
          <AppButton
            variant="contained"
            color="error"
            disabled={!cancelReason.trim() || cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            Отменить прививку
          </AppButton>
        </Stack>
      </Dialog>

      <Dialog open={reactionTarget != null} onClose={() => setReactionTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Реакция на прививку</DialogTitle>
        <DialogContent>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={3}
            sx={{ mt: 1 }}
            value={reactionText}
            onChange={(e) => setReactionText(e.target.value)}
            placeholder="Например: покраснение 1 см, t 37,5 на следующий день"
          />
        </DialogContent>
        <Stack direction="row" spacing={1.5} sx={{ px: 3, pb: 2, justifyContent: "flex-end" }}>
          <AppButton variant="outlined" onClick={() => setReactionTarget(null)}>
            Отмена
          </AppButton>
          <AppButton
            variant="contained"
            disabled={reactionMutation.isPending}
            onClick={() => reactionMutation.mutate()}
          >
            Сохранить
          </AppButton>
        </Stack>
      </Dialog>

      <Dialog open={auditId != null} onClose={() => setAuditId(null)} maxWidth="sm" fullWidth>
        <DialogTitle>История правок</DialogTitle>
        <DialogContent>
          {auditQuery.isLoading ? (
            <Skeleton variant="rounded" height={80} />
          ) : (auditQuery.data ?? []).length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Правок ещё не было.
            </Typography>
          ) : (
            <Stack spacing={1.25}>
              {(auditQuery.data ?? []).map((entry) => (
                <Box key={entry.id}>
                  <Typography variant="body2" fontWeight={600}>
                    {ACTION_LABEL[entry.action] ?? entry.action} ·{" "}
                    {dayjs(entry.createdAt).format("DD.MM.YYYY HH:mm")}
                    {entry.userName ? ` · ${entry.userName}` : ""}
                  </Typography>
                  {Object.entries(entry.changes).map(([field, [from, to]]) => (
                    <Typography key={field} variant="caption" color="text.secondary" display="block">
                      {field}: {String(from ?? "—")} → {String(to ?? "—")}
                    </Typography>
                  ))}
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default PatientVaccinationsPanel;
