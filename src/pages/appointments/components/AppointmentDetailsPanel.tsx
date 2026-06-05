import React from "react";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import type { DjangoAppointment } from "../../../api/appointments";
import { getAppointmentPayments } from "../../../api/payments";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../api/queryKeys";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLOR,
} from "../DjangoPaymentDrawer";
import { APPT_STATUS_LABELS, APPT_STATUS_COLOR } from "./AppointmentRow";
import DjangoConclusionSlotsPanel from "../DjangoConclusionSlotsPanel";

interface AppointmentDetailsPanelProps {
  appointment: DjangoAppointment;
  canUpdate: boolean;
  canManageFinance: boolean;
  canViewFinance: boolean;
  canViewConclusions: boolean;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
  onClose?: () => void;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AppointmentDetailsPanel: React.FC<AppointmentDetailsPanelProps> = ({
  appointment: appt,
  canUpdate,
  canManageFinance,
  canViewFinance,
  canViewConclusions,
  onEdit,
  onPay,
  onClose,
}) => {
  const theme = useTheme();
  const [showConclusions, setShowConclusions] = React.useState(false);

  const payQuery = useQuery({
    queryKey: djangoQueryKeys.appointments.payments(appt.id),
    queryFn: ({ signal }) => getAppointmentPayments(appt.id, signal),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    enabled: canViewFinance || canManageFinance,
  });

  const pay = payQuery.data;
  const payStatus = pay?.paymentStatus ?? appt.paymentStatus;
  const isCancelled = appt.status === "cancelled" || appt.status === "no_show";

  const servicesByEmployee = React.useMemo(() => {
    const map = new Map<string, { employeeName: string; employeeId: number | null; services: typeof appt.services }>();
    for (const sl of appt.services) {
      const key = sl.employee ? String(sl.employee.id) : "__no_doc__";
      if (!map.has(key)) {
        map.set(key, {
          employeeId: sl.employee?.id ?? null,
          employeeName: sl.employee?.fullName ?? "Без врача",
          services: [],
        });
      }
      map.get(key)!.services.push(sl);
    }
    return Array.from(map.values());
  }, [appt.services]);

  const totalAmount = pay?.totalAmount ?? appt.totalAmount;
  const paidTotal = pay?.paidTotal;
  const debt = pay?.debt ?? appt.debt;
  const discountAmount = pay?.discountAmount ?? appt.discountAmount;
  const hasPayment = paidTotal && paidTotal !== "0.00" && paidTotal !== "0";
  const hasFinanceInfo = totalAmount && totalAmount !== "0.00" && totalAmount !== "0";

  // Payment method breakdown from payments array
  const hasCash = pay?.payments?.some(p => p.method === "cash") ?? false;
  const hasCard = pay?.payments?.some(p => p.method === "card") ?? false;
  const hasBalance = pay?.payments?.some(p => p.method === "balance") ?? false;

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <CardHeader
        sx={{
          px: 2.5,
          py: 1.25,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiCardHeader-content": { minWidth: 0, overflow: "hidden" },
          "& .MuiCardHeader-action": { mt: 0, alignSelf: "center" },
        }}
        title={
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {appt.patient?.fullName ?? "Бронирование"}
            </Typography>
            <Chip
              label={APPT_STATUS_LABELS[appt.status] ?? appt.status}
              size="small"
              color={APPT_STATUS_COLOR[appt.status] ?? "default"}
              variant="filled"
              sx={{ height: 20, fontSize: "0.65rem" }}
            />
            {payStatus && (canViewFinance || canManageFinance) && (
              <Chip
                label={PAYMENT_STATUS_LABELS[payStatus] ?? payStatus}
                size="small"
                color={PAYMENT_STATUS_COLOR[payStatus] ?? "default"}
                variant="outlined"
                sx={{ height: 20, fontSize: "0.65rem" }}
              />
            )}
          </Stack>
        }
        action={
          onClose && (
            <IconButton size="small" onClick={onClose} sx={{ ml: 1 }}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          )
        }
      />

      <CardContent
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          p: 2.5,
          "&:last-child": { pb: 2.5 },
          msOverflowStyle: "none",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack spacing={2.5}>
          {/* Date / time */}
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <CalendarMonthOutlined sx={{ fontSize: 20, color: "primary.main" }} />
            <Typography variant="h6" fontWeight={700}>
              {dayjs(appt.scheduledAt).format("D MMMM YYYY, HH:mm")}
            </Typography>
            {appt.isNight && (
              <NightlightOutlined sx={{ fontSize: 18, color: "primary.main" }} />
            )}
          </Stack>

          {/* Patient card */}
          {appt.patient && (
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Пациент
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  display: "flex",
                  alignItems: "center",
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  borderColor: alpha(theme.palette.primary.main, 0.15),
                  borderRadius: 1.5,
                }}
              >
                <Avatar
                  sx={{
                    width: 44,
                    height: 44,
                    mr: 1.5,
                    bgcolor: "primary.light",
                    color: "primary.contrastText",
                    fontWeight: 700,
                  }}
                >
                  {initials(appt.patient.fullName)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" fontWeight={600} noWrap>
                    {appt.patient.fullName}
                  </Typography>
                  {appt.patient.phone && (
                    <Typography
                      variant="body2"
                      color="primary"
                      component="a"
                      href={`tel:${appt.patient.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                      noWrap
                    >
                      {appt.patient.phone}
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Box>
          )}

          <Divider />

          {/* Services grouped by doctor */}
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Услуги и специалисты
            </Typography>
            {appt.services.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{ p: 2, bgcolor: alpha(theme.palette.primary.main, 0.02), borderRadius: 1.5 }}
              >
                <Typography variant="body2" color="text.disabled">Услуги не указаны</Typography>
              </Paper>
            ) : (
              <Stack spacing={1.5}>
                {servicesByEmployee.map((group) => (
                  <Box key={group.employeeId ?? "__no_doc__"}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        mb: 0.75,
                        display: "flex",
                        alignItems: "center",
                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                        borderColor: alpha(theme.palette.primary.main, 0.12),
                        borderRadius: 1.5,
                      }}
                    >
                      <Avatar
                        sx={{
                          width: 32,
                          height: 32,
                          mr: 1.5,
                          bgcolor: group.employeeId ? "primary.main" : "action.selected",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          color: group.employeeId ? "primary.contrastText" : "text.secondary",
                        }}
                      >
                        {group.employeeId ? initials(group.employeeName) : "?"}
                      </Avatar>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {group.employeeName}
                      </Typography>
                    </Paper>

                    <Stack spacing={0.5} sx={{ pl: 1.5 }}>
                      {group.services.map((sl) => (
                        <Paper
                          key={sl.id}
                          variant="outlined"
                          sx={{
                            p: 1.25,
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            borderRadius: 1.5,
                            bgcolor: "background.paper",
                          }}
                        >
                          <Avatar
                            variant="rounded"
                            sx={{
                              width: 36,
                              height: 36,
                              bgcolor: "action.selected",
                              color: "text.secondary",
                              flexShrink: 0,
                            }}
                          >
                            <MedicalServicesOutlined fontSize="small" />
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {sl.service?.name ?? "—"}
                            </Typography>
                            {sl.quantity > 1 && (
                              <Typography variant="caption" color="text.secondary">
                                × {sl.quantity}
                              </Typography>
                            )}
                          </Box>
                          <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>
                            {sl.price} с
                          </Typography>
                        </Paper>
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          {/* Payment summary */}
          {(canViewFinance || canManageFinance) && (
            <>
              <Divider />
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <Typography variant="caption" color="text.secondary">Оплата</Typography>
                  {payQuery.isLoading && <CircularProgress size={10} />}
                </Stack>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.02), borderRadius: 1.5 }}
                >
                  <Stack spacing={0.5}>
                    {hasFinanceInfo && (
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">Итого</Typography>
                        <Typography variant="caption" fontWeight={600}>{totalAmount} с</Typography>
                      </Stack>
                    )}
                    {discountAmount && discountAmount !== "0.00" && discountAmount !== "0" && (
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">Скидка</Typography>
                        <Typography variant="caption" color="info.main" fontWeight={600}>-{discountAmount} с</Typography>
                      </Stack>
                    )}
                    {pay?.payableAmount && pay.payableAmount !== "0.00" && (
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">К оплате</Typography>
                        <Typography variant="caption" fontWeight={600}>{pay.payableAmount} с</Typography>
                      </Stack>
                    )}
                    {hasPayment && (
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="caption" color="text.secondary">Оплачено</Typography>
                          {hasCash && (
                            <Tooltip title="Наличные"><PaymentsOutlined sx={{ fontSize: 13, color: "success.main" }} /></Tooltip>
                          )}
                          {hasCard && (
                            <Tooltip title="Карта"><CreditCardOutlined sx={{ fontSize: 13, color: "info.main" }} /></Tooltip>
                          )}
                          {hasBalance && (
                            <Tooltip title="Баланс"><AccountBalanceWalletOutlined sx={{ fontSize: 13, color: "warning.main" }} /></Tooltip>
                          )}
                        </Stack>
                        <Typography variant="caption" color="success.main" fontWeight={700}>{paidTotal} с</Typography>
                      </Stack>
                    )}
                    {debt && debt !== "0.00" && debt !== "0" && (
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">Долг</Typography>
                        <Typography variant="caption" color="warning.main" fontWeight={700}>{debt} с</Typography>
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              </Box>
            </>
          )}

          {/* Complaints */}
          {(appt.complaints || appt.adminComment) && (
            <>
              <Divider />
              <Stack spacing={1.5}>
                {appt.complaints && (
                  <Box>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
                      Жалобы пациента
                    </Typography>
                    <Typography variant="body2" sx={{ bgcolor: "background.paper", p: 1.25, borderRadius: 1, border: "1px solid", borderColor: "divider", whiteSpace: "pre-wrap" }}>
                      {appt.complaints}
                    </Typography>
                  </Box>
                )}
                {appt.adminComment && (
                  <Box>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
                      Комментарий администратора
                    </Typography>
                    <Typography variant="body2" sx={{ bgcolor: "background.paper", p: 1.25, borderRadius: 1, border: "1px solid", borderColor: "divider", whiteSpace: "pre-wrap" }}>
                      {appt.adminComment}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </>
          )}

          {/* Conclusions */}
          {canViewConclusions && showConclusions && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={1}>
                  Заключения
                </Typography>
                <DjangoConclusionSlotsPanel appointmentId={appt.id} />
              </Box>
            </>
          )}
        </Stack>
      </CardContent>

      {/* Action buttons */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          borderTop: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          bgcolor: "background.paper",
        }}
      >
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {canUpdate && (
            <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => onEdit(appt)}>
              Изменить
            </Button>
          )}
          {canViewConclusions && (
            <Button
              size="small"
              variant={showConclusions ? "contained" : "outlined"}
              startIcon={<DescriptionOutlined />}
              onClick={() => setShowConclusions((v) => !v)}
            >
              Заключение
            </Button>
          )}
          {canManageFinance && (
            <Button
              size="small"
              variant={hasPayment ? "outlined" : "contained"}
              color={hasPayment ? "primary" : "success"}
              startIcon={<PaymentsOutlined />}
              onClick={() => onPay(appt)}
              disabled={isCancelled}
            >
              {hasPayment ? "Изменить оплату" : "Принять оплату"}
            </Button>
          )}
        </Stack>
      </Box>
    </Card>
  );
};

export default AppointmentDetailsPanel;
