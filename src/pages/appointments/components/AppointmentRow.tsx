import React from "react";
import {
  Box,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../api/appointments";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLOR,
} from "../DjangoPaymentDrawer";

export const APPT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Запланирован",
  waiting: "Ожидает",
  in_progress: "Принимается",
  completed: "Завершён",
  cancelled: "Отменён",
  no_show: "Не пришёл",
};

export const APPT_STATUS_COLOR: Record<
  string,
  "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"
> = {
  scheduled: "info",
  waiting: "warning",
  in_progress: "primary",
  completed: "success",
  cancelled: "error",
  no_show: "default",
};

interface AppointmentRowProps {
  appointment: DjangoAppointment;
  selected: boolean;
  canUpdate: boolean;
  canManageFinance: boolean;
  canViewFinance: boolean;
  onClick: (a: DjangoAppointment) => void;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
}

const AppointmentRow: React.FC<AppointmentRowProps> = ({
  appointment: appt,
  selected,
  canUpdate,
  canManageFinance,
  canViewFinance,
  onClick,
  onEdit,
  onPay,
}) => {
  const theme = useTheme();
  const time = dayjs(appt.scheduledAt).format("HH:mm");
  const patientName = appt.patient?.fullName ?? "Бронирование";

  // Collect unique employee names
  const uniqueEmployees = Array.from(
    new Map(
      appt.services
        .filter((sl) => sl.employee != null)
        .map((sl) => [sl.employee!.id, sl.employee!.fullName]),
    ).entries(),
  );

  const firstService = appt.services[0];
  const serviceLabel =
    appt.services.length === 0
      ? null
      : appt.services.length === 1
      ? firstService?.service?.name ?? null
      : `${appt.services.length} услуг`;

  const doctorLabel =
    uniqueEmployees.length === 0
      ? "Без врача"
      : uniqueEmployees.length === 1
      ? uniqueEmployees[0][1]
      : `${uniqueEmployees.length} исполнит.`;

  const payStatus = appt.paymentStatus;
  const isCancelled = appt.status === "cancelled" || appt.status === "no_show";
  const showPayCol = canViewFinance || canManageFinance;

  const totalStr =
    appt.totalAmount && appt.totalAmount !== "0.00" && appt.totalAmount !== "0"
      ? `Итого: ${appt.totalAmount} с`
      : null;

  const debtStr =
    appt.debt && appt.debt !== "0.00" && appt.debt !== "0"
      ? `долг ${appt.debt} с`
      : null;

  return (
    <Box
      onClick={() => onClick(appt)}
      sx={{
        px: { xs: 1.5, sm: 2 },
        py: 1,
        cursor: "pointer",
        bgcolor: selected
          ? alpha(theme.palette.primary.main, 0.08)
          : "transparent",
        borderLeft: selected
          ? `3px solid ${theme.palette.primary.main}`
          : "3px solid transparent",
        borderBottom: `1px solid ${theme.palette.divider}`,
        transition: "background 150ms",
        "&:hover": {
          bgcolor: selected
            ? alpha(theme.palette.primary.main, 0.1)
            : "action.hover",
        },
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        {/* Time + day/night icon */}
        <Box sx={{ flexShrink: 0, width: 44, pt: 0.25 }}>
          <Typography variant="body2" fontWeight={700} lineHeight={1.2}>
            {time}
          </Typography>
          {appt.isNight ? (
            <NightlightOutlined sx={{ fontSize: 11, color: "text.disabled" }} />
          ) : (
            <WbSunnyOutlined sx={{ fontSize: 11, color: "warning.light" }} />
          )}
        </Box>

        {/* Patient + service info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            fontWeight={600}
            noWrap
            sx={{ color: "text.primary" }}
          >
            {patientName}
          </Typography>
          {appt.patient?.phone && (
            <Typography
              variant="caption"
              color="text.disabled"
              noWrap
              display="block"
            >
              {appt.patient.phone}
            </Typography>
          )}
          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            flexWrap="wrap"
            mt={0.25}
          >
            {serviceLabel && (
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ maxWidth: 140 }}
              >
                {serviceLabel}
              </Typography>
            )}
            {serviceLabel && doctorLabel && (
              <Typography variant="caption" color="text.disabled">
                ·
              </Typography>
            )}
            <Typography
              variant="caption"
              color={uniqueEmployees.length === 0 ? "text.disabled" : "text.secondary"}
              noWrap
              sx={{ maxWidth: 120 }}
            >
              {doctorLabel}
            </Typography>
          </Stack>
        </Box>

        {/* Right side: amount + payment status + appointment status + actions */}
        <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0 }}>
          {showPayCol && totalStr && (
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              {totalStr}
            </Typography>
          )}
          {showPayCol && debtStr && (
            <Typography variant="caption" color="warning.main" fontWeight={600}>
              {debtStr}
            </Typography>
          )}
          {showPayCol && payStatus && (
            <Chip
              label={PAYMENT_STATUS_LABELS[payStatus] ?? payStatus}
              size="small"
              color={PAYMENT_STATUS_COLOR[payStatus] ?? "default"}
              variant="outlined"
              sx={{ height: 18, fontSize: "0.62rem", "& .MuiChip-label": { px: 0.75 } }}
            />
          )}
          <Chip
            label={APPT_STATUS_LABELS[appt.status] ?? appt.status}
            size="small"
            color={APPT_STATUS_COLOR[appt.status] ?? "default"}
            variant="outlined"
            sx={{ height: 18, fontSize: "0.62rem", "& .MuiChip-label": { px: 0.75 } }}
          />

          {/* Action icons — stop click from bubbling to row */}
          <Stack
            direction="row"
            spacing={0}
            onClick={(e) => e.stopPropagation()}
          >
            {canManageFinance && (
              <Tooltip
                title={isCancelled ? "Недоступно для отменённых" : "Оплата"}
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={() => onPay(appt)}
                    disabled={isCancelled}
                    sx={{ p: 0.5 }}
                  >
                    <PaymentsOutlined sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {canUpdate && (
              <Tooltip title="Редактировать">
                <IconButton
                  size="small"
                  onClick={() => onEdit(appt)}
                  sx={{ p: 0.5 }}
                >
                  <EditOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
};

export default AppointmentRow;
