import React from "react";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Stack,
  Typography,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Paper,
  Dialog,
  Avatar,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DirectionsWalkOutlined from "@mui/icons-material/DirectionsWalkOutlined";
import PersonOffOutlined from "@mui/icons-material/PersonOffOutlined";
import SmsOutlined from "@mui/icons-material/SmsOutlined";

import { PaymentSidebar } from "./PaymentSidebar";
import PatientQuickViewDrawer from "../../../components/patients/PatientQuickViewDrawer";
import ServiceQuickViewDrawer from "../../../components/services/ServiceQuickViewDrawer";
import DoctorQuickViewDrawer from "../../../components/employees/DoctorQuickViewDrawer";
import { PaymentInfoBlock } from "../../../components/ui";
import DoctorWorkDrawer from "../../../components/home/DoctorWorkDrawer";
import { BankConfirmationModal } from "../../../components/appointments/BankConfirmationModal";

import { supabase } from "../../../utility/supabaseClient";
import { sendAppointmentNotification } from "../../../utility/appointmentNotifications";
import { formatKGS } from "../../../utility/format";
import EditAppointmentSidebar from "./EditAppointmentSidebar";
import { useHasPermission, usePermissions } from "../../../hooks/usePermissions";
import { getStatusConfig, getStatusChipSx, APPOINTMENT_STATUSES } from "../../../config/appointmentStatuses";
import { DB_TABLES } from "../../../utility/constants";
import { useAppointmentDetails } from "../../../hooks/useAppointmentDetails";
import { usePatientBalance } from "../../patient-search/usePatientBalance";

import { Appointment } from "../types";

type AppointmentDetailsCardProps = {
  appointmentId: string | null;
  onClose: () => void;
  onUpdate: () => void; // Callback to refresh list after changes
  onStartAppointment?: (patientId: string) => void;
  hideActionsForDoctor?: boolean;
  extraHeaderActions?: React.ReactNode;
  showPaymentAction?: boolean;
  isConclusionVisible?: boolean;
  onToggleConclusion?: () => void;
  readOnly?: boolean;
  hideCloseButton?: boolean;
};

const AppointmentDetailsCardBase: React.FC<AppointmentDetailsCardProps> = ({
  appointmentId,
  onClose,
  onUpdate,
  onStartAppointment,
  hideActionsForDoctor = false,
  extraHeaderActions,
  showPaymentAction = false,
  isConclusionVisible = false,
  onToggleConclusion,
  readOnly = false,
  hideCloseButton = false,
}) => {
  const theme = useTheme(); // Need theme for matches
  // Hide specific elements on mobile if requested, but here we use it for logic
  const isMobile = useMediaQuery(theme.breakpoints.down("md")); // Same breakpoint as pages

  // Fetch data using custom hook with caching
  const {
    item,
    patientData,
    appointmentDoctors,
    appointmentProducts,
    servicesPhotos,
    notifications,
    loading: hookLoading,
    error: hookError,
    refresh
  } = useAppointmentDetails(appointmentId);

  // Local state for actions
  const [actionLoading, setActionLoading] = React.useState(false);
  // Combined loading state for UI
  const loading = hookLoading || actionLoading;

  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (hookError) setErrorMsg(hookError);
    else setErrorMsg(null);
  }, [hookError]);

  // Sidebar редактирования приема
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const { isDoctor, isNurse, isAdmin, isRegistrator, isSuperAdmin, hasPermission, employeeId } = usePermissions();
  const canDelete = isSuperAdmin?.() ?? false;

  // Drawer работы врача с приемом
  const [doctorWorkOpen, setDoctorWorkOpen] = React.useState(false);
  const isNurseRole = isNurse?.() ?? false;

  // Drawer'ы быстрого просмотра
  const [patientDrawerOpen, setPatientDrawerOpen] = React.useState(false);
  const [serviceDrawerOpen, setServiceDrawerOpen] = React.useState(false);
  const [selectedServiceId, setSelectedServiceId] = React.useState<string | null>(null);
  const [doctorDrawerOpen, setDoctorDrawerOpen] = React.useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = React.useState<string | null>(null);

  // Врачи приёма (Calculated from hook data, no state needed if direct usage, but existing code might rely on state?)
  // actually...

  // Врачи, написавшие заключение
  const [conclusionDoctors, setConclusionDoctors] = React.useState<any[]>([]);
  const [targetConclusionDoctorId, setTargetConclusionDoctorId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!appointmentId) return;
    const fetchConclusionDoctors = async () => {
      const { data } = await supabase
        .from("MedicalConclusions")
        .select(`
          doctor_id,
          doctor:Employees!doctor_id (
            id,
            full_name
          )
        `)
        .eq("appointment_id", appointmentId);

      if (data) {
        setConclusionDoctors(data.map((d: any) => d.doctor).filter(Boolean));
      }
    };
    fetchConclusionDoctors();
  }, [appointmentId]);

  // We should call `refresh()` when we update status or delete internally.
  const handleRefresh = React.useCallback(() => {
    refresh();
    onUpdate(); // Call parent update too
  }, [refresh, onUpdate]);

  const isNight = item ? item.is_night : false;

  const productsTotal = React.useMemo(() => {
    return appointmentProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
  }, [appointmentProducts]);

  // Группировка услуг для отображения
  const servicesGrouped = React.useMemo(() => {
    if (!item?.services_json) return { grouped: {}, noDoctorServices: [] };

    let services: any[] = [];
    try {
      if (typeof item.services_json === 'string') {
        services = JSON.parse(item.services_json);
      } else if (Array.isArray(item.services_json)) {
        services = item.services_json;
      }
    } catch (e) {
      console.error("Parse services error", e);
      return { grouped: {}, noDoctorServices: [] };
    }

    if (!Array.isArray(services) || services.length === 0) return { grouped: {}, noDoctorServices: [] };

    const grouped: Record<string, { doctor: any, services: any[] }> = {};
    const noDoctorServices: any[] = [];

    services.forEach(svc => {
      if (!svc) return;
      const docId = svc.doctor_id || svc.performer_id;
      if (!docId && !svc.service_id && !svc.id) return;

      if (docId) {
        if (!grouped[docId]) {
          grouped[docId] = {
            doctor: {
              id: docId,
              name: svc.doctor_name || svc.performer_name || "Врач",
              photo: svc.doctor_photo || svc.performer_photo || null
            },
            services: []
          };
        }
        grouped[docId].services.push(svc);
      } else {
        noDoctorServices.push(svc);
      }
    });

    return { grouped, noDoctorServices };
  }, [item?.services_json]);

  // Payment Sidebar
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [bankConfirmOpen, setBankConfirmOpen] = React.useState(false);

  // Patient balance (visible for admin/registrator)
  const canSeeBalance = !isDoctor?.() && !isNurse?.();
  const { balance: patientBalance } = usePatientBalance(
    canSeeBalance ? (item?.patient_id ?? null) : null
  );

  // Status Handlers
  const { open } = useNotification();

  // Confirmation Dialog State
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<"cancel" | "delete" | null>(null);


  const queryClient = useQueryClient();

  const handleStatusUpdate = async (newStatus: string) => {
    if (!item || !appointmentId) return;

    // 1. Optimistic Update
    const prevDetails = queryClient.getQueryData<any>(['appointment-details', appointmentId]);

    // Update local details cache
    if (prevDetails) {
      queryClient.setQueryData(['appointment-details', appointmentId], {
        ...prevDetails,
        item: { ...prevDetails.item, status: newStatus }
      });
    }

    // Update global list cache (we need to find which daily list it belongs to)
    // Since we don't easily know the dailyRange.key here without passing it down,
    // we can try to invalidate or update all matching patterns if we want to be thorough.
    // For now, updating any query starting with ["appointments", "daily"]
    queryClient.setQueriesData({ queryKey: ["appointments", "daily"] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map(a => a.id === appointmentId ? { ...a, status: newStatus } : a);
    });

    try {
      setActionLoading(true);
      const { error } = await supabase
        .from(DB_TABLES.APPOINTMENTS)
        .update({ status: newStatus })
        .eq("id", appointmentId);

      if (error) throw error;

      // Notify parent/context if needed
      onUpdate();

      open?.({
        message: "Статус обновлен",
        type: "success",
        description: `Запись переведена в статус "${newStatus}"`,
      });

      // Уведомление об отмене приёма (fire-and-forget)
      if (newStatus === APPOINTMENT_STATUSES.CANCELLED && item && patientData?.phone) {
        sendAppointmentNotification({
          appointment_id: item.id,
          notification_type: "appointment_cancel",
          patient_phone: patientData.phone,
          patient_name: item.patient_name || "",
          appointment_at: item.appointment_at,
          doctor_name: item.doctor_name || "",
        });
      }
    } catch (e: unknown) {
      // Rollback
      if (prevDetails) {
        queryClient.setQueryData(['appointment-details', appointmentId], prevDetails);
      }
      queryClient.invalidateQueries({ queryKey: ["appointments", "daily"] });

      const description =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: unknown }).message)
          : String(e);
      open?.({
        message: "Ошибка обновления статуса",
        type: "error",
        description,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleArrived = () => handleStatusUpdate(APPOINTMENT_STATUSES.PATIENT_ARRIVED);

  const handleConfirmAction = async () => {
    setConfirmOpen(false);
    if (confirmAction === 'cancel') {
      await handleStatusUpdate(APPOINTMENT_STATUSES.CANCELLED);
    } else if (confirmAction === 'delete') {
      if (!item || deleting) return;
      try {
        setDeleting(true);
        let errorFinal: unknown = null;
        try {
          const { error } = await supabase.from(DB_TABLES.APPOINTMENTS).delete().eq("id", item.id);
          if (error) throw error;
        } catch {
          // Fallback for case sensitivity
          try {
            const { error } = await supabase.from(DB_TABLES.APPOINTMENTS).delete().eq("id", item.id);
            if (error) throw error;
          } catch (e2) {
            errorFinal = e2;
          }
        }

        if (errorFinal) throw errorFinal; // Propagate error if both failed

        // onUpdate(); // Parent should refresh list
        open?.({
          message: "Прием удален",
          type: "success",
        });
        onClose();
        onUpdate();
        // No need to refresh local here as we close it
      } catch (e: unknown) {
        console.error("Delete appointment failed:", e);
        const description =
          e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message)
            : String(e);
        open?.({
          message: "Не удалось удалить прием",
          type: "error",
          description,
        });
      } finally {
        setDeleting(false);
      }
    }
    setConfirmAction(null);
  };

  // Wrapper for buttons to trigger dialog
  const promptDelete = () => {
    setConfirmAction('delete');
    setConfirmOpen(true);
  };

  const promptCancel = () => {
    setConfirmAction('cancel');
    setConfirmOpen(true);
  };

  const hasIncompleteServices = React.useMemo(() => {
    if (!item?.services_json || !employeeId) return false;
    let services: any[] = [];
    try {
      if (typeof item.services_json === 'string') {
        services = JSON.parse(item.services_json);
      } else if (Array.isArray(item.services_json)) {
        services = item.services_json;
      }
    } catch (e) {
      console.error("[AppointmentDetailsCard] Error parsing services_json in hasIncompleteServices:", e);
      return false;
    }

    if (!Array.isArray(services)) return false;

    // Check if any service where this doctor is performer is NOT completed
    return services.some(svc => {
      if (!svc) return false;
      const docId = svc.doctor_id || svc.performer_id;
      return docId === employeeId && svc.status !== "Выполнено";
    });
  }, [item?.services_json, employeeId]);

  if (!appointmentId) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1,
          color: "text.secondary",
          p: 2,
        }}
      >
        <Typography align="center">
          Выберите прием для просмотра подробной информации
        </Typography>
      </Box>
    );
  }

  return (
    <Card
      variant={isMobile ? "elevation" : "outlined"}
      elevation={0}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: 'border-box',
        m: 0,
        p: 0
      }}
    >
      <CardHeader
        title={
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: { xs: 1, sm: 2 },
            flexWrap: 'wrap',
          }}>
            {/* Основные действия - слева */}
            <Stack
              direction="row"
              spacing={{ xs: 0.5, sm: 1 }}
              alignItems="center"
              flexWrap="wrap"
              sx={{ gap: { xs: 0.5, sm: 1 }, overflow: 'hidden' }}
            >
              {item && !hideActionsForDoctor && !readOnly && (
                <>
                  {/* Кнопка "Пациент здесь" */}
                  {item.status === "Ожидаем" && (
                    <Button
                      variant="outlined"
                      color="success"
                      size="small"
                      startIcon={<DirectionsWalkOutlined />}
                      onClick={handleArrived}
                    >
                      Пациент здесь
                    </Button>
                  )}



                  {/* Кнопка "Начать прием" — только если "Пациент здесь" и есть невыполненные услуги у врача */}
                  {(item.status?.toLowerCase() === APPOINTMENT_STATUSES.PATIENT_ARRIVED.toLowerCase() || item.status?.toLowerCase() === APPOINTMENT_STATUSES.PAID.toLowerCase() || item.status === APPOINTMENT_STATUSES.COMPLETED) && isDoctor() && hasIncompleteServices && (
                    <Button
                      variant="outlined"
                      color="primary"
                      size="small"
                      startIcon={<MedicalServicesOutlined />}
                      onClick={() => setDoctorWorkOpen(true)}
                    >
                      Начать прием
                    </Button>
                  )}

                  {/* Кнопка "Изменить заключение" — если нет невыполненных услуг, но это Врач и он участник (был исполнителем) */}
                  {isDoctor() && !hasIncompleteServices && item.performer_ids?.includes(employeeId || "") && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<EditOutlined />}
                      onClick={() => setDoctorWorkOpen(true)}
                    >
                      Изменить заключение
                    </Button>
                  )}

                  {/* Кнопка изменения только для админов и регистраторов */}
                  {(isAdmin() || isRegistrator()) && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<EditOutlined />}
                      onClick={() => setEditOpen(true)}
                    >
                      Изменить
                    </Button>
                  )}
                </>
              )}

              {/* ReadOnly Conclusion Toggle Button - Show even if readOnly, but simple without edits. HIDDEN on Mobile as we use Tabs now */}
              {!isMobile && onToggleConclusion && item && (
                (item.has_conclusion || conclusionDoctors.length > 0 || item.conclusion || item.diagnosis_code || item.diagnosis_data)
              ) && (
                  <Button
                    variant={isConclusionVisible ? "contained" : "outlined"}
                    size="small"
                    startIcon={<VisibilityOutlined />}
                    onClick={onToggleConclusion}
                  >
                    {isConclusionVisible ? "Скрыть заключение" : "Заключение"}
                  </Button>
                )}

              {/* Extra header actions */}
              {extraHeaderActions}
            </Stack>

            {/* Второстепенные действия - справа - Show for Admin/SuperAdmin/Receptionist */}
            {item && !hideActionsForDoctor && !readOnly && (isAdmin() || isRegistrator()) && (
              <Stack direction="row" spacing={1}>
                {/* Кнопка отмены приема */}
                {item.status !== APPOINTMENT_STATUSES.PAID && item.status !== APPOINTMENT_STATUSES.CANCELLED && item.status !== APPOINTMENT_STATUSES.PATIENT_NOT_CAME && (
                  <Tooltip title="Отменить запись">
                    <IconButton
                      color="error"
                      size="small"
                      onClick={promptCancel}
                      sx={{
                        border: '1px solid',
                        borderColor: 'error.main',
                        '&:hover': {
                          borderColor: 'error.dark',
                          backgroundColor: (theme) => alpha(theme.palette.error.main, 0.08),
                        }
                      }}
                    >
                      <PersonOffOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}

                {/* Кнопка удаления приема - только для Супер-админа */}
                {isSuperAdmin() && (
                  <Tooltip title="Удалить">
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canDelete || deleting}
                        onClick={promptDelete}
                        sx={{
                          border: '1px solid',
                          borderColor: 'error.main',
                          color: 'error.main',
                          '&:hover': {
                            borderColor: 'error.dark',
                            backgroundColor: (theme) => alpha(theme.palette.error.main, 0.08),
                          },
                          '&.Mui-disabled': {
                            borderColor: 'action.disabled',
                            color: 'action.disabled',
                          },
                        }}
                      >
                        {deleting ? <CircularProgress size={20} color="error" /> : <DeleteOutlineOutlined fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Stack>
            )}
          </Box>
        }
        action={
          !hideCloseButton ? (
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                position: 'absolute',
                right: 8,
                top: 8,
              }}
            >
              <CloseOutlined />
            </IconButton>
          ) : undefined
        }
        sx={{
          px: 3, // Fixed 24px on all mobile/tablet views for consistency
          pb: 1,
          boxSizing: 'border-box'
        }} />
      <Divider />
      <CardContent sx={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        p: 2,
        px: 3, // Fixed 24px
        boxSizing: 'border-box'
      }}>
        {
          loading ? (
            <Typography variant="caption">Загрузка...</Typography>
          ) : item ? (
            <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
              <CalendarMonthOutlined fontSize="medium" sx={{ color: 'primary.onSurface' }} />
              <Typography variant="h6" fontWeight={700} color="text.primary">
                {item.formatted_date}
              </Typography>
              {isNight && (
                <NightlightOutlined sx={{ fontSize: 22, color: 'primary.onSurface' }} />
              )}

              {/* Метаданные создания и изменения */}
              <Stack direction="column" spacing={0} sx={{ ml: 1 }}>
                {item.created_by_name && (
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.725rem', lineHeight: 1.2 }}>
                    Создано: {item.created_by_name} {dayjs(item.created_at).format("DD.MM HH:mm")}
                  </Typography>
                )}
                {item.updated_by_name && item.updated_at && item.updated_at !== item.created_at && (
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.725rem', lineHeight: 1.2 }}>
                    Изм: {item.updated_by_name} {dayjs(item.updated_at).format("DD.MM HH:mm")}
                  </Typography>
                )}
              </Stack>
            </Stack>
          ) : null
        }
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        ) : errorMsg ? (
          <Typography color="error">Ошибка: {errorMsg}</Typography>
        ) : item ? (
          <Stack spacing={3}>
            {/* Status Section */}
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              {(() => {
                const isCardOnly = Number(item.paid_card || 0) > 0 && Number(item.paid_cash || 0) === 0;
                const displayStatus = (item.status === "Оплачено" && isCardOnly) ? "Оплачено безналом" : item.status;
                return (
                  <Chip
                    size="small"
                    label={getStatusConfig(displayStatus).label}
                    icon={getStatusConfig(displayStatus).icon}
                    sx={getStatusChipSx(displayStatus)}
                  />
                );
              })()}
              {item.has_bank_confirmation && (
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
            </Stack>


            {!isDoctor() && !isNurse() && (
              <>
                {/* Payment Information */}
                <PaymentInfoBlock
                  payment={{
                    baseTotal: Number(item.total_amount || item.total_cost || item.estimated_total || item.discount || 0),
                    cash: Number(item.paid_cash || 0),
                    card: Number(item.paid_card || 0),
                    balance: Number(item.paid_balance || 0),
                    bonuses: Number(item.paid_bonuses || 0),
                    discountAmount: Number(item.discount || 0),
                    discountPercent: (() => {
                      const base = Number(item.total_amount || item.total_cost || item.estimated_total || item.discount || 0);
                      const disc = Number(item.discount || 0);
                      if (base > 0 && disc > 0) return Math.round((disc / base) * 100);
                      return 0;
                    })(),
                    finalTotal: Math.max(0, Number(item.total_amount || item.total_cost || item.estimated_total || item.discount || 0) - Number(item.discount || 0)),
                    debt: Number(item.debt || 0),
                    status: item.status,
                  }}
                  variant="detailed"
                  showIcons={true}
                  actionButton={
                    showPaymentAction &&
                      item.status !== APPOINTMENT_STATUSES.CANCELLED &&
                      item.status !== APPOINTMENT_STATUSES.PATIENT_NOT_CAME ? (
                      (() => {
                        const hasPayment =
                          (item.paid_cash ?? 0) > 0 ||
                          (item.paid_card ?? 0) > 0 ||
                          (item.paid_balance ?? 0) > 0 ||
                          (item.paid_bonuses ?? 0) > 0;
                        const showBankConfirm =
                          (item.paid_card ?? 0) > 0 &&
                          item.status === APPOINTMENT_STATUSES.PAID &&
                          !item.has_bank_confirmation;
                        return (
                          <Stack
                            direction={{ xs: "column", md: "row" }}
                            spacing={1}
                          >
                            <Button
                              variant={hasPayment ? "outlined" : "contained"}
                              color={hasPayment ? "primary" : "success"}
                              size="small"
                              onClick={() => setPaymentOpen(true)}
                              sx={{ boxShadow: 'none', textTransform: 'none', whiteSpace: 'nowrap' }}
                            >
                              {hasPayment ? "Изменить оплату" : "Принять оплату"}
                            </Button>
                            {showBankConfirm && (
                              <Button
                                variant="outlined"
                                color="info"
                                size="small"
                                onClick={() => setBankConfirmOpen(true)}
                                sx={{ boxShadow: 'none', textTransform: 'none', whiteSpace: 'nowrap' }}
                              >
                                Подтвердить оплату
                              </Button>
                            )}
                          </Stack>
                        );
                      })()
                    ) : undefined
                  }
                />
                <Divider />
              </>
            )}

            {/* Patient */}
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Пациент
              </Typography>
              <Paper
                variant={isMobile ? "elevation" : "outlined"}
                elevation={0}
                onClick={() => item.patient_id && setPatientDrawerOpen(true)}
                sx={{
                  p: 2,
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04), // slightly darker for better contrast without border
                  cursor: item.patient_id ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                  '&:hover': item.patient_id ? {
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
                    borderColor: 'primary.main',
                  } : {},
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Avatar
                  src={patientData?.photo_url || undefined}
                  sx={{
                    width: 48,
                    height: 48,
                    mr: 2,
                    bgcolor: 'primary.light',
                    color: 'primary.contrastText',
                  }}
                >
                  {item.patient_name?.charAt(0) || 'П'}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body1" fontWeight={600}>
                    {item.patient_name || "Не указан"}
                  </Typography>

                  {patientData?.phone && (
                    <Typography
                      variant="body2"
                      color="primary"
                      component="a"
                      href={`tel:${patientData.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {patientData.phone}
                    </Typography>
                  )}

                  {/* Patient Balance — visible for admin/registrator when patient has funds */}
                  {canSeeBalance && patientBalance && (patientBalance.balance > 0 || patientBalance.bonuses > 0) && (
                    <Stack direction="row" spacing={1.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                      {patientBalance.balance > 0 && (
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">Счёт:</Typography>
                          <Typography variant="caption" fontWeight={700} color="success.main">
                            {patientBalance.balance.toLocaleString()} сом
                          </Typography>
                        </Stack>
                      )}
                      {patientBalance.bonuses > 0 && (
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">Бонусы:</Typography>
                          <Typography variant="caption" fontWeight={700} color="warning.main">
                            {patientBalance.bonuses.toLocaleString()} сом
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                  )}
                </Box>
              </Paper>
            </Box>


            {/* Services Grouped by Doctor */}
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Услуги и специалисты
              </Typography>
              <Stack spacing={2}>
                {(() => {
                  const { grouped, noDoctorServices } = servicesGrouped;

                  if (Object.keys(grouped).length === 0 && noDoctorServices.length === 0) {
                    return (
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.02),
                        }}
                      >
                        <Typography variant="body1" color="text.secondary">—</Typography>
                      </Paper>
                    );
                  }

                  const renderServiceItem = (svc: any, idx: number) => {
                    if (!svc) return null;
                    const serviceId = svc.id ?? svc.service_id ?? null;
                    const sidStr = serviceId ? String(serviceId) : null;
                    const serviceName = svc.name ?? svc.service_name ?? 'Услуга';
                    const servicePrice = Number(svc.price ?? svc.cost ?? 0);
                    const servicePhoto = svc.image_url || (sidStr && servicesPhotos ? servicesPhotos.get(sidStr) : null);

                    return (
                      <Paper
                        key={idx}
                        variant="outlined"
                        onClick={() => {
                          if (serviceId) {
                            setSelectedServiceId(serviceId);
                            setServiceDrawerOpen(true);
                          }
                        }}
                        sx={{
                          p: 1.5,
                          pl: 2,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          bgcolor: 'background.paper',
                          cursor: serviceId ? 'pointer' : 'default',
                          transition: 'all 0.2s',
                          '&:hover': serviceId ? {
                            borderColor: 'primary.main',
                            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.02),
                          } : {},
                        }}
                      >
                        <Avatar
                          src={servicePhoto || undefined}
                          variant="rounded"
                          sx={{
                            width: 40,
                            height: 40,
                            bgcolor: 'action.selected',
                            color: 'text.secondary',
                          }}
                        >
                          <MedicalServicesOutlined fontSize="small" />
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {serviceName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatKGS(servicePrice)}
                          </Typography>
                        </Box>
                      </Paper>
                    );
                  };

                  return (
                    <Stack spacing={2}>
                      {Object.values(grouped).map((group) => (
                        <Box key={group.doctor.id}>
                          {/* Doctor Header */}
                          <Paper
                            variant="outlined"
                            onClick={() => {
                              setSelectedDoctorId(group.doctor.id);
                              setDoctorDrawerOpen(true);
                            }}
                            sx={{
                              p: 1.5,
                              mb: 1,
                              display: 'flex',
                              alignItems: 'center',
                              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                              borderColor: (theme) => alpha(theme.palette.primary.main, 0.1),
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              '&:hover': {
                                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                                borderColor: 'primary.main',
                              },
                            }}
                          >
                            <Avatar
                              src={group.doctor.photo || undefined}
                              sx={{
                                width: 32,
                                height: 32,
                                mr: 1.5,
                                bgcolor: 'primary.main',
                                fontSize: '0.875rem'
                              }}
                            >
                              {group.doctor.name?.charAt(0) || '?'}
                            </Avatar>
                            <Typography variant="subtitle2" fontWeight={700}>
                              {group.doctor.name || "Врач"}
                            </Typography>
                          </Paper>

                          {/* Doctor's Services */}
                          <Stack spacing={1} sx={{ pl: 2 }}>
                            {group.services.map((svc, idx) => renderServiceItem(svc, idx))}
                          </Stack>
                        </Box>
                      ))}

                      {/* Services without doctor */}
                      {noDoctorServices.length > 0 && (
                        <Box>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ ml: 1 }}>
                            Другие услуги
                          </Typography>
                          <Stack spacing={1}>
                            {noDoctorServices.map((svc, idx) => renderServiceItem(svc, idx))}
                          </Stack>
                        </Box>
                      )}
                    </Stack>
                  );
                })()}
              </Stack>
            </Box>

            {/* Товары */}
            {appointmentProducts.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                  Товары
                </Typography>
                <Stack spacing={1.5}>
                  {appointmentProducts.map((product, idx) => (
                    <Paper
                      key={idx}
                      variant="outlined"
                      sx={{
                        p: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        bgcolor: (theme) => alpha(theme.palette.success.main, 0.02),
                        borderColor: (theme) => alpha(theme.palette.success.main, 0.2),
                      }}
                    >
                      <Avatar
                        src={product.photo_url || undefined}
                        variant="rounded"
                        sx={{
                          width: 48,
                          height: 48,
                          bgcolor: 'success.lighter',
                          color: 'success.main',
                        }}
                      >
                        📦
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" fontWeight={600}>
                          {product.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                          {product.quantity} x {formatKGS(product.price)} = <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{formatKGS(product.price * product.quantity)}</Box>
                        </Typography>
                      </Box>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Complaints, Conclusion & Comments */}
            {(item.complaints || item.conclusion || item.admin_comment) && (
              <Stack spacing={2}>
                {item.complaints && (
                  <Box>
                    <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                      <DescriptionOutlined color="primary" fontSize="small" />
                      <Typography variant="subtitle2" color="text.secondary">
                        Жалобы пациента
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ bgcolor: "background.paper", p: 1, borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                      {item.complaints}
                    </Typography>
                  </Box>
                )}

                {item.doctor_complaints && (
                  <Box>
                    <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                      <DescriptionOutlined color="secondary" fontSize="small" />
                      <Typography variant="subtitle2" color="text.secondary">
                        Жалобы (врач)
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ bgcolor: "background.paper", p: 1, borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                      {item.doctor_complaints}
                    </Typography>
                  </Box>
                )}

                {item.admin_comment && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Комментарий администратора
                    </Typography>
                    <Typography variant="body2" sx={{ bgcolor: "background.paper", p: 1, borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                      {item.admin_comment}
                    </Typography>
                  </Box>
                )}
              </Stack>
            )}

            {(isDoctor() || isNurse()) && (
              <>
                <Divider />
                <Typography variant="caption" color="text.secondary" display="block">
                  Информация об оплате
                </Typography>
                <PaymentInfoBlock
                  payment={{
                    baseTotal: Number(item.total_amount || item.total_cost || item.estimated_total || item.discount || 0),
                    cash: Number(item.paid_cash || 0),
                    card: Number(item.paid_card || 0),
                    discountAmount: Number(item.discount || 0),
                    discountPercent: (() => {
                      const base = Number(item.total_amount || item.total_cost || item.estimated_total || item.discount || 0);
                      const disc = Number(item.discount || 0);
                      if (base > 0 && disc > 0) return Math.round((disc / base) * 100);
                      return 0;
                    })(),
                    finalTotal: Math.max(0, Number(item.total_amount || item.total_cost || item.estimated_total || item.discount || 0) - Number(item.discount || 0)),
                    debt: Number(item.debt || 0),
                    status: item.status,
                  }}
                  variant="detailed"
                  showIcons={true}
                  actionButton={
                    showPaymentAction &&
                      item.status !== APPOINTMENT_STATUSES.CANCELLED &&
                      item.status !== APPOINTMENT_STATUSES.PATIENT_NOT_CAME ? (
                      (() => {
                        const hasPayment = (item.paid_cash ?? 0) > 0 || (item.paid_card ?? 0) > 0;
                        return (
                          <Button
                            variant={hasPayment ? "outlined" : "contained"}
                            color={hasPayment ? "primary" : "success"}
                            size="small"
                            onClick={() => setPaymentOpen(true)}
                            sx={{
                              boxShadow: 'none',
                              textTransform: 'none',
                              whiteSpace: 'nowrap',
                              minWidth: hasPayment ? 'auto' : undefined,
                              px: hasPayment ? 1.5 : 2,
                            }}
                          >
                            {hasPayment ? "Изменить оплату" : "Принять оплату"}
                          </Button>
                        );
                      })()
                    ) : undefined
                  }
                />
              </>
            )}

            {/* Actions */}
            {/* Actions moved to Header */}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" align="center">
            Прием не найден
          </Typography>
        )}
      </CardContent>

      {/* Sidebar редактирования приема */}
      {item ? (
        <EditAppointmentSidebar
          key={item.id}
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          item={item}
          initialProductRows={appointmentProducts.map(p => ({
            productId: p.sellable_item_id,
            quantity: p.quantity
          }))}
          onDeleted={() => {
            setEditOpen(false);
            onClose();
            onUpdate();
          }}
          onSaved={() => {
            setEditOpen(false);
            onUpdate();
            handleRefresh();
          }}
        />
      ) : null}


      {/* Confirmation Dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      >
        <DialogTitle>
          {confirmAction === 'delete' ? "Удалить прием?" : "Отменить запись?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmAction === 'delete'
              ? "Это действие необратимо. Прием будет полностью удален из базы данных."
              : "Запись будет переведена в статус 'Отменено'. Она не удалится из истории."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Назад</Button>
          <Button
            onClick={handleConfirmAction}
            color="error"
            variant="contained"
            autoFocus
          >
            {confirmAction === 'delete' ? "Удалить" : "Подтвердить отмену"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment Sidebar */}
      <PaymentSidebar
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        appointment={item}
        onSaved={() => {
          onUpdate();
          handleRefresh();
        }}
        productsCost={productsTotal}
      />

      {/* Drawer быстрого просмотра пациента */}
      <PatientQuickViewDrawer
        open={patientDrawerOpen}
        onClose={() => setPatientDrawerOpen(false)}
        patientId={item?.patient_id || null}
        onStartAppointment={onStartAppointment}
      />

      {/* Drawer быстрого просмотра услуги */}
      <ServiceQuickViewDrawer
        open={serviceDrawerOpen}
        onClose={() => {
          setServiceDrawerOpen(false);
          setSelectedServiceId(null);
        }}
        serviceId={selectedServiceId}
      />

      {/* Drawer быстрого просмотра врача */}
      <DoctorQuickViewDrawer
        open={doctorDrawerOpen}
        onClose={() => {
          setDoctorDrawerOpen(false);
          setSelectedDoctorId(null);
        }}
        doctorId={selectedDoctorId}
      />

      {/* Drawer работы врача с приемом (заключение + диагноз) */}
      <DoctorWorkDrawer
        open={doctorWorkOpen}
        onClose={() => setDoctorWorkOpen(false)}
        appointment={item}
        onSuccess={() => {
          onUpdate();
          handleRefresh();
        }}
      />

      {/* Bank payment confirmation modal */}
      {appointmentId && (
        <BankConfirmationModal
          open={bankConfirmOpen}
          appointmentId={appointmentId}
          onClose={() => setBankConfirmOpen(false)}
          onConfirmed={() => {
            handleRefresh();
            onUpdate();
          }}
        />
      )}
    </Card>
  );
};

export const AppointmentDetailsCard = React.memo(AppointmentDetailsCardBase);

export default AppointmentDetailsCard;
