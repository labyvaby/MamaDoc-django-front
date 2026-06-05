/**
 * PatientHistoryPanel — правая колонка «История приёмов» (Django mode).
 * Берёт приёмы пациента через Django appointments API (getAppointments({patientId})).
 * Без Supabase. Повторяет вид оригинального PatientHistoryPanel.
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
  Typography,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import type { DjangoAppointment } from "../../../api/appointments";
import { APPT_STATUS_LABELS, APPT_STATUS_COLOR } from "../../appointments/components/AppointmentRow";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLOR } from "../../appointments/DjangoPaymentDrawer";

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
  if (names.length === 0) return "Без врача";
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
              <Chip size="small" label={history.length} />
            </Stack>
          }
          sx={{ pb: 1 }}
        />
        <Divider />
        <CardContent sx={{ p: 0, flex: 1, overflowY: "auto", minHeight: 0 }}>
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
          ) : history.length === 0 ? (
            <Typography sx={{ p: 2 }} variant="body2" color="text.secondary" align="center">
              История пуста
            </Typography>
          ) : (
            <List disablePadding sx={{ px: 1, py: 0.5 }}>
              {history.map((h) => {
                const svc = servicesLabel(h);
                const total = h.totalAmount && h.totalAmount !== "0.00" && h.totalAmount !== "0"
                  ? `${h.totalAmount} с`
                  : null;
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
                      "&:hover": { bgcolor: (theme) => theme.palette.action.hover },
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
                        <Chip
                          label={APPT_STATUS_LABELS[h.status] ?? h.status}
                          size="small"
                          color={APPT_STATUS_COLOR[h.status] ?? "default"}
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
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
