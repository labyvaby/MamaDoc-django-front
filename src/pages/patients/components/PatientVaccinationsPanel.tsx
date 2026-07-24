import React from "react";
import { Alert, Box, Divider, Skeleton, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";

import { AppButton } from "../../../components/ui";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import {
  getPatientHistory,
  getPatientSchedule,
  type VaccinationScheduleSlot,
} from "../../../api/vaccinations";
import type { DjangoPatient } from "../../../api/patients";
import {
  RecordStatusChip,
  ScheduleStatusChip,
} from "../../../components/vaccinations/VaccinationChips";
import { printVaccinationCertificate } from "../../../components/vaccinations/vaccinationCertificate";
import { injectionSiteLabel, scheduleDateInfo } from "../../vaccinations/meta";

// Карточка пациента — только просмотр календаря/истории прививок. Ввод
// («со склада») делается из регистратуры по приёму, внешние — в модуле «Прививки».
type PatientVaccinationsPanelProps = {
  patient: DjangoPatient | null;
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

const PatientVaccinationsPanel: React.FC<PatientVaccinationsPanelProps> = ({ patient }) => {
  const orgId = useApiOrgId();
  const patientId = patient?.id ?? null;

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
  // «План» — ещё не сделанные дозы (planned/overdue); сделанные уходят в историю.
  const planned = schedule.filter((s) => s.status === "planned" || s.status === "overdue");
  const other = schedule.filter((s) => s.status === "skipped");
  const history = historyQuery.data ?? [];

  const loading = scheduleQuery.isLoading || historyQuery.isLoading;
  const error = scheduleQuery.error ?? historyQuery.error;

  const hasVaccData = history.length > 0 || schedule.length > 0;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {hasVaccData && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1.5, flexShrink: 0 }}>
          <AppButton
            variant="outlined"
            startIcon={<PrintOutlined />}
            onClick={() => printVaccinationCertificate(patient, history, planned)}
          >
            Сертификат
          </AppButton>
        </Stack>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
        {error ? (
          <Alert severity="error">
            {error instanceof Error ? error.message : "Ошибка загрузки прививок"}
          </Alert>
        ) : loading ? (
          <Stack spacing={1}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={56} />
            ))}
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            {/* ── План ── */}
            <Box>
              <SectionTitle>Календарь прививок</SectionTitle>
              {planned.length === 0 && other.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Нет запланированных прививок.
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
              <SectionTitle>История прививок</SectionTitle>
              {history.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Прививки ещё не вводились.
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
                          {rec.vaccineName} · доза {rec.doseNumber}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {dayjs(rec.administeredAt).format("DD.MM.YYYY")} ·{" "}
                          {rec.isExternal ? "внешняя" : "со склада"} · {injectionSiteLabel(rec.injectionSite)}
                          {rec.administeredBy ? ` · ${rec.administeredBy.fullName}` : ""}
                        </Typography>
                      </Box>
                      <RecordStatusChip status={rec.status} />
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
    </Box>
  );
};

export default PatientVaccinationsPanel;
