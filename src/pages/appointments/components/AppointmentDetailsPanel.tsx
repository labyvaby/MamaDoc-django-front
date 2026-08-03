import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EditOutlined from "@mui/icons-material/EditOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PersonOffOutlined from "@mui/icons-material/PersonOffOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DirectionsWalkOutlined from "@mui/icons-material/DirectionsWalkOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import StarOutlineRounded from "@mui/icons-material/StarOutlineRounded";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import type { DjangoAppointment } from "../../../api/appointments";
import { getAppointmentPayments } from "../../../api/payments";
import { getPatient } from "../../../api/patients";
import { formatPatientAge } from "../../../utility/age";
import { getPatientSchedule } from "../../../api/vaccinations";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../../api/queryKeys";
import ServiceEmployeeGroups, {
  type ServiceEmployeeGroup,
} from "../../../components/appointments/ServiceEmployeeGroups";
import { PaymentInfoBlock } from "../../../components/ui";
import { useT } from "../../../i18n/VerticalProvider";
import { tt } from "../../../i18n/t";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { useAuthUserNames } from "../../../hooks/useAuthUserNames";
import DjangoConclusionDrawer from "../DjangoConclusionDrawer";
import { getConclusionSlots, type ConclusionSlot } from "../../../api/medical";
import PatientQuickViewDrawer from "../../../components/patients/DjangoPatientQuickViewDrawer";
import ServiceQuickViewDrawer from "../../../components/services/DjangoServiceQuickViewDrawer";
import ProductQuickViewDrawer from "../../../components/products/DjangoProductQuickViewDrawer";
import AppointmentPatientCard from "./details/AppointmentPatientCard";
import AppointmentWhenBlock from "./details/AppointmentWhenBlock";
import AppointmentProductLines from "./details/AppointmentProductLines";
import AppointmentConsumptions from "./details/AppointmentConsumptions";
import AppointmentDueDoses from "./details/AppointmentDueDoses";
import { useAppointmentReview } from "../../reviews/AppointmentReviewBlock";
import { useInlineFit } from "../../../hooks/useInlineFit";

/** Сколько действий шапки показывать кнопками; остальные уходят в меню «⋯». */
const INLINE_ACTIONS_LIMIT = 3;

/** Действие шапки карточки — рисуется кнопкой или пунктом меню. */
interface HeaderAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: "primary" | "info" | "success" | "error";
  /** Действие включено (кнопка залита) — например, открытая колонка заключения. */
  active?: boolean;
  disabled?: boolean;
}
import DoctorQuickViewDrawer from "../../../components/employees/DjangoDoctorQuickViewDrawer";

interface AppointmentDetailsPanelProps {
  appointment: DjangoAppointment;
  canUpdate: boolean;
  canManageFinance: boolean;
  canViewFinance: boolean;
  canViewConclusions: boolean;
  canDelete?: boolean;
  /** vaccinations.record — показывать «Ввести прививку» в карточке приёма. */
  canRecordVaccination?: boolean;
  /** Открыта ли третья колонка с заключением (состояние страницы). */
  isConclusionVisible?: boolean;
  /** Переключить третью колонку с заключением. */
  onToggleConclusion?: () => void;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
  /** Пациент подтвердил визит по телефону: scheduled → confirmed. */
  onConfirmVisit?: (a: DjangoAppointment) => void;
  onArrived?: (a: DjangoAppointment) => void;
  /** Врач начинает приём: перевести в in_progress (если ещё не завершён). */
  onStartAppointment?: (a: DjangoAppointment) => void;
  /**
   * Ввести прививку по этому приёму (регистратура). prefill — из прогноза
   * календаря (положенная доза): подставит вакцину и № дозы в дровер.
   */
  onRecordVaccination?: (
    a: DjangoAppointment,
    prefill?: { vaccineId: number; doseNumber: number },
  ) => void;
  /** Групповой ввод нескольких положенных доз за один визит. */
  onRecordVaccinationMulti?: (
    a: DjangoAppointment,
    doses: { vaccineId: number; vaccineName: string; doseNumber: number }[],
  ) => void;
  onCancelAppt?: (a: DjangoAppointment) => void;
  onDelete?: (a: DjangoAppointment) => void;
  onClose?: () => void;
}

function som(value?: string | number | null): string {
  const n = Number(value ?? 0);
  return tt("appointments:details.amountWithCurrency", {
    amount: isNaN(n) ? 0 : n.toLocaleString("ru-RU"),
  });
}

const AppointmentDetailsPanel: React.FC<AppointmentDetailsPanelProps> = ({
  appointment: appt,
  canUpdate,
  canManageFinance,
  canViewFinance,
  canViewConclusions,
  canDelete,
  canRecordVaccination,
  isConclusionVisible = false,
  onToggleConclusion,
  onEdit,
  onPay,
  onConfirmVisit,
  onArrived,
  onStartAppointment,
  onRecordVaccination,
  onRecordVaccinationMulti,
  onCancelAppt,
  onDelete,
  onClose,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  // На узком экране кнопкам шапки не хватает места даже вдвоём — держим
  // инлайн только самые частые действия, остальное уходит в «⋯» (там уже
  // живут отмена/удаление, паттерн знакомый).
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const orgId = useApiOrgId();
  const { isDoctor, isNurse, activeEmployee } = usePermissions();
  // Клик по товару открывает карточку из справочника — только при праве на него.
  const canViewProducts = useCan(["warehouse.view", "warehouse.sales.view"]);

  // Кто создал/изменил приём: бэк отдаёт только auth-user id, имя — из
  // справочника сотрудников (authUserId → ФИО).
  const userNames = useAuthUserNames(appt.createdById != null || appt.updatedById != null);
  const createdByName = appt.createdById != null ? userNames[appt.createdById] : undefined;
  const updatedByName = appt.updatedById != null ? userNames[appt.updatedById] : undefined;

  // Заключение теперь открывается отдельной (третьей) колонкой на уровне
  // страницы — карточка лишь переключает её через onToggleConclusion.
  const showConclusions = isConclusionVisible;
  const openConclusions = React.useCallback(() => {
    if (!isConclusionVisible) onToggleConclusion?.();
  }, [isConclusionVisible, onToggleConclusion]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<"cancel" | "delete" | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);

  // Quick-view drawers (краткая информация по клику: пациент / врач / услуга / товар)
  const [patientDrawerOpen, setPatientDrawerOpen] = React.useState(false);
  const [doctorDrawerOpen, setDoctorDrawerOpen] = React.useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = React.useState<number | null>(null);
  const [selectedDoctorName, setSelectedDoctorName] = React.useState<string | null>(null);
  const [selectedDoctorPhotoUrl, setSelectedDoctorPhotoUrl] = React.useState<string | null>(null);
  const [serviceDrawerOpen, setServiceDrawerOpen] = React.useState(false);
  const [selectedServiceId, setSelectedServiceId] = React.useState<number | null>(null);
  const [productDrawerOpen, setProductDrawerOpen] = React.useState(false);
  const [selectedProductId, setSelectedProductId] = React.useState<number | null>(null);
  const [selectedProductName, setSelectedProductName] = React.useState<string | null>(null);

  const payQuery = useQuery({
    queryKey: djangoQueryKeys.appointments.payments(appt.id),
    queryFn: ({ signal }) => getAppointmentPayments(appt.id, signal),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    enabled: canViewFinance || canManageFinance,
  });

  /**
   * Карта пациента отдельным запросом: приём отдаёт только id/ФИО/телефон/фото,
   * а регистратуре нужны возраст (педиатрия — доза и тон разговора) и метка
   * чёрного списка. Запрос лёгкий и кэшируется react-query на все приёмы этого
   * пациента; ошибку глотаем — карточка приёма из-за неё падать не должна.
   */
  const patientCardQuery = useQuery({
    queryKey: djangoQueryKeys.patients.detail(appt.patient?.id ?? 0),
    queryFn: () => getPatient(appt.patient!.id),
    enabled: appt.patient?.id != null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: false,
  });
  const patientCard = patientCardQuery.data;
  const patientAge = formatPatientAge(patientCard?.birthDate);

  // Прогноз календаря пациента: положенные (planned/overdue) дозы — чтобы ввести
  // прививку в 1–2 клика прямо из приёма (вакцина/доза предзаполнятся).
  const patientId = appt.patient?.id ?? null;
  const scheduleQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.patientSchedule(patientId ?? 0),
    queryFn: ({ signal }) => getPatientSchedule(patientId!, orgId, signal),
    enabled: canRecordVaccination && patientId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const dueDoses = React.useMemo(
    () =>
      (scheduleQuery.data ?? [])
        .filter((s) => s.status === "planned" || s.status === "overdue")
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    [scheduleQuery.data],
  );


  // Запрос отзыва — статус виден в AppointmentWhenBlock, кнопка живёт в
  // общем списке действий шапки (см. ниже, actions.push key "review").
  const review = useAppointmentReview(appt.id);

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

  // Подтверждение банка бэк шлёт не на всех эндпоинтах, в типе приёма поля нет.
  const hasBankConfirmation = (appt as DjangoAppointment & { hasBankConfirmation?: boolean })
    .hasBankConfirmation;

  const hasFinanceInfo = !!(totalAmount && totalAmount !== "0.00" && totalAmount !== "0");
  const hasDiscount = !!(discountAmount && discountAmount !== "0.00" && discountAmount !== "0");
  const hasPaid = !!(paidTotal && paidTotal !== "0.00" && paidTotal !== "0");
  const hasRefund = !!(refundedTotal && refundedTotal !== "0.00" && refundedTotal !== "0");

  // Оплату приняли — визит де-факто состоялся: «Подтвердить» и «Пациент здесь»
  // больше не нужны, а запрос отзыва, наоборот, доступен только с этого
  // момента (см. actions ниже). Смотрим на деньги,
  // а не на статус приёма: бэк оставляет его scheduled/confirmed и после оплаты.
  // «discounted» без внесённых сумм — скидка 100%, тоже закрытый расчёт.
  const isPaymentAccepted = hasPaid || payStatus === "paid" || payStatus === "discounted";

  const cashPaid = pay?.payments?.reduce((s, p) => p.method === "cash" ? s + Number(p.amount) : s, 0) ?? 0;
  const cardPaid = pay?.payments?.reduce((s, p) => p.method === "card" ? s + Number(p.amount) : s, 0) ?? 0;
  const balancePaid = pay?.payments?.reduce((s, p) => p.method === "balance" ? s + Number(p.amount) : s, 0) ?? 0;
  const bonusesPaid = pay?.payments?.reduce((s, p) => p.method === "bonus" ? s + Number(p.amount) : s, 0) ?? 0;
  const insurancePaid = pay?.payments?.reduce((s, p) => p.method === "insurance" ? s + Number(p.amount) : s, 0) ?? 0;
  // Метаданные страховки из первой insurance-строки журнала.
  const insurancePayment = pay?.payments?.find((p) => p.method === "insurance");

  // Врач — исполнитель? Есть невыполненные услуги для него?
  const isDoctorRole = isDoctor();
  const isNurseRole = isNurse();
  const isNonDoctor = !isDoctorRole && !isNurseRole;

  // Ниже покажется PaymentInfoBlock со своим статусом крупно (см. paymentBlock) —
  // чип «Оплачено» в шапке для этого зрителя будет дублем, прячем его там.
  const financeBlockVisible = (canViewFinance || canManageFinance) && hasFinanceInfo;

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

  /**
   * Источник для чипов статуса: платёжные поля берём из журнала оплат
   * (payQuery свежее полей приёма), а способы оплаты собираем из самих
   * платежей — по ним компонент отличает безнал («Оплачено» синим) от
   * наличных и рисует иконки способов.
   */
  const statusChipsSource = React.useMemo(() => {
    const methodsFromPayments = [
      cashPaid > 0 && "cash",
      cardPaid > 0 && "card",
      balancePaid > 0 && "balance",
      bonusesPaid > 0 && "bonus",
      insurancePaid > 0 && "insurance",
    ].filter(Boolean) as string[];

    return {
      ...appt,
      paymentStatus: payStatus,
      paidTotal,
      paymentMethods:
        methodsFromPayments.length > 0 ? methodsFromPayments : appt.paymentMethods,
    };
  }, [appt, payStatus, paidTotal, cashPaid, cardPaid, balancePaid, bonusesPaid, insurancePaid]);

  // Services grouped by employee — исполнитель и его услуги одной группой
  const servicesByEmployee = React.useMemo<ServiceEmployeeGroup[]>(() => {
    const map = new Map<string, ServiceEmployeeGroup & { rawTotal: number }>();
    for (const sl of appt.services) {
      const key = sl.employee ? String(sl.employee.id) : "__no_doc__";
      if (!map.has(key)) {
        map.set(key, {
          employeeId: sl.employee?.id ?? null,
          employeeName: sl.employee?.fullName ?? t("details.noSpecialist"),
          employeePhotoUrl: sl.employee?.photoUrl ?? null,
          lines: [],
          total: null,
          rawTotal: 0,
        });
      }
      const group = map.get(key)!;
      const lineAmount = Number(sl.price) > 0 ? sl.price : (sl.service?.basePrice ?? sl.price);
      group.lines.push({
        lineId: sl.id,
        serviceId: sl.service?.id ?? null,
        name: sl.service?.name ?? "—",
        imageUrl: sl.service?.imageUrl ?? null,
        quantity: sl.quantity,
        amount: som(lineAmount),
        conclusionState: sl.conclusionState,
      });
      group.rawTotal += Number(lineAmount) || 0;
    }
    // Итог по исполнителю показываем только когда услуг больше одной —
    // при единственной услуге он дублировал бы её цену.
    return Array.from(map.values()).map(({ rawTotal, ...group }) => ({
      ...group,
      total: group.lines.length > 1 ? som(rawTotal) : null,
    }));
  }, [appt.services]);

  const paymentBlock = (withBalanceBonuses: boolean) => {
    const payment = {
      baseTotal: Number(totalAmount || 0),
      cash: cashPaid,
      card: cardPaid,
      balance: withBalanceBonuses ? balancePaid : 0,
      bonuses: withBalanceBonuses ? bonusesPaid : 0,
      insurance: insurancePaid,
      insurerName: insurancePayment?.insurerName ?? null,
      policyNumber: insurancePayment?.policyNumber || null,
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
            {hasPaid ? t("details.editPayment") : t("details.acceptPayment")}
          </Button>
        </Stack>
      ) : undefined;

    return (
      <PaymentInfoBlock
        payment={payment}
        variant="detailed"
        showIcons
        dense
        // У оплаченного приёма чипа скидки нет (там «Оплачено») — шапка
        // единственное место, где виден дисконт.
        showDiscountPercent
        actionButton={actionBtn}
      />
    );
  };

  /**
   * Действия шапки одним списком в порядке важности. Раньше они рисовались
   * подряд шестью кнопками: у админа на активном приёме шапка переносилась на
   * вторую строку и толкала содержимое вниз. Теперь первые INLINE_ACTIONS_LIMIT
   * видны кнопками, остальное — в меню «⋯».
   */
  const actions: HeaderAction[] = [];

  // Подтвердить — пациент подтвердил визит по телефону, но ещё не пришёл.
  if (canUpdate && onConfirmVisit && appt.status === "scheduled" && !isPaymentAccepted) {
    actions.push({
      key: "confirm",
      label: t("details.confirm"),
      icon: <EventAvailableOutlined fontSize="small" />,
      color: "info",
      onClick: () => onConfirmVisit(appt),
    });
  }

  // Пациент здесь — пока пациента не отметили пришедшим.
  if (
    canUpdate &&
    onArrived &&
    (appt.status === "scheduled" || appt.status === "confirmed") &&
    !isPaymentAccepted
  ) {
    actions.push({
      key: "arrived",
      label: t("details.patientArrived"),
      icon: <DirectionsWalkOutlined fontSize="small" />,
      color: "success",
      onClick: () => onArrived(appt),
    });
  }

  // Начать приём — врач-исполнитель с незавершёнными услугами, при любом
  // активном статусе: регистратор мог не отметить «Пациент здесь», а врач всё
  // равно должен мочь начать приём.
  if (isDoctorRole && hasIncompleteServices && isAppointmentActive && canViewConclusions) {
    actions.push({
      key: "start",
      label: t("details.startVisit"),
      icon: startBusy ? (
        <CircularProgress size={14} color="inherit" />
      ) : (
        <MedicalServicesOutlined fontSize="small" />
      ),
      color: "primary",
      disabled: startBusy,
      onClick: handleStartAppointment,
    });
  }

  // Изменить заключение — врач-исполнитель, у которого заключение уже есть.
  if (isDoctorRole && !hasIncompleteServices && isPerformer && canViewConclusions) {
    actions.push({
      key: "edit-conclusion",
      label: t("details.editConclusion"),
      icon: <EditOutlined fontSize="small" />,
      onClick: openConclusions,
    });
  }

  if (canUpdate) {
    actions.push({
      key: "edit",
      label: t("details.edit"),
      icon: <EditOutlined fontSize="small" />,
      onClick: () => onEdit(appt),
    });
  }

  // Запросить отзыв — только после принятой оплаты: до расчёта просить отзыв
  // не о чем. Низкоприоритетное действие, обычно уходит в меню «⋯»;
  // если запрос уже был, кнопка предлагает переотправить.
  if (review.showButton && isPaymentAccepted) {
    actions.push({
      key: "review",
      label: review.latest ? "Переотправить отзыв" : "Запросить отзыв",
      icon: review.isPending ? (
        <CircularProgress size={14} color="inherit" />
      ) : (
        <StarOutlineRounded fontSize="small" />
      ),
      disabled: review.isPending,
      onClick: review.requestReview,
    });
  }

  // Ввести прививку — право vaccinations.record, приём с пациентом и активный.
  if (canRecordVaccination && onRecordVaccination && appt.patient && isAppointmentActive) {
    actions.push({
      key: "vaccine",
      label: t("details.recordVaccine"),
      icon: <VaccinesOutlined fontSize="small" />,
      color: "primary",
      onClick: () => onRecordVaccination(appt),
    });
  }

  // Заключение — только просмотр уже существующего (создание идёт через «Начать приём»).
  if (canViewConclusions && hasConclusion) {
    actions.push({
      key: "conclusion",
      label: showConclusions ? t("details.hideConclusion") : t("details.conclusion"),
      icon: showConclusions ? (
        <VisibilityOutlined fontSize="small" />
      ) : (
        <DescriptionOutlined fontSize="small" />
      ),
      active: showConclusions,
      onClick: () => onToggleConclusion?.(),
    });
  }

  // Отмена — заметная отдельная кнопка: это частое действие регистратуры.
  // Удаление остаётся в меню, чтобы их нельзя было перепутать.
  let cancelAction: HeaderAction | null = null;
  if (canUpdate && onCancelAppt && !isCancelled) {
    cancelAction = {
      key: "cancel",
      label: t("details.cancelRecord"),
      icon: <PersonOffOutlined fontSize="small" />,
      onClick: () => {
        setConfirmAction("cancel");
        setConfirmOpen(true);
      },
    };
  }

  const dangerActions: HeaderAction[] = [];
  if (canDelete && onDelete) {
    dangerActions.push({
      key: "delete",
      label: t("details.delete"),
      icon: <DeleteOutlineOutlined fontSize="small" />,
      onClick: () => {
        setConfirmAction("delete");
        setConfirmOpen(true);
      },
    });
  }

  // Верхняя граница — чтобы шапка не превращалась в частокол кнопок даже на
  // широком мониторе; ниже её useInlineFit подрезает до фактически влезающего.
  const inlineLimit = Math.min(actions.length, isMobile ? 2 : INLINE_ACTIONS_LIMIT);
  const fit = useInlineFit(inlineLimit);
  const inlineActions = actions.slice(0, fit.visible);
  const overflowActions = actions.slice(fit.visible);
  const hasMenu = overflowActions.length > 0 || dangerActions.length > 0;

  const runFromMenu = (action: HeaderAction) => {
    setMenuAnchor(null);
    action.onClick();
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
            /* Основные действия — кнопками, остальное в меню «⋯». Ряд не
               переносится и не скроллится: useInlineFit меряет доступную
               ширину и оставляет ровно столько кнопок, сколько влезает целиком
               (на 1280 колонка ~360px — это одна кнопка плюс «Отменить»).
               «⋯» вынесено из измеряемого ряда и прибито справа. */
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                alignItems: "center",
                gap: { xs: 0.5, sm: 1 },
                // width/maxWidth обязательны: без них ряд рос по контенту и
                // вылезал за шапку, а замер в useInlineFit не видел переполнения.
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                // Место под крестик закрытия — он висит абсолютом в правом
                // верхнем углу шапки, «⋯» не должно под него заезжать.
                pr: onClose ? 4 : 0,
              }}
            >
              <Stack
                ref={fit.ref}
                direction="row"
                alignItems="center"
                useFlexGap
                sx={{
                  gap: { xs: 0.5, sm: 1 },
                  // nowrap + hidden — условие корректного замера в useInlineFit:
                  // clientWidth = доступное место, scrollWidth = ширина кнопок.
                  flexWrap: "nowrap",
                  overflow: "hidden",
                  // basis 0, а не auto: иначе ряд растёт по контенту и всегда
                  // «влезает» сам в себя.
                  flex: "1 1 0",
                  minWidth: 0,
                }}
              >
                {inlineActions.map((action) => (
                  <Button
                    key={action.key}
                    size="small"
                    variant={action.active ? "contained" : "outlined"}
                    color={action.color ?? "primary"}
                    startIcon={action.icon}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                  >
                    {action.label}
                  </Button>
                ))}

                {cancelAction && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={cancelAction.icon}
                    onClick={cancelAction.onClick}
                    sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                  >
                    {cancelAction.label}
                  </Button>
                )}
              </Stack>

              {hasMenu && (
                <Tooltip title={t("details.moreActions")}>
                  <IconButton
                    size="small"
                    onClick={(e) => setMenuAnchor(e.currentTarget)}
                    sx={{ flexShrink: 0, alignSelf: "center" }}
                  >
                    <MoreVertOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
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
            {/* Пациент, возраст, телефон + предупреждения (чёрный список,
                комментарий администратора) — первым блоком карточки. */}
            <AppointmentPatientCard
              patient={appt.patient}
              age={patientAge}
              isBlacklisted={patientCard?.isBlacklisted}
              blacklistReason={patientCard?.blacklistReason}
              adminComment={appt.adminComment}
              onOpenPatient={appt.patient ? () => setPatientDrawerOpen(true) : undefined}
            />

            {/* Когда приём, относительный день, статусы и отзыв. */}
            <AppointmentWhenBlock
              appointmentId={appt.id}
              scheduledAt={appt.scheduledAt}
              endsAt={appt.endsAt}
              isNight={appt.isNight}
              createdAt={appt.createdAt}
              updatedAt={appt.updatedAt}
              createdByName={createdByName}
              updatedByName={updatedByName}
              hasBankConfirmation={hasBankConfirmation}
              statusSource={statusChipsSource}
              paymentsLoading={payQuery.isLoading}
              hidePaymentChip={financeBlockVisible}
            />

            {/* ── Payment block — non-doctor/nurse ── */}
            {isNonDoctor && (canViewFinance || canManageFinance) && (
              <>
                {hasFinanceInfo ? (
                  // Сумма и кнопка оплаты закреплены: на приёме с несколькими
                  // услугами и жалобами блок уезжал вверх, и касса теряла из
                  // виду и остаток, и кнопку.
                  <Box
                    sx={{
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      bgcolor: "background.paper",
                      pb: 0.5,
                    }}
                  >
                    {paymentBlock(true)}
                  </Box>
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
                      {t("details.acceptPayment")}
                    </Button>
                  )
                )}
                {hasRefund && (
                  <Typography variant="caption" color="error.main" fontWeight={600} display="block">
                    {t("details.refundLabel", { amount: som(refundedTotal) })}
                  </Typography>
                )}
                <Divider />
              </>
            )}

            {/* ── Services grouped by doctor ── */}
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                {t("details.servicesAndSpecialists")}
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
                    {t("details.noServices")}
                  </Typography>
                </Paper>
              ) : (
                <ServiceEmployeeGroups
                  groups={servicesByEmployee}
                  onEmployeeClick={(group) => {
                    setSelectedDoctorId(group.employeeId);
                    setSelectedDoctorName(group.employeeName);
                    setSelectedDoctorPhotoUrl(group.employeePhotoUrl);
                    setDoctorDrawerOpen(true);
                  }}
                  onServiceClick={(serviceId) => {
                    setSelectedServiceId(serviceId);
                    setServiceDrawerOpen(true);
                  }}
                />
              )}
            </Box>

            {/* Расходники услуг — что уйдёт со склада при завершении. Перед
                товарами: это часть услуги, а не отдельная продажа. */}
            <AppointmentConsumptions services={appt.services} />

            {/* Товары, проданные в рамках визита. */}
            <AppointmentProductLines
              lines={appt.productLines ?? []}
              formatAmount={som}
              clickable={canViewProducts}
              onProductClick={(id, name) => {
                setSelectedProductId(id);
                setSelectedProductName(name);
                setProductDrawerOpen(true);
              }}
            />

            {/* Положенные дозы — ПОСЛЕ услуг и товаров: это подсказка «заодно
                можно ввести», а не содержание визита. */}
            {canRecordVaccination && appt.patient && isAppointmentActive && (
              <AppointmentDueDoses
                dueDoses={dueDoses}
                onRecord={(prefill) => onRecordVaccination?.(appt, prefill)}
                onRecordMulti={(doses) => onRecordVaccinationMulti?.(appt, doses)}
              />
            )}

            {/* ── Text blocks ── */}
            {(appt.complaints || appt.doctorComplaints) && (
              <>
                <Divider />
                <Stack spacing={2}>
                  {appt.complaints && (
                    <Box>
                      <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                        <DescriptionOutlined color="primary" fontSize="small" />
                        <Typography variant="subtitle2" color="text.secondary">
                          {t("details.patientComplaints")}
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
                          {t("details.doctorComplaints")}
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
                  {/* adminComment показан вверху, рядом с пациентом. */}
                </Stack>
              </>
            )}

            {/* ── Payment block for doctor/nurse (cash+card only) ── */}
            {(isDoctorRole || isNurseRole) && (canViewFinance || canManageFinance) && hasFinanceInfo && (
              <>
                <Divider />
                <Typography variant="caption" color="text.secondary" display="block">
                  {t("details.paymentInfo")}
                </Typography>
                {paymentBlock(false)}
              </>
            )}

            {/* Заключение теперь открывается отдельной (третьей) колонкой на
                странице приёмов (как в оригинале), а не внутри карточки. */}
          </Stack>
        </CardContent>
      </Card>

      {/* ── Меню дополнительных действий ── */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {overflowActions.map((action) => (
          <MenuItem
            key={action.key}
            onClick={() => runFromMenu(action)}
            disabled={action.disabled}
            selected={action.active}
          >
            <ListItemIcon sx={{ color: action.color ? `${action.color}.main` : undefined }}>
              {action.icon}
            </ListItemIcon>
            <ListItemText>{action.label}</ListItemText>
          </MenuItem>
        ))}

        {overflowActions.length > 0 && dangerActions.length > 0 && <Divider />}

        {dangerActions.map((action) => (
          <MenuItem
            key={action.key}
            onClick={() => runFromMenu(action)}
            sx={{ color: "error.main" }}
          >
            <ListItemIcon sx={{ color: "error.main" }}>{action.icon}</ListItemIcon>
            <ListItemText>{action.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

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
      <ProductQuickViewDrawer
        open={productDrawerOpen}
        onClose={() => {
          setProductDrawerOpen(false);
          setSelectedProductId(null);
        }}
        productId={selectedProductId}
        fallbackName={selectedProductName}
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
          {confirmAction === "delete" ? t("details.deleteTitle") : t("details.cancelTitle")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmAction === "delete" ? t("details.deleteText") : t("details.cancelText")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t("details.back")}</Button>
          <Button onClick={handleConfirm} color="error" variant="contained" autoFocus>
            {confirmAction === "delete" ? t("details.delete") : t("details.cancelSubmit")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AppointmentDetailsPanel;
