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
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CardGiftcardOutlined from "@mui/icons-material/CardGiftcardOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import dayjs from "dayjs";

import { formatKGS } from "../../../utility/format";
import type { DjangoAppointment } from "../../../api/appointments";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLOR,
} from "../DjangoPaymentDrawer";
import {
  getStatusConfig,
  getStatusChipSx,
  normalizeDjangoStatus,
} from "../../../config/appointmentStatuses";

// Labels matching original MamaDoc crm.pediatr.kg statuses
export const APPT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Ожидаем",
  waiting: "Пациент здесь",
  in_progress: "Принимается",
  completed: "Завершён",
  cancelled: "Отменено",
  no_show: "Не пришёл",
};

export const PAYMENT_APPT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Не оплачен",
  partial: "Частично оплачен",
  paid: "Оплачено",
  overpaid: "Переплата",
  refunded: "Возврат",
};

export const APPT_STATUS_COLOR: Record<
  string,
  "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"
> = {
  scheduled: "default",
  waiting: "info",
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

  const hasPaid = appt.paidTotal && appt.paidTotal !== "0.00" && appt.paidTotal !== "0";
  const hasDebt = appt.debt && appt.debt !== "0.00" && appt.debt !== "0";

  const totalStr =
    appt.totalAmount && appt.totalAmount !== "0.00" && appt.totalAmount !== "0"
      ? formatKGS(appt.totalAmount)
      : null;

  const debtStr = hasDebt ? `долг ${formatKGS(appt.debt)}` : null;

  // Payment method icons — infer from payment status and available payment info
  // We check services or use paymentStatus as proxy
  const hasCashPayment = payStatus === "paid" || payStatus === "partial";
  const hasCardPayment = false; // we don't have per-method breakdown on row level
  const hasBalancePayment = false;

  // Display status using original getStatusChipSx (same colours as original MamaDoc)
  const displayStatus = normalizeDjangoStatus(appt.status);
  const statusCfg = getStatusConfig(displayStatus);
  const statusChipSx = getStatusChipSx(displayStatus);

  // Payment chip uses original status chip style too
  const payStatusSafe = payStatus ?? "";
  const payDisplayLabel = PAYMENT_APPT_STATUS_LABELS[payStatusSafe] ?? PAYMENT_STATUS_LABELS[payStatusSafe as keyof typeof PAYMENT_STATUS_LABELS] ?? payStatusSafe;
  const payChipSx = payStatusSafe ? getStatusChipSx(
    payStatusSafe === "paid" ? "Оплачено" :
    payStatusSafe === "partial" ? "Частично оплачено" :
    payStatusSafe === "unpaid" ? "Ожидаем" :
    payStatusSafe === "refunded" ? "Отменено" : "Ожидаем"
  ) : undefined;

  return (
    <Box
      onClick={() => onClick(appt)}
      sx={{
        px: { xs: 1.5, sm: 2 },
        py: 1.25,
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
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
        {/* Left: time + patient */}
        <Stack>
          <Stack direction="row" alignItems="center" gap={0.5}>
            {appt.isNight ? (
              <NightlightOutlined color="action" sx={{ fontSize: 14 }} />
            ) : (
              <WbSunnyOutlined sx={{ fontSize: 14, color: "warning.light" }} />
            )}
            <Typography variant="subtitle2" fontWeight={700}>{time}</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
            Пациент: {patientName}
          </Typography>
          {appt.patient?.phone && (
            <Typography variant="caption" color="text.disabled" noWrap>
              {appt.patient.phone}
            </Typography>
          )}
          {(serviceLabel || doctorLabel) && (
            <Stack direction="row" spacing={0.5} alignItems="center" mt={0.25}>
              {serviceLabel && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 140 }}>
                  {serviceLabel}
                </Typography>
              )}
              {serviceLabel && (
                <Typography variant="caption" color="text.disabled">·</Typography>
              )}
              <Typography
                variant="caption"
                color={uniqueEmployees.length === 0 ? "text.disabled" : "text.secondary"}
                noWrap sx={{ maxWidth: 120 }}
              >
                {doctorLabel}
              </Typography>
            </Stack>
          )}
        </Stack>

        {/* Right: status chips + total + action icons — like original AppointmentsList.tsx */}
        <Stack alignItems="flex-end" spacing={0.5}>
          <Stack direction="row" alignItems="center" gap={1}>
            {/* Appointment status chip — only when not completed/paid to reduce noise */}
            {appt.status !== "completed" && appt.status !== "scheduled" && (
              <Chip
                label={statusCfg.label}
                icon={statusCfg.icon}
                size="small"
                sx={statusChipSx}
              />
            )}

            {/* Payment status chip with method icons — like original */}
            {showPayCol && payStatusSafe && hasPaid && payChipSx && (
              <Chip
                label={
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <PaymentsOutlined sx={{ fontSize: 13 }} />
                    <span>{payDisplayLabel}</span>
                  </Stack>
                }
                size="small"
                sx={payChipSx}
              />
            )}
            {showPayCol && payStatusSafe && !hasPaid && payChipSx && (
              <Chip
                label={payDisplayLabel}
                size="small"
                sx={payChipSx}
              />
            )}

            {/* Conclusion icon like original */}
            {appt.hasMedicalConclusion && (
              <Tooltip title="Есть заключение">
                <PrintOutlinedIcon sx={{ fontSize: 18, color: "action.active", opacity: 0.8 }} />
              </Tooltip>
            )}
          </Stack>

          {/* Total amount */}
          {showPayCol && totalStr && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Итого: {totalStr}
            </Typography>
          )}
          {/* Debt highlight */}
          {showPayCol && debtStr && (
            <Typography variant="caption" color="warning.main" fontWeight={700}>
              {debtStr}
            </Typography>
          )}

          {/* Action icons — stop click bubbling */}
          <Stack direction="row" spacing={0} onClick={(e) => e.stopPropagation()}>
            {canManageFinance && (
              <Tooltip title={isCancelled ? "Недоступно для отменённых" : "Оплата"}>
                <span>
                  <IconButton size="small" onClick={() => onPay(appt)} disabled={isCancelled} sx={{ p: 0.5 }}>
                    <PaymentsOutlined sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {canUpdate && (
              <Tooltip title="Редактировать">
                <IconButton size="small" onClick={() => onEdit(appt)} sx={{ p: 0.5 }}>
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
