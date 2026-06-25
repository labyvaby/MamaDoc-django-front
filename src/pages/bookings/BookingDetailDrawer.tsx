import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import PersonOffOutlined from "@mui/icons-material/PersonOffOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  getBooking,
  updateBookingStatus,
  type BookingManageStatus,
} from "../../api/bookings";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { BOOKING_STATUS_META } from "./meta";

interface Props {
  bookingId: number | null;
  canManage: boolean;
  onClose: () => void;
}

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={500}>
      {value}
    </Typography>
  </Box>
);

const BookingDetailDrawer: React.FC<Props> = ({ bookingId, canManage, onClose }) => {
  const open = bookingId != null;
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();

  const query = useQuery({
    queryKey: bookingId != null ? djangoQueryKeys.bookings.detail(bookingId) : ["bookings", "none"],
    queryFn: ({ signal }) => getBooking(bookingId as number, signal),
    enabled: open,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const mutation = useMutation({
    mutationFn: (status: BookingManageStatus) =>
      updateBookingStatus(bookingId as number, status),
    onSuccess: (data) => {
      queryClient.setQueryData(djangoQueryKeys.bookings.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.bookings.all });
      notify?.({ type: "success", message: "Статус обновлён" });
    },
    onError: (e) =>
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" }),
  });

  const b = query.data;
  const statusMeta = b ? BOOKING_STATUS_META[b.status] : null;
  const busy = mutation.isPending;

  // Контекстные действия: какие переходы статуса показывать.
  const actions: { status: BookingManageStatus; label: string; icon: React.ReactNode; color: "success" | "error" | "primary" | "inherit" }[] =
    b == null
      ? []
      : b.status === "pending"
        ? [
            { status: "confirmed", label: "Подтвердить", icon: <CheckCircleOutlined />, color: "success" },
            { status: "cancelled", label: "Отменить", icon: <CancelOutlined />, color: "error" },
          ]
        : b.status === "confirmed"
          ? [
              { status: "completed", label: "Завершена", icon: <EventAvailableOutlined />, color: "primary" },
              { status: "no_show", label: "Неявка", icon: <PersonOffOutlined />, color: "inherit" },
              { status: "cancelled", label: "Отменить", icon: <CancelOutlined />, color: "error" },
            ]
          : []; // terminal: completed / cancelled / no_show

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 440 }, maxWidth: "100vw" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5}>
        <Typography variant="h6">Бронь</Typography>
        <IconButton onClick={busy ? undefined : onClose}>
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />

      <Box sx={{ p: 2, overflowY: "auto" }}>
        {query.isLoading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        ) : query.error || !b ? (
          <Alert severity="error">
            {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
          </Alert>
        ) : (
          <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              {statusMeta && (
                <Chip label={statusMeta.label} color={statusMeta.color} size="small" />
              )}
              <Chip label={`Код: ${b.confirmationCode}`} size="small" variant="outlined" />
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={700}>
                {dayjs(b.date).format("D MMMM YYYY")}, {b.time}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
              <Field
                label="Пациент"
                value={
                  <>
                    {b.patientName}
                    {b.patientPhone && (
                      <Typography
                        variant="body2"
                        component="a"
                        href={`tel:${b.patientPhone}`}
                        sx={{ display: "block", color: "primary.main", textDecoration: "none" }}
                      >
                        {b.patientPhone}
                      </Typography>
                    )}
                  </>
                }
              />
              <Field label="Врач" value={b.doctorName || "—"} />
            </Stack>

            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
              <Field label="Сумма" value={formatKGS(b.totalPrice)} />
              <Field label="Длительность" value={`${b.totalDurationMin} мин`} />
              <Field label="ID брони (operator)" value={b.operatorBookingId || "—"} />
            </Stack>

            {/* Услуги (снимок из operator.kg) */}
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Услуги
              </Typography>
              {b.services && b.services.length > 0 ? (
                <Stack spacing={1}>
                  {b.services.map((s, i) => (
                    <Paper
                      key={i}
                      variant="outlined"
                      sx={{ p: 1.25, display: "flex", justifyContent: "space-between", gap: 1 }}
                    >
                      <Typography variant="body2">{s.name ?? "—"}</Typography>
                      {s.price != null && (
                        <Typography variant="body2" fontWeight={700}>
                          {formatKGS(s.price)}
                        </Typography>
                      )}
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Typography variant="caption" color="text.disabled">
                  Нет данных об услугах
                </Typography>
              )}
            </Box>

            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
              <Field
                label="Приём в CRM"
                value={b.appointmentId != null ? `#${b.appointmentId}` : "не материализована"}
              />
              <Field
                label="Синхронизирована"
                value={b.syncedAt ? dayjs(b.syncedAt).format("DD.MM.YYYY HH:mm") : "—"}
              />
            </Stack>

            {/* Действия смены статуса */}
            {canManage && actions.length > 0 && (
              <>
                <Divider />
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {actions.map((a) => (
                    <Button
                      key={a.status}
                      size="small"
                      variant={a.color === "error" || a.color === "inherit" ? "outlined" : "contained"}
                      color={a.color}
                      startIcon={busy ? <CircularProgress size={14} /> : a.icon}
                      disabled={busy}
                      onClick={() => mutation.mutate(a.status)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

export default BookingDetailDrawer;
