/**
 * PatientHistoryPanel — правая колонка «История приёмов» (Django mode).
 *   - фильтр Врачи / Процедуры (визуальный — Django appointments ещё без поля типа)
 *   - статус-чипы через getStatusChipSx (оригинальные цвета)
 *   - кликабельные строки с датой, врачом, услугой, суммой, статусом
 */
import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { AppCard, ListEmptyState, ListLoadingSkeleton, SegmentedTabs } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { formatKGS } from "../../../utility/format";
import type { DjangoAppointment } from "../../../api/appointments";
import {
  getStatusConfig,
  getStatusChipSx,
  normalizeDjangoStatus,
} from "../../../config/appointmentStatuses";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLOR } from "../../appointments/DjangoPaymentDrawer";

type FilterType = "all" | "doctor" | "procedure";

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "doctor", label: "Врачи" },
  { key: "procedure", label: "Процедуры" },
];

type Props = {
  selected: boolean;
  loading: boolean;
  error: string | null;
  history: DjangoAppointment[];
  canViewFinance: boolean;
  onClick: (appt: DjangoAppointment) => void;
};

function doctorsLabel(appt: DjangoAppointment): string {
  const names = Array.from(
    new Set(appt.services.filter((s) => s.employee).map((s) => s.employee!.fullName)),
  );
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return `${names.length} исполнит.`;
}

function servicesLabel(appt: DjangoAppointment): string | null {
  if (appt.services.length === 0) return null;
  if (appt.services.length === 1) return appt.services[0].service?.name ?? null;
  return `${appt.services.length} услуг`;
}

const PatientHistoryPanel: React.FC<Props> = ({
  selected,
  loading,
  error,
  history,
  canViewFinance,
  onClick,
}) => {
  const [filter, setFilter] = React.useState<FilterType>("all");

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
                <Typography variant="h6">История приёмов</Typography>
              </Stack>
              {selected && !loading && !error && (
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {filtered.length}
                </Typography>
              )}
            </Stack>
            <SegmentedTabs layoutId="django-patient-history-filter" tabs={FILTER_TABS} value={filter} onChange={setFilter} />
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
              title="Пациент не выбран"
              description="Выберите пациента слева, чтобы увидеть историю приёмов"
            />
          ) : loading ? (
            <ListLoadingSkeleton rows={5} />
          ) : error ? (
            <ListEmptyState icon={<ErrorOutlineOutlined />} title="Не удалось загрузить" description={error} />
          ) : filtered.length === 0 ? (
            <ListEmptyState
              icon={<EventBusyOutlined />}
              title="История пуста"
              description="У пациента ещё не было приёмов"
            />
          ) : (
            <Stack spacing={0.75}>
              {filtered.map((h) => {
                const svc = servicesLabel(h);
                const total =
                  h.totalAmount && h.totalAmount !== "0.00" && h.totalAmount !== "0"
                    ? formatKGS(h.totalAmount)
                    : null;
                const displayStatus = normalizeDjangoStatus(h.status);
                const statusCfg = getStatusConfig(displayStatus);
                const statusChipSx = getStatusChipSx(displayStatus);

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
                          Врач: {doctorsLabel(h)}
                        </Typography>
                        {svc && (
                          <Typography variant="body2" color="text.secondary" noWrap>
                            Услуга: {svc}
                          </Typography>
                        )}
                      </Stack>
                      <Stack alignItems="flex-end" flexShrink={0} spacing={0.5}>
                        {canViewFinance && total && (
                          <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {total}
                          </Typography>
                        )}
                        <Chip label={statusCfg.label} icon={statusCfg.icon} size="small" sx={statusChipSx} />
                        {canViewFinance && h.paymentStatus && (
                          <Chip
                            label={PAYMENT_STATUS_LABELS[h.paymentStatus] ?? h.paymentStatus}
                            size="small"
                            color={PAYMENT_STATUS_COLOR[h.paymentStatus] ?? "default"}
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.65rem" }}
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
