/**
 * PatientHistoryPanel — правая колонка «История приёмов» (Django mode).
 *   - фильтр Врачи / Процедуры (визуальный — Django appointments ещё без поля типа)
 *   - статус приёма и оплаты — через общий AppointmentStatusChips (одна логика
 *     со страницей «Приёмы», иначе оплаченный приём здесь выглядел «Ожидаем»)
 *   - кликабельные строки с датой, врачом, услугой, суммой, статусом
 */
import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { AppCard, ListEmptyState, ListLoadingSkeleton, SegmentedTabs } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { formatKGS } from "../../../utility/format";
import type { DjangoAppointment } from "../../../api/appointments";
import AppointmentStatusChips from "../../../components/appointments/AppointmentStatusChips";
import { useT } from "../../../i18n/VerticalProvider";

type FilterType = "all" | "doctor" | "procedure";

type Props = {
  selected: boolean;
  loading: boolean;
  error: string | null;
  history: DjangoAppointment[];
  canViewFinance: boolean;
  onClick: (appt: DjangoAppointment) => void;
};

/** Тип функции перевода — панель получает её из useT и прокидывает в хелперы. */
type TFunc = (key: string, options?: Record<string, unknown>) => string;

function doctorsLabel(appt: DjangoAppointment, t: TFunc): string {
  const names = Array.from(
    new Set(appt.services.filter((s) => s.employee).map((s) => s.employee!.fullName)),
  );
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return t("common:counts.performers", { count: names.length });
}

/**
 * Есть ли по приёму заключение: бэк не отдаёт hasMedicalConclusion, но шлёт по
 * каждой строке услуги conclusionState/conclusionId (та же логика, что в
 * AppointmentDetailsPanel).
 */
function hasConclusion(appt: DjangoAppointment): boolean {
  return appt.services.some(
    (sl) =>
      sl.conclusionId != null ||
      sl.conclusionState === "draft" ||
      sl.conclusionState === "completed",
  );
}

function servicesLabel(appt: DjangoAppointment, t: TFunc): string | null {
  if (appt.services.length === 0) return null;
  if (appt.services.length === 1) return appt.services[0].service?.name ?? null;
  return t("common:counts.services", { count: appt.services.length });
}

const PatientHistoryPanel: React.FC<Props> = ({
  selected,
  loading,
  error,
  history,
  canViewFinance,
  onClick,
}) => {
  const { t } = useT("patients");
  const [filter, setFilter] = React.useState<FilterType>("all");

  const filterTabs: { key: FilterType; label: string }[] = React.useMemo(
    () => [
      { key: "all", label: t("history.filterAll") },
      { key: "doctor", label: t("history.filterDoctor") },
      { key: "procedure", label: t("history.filterProcedure") },
    ],
    [t],
  );

  // Django appointments don't have an appointment_type field yet — filter is visual placeholder
  const filtered = React.useMemo(() => history, [history]);

  return (
    <Box sx={{ height: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <AppCard
        variant="outlined"
        header={
          <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" sx={{ mb: 1.25 }}>
              <Stack direction="row" alignItems="center" gap={1.25}>
                <HistoryOutlined color="primary" />
                <Typography variant="h6">{t("history.title")}</Typography>
              </Stack>
              {selected && !loading && !error && (
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {filtered.length}
                </Typography>
              )}
            </Stack>
            <SegmentedTabs layoutId="django-patient-history-filter" tabs={filterTabs} value={filter} onChange={setFilter} />
          </Box>
        }
        disableContentPadding
        sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <Box
          sx={{
            borderTop: 1,
            borderColor: "divider",
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            p: 1,
            msOverflowStyle: "none",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {!selected ? (
            <ListEmptyState
              icon={<HistoryOutlined />}
              title={t("history.notSelectedTitle")}
              description={t("history.notSelectedDescription")}
            />
          ) : loading ? (
            <ListLoadingSkeleton rows={5} />
          ) : error ? (
            <ListEmptyState icon={<ErrorOutlineOutlined />} title={t("errors.loadFailed")} description={error} />
          ) : filtered.length === 0 ? (
            <ListEmptyState
              icon={<EventBusyOutlined />}
              title={t("history.emptyTitle")}
              description={t("history.emptyDescription")}
            />
          ) : (
            <Stack spacing={0.75}>
              {filtered.map((h) => {
                const svc = servicesLabel(h, t);
                const total =
                  h.totalAmount && h.totalAmount !== "0.00" && h.totalAmount !== "0"
                    ? formatKGS(h.totalAmount)
                    : null;
                return (
                  <Box
                    key={h.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onClick(h)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onClick(h);
                      }
                    }}
                    sx={(t) => ({
                      p: 1.5,
                      borderRadius: "10px",
                      border: 1,
                      borderColor: "divider",
                      bgcolor: subtleBg(t),
                      cursor: "pointer",
                      transition: "background-color .15s ease, border-color .15s ease",
                      "&:hover": {
                        bgcolor: subtleBg(t, true),
                        borderColor: alpha(t.palette.primary.main, 0.28),
                      },
                    })}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                      <Stack sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {dayjs(h.scheduledAt).format("D MMMM YYYY, HH:mm")}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {t("history.specialistLabel")} {doctorsLabel(h, t)}
                        </Typography>
                        {svc && (
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {t("history.serviceLabel")} {svc}
                          </Typography>
                        )}
                      </Stack>
                      <Stack alignItems="flex-end" flexShrink={0} spacing={0.5}>
                        {canViewFinance && total && (
                          <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {total}
                          </Typography>
                        )}
                        <AppointmentStatusChips
                          appointment={h}
                          direction="column"
                          chipHeight={22}
                        />
                        {hasConclusion(h) && (
                          <Chip
                            label={t("history.conclusionChip")}
                            icon={<DescriptionOutlined />}
                            size="small"
                            color="info"
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.65rem", "& .MuiChip-icon": { fontSize: 14 } }}
                          />
                        )}
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
      </AppCard>
    </Box>
  );
};

export default PatientHistoryPanel;
