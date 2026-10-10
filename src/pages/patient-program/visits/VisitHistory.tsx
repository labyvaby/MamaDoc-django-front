import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import FilterListOutlined from "@mui/icons-material/FilterListOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../api/appointments";
import type { PatientConclusionRow } from "../../../api/medical";
import { AppButton, AppCard, FilterPill, ListEmptyState, ListLoadingSkeleton, SegmentedTabs } from "../../../components/ui";
import { pluralRu } from "../../../utility/amountInWords";
import { TodayRow, VisitRow, YearRow } from "./VisitRow";
import { VisitSummaryTiles } from "./VisitSummaryTiles";
import {
  buildVisits,
  doctorOptions,
  filterVisits,
  railSegments,
  timelineItems,
  visitCounts,
  visitSummary,
  type VisitFilter,
} from "./visitsData";

const PAGE = 15;

interface VisitHistoryProps {
  loading: boolean;
  error: string | null;
  appointments: ReadonlyArray<DjangoAppointment>;
  conclusions: ReadonlyArray<PatientConclusionRow>;
  birthDate: string | null;
  canViewFinance: boolean;
  specialization: (doctorId: number) => string | null;
  onOpen: (appointment: DjangoAppointment) => void;
}

/**
 * «Приёмы» книжки — лента по времени: впереди пунктиром, отметка
 * «сегодня», прошедшие по годам. У приёма — возраст ребёнка в тот день,
 * диагнозы из заключения, врач и статус; отменённые приглушены.
 */
export const VisitHistory: React.FC<VisitHistoryProps> = ({
  loading,
  error,
  appointments,
  conclusions,
  birthDate,
  canViewFinance,
  specialization,
  onOpen,
}) => {
  const [filter, setFilter] = React.useState<VisitFilter>("all");
  const [doctorId, setDoctorId] = React.useState<number | null>(null);
  const [limit, setLimit] = React.useState(PAGE);
  // «Сейчас» фиксируем на время показа раздела, чтобы лента не перестраивалась на ходу.
  const now = React.useMemo(() => dayjs(), []);

  const visits = React.useMemo(
    () => buildVisits(appointments, { birthDate, conclusions, now }),
    [appointments, birthDate, conclusions, now],
  );
  const counts = React.useMemo(() => visitCounts(visits), [visits]);
  const summary = React.useMemo(() => visitSummary(visits, now), [visits, now]);
  const doctors = React.useMemo(() => doctorOptions(filterVisits(visits, filter, null)), [visits, filter]);
  const filtered = React.useMemo(() => filterVisits(visits, filter, doctorId), [visits, filter, doctorId]);
  const shown = filtered.slice(0, limit);
  const items = React.useMemo(() => timelineItems(shown, now), [shown, now]);
  const segments = React.useMemo(() => railSegments(items, now), [items, now]);
  const showBranch = React.useMemo(() => new Set(visits.map((visit) => visit.appointment.branchId)).size > 1, [visits]);

  React.useEffect(() => {
    setLimit(PAGE);
  }, [filter, doctorId]);
  // Врач пропал из выборки после смены фазы — фильтр по нему снимаем.
  React.useEffect(() => {
    if (doctorId != null && !doctors.some((doctor) => doctor.id === doctorId)) setDoctorId(null);
  }, [doctors, doctorId]);

  const subtitle = loading
    ? "Загрузка…"
    : summary.pastCount
      ? [
          `${summary.pastCount} ${pluralRu(summary.pastCount, ["приём", "приёма", "приёмов"])}${
            summary.firstAt ? ` с ${dayjs(summary.firstAt).format("D MMMM YYYY")}` : ""
          }`,
          summary.doctorsCount ? `${summary.doctorsCount} ${pluralRu(summary.doctorsCount, ["врач", "врача", "врачей"])}` : "",
          summary.withConclusion ? `${summary.withConclusion} с заключением` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "Приёмы ребёнка во всех филиалах клиники";
  const rest = filtered.length - shown.length;
  const more = Math.min(PAGE * 2, rest);

  let visitIndex = 0;
  return (
    <AppCard
      variant="outlined"
      header={
        <Box sx={{ px: 2, pt: 2 }}>
          <Typography variant="h6" fontWeight={700}>
            Приёмы
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
      }
    >
      {error ? (
        <Alert severity="error">Не удалось загрузить приёмы: {error}</Alert>
      ) : loading ? (
        <ListLoadingSkeleton rows={4} />
      ) : !visits.length ? (
        <ListEmptyState
          icon={<MedicalServicesOutlined />}
          title="Приёмов пока не было"
          description="Записи ребёнка к врачам появятся здесь сами — из расписания клиники."
        />
      ) : (
        <Stack gap={2.25}>
          <VisitSummaryTiles summary={summary} now={now} />

          <Stack direction={{ xs: "column", md: "row" }} gap={1.25} alignItems={{ xs: "flex-start", md: "center" }} justifyContent="space-between">
            <Box sx={{ overflowX: "auto", maxWidth: "100%", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
              <SegmentedTabs<VisitFilter>
                layoutId="book-visit-filter"
                value={filter}
                onChange={setFilter}
                tabs={[
                  { key: "all", label: "Все", badge: counts.all },
                  { key: "upcoming", label: "Впереди", badge: counts.upcoming },
                  { key: "past", label: "Были", badge: counts.past },
                  { key: "cancelled", label: "Отменены", badge: counts.cancelled },
                ]}
              />
            </Box>
            {doctors.length > 1 && (
              <FilterPill
                label="Врач"
                icon={<FilterListOutlined />}
                value={doctorId == null ? "" : String(doctorId)}
                allLabel="Все врачи"
                options={doctors.map((doctor) => ({ value: String(doctor.id), label: `${doctor.name} · ${doctor.count}` }))}
                onChange={(value) => setDoctorId(value ? Number(value) : null)}
              />
            )}
          </Stack>

          {!filtered.length ? (
            <ListEmptyState icon={<EventBusyOutlined />} title="Здесь пусто" description="Под выбранный фильтр приёмов нет." />
          ) : (
            <Box>
              {items.map((item, index) => {
                const segment = segments[index];
                if (item.kind === "year") {
                  return <YearRow key={item.key} year={item.year} count={item.count} top={segment.top} bottom={segment.bottom} />;
                }
                if (item.kind === "today") {
                  return <TodayRow key={item.key} now={now} top={segment.top} bottom={segment.bottom} />;
                }
                const position = visitIndex;
                visitIndex += 1;
                return (
                  <VisitRow
                    key={item.key}
                    visit={item.visit}
                    index={position}
                    top={segment.top}
                    bottom={segment.bottom}
                    specialization={specialization}
                    showBranch={showBranch}
                    canViewFinance={canViewFinance}
                    onOpen={onOpen}
                  />
                );
              })}
              {rest > 0 && (
                <Box sx={{ pl: { xs: "80px", md: "132px" }, pt: 0.5 }}>
                  <AppButton variant="outlined" size="small" onClick={() => setLimit((value) => value + PAGE * 2)}>
                    {more < rest ? `Показать ещё ${more} из ${rest}` : `Показать ещё ${rest}`}
                  </AppButton>
                </Box>
              )}
            </Box>
          )}
        </Stack>
      )}
    </AppCard>
  );
};
