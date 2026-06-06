/**
 * PatientHistoryPanel — правая колонка «История приёмов» (Django mode).
 * 1-в-1 стиль оригинального PatientHistoryPanel из patient-search:
 *   - фильтр Врачи / Процедуры
 *   - статус-чипы через getStatusChipSx (оригинальные цвета)
 *   - кликабельные строки с датой, врачом, услугой, суммой, статусом
 */
import React from "react";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  List,
  ListItemButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { formatKGS } from "../../../utility/format";
import type { DjangoAppointment } from "../../../api/appointments";
import {
  getStatusConfig,
  getStatusChipSx,
  normalizeDjangoStatus,
} from "../../../config/appointmentStatuses";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLOR } from "../../appointments/DjangoPaymentDrawer";

type FilterType = "all" | "doctor" | "procedure";

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
      <Card variant="outlined" sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <CardHeader
          title={
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
              <Stack direction="row" alignItems="center" gap={1.25}>
                <HistoryOutlined color="primary" />
                <Typography variant="h6">История приёмов</Typography>
              </Stack>
              <Chip size="small" label={filtered.length} />
            </Stack>
          }
          subheader={
            <ToggleButtonGroup
              value={filter}
              exclusive
              onChange={(_, v) => setFilter((prev) => (prev === v ? "all" : (v ?? "all")))}
              size="small"
              sx={{ mt: 1 }}
            >
              <ToggleButton
                value="doctor"
                sx={{
                  px: 1.5,
                  py: 0.5,
                  fontSize: "0.75rem",
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    fontWeight: 700,
                    "&:hover": { bgcolor: "primary.dark" },
                  },
                }}
              >
                Врачи
              </ToggleButton>
              <ToggleButton
                value="procedure"
                sx={{
                  px: 1.5,
                  py: 0.5,
                  fontSize: "0.75rem",
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    fontWeight: 700,
                    "&:hover": { bgcolor: "primary.dark" },
                  },
                }}
              >
                Процедуры
              </ToggleButton>
            </ToggleButtonGroup>
          }
          sx={{ pb: 1 }}
        />
        <Divider />
        <CardContent sx={{ p: 0, flex: 1, overflowY: "auto", minHeight: 0, msOverflowStyle: "none", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
          {!selected ? (
            <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
              Выберите пациента слева
            </Typography>
          ) : loading ? (
            <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
              Загрузка…
            </Typography>
          ) : error ? (
            <Typography sx={{ p: 2 }} variant="body2" color="error" align="center">
              Ошибка: {error}
            </Typography>
          ) : filtered.length === 0 ? (
            <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
              История пуста
            </Typography>
          ) : (
            <List disablePadding sx={{ px: 1, py: 0.5 }}>
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
                  <ListItemButton
                    key={h.id}
                    onClick={() => onClick(h)}
                    sx={{
                      px: 2,
                      py: 1.25,
                      my: "5px",
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
                      alignItems: "flex-start",
                      "&:hover": { bgcolor: (t) => t.palette.action.hover },
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} sx={{ width: "100%" }}>
                      <Stack sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2">
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
                      <Stack alignItems="flex-end" spacing={0.5}>
                        {canViewFinance && total && (
                          <Typography variant="body2" color="text.secondary" fontWeight="medium">
                            {total}
                          </Typography>
                        )}
                        {/* Appointment status — оригинальные цвета */}
                        <Chip
                          label={statusCfg.label}
                          icon={statusCfg.icon}
                          size="small"
                          sx={statusChipSx}
                        />
                        {/* Payment status */}
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
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default PatientHistoryPanel;
