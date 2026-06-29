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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PersonOffOutlined from "@mui/icons-material/PersonOffOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DirectionsWalkOutlined from "@mui/icons-material/DirectionsWalkOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import type { DjangoAppointment } from "../../../api/appointments";
import { getAppointmentPayments } from "../../../api/payments";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../api/queryKeys";
import { getStatusConfig, getStatusChipSx, normalizeDjangoStatus } from "../../../config/appointmentStatuses";
import { PaymentInfoBlock } from "../../../components/ui";
import { usePermissions } from "../../../hooks/usePermissions";
import DjangoConclusionSlotsPanel from "../DjangoConclusionSlotsPanel";
import AppointmentReviewBlock from "../../reviews/AppointmentReviewBlock";
import DjangoConclusionDrawer from "../DjangoConclusionDrawer";
import { getConclusionSlots, type ConclusionSlot } from "../../../api/medical";
import PatientQuickViewDrawer from "../../../components/patients/DjangoPatientQuickViewDrawer";
import ServiceQuickViewDrawer from "../../../components/services/DjangoServiceQuickViewDrawer";
import DoctorQuickViewDrawer from "../../../components/employees/DjangoDoctorQuickViewDrawer";

interface AppointmentDetailsPanelProps {
  appointment: DjangoAppointment;
  canUpdate: boolean;
  canManageFinance: boolean;
  canViewFinance: boolean;
  canViewConclusions: boolean;
  canDelete?: boolean;
  /** Открыта ли третья колонка с заключением (состояние страницы). */
  isConclusionVisible?: boolean;
  /** Переключить третью колонку с заключением. */
  onToggleConclusion?: () => void;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
  onArrived?: (a: DjangoAppointment) => void;
  /** Врач начинает приём: перевести в in_progress (если ещё не завершён). */
  onStartAppointment?: (a: DjangoAppointment) => void;
  onCancelAppt?: (a: DjangoAppointment) => void;
  onDelete?: (a: DjangoAppointment) => void;
  onClose?: () => void;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function som(value?: string | number | null): string {
  const n = Number(value ?? 0);
  return `${isNaN(n) ? 0 : n.toLocaleString("ru-RU")} сом`;
}

const AppointmentDetailsPanel: React.FC<AppointmentDetailsPanelProps> = ({
  appointment: appt,
  canUpdate,
  canManageFinance,
  canViewFinance,
  canViewConclusions,
  canDelete,
  isConclusionVisible = false,
  onToggleConclusion,
  onEdit,
  onPay,
  onArrived,
  onStartAppointment,
  onCancelAppt,
  onDelete,
  onClose,
}) => {
  const theme = useTheme();
  const { isDoctor, isNurse, isAdmin, isRegistrator, activeEmployee } = usePermissions();

  // Заключение теперь открывается отдельной (третьей) колонкой на уровне
  // страницы — карточка лишь переключает её через onToggleConclusion.
  const showConclusions = isConclusionVisible;
  const openConclusions = React.useCallback(() => {
    if (!isConclusionVisible) onToggleConclusion?.();
  }, [isConclusionVisible, onToggleConclusion]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<"cancel" | "delete" | null>(null);

  // Quick-view drawers (краткая информация по клику: пациент / врач / услуга)
  const [patientDrawerOpen, setPatientDrawerOpen] = React.useState(false);
  const [doctorDrawerOpen, setDoctorDrawerOpen] = React.useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = React.useState<number | null>(null);
  const [selectedDoctorName, setSelectedDoctorName] = React.useState<string | null>(null);
  const [selectedDoctorPhotoUrl, setSelectedDoctorPhotoUrl] = React.useState<string | null>(null);
  const [serviceDrawerOpen, setServiceDrawerOpen] = React.useState(false);
  const [selectedServiceId, setSelectedServiceId] = React.useState<number | null>(null);

  const payQuery = useQuery({
    queryKey: djangoQueryKeys.appointments.payments(appt.id),
    queryFn: ({ signal }) => getAppointmentPayments(appt.id, signal),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    enabled: canViewFinance || canManageFinance,
  });

  const pay = payQuery.data;
  const isCancelled =
    appt.status === "canceled" ||
    appt.status === "no_show";

  const totalAmount = pay?.totalAmount ?? appt.totalAmount;
  const paidTotal = pay?.paidTotal ?? appt.paidTotal;
  const debt = pay?.debt ?? appt.debt;
  const discountAmount = pay?.discountAmount ?? appt.discountAmount;
  const refundedTotal = pay?.refundedTotal;
  const payStatus = pay?.paymentStatus ?? appt.paymentStatus;

  const hasFinanceInfo = !!(totalAmount && totalAmount !== "0.00" && totalAmount !== "0");
  const hasDebt = !!(debt && debt !== "0.00" && debt !== "0");
  const hasDiscount = !!(discountAmount && discountAmount !== "0.00" && discountAmount !== "0");
  const hasPaid = !!(paidTotal && paidTotal !== "0.00" && paidTotal !== "0");
  const hasRefund = !!(refundedTotal && refundedTotal !== "0.00" && refundedTotal !== "0");

  const cashPaid = pay?.payments?.reduce((s, p) => p.method === "cash" ? s + Number(p.amount) : s, 0) ?? 0;
  const cardPaid = pay?.payments?.reduce((s, p) => p.method === "card" ? s + Number(p.amount) : s, 0) ?? 0;
  const balancePaid = pay?.payments?.reduce((s, p) => p.method === "balance" ? s + Number(p.amount) : s, 0) ?? 0;
  const bonusesPaid = pay?.payments?.reduce((s, p) => p.method === "bonus" ? s + Number(p.amount) : s, 0) ?? 0;

  // Врач — исполнитель? Есть невыполненные услуги для него?
  const isDoctorRole = isDoctor();
  const isNurseRole = isNurse();
  const isAdminRole = isAdmin();
  const isRegistratorRole = isRegistrator();
  const isNonDoctor = !isDoctorRole && !isNurseRole;

  const activeEmployeeId = activeEmployee?.id ?? null;
  const isPerformer = React.useMemo(
    () =>
      activeEmployeeId != null &&
      appt.services.some((sl) => sl.employee?.id === activeEmployeeId),
    [appt.services, activeEmployeeId],
  );
  // Реально ли существует заключение: бэк не отдаёт hasMedicalConclusion,
  // но шлёт по каждой строке услуги conclusionState/conclusionId. Заключение
  // есть, если хотя бы одна строка в состоянии draft/completed (или с id).
  const hasConclusion = React.useMemo(
    () =>
      appt.services.some(
        (sl) =>
          sl.conclusionId != null ||
          sl.conclusionState === "draft" ||
          sl.conclusionState === "completed",
      ),
    [appt.services],
  );
  // "Невыполненные" — Django не имеет service.status, поэтому проверяем наличие
  // заключения как прокси: если у этого врача нет заключения — есть "незавершённые".
  const hasIncompleteServices = isDoctorRole && isPerformer && !hasConclusion;


  // Активный приём — не отменён/неявка/завершён. Кнопку «Начать приём» врач
  // может нажать на любом таком статусе (в т.ч. scheduled, если регистратор
  // не отметил «Пациент здесь»).
  const isAppointmentActive =
    appt.status !== "canceled" &&
    (appt.status as string) !== "cancelled" &&
    appt.status !== "no_show" &&
    appt.status !== "completed";

  // Дравер заключения, открываемый сразу по «Начать приём» (как в оригинале:
  // одна полная форма на приём врача, без промежуточной панели слотов).
  const [startedSlot, setStartedSlot] = React.useState<ConclusionSlot | null>(null);
  const [startBusy, setStartBusy] = React.useState(false);

  // «Начать приём»: переводим приём в in_progress и сразу открываем полную
  // форму заключения для услуги текущего врача (первый редактируемый слот).
  const handleStartAppointment = React.useCallback(async () => {
    if (startBusy) return;
    setStartBusy(true);
    try {
      if (
        onStartAppointment &&
        appt.status !== "in_progress" &&
        appt.status !== "completed"
      ) {
        onStartAppointment(appt);
      }
      const slots = await getConclusionSlots(appt.id);
      // Слот текущего врача, который можно редактировать; иначе первый редактируемый.
      const mine =
        slots.find(
          (s) => s.canEdit && s.doctor?.id === activeEmployeeId,
        ) ?? slots.find((s) => s.canEdit);
      if (mine) {
        setStartedSlot(mine);
      } else {
        // Нет редактируемого слота — открываем колонку заключения как было.
        openConclusions();
      }
    } finally {
      setStartBusy(false);
    }
  }, [appt, onStartAppointment, activeEmployeeId, startBusy]);

  // Статус "Оплачено безналом" — только карта, без наличных
  const displayStatus = React.useMemo(() => {
    const normalized = normalizeDjangoStatus(appt.status);
    if (
      (appt.status === "completed" || payStatus === "paid") &&
      cardPaid > 0 &&
      cashPaid === 0
    ) {
      return "Оплачено безналом";
    }
    return normalized;
  }, [appt.status, payStatus, cardPaid, cashPaid]);

  const statusCfg = getStatusConfig(displayStatus);
  const statusChipSx = getStatusChipSx(displayStatus);

  // Services grouped by employee
  const servicesByEmployee = React.useMemo(() => {
    const map = new Map<
      string,
      {
        employeeName: string;
        employeeId: number | null;
        employeePhotoUrl: string | null;
        services: typeof appt.services;
      }
    >();
    for (const sl of appt.services) {
      const key = sl.employee ? String(sl.employee.id) : "__no_doc__";
      if (!map.has(key)) {
        map.set(key, {
          employeeId: sl.employee?.id ?? null,
          employeeName: sl.employee?.fullName ?? "Без врача",
          employeePhotoUrl: sl.employee?.photoUrl ?? null,
          services: [],
        });
      }
      map.get(key)!.services.push(sl);
    }
    return Array.from(map.values());
  }, [appt.services]);

  const paymentBlock = (withBalanceBonuses: boolean) => {
    const payment = {
      baseTotal: Number(totalAmount || 0),
      cash: cashPaid,
      card: cardPaid,
      balance: withBalanceBonuses ? balancePaid : 0,
      bonuses: withBalanceBonuses ? bonusesPaid : 0,
      discountAmount: Number(discountAmount || 0),
      discountPercent: hasDiscount && totalAmount
        ? Math.round((Number(discountAmount) / Number(totalAmount)) * 100)
        : 0,
      finalTotal: Math.max(0, Number(totalAmount || 0) - Number(discountAmount || 0)),
      debt: Number(debt || 0),
      status: payStatus ?? appt.status,
    };

    const actionBtn =
      canManageFinance && !isCancelled ? (
        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
          <Button
            variant={hasPaid ? "outlined" : "contained"}
            color={hasPaid ? "primary" : "success"}
            size="small"
            startIcon={<PaymentsOutlined />}
            onClick={() => onPay(appt)}
            sx={{ boxShadow: "none", textTransform: "none", whiteSpace: "nowrap" }}
          >
            {hasPaid ? "Изменить оплату" : "Принять оплату"}
          </Button>
        </Stack>
      ) : undefined;

    return (
      <PaymentInfoBlock
        payment={payment}
        variant="detailed"
        showIcons
        actionButton={actionBtn}
      />
    );
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    if (confirmAction === "cancel" && onCancelAppt) onCancelAppt(appt);
    if (confirmAction === "delete" && onDelete) onDelete(appt);
    setConfirmAction(null);
  };

  return (
    <>
      <Card
        variant="outlined"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxSizing: "border-box",
          m: 0,
          p: 0,
        }}
      >
        {/* ── Header ── */}
        <CardHeader
          sx={{
            px: 3,
            py: 1,
            pb: 1,
            "& .MuiCardHeader-content": { minWidth: 0, overflow: "hidden" },
            "& .MuiCardHeader-action": { mt: 0, alignSelf: "center", ml: 1 },
          }}
          title={
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: { xs: 1, sm: 2 },
                flexWrap: "wrap",
              }}
            >
              {/* Left: main action buttons */}
              <Stack
                direction="row"
                spacing={{ xs: 0.5, sm: 1 }}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
                sx={{ gap: { xs: 0.5, sm: 1 } }}
              >
                {/* Пациент здесь — только если scheduled */}
                {canUpdate && onArrived && appt.status === "scheduled" && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    startIcon={<DirectionsWalkOutlined />}
                    onClick={() => onArrived(appt)}
                  >
                    Пациент здесь
                  </Button>
                )}

                {/* Начать приём — врач-исполнитель + есть незавершённые услуги,
                    при ЛЮБОМ активном статусе (не отменён/неявка/завершён). Не
                    зависит от «Пациент здесь»: регистратор мог не отметить, а
                    врач всё равно должен мочь начать приём. */}
                {isDoctorRole && hasIncompleteServices && isAppointmentActive && canViewConclusions && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    startIcon={
                      startBusy ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <MedicalServicesOutlined />
                      )
                    }
                    onClick={handleStartAppointment}
                    disabled={startBusy}
                  >
                    Начать приём
                  </Button>
                )}

                {/* Изменить заключение — врач + нет незавершённых + он исполнитель */}
                {isDoctorRole && !hasIncompleteServices && isPerformer && canViewConclusions && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditOutlined />}
                    onClick={openConclusions}
                  >
                    Изменить заключение
                  </Button>
                )}

                {/* Изменить — только для адм/рег */}
                {canUpdate && (isAdminRole || isRegistratorRole) && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditOutlined />}
                    onClick={() => onEdit(appt)}
                  >
                    Изменить
                  </Button>
                )}

                {/* Заключение toggle — только если заключение реально есть.
                    Создание заключения врачом идёт отдельным потоком выше
                    (hasIncompleteServices); эта кнопка — лишь просмотр. */}
                {canViewConclusions && hasConclusion && (
                  <Button
                    size="small"
                    variant={showConclusions ? "contained" : "outlined"}
                    startIcon={showConclusions ? <VisibilityOutlined /> : <DescriptionOutlined />}
                    onClick={() => onToggleConclusion?.()}
                  >
                    {showConclusions ? "Скрыть заключение" : "Заключение"}
                  </Button>
                )}

                {/* Печать/Справка перенесены в саму карточку заключения
                    (третья колонка), как в оригинале. */}
              </Stack>

              {/* Right: cancel/delete — адм/рег only */}
              {(isAdminRole || isRegistratorRole) && (
                <Stack direction="row" spacing={0.5}>
                  {canUpdate && onCancelAppt && !isCancelled && (
                    <Tooltip title="Отменить запись">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => { setConfirmAction("cancel"); setConfirmOpen(true); }}
                        sx={{
                          border: "1px solid",
                          borderColor: "error.main",
                          "&:hover": { bgcolor: alpha(theme.palette.error.main, 0.08) },
                        }}
                      >
                        <PersonOffOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canDelete && onDelete && (
                    <Tooltip title="Удалить">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => { setConfirmAction("delete"); setConfirmOpen(true); }}
                          sx={{
                            border: "1px solid",
                            borderColor: "error.main",
                            color: "error.main",
                            "&:hover": { bgcolor: alpha(theme.palette.error.main, 0.08) },
                          }}
                        >
                          <DeleteOutlineOutlined fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Stack>
              )}
            </Box>
          }
          action={
            onClose ? (
              <IconButton
                size="small"
                onClick={onClose}
                sx={{ position: "absolute", right: 8, top: 8 }}
              >
                <CloseOutlined fontSize="small" />
              </IconButton>
            ) : undefined
          }
        />

        <Divider />

        <CardContent
          sx={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            p: 2,
            px: 3,
            "&:last-child": { pb: 2 },
            msOverflowStyle: "none",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <Stack spacing={3}>
            {/* ── Date row ── */}
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
              <CalendarMonthOutlined fontSize="medium" sx={{ color: "primary.onSurface" }} />
              <Typography variant="h6" fontWeight={700} color="text.primary">
                {dayjs(appt.scheduledAt).format("D MMMM YYYY, HH:mm")}
              </Typography>
              {appt.isNight && (
                <NightlightOutlined sx={{ fontSize: 22, color: "primary.onSurface" }} />
              )}
              <Stack direction="column" spacing={0} sx={{ ml: "auto" }}>
                {appt.createdAt && (
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ fontSize: "0.725rem", lineHeight: 1.2 }}
                  >
                    Создан: {dayjs(appt.createdAt).format("DD.MM HH:mm")}
                  </Typography>
                )}
                {appt.updatedAt && appt.updatedAt !== appt.createdAt && (
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ fontSize: "0.725rem", lineHeight: 1.2 }}
                  >
                    Изм: {dayjs(appt.updatedAt).format("DD.MM HH:mm")}
                  </Typography>
                )}
              </Stack>
            </Stack>

            {/* ── Status ── */}
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              <Chip
                label={statusCfg.label}
                icon={statusCfg.icon}
                size="small"
                sx={statusChipSx}
              />
              {/* bank confirmation double-check chip */}
              {(appt as any).hasBankConfirmation && (
                <Tooltip title="Оплата подтверждена банком">
                  <Chip
                    size="small"
                    label="✓✓"
                    sx={{
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      letterSpacing: 1,
                    }}
                  />
                </Tooltip>
              )}
              {payQuery.isLoading && <CircularProgress size={14} />}
            </Stack>

            {/* ── Review status + request (self-gated by reviews.* perms) ── */}
            <AppointmentReviewBlock appointmentId={appt.id} />

            {/* ── Payment block — non-doctor/nurse ── */}
            {isNonDoctor && (canViewFinance || canManageFinance) && (
              <>
                {hasFinanceInfo ? (
                  paymentBlock(true)
                ) : (
                  canManageFinance && !isCancelled && (
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      startIcon={<PaymentsOutlined />}
                      onClick={() => onPay(appt)}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Принять оплату
                    </Button>
                  )
                )}
                {hasRefund && (
                  <Typography variant="caption" color="error.main" fontWeight={600} display="block">
                    Возврат: {som(refundedTotal)}
                  </Typography>
                )}
                <Divider />
              </>
            )}

            {/* ── Patient card ── */}
            {appt.patient ? (
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                  Пациент
                </Typography>
                <Paper
                  variant="outlined"
                  onClick={() => setPatientDrawerOpen(true)}
                  sx={{
                    p: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                    display: "flex",
                    alignItems: "center",
                    borderRadius: "10px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    "&:hover": {
                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                      borderColor: "primary.main",
                    },
                  }}
                >
                  <Avatar
                    src={appt.patient.photoUrl ?? undefined}
                    sx={{
                      width: 48,
                      height: 48,
                      mr: 2,
                      bgcolor: "primary.light",
                      color: "primary.contrastText",
                      fontWeight: 700,
                      fontSize: "1.1rem",
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
                        sx={{
                          textDecoration: "none",
                          "&:hover": { textDecoration: "underline" },
                          fontWeight: 500,
                        }}
                        noWrap
                      >
                        {appt.patient.phone}
                      </Typography>
                    )}
                  </Box>
                </Paper>
              </Box>
            ) : (
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                  Пациент
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    bgcolor: alpha(theme.palette.warning.main, 0.04),
                    borderRadius: "10px",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Бронирование (без пациента)
                  </Typography>
                </Paper>
              </Box>
            )}

            {/* ── Services grouped by doctor ── */}
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Услуги и специалисты
              </Typography>
              {appt.services.length === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.02),
                    borderRadius: "10px",
                  }}
                >
                  <Typography variant="body2" color="text.disabled">
                    Услуги не указаны
                  </Typography>
                </Paper>
              ) : (
                <Stack spacing={2}>
                  {servicesByEmployee.map((group) => (
                    <Box key={group.employeeId ?? "__no_doc__"}>
                      {/* Doctor header */}
                      <Paper
                        variant="outlined"
                        onClick={
                          group.employeeId
                            ? () => {
                                setSelectedDoctorId(group.employeeId);
                                setSelectedDoctorName(group.employeeName);
                                setSelectedDoctorPhotoUrl(group.employeePhotoUrl);
                                setDoctorDrawerOpen(true);
                              }
                            : undefined
                        }
                        sx={{
                          p: 1.5,
                          mb: 1,
                          display: "flex",
                          alignItems: "center",
                          bgcolor: alpha(theme.palette.primary.main, 0.04),
                          borderColor: alpha(theme.palette.primary.main, 0.1),
                          borderRadius: "10px",
                          cursor: group.employeeId ? "pointer" : "default",
                          transition: "all 0.2s",
                          "&:hover": {
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                            borderColor: "primary.main",
                          },
                        }}
                      >
                        <Avatar
                          src={group.employeePhotoUrl ?? undefined}
                          sx={{
                            width: 32,
                            height: 32,
                            mr: 1.5,
                            bgcolor: group.employeeId ? "primary.main" : "action.selected",
                            fontSize: "0.875rem",
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

                      {/* Service items */}
                      <Stack spacing={1} sx={{ pl: 2 }}>
                        {group.services.map((sl) => (
                          <Paper
                            key={sl.id}
                            variant="outlined"
                            onClick={
                              sl.service?.id
                                ? () => {
                                    setSelectedServiceId(sl.service!.id);
                                    setServiceDrawerOpen(true);
                                  }
                                : undefined
                            }
                            sx={{
                              p: 1.5,
                              pl: 2,
                              display: "flex",
                              alignItems: "center",
                              gap: 2,
                              bgcolor: "background.paper",
                              borderRadius: "10px",
                              cursor: sl.service?.id ? "pointer" : "default",
                              transition: "all 0.2s",
                              "&:hover": {
                                borderColor: "primary.main",
                                bgcolor: alpha(theme.palette.primary.main, 0.02),
                              },
                            }}
                          >
                            <Avatar
                              variant="rounded"
                              src={sl.service?.imageUrl ?? undefined}
                              sx={{
                                width: 40,
                                height: 40,
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
                              {som(Number(sl.price) > 0 ? sl.price : (sl.service?.basePrice ?? sl.price))}
                            </Typography>
                          </Paper>
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>

            {/* ── Products (goods sold within the visit) ── */}
            {(appt.productLines ?? []).filter((pl) => pl.status !== "canceled").length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                  Товары
                </Typography>
                <Stack spacing={1}>
                  {(appt.productLines ?? [])
                    .filter((pl) => pl.status !== "canceled")
                    .map((pl) => (
                      <Paper
                        key={pl.id}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          pl: 2,
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          bgcolor: "background.paper",
                          borderRadius: 1.5,
                        }}
                      >
                        <Avatar
                          variant="rounded"
                          sx={{
                            width: 40,
                            height: 40,
                            bgcolor: "action.selected",
                            color: "text.secondary",
                            flexShrink: 0,
                          }}
                        >
                          <Inventory2Outlined fontSize="small" />
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {pl.product?.name ?? "—"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            × {pl.quantity}
                            {pl.product?.unit ? ` ${pl.product.unit}` : ""}
                          </Typography>
                        </Box>
                        <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>
                          {som(pl.lineTotal)}
                        </Typography>
                      </Paper>
                    ))}
                </Stack>
              </Box>
            )}

            {/* ── Text blocks ── */}
            {(appt.complaints || appt.doctorComplaints || appt.adminComment) && (
              <>
                <Divider />
                <Stack spacing={2}>
                  {appt.complaints && (
                    <Box>
                      <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                        <DescriptionOutlined color="primary" fontSize="small" />
                        <Typography variant="subtitle2" color="text.secondary">
                          Жалобы пациента
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        sx={{
                          bgcolor: "background.paper",
                          p: 1,
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {appt.complaints}
                      </Typography>
                    </Box>
                  )}
                  {appt.doctorComplaints && (
                    <Box>
                      <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                        <DescriptionOutlined color="secondary" fontSize="small" />
                        <Typography variant="subtitle2" color="text.secondary">
                          Жалобы (врач)
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        sx={{
                          bgcolor: "background.paper",
                          p: 1,
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {appt.doctorComplaints}
                      </Typography>
                    </Box>
                  )}
                  {appt.adminComment && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Комментарий администратора
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          bgcolor: "background.paper",
                          p: 1,
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {appt.adminComment}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </>
            )}

            {/* ── Payment block for doctor/nurse (cash+card only) ── */}
            {(isDoctorRole || isNurseRole) && (canViewFinance || canManageFinance) && hasFinanceInfo && (
              <>
                <Divider />
                <Typography variant="caption" color="text.secondary" display="block">
                  Информация об оплате
                </Typography>
                {paymentBlock(false)}
              </>
            )}

            {/* Заключение теперь открывается отдельной (третьей) колонкой на
                странице приёмов (как в оригинале), а не внутри карточки. */}
          </Stack>
        </CardContent>
      </Card>

      {/* ── Quick-view drawers (краткая инфо по клику) ── */}
      <PatientQuickViewDrawer
        open={patientDrawerOpen}
        onClose={() => setPatientDrawerOpen(false)}
        patientId={appt.patient?.id ?? null}
      />
      <ServiceQuickViewDrawer
        open={serviceDrawerOpen}
        onClose={() => {
          setServiceDrawerOpen(false);
          setSelectedServiceId(null);
        }}
        serviceId={selectedServiceId}
      />
      <DoctorQuickViewDrawer
        open={doctorDrawerOpen}
        onClose={() => {
          setDoctorDrawerOpen(false);
          setSelectedDoctorId(null);
        }}
        doctorId={selectedDoctorId}
        fallbackName={selectedDoctorName}
        fallbackPhotoUrl={selectedDoctorPhotoUrl}
      />

      {/* ── Полная форма заключения по «Начать приём» (поток как в оригинале) ── */}
      {startedSlot && (
        <DjangoConclusionDrawer
          open={!!startedSlot}
          onClose={() => setStartedSlot(null)}
          conclusion={startedSlot.conclusion}
          serviceLineId={startedSlot.serviceLineId}
          serviceName={startedSlot.service.name}
          doctorName={startedSlot.doctor?.fullName ?? "—"}
          canEdit={startedSlot.canEdit}
          canPrint={startedSlot.canPrint}
          patientComplaints={appt.complaints}
          onSaved={() => setStartedSlot(null)}
        />
      )}

      {/* ── Confirm dialog ── */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>
          {confirmAction === "delete" ? "Удалить приём?" : "Отменить запись?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmAction === "delete"
              ? "Удалить можно только ошибочно созданный приём без оплат, возвратов и медицинских заключений."
              : "Запись будет переведена в статус «Отменено». Она не удалится из истории."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Назад</Button>
          <Button onClick={handleConfirm} color="error" variant="contained" autoFocus>
            {confirmAction === "delete" ? "Удалить" : "Подтвердить отмену"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AppointmentDetailsPanel;
