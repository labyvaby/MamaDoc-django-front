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
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import PersonOffOutlined from "@mui/icons-material/PersonOffOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import CallOutlined from "@mui/icons-material/CallOutlined";
import ChatOutlined from "@mui/icons-material/ChatOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { useNavigate } from "react-router";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import {
  getBooking,
  updateBookingStatus,
  type BookingDetail,
  type BookingManageStatus,
  type BookingStatusExtras,
} from "../../api/bookings";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { bookingCodeUrl } from "../public-booking/format";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { subtleBg } from "../../theme/uiHelpers";
import { ConfirmDialog, UserAvatar } from "../../components/ui";
import {
  bookingTimeHint,
  bookingTimeRange,
  isTerminalBookingStatus,
  StatusChip,
} from "./meta";
import ConfirmBookingDialog from "./ConfirmBookingDialog";
import { useT } from "../../i18n/VerticalProvider";

interface Props {
  bookingId: number | null;
  canManage: boolean;
  onClose: () => void;
  /**
   * Брони текущей страницы списка — для перехода к соседней прямо из карточки.
   * Разбирая «Ожидает», регистратор идёт по списку подряд, и закрывать дровер
   * ради следующей заявки незачем.
   */
  siblingIds?: number[];
  onNavigate?: (id: number) => void;
}

// ── Мелкие блоки ──────────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box sx={{ minWidth: 120 }}>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={500} component="div">
      {value}
    </Typography>
  </Box>
);

/** Секция карточки: иконка + заголовок + содержимое (стиль ConfirmBookingDialog). */
const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <Stack spacing={1.25}>
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box sx={{ display: "flex", color: "text.secondary", "& svg": { fontSize: 18 } }}>{icon}</Box>
      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
        {title}
      </Typography>
    </Stack>
    {children}
  </Stack>
);

/** Только цифры номера — формат, который понимает wa.me. */
const waDigits = (phone: string): string => phone.replace(/\D/g, "");

// ── Компонент ─────────────────────────────────────────────────────────────────

const BookingDetailDrawer: React.FC<Props> = ({
  bookingId,
  canManage,
  onClose,
  siblingIds,
  onNavigate,
}) => {
  const { t } = useT("bookings");
  const open = bookingId != null;
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const navigate = useNavigate();
  // Витрина одна на все организации — карточку записи открываем в своей клинике.
  const { activeOrganization } = usePermissions();
  const canOpenAppointments = useCan("appointments.registry.view");
  const canCreateAppointment = useCan("appointments.create");
  const canViewPatients = useCan("patients.view");

  const query = useQuery({
    queryKey: bookingId != null ? djangoQueryKeys.bookings.detail(bookingId) : ["bookings", "none"],
    queryFn: ({ signal }) => getBooking(bookingId as number, signal),
    enabled: open,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const mutation = useMutation({
    mutationFn: (vars: { status: BookingManageStatus; extras?: BookingStatusExtras }) =>
      updateBookingStatus(bookingId as number, vars.status, vars.extras),
    onSuccess: (data) => {
      queryClient.setQueryData(djangoQueryKeys.bookings.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.bookings.all });
      // Подтверждение материализует приём — список приёмов и окна расписания
      // должны увидеть его без перезагрузки страницы.
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.appointments.all });
      setConfirmOpen(false);
      setCancelOpen(false);
      notify?.({ type: "success", message: "Статус обновлён" });
    },
    onError: (e) =>
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" }),
  });

  const b = query.data;
  const busy = mutation.isPending;

  // ── Навигация по списку ──
  const ids = siblingIds ?? [];
  const index = bookingId != null ? ids.indexOf(bookingId) : -1;
  const prevId = index > 0 ? ids[index - 1] : null;
  const nextId = index >= 0 && index < ids.length - 1 ? ids[index + 1] : null;
  const goPrev = React.useCallback(() => {
    if (prevId != null) onNavigate?.(prevId);
  }, [prevId, onNavigate]);
  const goNext = React.useCallback(() => {
    if (nextId != null) onNavigate?.(nextId);
  }, [nextId, onNavigate]);

  // Стрелки листают брони, пока фокус не в поле ввода (диалоги подтверждения
  // перехватывают клавиши сами — при открытом диалоге не вмешиваемся).
  React.useEffect(() => {
    if (!open || busy || confirmOpen || cancelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (e.key === "ArrowLeft") goPrev();
      else goNext();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, busy, confirmOpen, cancelOpen, goPrev, goNext]);

  const handleCopyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* буфер недоступен (нет https / отказ в правах) — номер виден рядом */
    }
  };

  // ── Действия смены статуса ──
  const actions: {
    status: BookingManageStatus;
    label: string;
    icon: React.ReactNode;
    color: "success" | "error" | "primary" | "inherit";
  }[] =
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

  // Единственное совпадение по телефону — почти всегда та самая карта, её и
  // предлагаем открыть. Несколько — выбор делают при подтверждении.
  const matches = b?.patientMatches ?? [];
  const singleMatch = matches.length === 1 ? matches[0] : null;

  const openAppointment = (appointmentId: number) => {
    navigate(`/appointments?appointment=${appointmentId}`);
    onClose();
  };
  const openPatient = (patientId: number) => {
    navigate(`/patients?patient=${patientId}`);
    onClose();
  };
  const rebook = (booking: BookingDetail) => {
    const params = new URLSearchParams({ new: "1" });
    if (singleMatch) params.set("patient", String(singleMatch.id));
    if (booking.doctorId != null) params.set("employee", String(booking.doctorId));
    navigate(`/appointments?${params.toString()}`);
    onClose();
  };

  const terminal = b != null && isTerminalBookingStatus(b.status);
  const timeHint = b ? bookingTimeHint(b.date, b.time, b.status) : null;
  const footerActions = canManage && (actions.length > 0 || (terminal && canCreateAppointment));

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: { width: { xs: "100%", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" },
      }}
    >
      {/* ── Шапка: заголовок, навигация по списку, закрытие ── */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5}>
        <Typography variant="h6">{t("detail.title")}</Typography>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {ids.length > 1 && index >= 0 && (
            <>
              <Tooltip title={t("detail.prev")}>
                <span>
                  <IconButton size="small" onClick={goPrev} disabled={prevId == null || busy}>
                    <ChevronLeftOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 44, textAlign: "center" }}>
                {index + 1} / {ids.length}
              </Typography>
              <Tooltip title={t("detail.next")}>
                <span>
                  <IconButton size="small" onClick={goNext} disabled={nextId == null || busy}>
                    <ChevronRightOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
          <IconButton onClick={busy ? undefined : onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>
      </Stack>
      <Divider />

      <Box sx={{ p: 2, overflowY: "auto", flex: 1, minHeight: 0 }}>
        {query.isLoading ? (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Skeleton variant="rounded" width={48} height={48} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" height={24} />
                <Skeleton variant="text" width="40%" />
              </Box>
            </Stack>
            <Skeleton variant="rounded" height={64} />
            <Skeleton variant="rounded" height={96} />
            <Skeleton variant="rounded" height={72} />
          </Stack>
        ) : query.error || !b ? (
          <Alert severity="error">
            {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
          </Alert>
        ) : (
          <Stack spacing={2.5}>
            {/* ── Шапка-герой: кто записан и в каком статусе ── */}
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <UserAvatar name={b.patientName} size={48} sx={{ borderRadius: "12px", flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={700} noWrap>
                  {b.patientName}
                </Typography>
                {b.patientPhone && (
                  <Stack direction="row" alignItems="center" spacing={0.25} sx={{ mt: 0.25 }}>
                    <Typography variant="body2" color="text.secondary">
                      {formatPhoneDisplay(b.patientPhone)}
                    </Typography>
                    <Tooltip title={t("detail.call")}>
                      <IconButton size="small" component="a" href={`tel:${b.patientPhone}`}>
                        <CallOutlined sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("detail.whatsapp")}>
                      <IconButton
                        size="small"
                        component="a"
                        href={`https://wa.me/${waDigits(b.patientPhone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ChatOutlined sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={copied ? t("detail.copied") : t("detail.copyPhone")}>
                      <IconButton size="small" onClick={() => handleCopyPhone(b.patientPhone)}>
                        {copied ? (
                          <CheckOutlined sx={{ fontSize: 16 }} color="success" />
                        ) : (
                          <ContentCopyOutlined sx={{ fontSize: 16 }} />
                        )}
                      </IconButton>
                    </Tooltip>
                  </Stack>
                )}
              </Box>
              <StatusChip status={b.status} size="medium" />
            </Stack>

            {/* Код брони — та же карточка записи, что видит пациент по QR. */}
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              <Tooltip title={t("detail.openOnSite")}>
                <Chip
                  component="a"
                  href={bookingCodeUrl(b.confirmationCode, activeOrganization?.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  clickable
                  label={`Код: ${b.confirmationCode}`}
                  size="small"
                  variant="outlined"
                  icon={<OpenInNewOutlined sx={{ fontSize: 14 }} />}
                />
              </Tooltip>
              {timeHint && (
                <Chip
                  size="small"
                  label={timeHint.text}
                  sx={(th) => ({
                    height: 24,
                    borderRadius: "7px",
                    fontWeight: 500,
                    ...(timeHint.tone === "warning"
                      ? {
                          color: th.palette.mode === "dark" ? th.palette.warning.light : th.palette.warning.dark,
                          bgcolor: alpha(th.palette.warning.main, th.palette.mode === "dark" ? 0.2 : 0.14),
                        }
                      : { color: "text.secondary", bgcolor: subtleBg(th, true) }),
                  })}
                />
              )}
            </Stack>

            {/* ── Когда и к кому ── */}
            <Section icon={<EventOutlined />} title={t("detail.recordSection")}>
              <Stack spacing={1.25}>
                <Typography variant="h6" fontWeight={700}>
                  {dayjs(b.date).locale("ru").format("D MMMM YYYY, dd")} · {bookingTimeRange(b.time, b.totalDurationMin)}
                </Typography>
                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                  <Field label={t("specialistLabel")} value={b.doctorName || "—"} />
                  <Field label={t("detail.duration")} value={`${b.totalDurationMin} мин`} />
                  {/* Филиал бэк сериализует не всегда — показываем, когда отдал. */}
                  {b.branchName && <Field label={t("detail.branch")} value={b.branchName} />}
                </Stack>
              </Stack>
            </Section>

            <Divider />

            {/* ── Есть ли карта в CRM ── */}
            <Section icon={<PersonOutlineOutlined />} title={t("detail.patientSection")}>
              <Stack spacing={1} alignItems="flex-start">
                <Typography variant="body2" color="text.secondary">
                  {singleMatch
                    ? t("detail.matchOne")
                    : matches.length > 1
                      ? t("detail.matchMany", { count: matches.length })
                      : t("detail.matchNone")}
                </Typography>
                {singleMatch && (
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={500}>
                      {singleMatch.fullName}
                    </Typography>
                    {canViewPatients && (
                      <Button size="small" onClick={() => openPatient(singleMatch.id)} sx={{ textTransform: "none" }}>
                        {t("detail.openPatient")}
                      </Button>
                    )}
                  </Stack>
                )}
              </Stack>
            </Section>

            <Divider />

            {/* Услуги: у публичных броней — id услуг CRM, у operator.kg только имена. */}
            <Section icon={<MedicalServicesOutlined />} title={t("detail.servicesSection")}>
              {b.services && b.services.length > 0 ? (
                <Stack spacing={1}>
                  {b.services.map((s, i) => (
                    <Stack
                      key={i}
                      direction="row"
                      justifyContent="space-between"
                      gap={1}
                      sx={(th) => ({
                        p: 1.25,
                        borderRadius: "10px",
                        border: 1,
                        borderColor: "divider",
                        bgcolor: subtleBg(th),
                      })}
                    >
                      <Typography variant="body2">{s.name ?? "—"}</Typography>
                      {s.price != null && (
                        <Typography variant="body2" fontWeight={700} whiteSpace="nowrap">
                          {formatKGS(s.price)}
                        </Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="caption" color="text.disabled">
                  {t("detail.noServices")}
                </Typography>
              )}
            </Section>

            <Divider />

            {/* ── Связь с CRM: приём и синхронизация ── */}
            <Section icon={<LinkOutlined />} title={t("detail.crmSection")}>
              <Stack spacing={1.25}>
                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                  <Field
                    label={t("visitInCrm")}
                    value={b.appointmentId != null ? `#${b.appointmentId}` : t("detail.visitNotCreated")}
                  />
                  <Field
                    label={t("detail.syncedAt")}
                    value={b.syncedAt ? dayjs(b.syncedAt).format("DD.MM.YYYY HH:mm") : "—"}
                  />
                </Stack>
                {b.appointmentId != null && canOpenAppointments && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNewOutlined />}
                    onClick={() => openAppointment(b.appointmentId as number)}
                    sx={{ alignSelf: "flex-start", textTransform: "none" }}
                  >
                    {t("detail.openVisit")}
                  </Button>
                )}
              </Stack>
            </Section>
          </Stack>
        )}
      </Box>

      {/* ── Действия: закреплены внизу, не уезжают за длинным списком услуг ── */}
      {b && footerActions && (
        <>
          <Divider />
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            useFlexGap
            sx={{ p: 2, bgcolor: "background.paper" }}
          >
            {actions.map((a) => (
              <Button
                key={a.status}
                size="small"
                variant={a.color === "error" || a.color === "inherit" ? "outlined" : "contained"}
                color={a.color}
                startIcon={busy ? <CircularProgress size={14} /> : a.icon}
                disabled={busy}
                onClick={() =>
                  // Подтверждение — через диалог: там выбирают карту пациента и
                  // услуги приёма. Отмена необратима — тоже через подтверждение.
                  a.status === "confirmed"
                    ? setConfirmOpen(true)
                    : a.status === "cancelled"
                      ? setCancelOpen(true)
                      : mutation.mutate({ status: a.status })
                }
              >
                {a.label}
              </Button>
            ))}

            {/* Терминальная бронь: переходов больше нет, но пациента часто
                записывают заново — из карточки это один клик. */}
            {terminal && canCreateAppointment && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<ReplayOutlined />}
                onClick={() => rebook(b)}
                sx={{ textTransform: "none" }}
              >
                {t("detail.rebook")}
              </Button>
            )}
          </Stack>
        </>
      )}

      {b && (
        <>
          <ConfirmBookingDialog
            booking={b}
            open={confirmOpen}
            busy={busy}
            onClose={() => setConfirmOpen(false)}
            onConfirm={(extras) => mutation.mutate({ status: "confirmed", extras })}
          />
          <ConfirmDialog
            open={cancelOpen}
            onClose={() => setCancelOpen(false)}
            onConfirm={() => mutation.mutate({ status: "cancelled" })}
            title={t("cancelConfirm.title")}
            message={t("cancelConfirm.message")}
            confirmText={t("cancelConfirm.confirm")}
            cancelText={t("cancelConfirm.cancel")}
            variant="error"
            loading={busy}
          />
        </>
      )}
    </Drawer>
  );
};

export default BookingDetailDrawer;
