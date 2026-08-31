import React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import FormatListBulletedOutlined from "@mui/icons-material/FormatListBulletedOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { useSearchParams } from "react-router";

import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useActiveScope } from "../../hooks/useActiveScope";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import DjangoAddAppointmentDrawer from "./DjangoAddAppointmentDrawer";
import DjangoEditAppointmentDrawer from "./DjangoEditAppointmentDrawer";
import FreeSlotsView from "./FreeSlotsView";
import DjangoPaymentDrawer from "./DjangoPaymentDrawer";
import type { PaymentSummary } from "../../api/payments";
import {
  getHomeDashboard,
  getAppointment,
  getAppointmentNotifications,
  updateAppointment,
  startAppointment,
  deleteAppointment,
  parseBackendError,
  type DjangoAppointment,
  type HomeDashboard,
} from "../../api/appointments";
import { formatConsumptionWarnings } from "../../components/appointments/consumptionWarnings";
import { getDjangoEmployees } from "../../api/staff";
import { getScheduleRules, getScheduleExceptions } from "../../api/scheduling";
import { computeDayOccurrences } from "../schedule/django/occurrences";
import { useNotification } from "@refinedev/core";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../api/queryKeys";

import AppointmentListPanel from "./components/AppointmentListPanel";
import AppointmentDetailsPanel from "./components/AppointmentDetailsPanel";
import DjangoConclusionSlotsPanel from "./DjangoConclusionSlotsPanel";
import RecordVaccinationDrawer from "../../components/vaccinations/RecordVaccinationDrawer";
import BatchRecordVaccinationDrawer, {
  type BatchDoseInput,
} from "../../components/vaccinations/BatchRecordVaccinationDrawer";
import { appointmentPatientToStub } from "./patientStub";
import { PageHeader, DateNavigation } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useAppointmentsAutoSync } from "../../hooks/useAppointmentsAutoSync";
import { useT } from "../../i18n/VerticalProvider";
import { useReceptionFilters } from "./useReceptionFilters";

// ── data hooks ────────────────────────────────────────────────────────────────

// Единый агрегат главной: список приёмов за дату + счётчики дней для навбара
// + lastUpdate приходят одним запросом GET /api/appointments/home/ вместо трёх
// отдельных (список + day-counts + last-update).
function useHomeDashboard(params: {
  date: Dayjs;
  search: string;
  branchId?: number;
  organizationId?: number;
  employeeId?: number | "me";
  /** Навбар-счётчики отдельно от списка: "me" для врача/медсестры. */
  countsEmployeeId?: number | "me";
  /** Фильтр списка и счётчиков по роли исполнителя (процедурный кабинет = "nurse"). */
  clinicalRole?: "doctor" | "nurse" | "other";
  nightOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const dateKey = params.date.format("YYYY-MM-DD");
  const monthKey = params.date.format("YYYY-MM");
  const queryParams = React.useMemo(() => {
    const base = dayjs(`${monthKey}-01`);
    // Навбар показывает окно ±7 дней вокруг выбранной даты, поэтому счётчики
    // запрашиваем на 7 дней шире краёв месяца — иначе на краю месяца соседние
    // дни остаются без счётчиков.
    return {
      date: dateKey,
      dateFrom: base.startOf("month").subtract(7, "day").format("YYYY-MM-DD"),
      dateTo: base.endOf("month").add(7, "day").format("YYYY-MM-DD"),
      search: params.search || undefined,
      branchId: params.branchId,
      organizationId: params.organizationId,
      employeeId: params.employeeId,
      countsEmployeeId: params.countsEmployeeId,
      clinicalRole: params.clinicalRole,
      nightOnly: params.nightOnly || undefined,
    };
  }, [dateKey, monthKey, params.search, params.branchId, params.organizationId, params.employeeId, params.countsEmployeeId, params.clinicalRole, params.nightOnly]);

  const queryKey = djangoQueryKeys.appointments.home(queryParams);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      getHomeDashboard(
        { organizationId: params.organizationId, branchId: params.branchId },
        queryParams,
        signal,
      ),
    // Увеличиваем staleTime до 5 минут. Любое изменение в клинике спровоцирует
    // инвалидацию кэша через useAppointmentsAutoSync, а до тех пор данные верны.
    staleTime: 5 * 60 * 1000, 
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return undefined;
      const prevParams = previousQuery.queryKey[3] as typeof queryParams | undefined;
      // Предыдущие данные показываем ТОЛЬКО если дата, филиал, врач и роль совпадают.
      // При смене даты/филиала/врача старые данные сразу скрываются, уступая место лоадеру.
      if (
        prevParams &&
        prevParams.date === queryParams.date &&
        prevParams.branchId === queryParams.branchId &&
        prevParams.organizationId === queryParams.organizationId &&
        prevParams.employeeId === queryParams.employeeId &&
        prevParams.clinicalRole === queryParams.clinicalRole
      ) {
        return previousData;
      }
      return undefined;
    },
  });

  const setItems = React.useCallback(
    (updater: DjangoAppointment[] | ((prev: DjangoAppointment[]) => DjangoAppointment[])) => {
      queryClient.setQueryData<HomeDashboard>(queryKey, (prev) => {
        const prevData: HomeDashboard =
          prev ?? { appointments: [], dayCounts: {}, lastUpdate: null };
        const nextAppointments =
          typeof updater === "function" ? updater(prevData.appointments) : updater;
        return { ...prevData, appointments: nextAppointments };
      });
    },
    [queryClient, queryKey],
  );

  return {
    items: query.data?.appointments ?? [],
    setItems,
    dayCounts: query.data?.dayCounts ?? {},
    // Учитываем фоновые обновления (refetch / auto-sync / invalidate), чтобы
    // пользователь всегда видел 2px LinearProgress во время загрузки/синхронизации.
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
  };
}

/**
 * Set of active employee ids with the given clinical role.
 *
 * Used by the privileged cabinet views (admin / manager / receptionist): they
 * load every appointment, then group/filter strictly by clinician type — the
 * doctor cabinet by doctors, the procedure cabinet by nurses. Only fetched when
 * `enabled` — a clinician looking at their own list doesn't need it.
 */
function useClinicalIds(role: "doctor" | "nurse", enabled: boolean): Set<number> {
  const orgId = useApiOrgId();
  const query = useQuery({
    queryKey: ["staff", "employees", "clinicalIds", role, orgId],
    queryFn: async ({ signal }) => {
      const res = await getDjangoEmployees(
        { status: "active", pageSize: 500, organizationId: orgId },
        signal,
      );
      return res.results.filter((e) => e.clinicalRole === role).map((e) => e.id);
    },
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  return React.useMemo(() => new Set(query.data ?? []), [query.data]);
}

/**
 * Уведомления для иконок статусов рядом с приёмом.
 *
 * Лёгкий батч-запрос по видимым id приёмов (отдельно от тяжёлого home-аггрегата,
 * как day-counts). Сворачиваем в Map<appointmentId, Map<type, item>>: бэкенд
 * отдаёт строки по возрастанию sent_at, поэтому в Map по каждому типу остаётся
 * самое позднее уведомление (1-в-1 со старым фронтом). Ключ запроса зависит от
 * набора id, поэтому при смене даты/фильтра карта пересобирается.
 */
function useNotificationsMap(
  appointmentIds: number[],
): Map<number, Map<string, import("../../api/appointments").AppointmentNotificationItem>> {
  // Стабилизируем ключ: сортируем id, чтобы порядок в списке не плодил рефетчи.
  const sortedIds = React.useMemo(
    () => [...appointmentIds].sort((a, b) => a - b),
    [appointmentIds],
  );

  const query = useQuery({
    queryKey: djangoQueryKeys.appointments.notifications(sortedIds),
    queryFn: ({ signal }) => getAppointmentNotifications(sortedIds, signal),
    enabled: sortedIds.length > 0,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  return React.useMemo(() => {
    const map = new Map<number, Map<string, import("../../api/appointments").AppointmentNotificationItem>>();
    for (const n of query.data ?? []) {
      if (!["queued", "sent", "delivered", "failed"].includes(n.status)) continue;
      let byType = map.get(n.appointmentId);
      if (!byType) {
        byType = new Map<string, import("../../api/appointments").AppointmentNotificationItem>();
        map.set(n.appointmentId, byType);
      }
      byType.set(n.notificationType, n);
    }
    return map;
  }, [query.data]);
}

// ── page ──────────────────────────────────────────────────────────────────────

type AppointmentsPageProps = {
  /**
   * "me"    → кабинет врача: только свои приёмы, без создания.
   * "nurse" → процедурный кабинет: медсестра видит только свои процедуры;
   *           админ/управляющий/регистратура видят все приёмы, в которых
   *           участвует медсестра.
   */
  scope?: "me" | "nurse";
};

const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ scope }) => {
  const { t } = useT("appointments");
  const isDoctorCabinet = scope === "me";
  const isNurseCabinet = scope === "nurse";
  const pageTitle = isDoctorCabinet
    ? t("page.titleDoctor")
    : isNurseCabinet
    ? t("page.titleProcedure")
    : t("page.titleReception");
  const addButtonText = isNurseCabinet ? t("page.addProcedure") : t("page.addVisit");
  usePageTitle(pageTitle);
  const { can } = useCanChecker();
  const queryClient = useQueryClient();
  const {
    activeBranch,
    activeOrganization,
    activeEmployee,
    isSuperAdmin,
  } = usePermissions();

  // Область ЧТЕНИЯ определяется отдельным правом appointments.view_all, а не
  // правом редактирования: appointments.update разрешает править доступный
  // тебе приём и НИКОГДА не должен открывать чужие (из-за этой связки врачи
  // «Клиники 21» видели приёмы коллег). Сужение теперь и на бэке —
  // get_scoped_appointments_for_user; здесь оно только про то, что рисовать.
  const canSeeOthersAppointments = can("appointments.view_all");

  // Привилегированные кабинеты: роль с view_all смотрит кабинет целиком —
  // все врачи / все медсёстры (фильтр clinicalRole на бэке).
  const doctorSeesAll = isDoctorCabinet && canSeeOthersAppointments;
  const nurseSeesAll = isNurseCabinet && canSeeOthersAppointments;
  const { open: notify } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [date, setDate] = React.useState<Dayjs>(dayjs());
  // Поиск по дню — клиентский (день загружен целиком), поэтому серверный
  // параметр search остаётся пустым: фильтрует AppointmentListPanel.
  const search = "";
  const [nightOnly] = React.useState(false);

  // ── Фильтры дня (URL) ──────────────────────────────────────────────────────
  // Живут в query-параметрах, а не в состоянии: иначе отбор терялся при
  // перезагрузке и при смене даты, а регистратор листает дни именно чтобы
  // посмотреть загрузку одного специалиста. Плюс ссылку можно передать коллеге.
  const {
    searchQuery,
    setSearchQuery,
    doctorFilter,
    setDoctorFilter,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    resetChipFilters,
  } = useReceptionFilters();

  // Врач привязан к текущему скоупу данных. При переходе в другую
  // организацию/филиал старый id нельзя переносить в новый скоуп, но смена
  // даты этот фильтр должна сохранять.
  const scopeKey = `${activeOrganization?.id ?? ""}:${activeBranch?.id ?? ""}`;
  const observedScopeRef = React.useRef(false);
  const previousScopeKeyRef = React.useRef(scopeKey);
  React.useEffect(() => {
    // Контекст пользователя может прийти после первого рендера. Это ещё не
    // переключение скоупа, поэтому первый полностью определённый скоуп только
    // запоминаем и не трогаем фильтр из URL.
    if (activeOrganization?.id == null) return;
    if (!observedScopeRef.current) {
      observedScopeRef.current = true;
      previousScopeKeyRef.current = scopeKey;
      return;
    }
    if (previousScopeKeyRef.current !== scopeKey) {
      setDoctorFilter(null);
      previousScopeKeyRef.current = scopeKey;
    }
  }, [activeOrganization?.id, scopeKey, setDoctorFilter]);

  // DateNavigation (shared with the original Регистратура) works in string dates
  const dateStr = date.format("YYYY-MM-DD");
  const handleSetDate = React.useCallback(
    (s: string) => {
      setDate(dayjs(s));
    },
    [],
  );

  const [createOpen, setCreateOpen] = React.useState(false);
  // Вид регистратуры: список приёмов или свободные окна врачей (сохраняется в localStorage).
  const [viewMode, setViewModeState] = React.useState<"list" | "slots">(() => {
    const saved = localStorage.getItem("mamadoc_appointments_view_mode");
    return saved === "slots" || saved === "list" ? saved : "list";
  });
  const handleViewModeChange = React.useCallback((mode: "list" | "slots") => {
    setViewModeState(mode);
    localStorage.setItem("mamadoc_appointments_view_mode", mode);
  }, []);
  // Предзаполнение создания приёма из клика по свободному окну.
  // employeeId/serviceId заполнены из вида «Окна» (врач+услуга известны);
  // клик по «Есть окно на HH:mm» в списке передаёт время и врача группы
  // (услугу регистратор выбирает в форме).
  const [slotPrefill, setSlotPrefill] = React.useState<
    {
      employeeId: number | null;
      dateTime: string;
      serviceId: number | null;
      /** Явно включить режим брони без пациента. */
      booking: boolean;
    } | null
  >(null);
  // Выбранный в ленте аватарок исполнитель живёт в URL (см. useReceptionFilters):
  // «Добавить приём» подставляет его в исполнителя первой строки услуг —
  // регистратор, отобравший день по врачу, почти всегда записывает именно к нему.
  // При смене даты фильтр НЕ сбрасывается: дни листают как раз для того, чтобы
  // посмотреть загрузку одного специалиста, а о скрытых записях сообщает
  // счётчик «показано N из M» в шапке списка.
  // Клик по занятому времени в виде «Окна»: карточка приёма открывается дровером
  // поверх сетки. Сетка знает только id приёма (и он может быть на другой дате,
  // чем список дня), поэтому карточка грузится отдельным запросом по id.
  const [slotApptId, setSlotApptId] = React.useState<number | null>(null);
  // Повторная запись из карточки брони: карта пациента и врач приходят в адресе.
  const [rebookPatientId, setRebookPatientId] = React.useState<number | null>(null);
  const [rebookEmployeeId, setRebookEmployeeId] = React.useState<number | null>(null);
  // ?service= — запись на конкретную услугу (кнопка «Записать» в карточке услуги).
  const [rebookServiceId, setRebookServiceId] = React.useState<number | null>(null);
  const [editTarget, setEditTarget] = React.useState<DjangoAppointment | null>(null);
  const [paymentTarget, setPaymentTarget] = React.useState<DjangoAppointment | null>(null);
  const [selectedAppt, setSelectedAppt] = React.useState<DjangoAppointment | null>(null);
  // Ввод вакцины из карточки приёма (регистратура): приём, для которого открыт дровер.
  const [vaccineAppt, setVaccineAppt] = React.useState<DjangoAppointment | null>(null);
  // Предзаполнение из прогноза календаря (клик «Ввести» на положенной дозе):
  // вакцина + № дозы. null — общий ввод без прогноза.
  const [vaccinePrefill, setVaccinePrefill] = React.useState<{ vaccineId: number; doseNumber: number } | null>(null);
  // Стабильный stub пациента для дровера вакцины: без мемо новый объект на каждый
  // рендер (heartbeat autosync) сбрасывал бы форму (resetForm зависит от initialPatient).
  const vaccinePatientStub = React.useMemo(
    () =>
      vaccineAppt?.patient
        ? appointmentPatientToStub(vaccineAppt.patient, activeOrganization?.id ?? 0)
        : null,
    [vaccineAppt, activeOrganization?.id],
  );
  // Групповой ввод вакцин (несколько положенных доз за один визит).
  const [multiVaccineAppt, setMultiVaccineAppt] = React.useState<DjangoAppointment | null>(null);
  const [multiVaccineDoses, setMultiVaccineDoses] = React.useState<BatchDoseInput[]>([]);
  const multiVaccinePatientStub = React.useMemo(
    () =>
      multiVaccineAppt?.patient
        ? appointmentPatientToStub(multiVaccineAppt.patient, activeOrganization?.id ?? 0)
        : null,
    [multiVaccineAppt, activeOrganization?.id],
  );
  // Заключение открывается отдельной (третьей) колонкой — как в оригинале.
  const [conclusionOpen, setConclusionOpen] = React.useState(false);

  // В кабинете врача создание приёмов скрыто — это рабочий список своих приёмов.
  const canCreate = !isDoctorCabinet && can("appointments.create");
  const canUpdate = can("appointments.update");
  const canDelete = isSuperAdmin() || can("appointments.delete");
  const canViewFinance = can("finance.view");
  const canManageFinance = can("finance.manage");
  // Регистратор может ввести вакцину прямо из карточки приёма — если бэк выдал
  // роли право vaccinations.record (иначе кнопка не показывается).
  const canRecordVaccination = can("vaccinations.record");

  // confirm dialog for cancel / delete
  const [confirm, setConfirm] = React.useState<
    { mode: "cancel" | "delete"; appt: DjangoAppointment } | null
  >(null);
  const [confirmBusy, setConfirmBusy] = React.useState(false);
  const activeScope = useActiveScope();
  const branchId = activeBranch?.id ?? undefined;

  // Сужение до своих приёмов зависит от ПРАВА, а не от страницы: клиницист без
  // appointments.view_all видит только свои приёмы и в кабинете, И В
  // РЕГИСТРАТУРЕ. Раньше флаг был завязан на scope кабинета, поэтому на
  // Регистратуре врачу показывалась полоска фильтра со всем штатом (список при
  // этом уже приходил сужённым с бэка — утекали имена сотрудников).
  //
  // Условие зеркалит бэкенд (get_scoped_appointments_for_user + user_is_clinician):
  // сужаем только тех, у кого есть карточка сотрудника. У управляющих ролей и
  // ops-суперадминов её нет, и "me" вернул бы им пустой список.
  const seesOwnOnly = !canSeeOthersAppointments && activeEmployee != null;
  const scopedEmployeeId: number | "me" | undefined = seesOwnOnly ? "me" : undefined;

  // Навбар-счётчики: клиницист в своём кабинете считает только свои; привилегированная
  // роль и Регистратура считают по тому же scope, что и список (clinicalRole/всё).
  const countsScopeToMe = seesOwnOnly;

  // Привилегированный кабинет фильтрует список и счётчики по клинической роли:
  // кабинет врача → все врачи, процедурный → все медсёстры.
  const clinicalRoleScope: "doctor" | "nurse" | undefined = doctorSeesAll
    ? "doctor"
    : nurseSeesAll
    ? "nurse"
    : undefined;

  // Клиницист видит только свой список — фильтр-полоска по сотрудникам бессмысленна,
  // оставляем только навигацию по датам. Привилегированные кабинеты и Регистратура
  // полоску показывают (выбор конкретного врача / медсестры).
  const hideEmployeeStrip = seesOwnOnly;

  const { items, setItems, dayCounts, loading, error, refresh } = useHomeDashboard({
    date,
    search,
    branchId,
    organizationId: activeScope.organizationId,
    employeeId: scopedEmployeeId,
    countsEmployeeId: countsScopeToMe ? "me" : undefined,
    // Привилегированный кабинет: список и счётчики сужены по клинической роли
    // (врачи / медсёстры). Клиницист уже сужен через scopedEmployeeId="me".
    clinicalRole: clinicalRoleScope,
    nightOnly,
  });

  // Приём, открытый из вида «Окна» (клик по занятому времени).
  const slotApptQuery = useQuery({
    queryKey: djangoQueryKeys.appointments.detail(slotApptId ?? 0),
    queryFn: () => getAppointment(slotApptId as number),
    enabled: slotApptId != null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const slotAppt = slotApptId != null ? slotApptQuery.data ?? null : null;
  const closeSlotAppt = React.useCallback(() => {
    setSlotApptId(null);
    setConclusionOpen(false);
  }, []);

  /**
   * Вход из других модулей. Карточка брони ведёт сюда двумя адресами:
   * `?appointment=<id>` — открыть карточку приёма, созданного из брони;
   * `?new=1&patient=<id>&employee=<id>` — записать пациента повторно.
   *
   * Приём открываем тем же дровером, что и клик по занятому окну: он грузится
   * по id и не зависит от выбранной в регистратуре даты (приём может быть на
   * другой день). Параметры одноразовые — сразу вычищаем из адреса, иначе
   * перезагрузка страницы снова открывала бы дровер.
   */
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * `?date=YYYY-MM-DD` открывает регистратуру сразу на нужном дне. Нужен для
   * переходов извне — например, из сводки по клику на день пиковой загрузки.
   * Параметр одноразовый, как и остальные: иначе он перебивал бы дату, которую
   * пользователь выбрал руками после перехода.
   */
  React.useEffect(() => {
    const raw = searchParams.get("date");
    if (!raw) return;
    // Формат проверяем регулярным выражением: плагин строгого разбора
    // (customParseFormat) в проекте не подключён, и dayjs молча съел бы мусор.
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? dayjs(raw) : null;
    if (parsed?.isValid()) setDate(parsed);
    setSearchParams(
      (prev: URLSearchParams) => {
        const next = new URLSearchParams(prev);
        next.delete("date");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  React.useEffect(() => {
    const apptRaw = searchParams.get("appointment");
    const isNew = searchParams.get("new") === "1";
    if (!apptRaw && !isNew) return;

    const asId = (raw: string | null): number | null => {
      const n = Number(raw);
      return raw && Number.isFinite(n) && n > 0 ? n : null;
    };

    const apptId = asId(apptRaw);
    if (apptId != null) setSlotApptId(apptId);
    if (isNew) {
      setRebookPatientId(asId(searchParams.get("patient")));
      setRebookEmployeeId(asId(searchParams.get("employee")));
      setRebookServiceId(asId(searchParams.get("service")));
      setCreateOpen(true);
    }

    setSearchParams(
      (prev: URLSearchParams) => {
        const next = new URLSearchParams(prev);
        for (const key of ["appointment", "new", "patient", "employee", "service"]) {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  // Синхронизация с изменениями коллег: WebSocket /ws/changes/ как мгновенный
  // триггер + лёгкий timestamp-polling как страховка (частый, когда сокет
  // недоступен; редкий, пока он жив). Тяжёлый список перезапрашивается только
  // при реальном изменении. Пауза, пока открыт любой дровер/диалог — чтобы не
  // мешать вводу (изменения за время паузы подтянутся сразу после закрытия).
  useAppointmentsAutoSync({
    branchId,
    paused: createOpen || editTarget !== null || paymentTarget !== null || confirm !== null,
    onChange: () => {
      // Сбрасываем кэш всех запросов по приёмам (включая неактивные даты/кабинеты),
      // чтобы при переходе на них отображались актуальные данные.
      queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.all,
      });
      // Свободные окна считаются от занятости приёмов: новый/перенесённый приём
      // должен сразу закрывать слот и в виде «Окна».
      queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.scheduling.availabilityAll,
      });
    },
  });

  // ── Смены на день: «Есть окно…» не должно предлагаться вне графика врача ──
  // Правила/исключения расписания грузим отдельно от home-агрегата; у части
  // ролей может не быть доступа к /scheduling/ — тогда деградируем к старому
  // поведению (окна без ограничения по графику), retry не нужен.
  const schedOrgId = isSuperAdmin() ? activeOrganization?.id ?? undefined : undefined;
  const scheduleRulesQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.rules({
      employeeId: null,
      orgId: schedOrgId ?? null,
      branchId: branchId ?? null,
    }),
    queryFn: ({ signal }) => getScheduleRules({ organizationId: schedOrgId, branchId }, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    retry: false,
  });
  const scheduleExceptionsQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.exceptions({
      dateFrom: dateStr,
      dateTo: dateStr,
      orgId: schedOrgId ?? null,
      branchId: branchId ?? null,
    }),
    queryFn: ({ signal }) =>
      getScheduleExceptions(
        { dateFrom: dateStr, dateTo: dateStr, organizationId: schedOrgId, branchId },
        signal,
      ),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    retry: false,
  });
  const dayShifts = React.useMemo(() => {
    const allRules = scheduleRulesQuery.data;
    // Разовая смена (`extra`) может быть единственным расписанием сотрудника:
    // в этом случае правил нет, но исключения всё равно должны ограничивать окна.
    if (!allRules) return null;
    // Правило другого филиала не даёт окон в текущем (branchId=null — общие).
    const rules = branchId
      ? allRules.filter((r) => r.branchId == null || r.branchId === branchId)
      : allRules;
    // Защитный фильтр: разовая смена из другого филиала не должна попадать
    // в список даже при старом/закэшированном ответе API.
    const exceptions = (scheduleExceptionsQuery.data ?? []).filter(
      (e) => branchId == null || e.branchId == null || e.branchId === branchId,
    );
    const occurrences = computeDayOccurrences(
      date,
      rules,
      exceptions,
    );
    const segments = new Map<number, { start: string; end: string }[]>();
    const employeeNames = new Map<number, string>();
    for (const o of occurrences) {
      const list = segments.get(o.employeeId) ?? [];
      list.push({ start: o.startTime, end: o.endTime });
      segments.set(o.employeeId, list);
      employeeNames.set(o.employeeId, o.employeeName);
    }
    // «Расписание ведётся» = есть активное правило, покрывающее эту дату.
    // Для таких сотрудников окна ограничены сменами (нет смены — нет окон);
    // сотрудники без правил ведут себя как раньше.
    const scheduledIds = new Set<number>();
    for (const r of rules) {
      if (r.isActive && !date.isBefore(r.dateFrom, "day") && !date.isAfter(r.dateTo, "day")) {
        scheduledIds.add(r.employeeId);
      }
    }
    // Рабочие исключения (`extra`/`override`) также означают, что расписание
    // сотрудника ведётся в этот день. Это важно для extra без базового правила.
    for (const o of occurrences) {
      scheduledIds.add(o.employeeId);
    }
    return { scheduledIds, segments, employeeNames };
  }, [scheduleRulesQuery.data, scheduleExceptionsQuery.data, date, branchId]);

  // Привилегированный кабинет группируется строго по клиницистам своего типа
  // (врачи / медсёстры), чтобы из совместного приёма не появлялась группа второго
  // участника. Грузим id нужной роли только когда это реально привилегированный кабинет.
  const clinicianIds = useClinicalIds(
    clinicalRoleScope ?? "doctor",
    clinicalRoleScope != null,
  );

  // Список уже сужен сервером (employeeId="me" или clinicalRole=...). Клиентский
  // фильтр оставлен как защитный слой для привилегированного кабинета: нет клиницистов
  // нужной роли → кабинет пуст, а не показывает чужие приёмы.
  const visibleItems = React.useMemo(() => {
    if (clinicalRoleScope == null) return items;
    if (clinicianIds.size === 0) return [];
    return items.filter((a) =>
      a.services.some((s) => s.employee != null && clinicianIds.has(s.employee.id)),
    );
  }, [items, clinicalRoleScope, clinicianIds]);

  // Исполнитель, выбранный в ленте, — сразу employee id: он же идёт в
  // предзаполнение формы записи.
  const filterEmployeeId = doctorFilter;
  // Группировка: привилегированный кабинет — строго по клиницистам своего типа;
  // клиницист без view_all — по себе, и в кабинете, И В РЕГИСТРАТУРЕ. Второе
  // важно: лента аватарок и группы «свободные смены» берут сотрудников ещё и из
  // расписания (dayShifts), а не только из выданных приёмов, — без сужения они
  // раскрывали врачу весь штат смены даже при пустом списке приёмов.
  // Иначе (роль с view_all) — по всем участникам.
  // ВАЖНО: для группировки «по себе» нужен ID СОТРУДНИКА (Employee.id из
  // appointment.employee), а не ID auth-пользователя. usePermissions().employeeId —
  // это user.id и с appointment.services[].employee.id не совпадает.
  const ownEmployeeId = Number(activeEmployee?.id);
  const groupEmployeeIds = React.useMemo<Set<number> | null>(() => {
    if (clinicalRoleScope != null) return clinicianIds;
    if (seesOwnOnly && Number.isFinite(ownEmployeeId)) return new Set([ownEmployeeId]);
    return null;
  }, [clinicalRoleScope, clinicianIds, seesOwnOnly, ownEmployeeId]);

  // Иконки SMS-уведомлений: батч по id уже видимых приёмов (после клиентского
  // фильтра по клинической роли — не запрашиваем уведомления для скрытых строк).
  const visibleIds = React.useMemo(
    () => visibleItems.map((a) => a.id),
    [visibleItems],
  );
  const notificationsMap = useNotificationsMap(visibleIds);

  // Keep selectedAppt in sync with fresh list data
  React.useEffect(() => {
    if (!selectedAppt) return;
    const fresh = items.find((a) => a.id === selectedAppt.id);
    if (fresh) setSelectedAppt(fresh);
  }, [items, selectedAppt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deselect when switching dates (if nothing found)
  React.useEffect(() => {
    setSelectedAppt(null);
    setConclusionOpen(false);
  }, [dateStr]);

  const handlePaymentSaved = React.useCallback(
    (summary: PaymentSummary) => {
      setItems((prev) =>
        prev.map((appt) =>
          appt.id === summary.appointmentId
            ? {
                ...appt,
                paymentStatus: summary.paymentStatus,
                paidTotal: summary.paidTotal,
                // Сумму чека тоже забираем из сводки: с платными расходниками
                // услуг totalAmount перестал быть неизменяемым, а строка списка
                // считает от него скидку — иначе до рефетча покажет своё.
                totalAmount: summary.totalAmount,
                discountAmount: summary.discountAmount,
                payableAmount: summary.payableAmount,
                debt: summary.debt,
              }
            : appt,
        ),
      );
      // Карточка над «Окнами» живёт вне списка дня — её обновляем запросом.
      if (slotApptId === summary.appointmentId) {
        queryClient.invalidateQueries({
          queryKey: djangoQueryKeys.appointments.detail(slotApptId),
        });
      }
    },
    [setItems, slotApptId, queryClient],
  );

  /**
   * Обновление после любой мутации приёма.
   *
   * Кроме списка дня перезапрашиваем сетку окон (приём мог занять/освободить
   * время) и карточку, открытую поверх окон — она живёт вне списка дня и сама
   * бы не обновилась. Инвалидация неактивных запросов холостая, поэтому в виде
   * «Список» это ничего не стоит.
   */
  const refreshAfterMutation = React.useCallback(() => {
    void refresh();
    queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.scheduling.availabilityAll,
    });
    if (slotApptId != null) {
      queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.detail(slotApptId),
      });
    }
  }, [refresh, queryClient, slotApptId]);

  const handleSelect = React.useCallback((appt: DjangoAppointment) => {
    setConclusionOpen(false); // при смене приёма закрываем колонку заключения
    setSelectedAppt((prev) => (prev?.id === appt.id ? null : appt));
  }, []);

  const handleEdit = React.useCallback((appt: DjangoAppointment) => {
    setEditTarget(appt);
  }, []);

  const handlePay = React.useCallback((appt: DjangoAppointment) => {
    setPaymentTarget(appt);
  }, []);

  const handlePriceOverrideSaved = React.useCallback(
    (updated: DjangoAppointment) => {
      setItems((prev) => prev.map((appt) => (appt.id === updated.id ? updated : appt)));
      notify?.({ type: "success", message: t("priceOverride.success") });
      refreshAfterMutation();
    },
    [notify, refreshAfterMutation, setItems, t],
  );

  // Списание/возврат расходников склада: бэк складывает результат операции в
  // consumptionWarnings любого ответа по приёму. Показываем тостом — нехватка
  // не отменяет ни сохранение, ни смену статуса.
  const notifyConsumptionWarnings = React.useCallback(
    (updated: DjangoAppointment) => {
      const message = formatConsumptionWarnings(updated.consumptionWarnings);
      if (message) notify?.({ type: "error", message });
    },
    [notify],
  );

  // «Подтвердить»: пациент подтвердил визит по телефону, scheduled → confirmed.
  // Бэк с 23.07.2026 не запускает overlap-проверку на status-only PATCH, поэтому
  // allowOverlap здесь больше не нужен (frontend-backend-tickets-2026-07-23.md, п.2).
  const handleConfirmVisit = React.useCallback(
    async (appt: DjangoAppointment) => {
      try {
        const updated = await updateAppointment(appt.id, { status: "confirmed" });
        notifyConsumptionWarnings(updated);
        refreshAfterMutation();
      } catch (e) {
        notify?.({ type: "error", message: parseBackendError(e) });
      }
    },
    [refreshAfterMutation, notify, notifyConsumptionWarnings],
  );

  // "Пациент здесь": scheduled → arrived (status-only, overlap не проверяется).
  const handleArrived = React.useCallback(
    async (appt: DjangoAppointment) => {
      try {
        const updated = await updateAppointment(appt.id, { status: "arrived" });
        notifyConsumptionWarnings(updated);
        refreshAfterMutation();
      } catch (e) {
        notify?.({ type: "error", message: parseBackendError(e) });
      }
    },
    [refreshAfterMutation, notify, notifyConsumptionWarnings],
  );

  // Врач начинает приём → статус in_progress («На приёме»). Используем
  // отдельный узкий эндпоинт start: он не требует appointments.update
  // (которого у врача нет), а только переводит статус. Форма заключения
  // открывается внутри панели.
  const handleStartAppointment = React.useCallback(
    async (appt: DjangoAppointment) => {
      try {
        await startAppointment(appt.id);
        refreshAfterMutation();
      } catch (e) {
        notify?.({ type: "error", message: parseBackendError(e) });
      }
    },
    [refreshAfterMutation, notify],
  );

  const handleConfirm = React.useCallback(async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.mode === "cancel") {
        // status-only PATCH: бэк не проверяет overlap, отмена дубля проходит.
        // Отмена завершённого приёма возвращает расходники на склад — возврат
        // тоже приходит с предупреждениями (например, склада у филиала нет).
        notifyConsumptionWarnings(
          await updateAppointment(confirm.appt.id, { status: "canceled" }),
        );
      } else {
        await deleteAppointment(confirm.appt.id);
        setSelectedAppt((prev) => (prev?.id === confirm.appt.id ? null : prev));
        // Удалённый приём нельзя оставлять открытым поверх окон.
        if (slotApptId === confirm.appt.id) closeSlotAppt();
      }
      setConfirm(null);
      refreshAfterMutation();
    } catch (e) {
      notify?.({ type: "error", message: parseBackendError(e) });
    } finally {
      setConfirmBusy(false);
    }
  }, [
    confirm,
    refreshAfterMutation,
    notify,
    notifyConsumptionWarnings,
    slotApptId,
    closeSlotAppt,
  ]);

  const handleCreated = React.useCallback(() => {
    setCreateOpen(false);
    refreshAfterMutation();
  }, [refreshAfterMutation]);

  const handleSaved = React.useCallback(() => {
    setEditTarget(null);
    refreshAfterMutation();
  }, [refreshAfterMutation]);

  const showDetails = selectedAppt !== null;

  /**
   * Карточка приёма: в виде «Список» — колонка/дровер выбранного приёма,
   * в виде «Окна» — дровер поверх сетки. Действия одни и те же, поэтому
   * рендер общий, отличается только приём и способ закрытия.
   */
  const renderDetailsPanel = (appt: DjangoAppointment, onClose: () => void) => (
    <AppointmentDetailsPanel
      appointment={appt}
      canUpdate={canUpdate}
      canManageFinance={canManageFinance}
      canViewFinance={canViewFinance}
      canDelete={canDelete}
      canRecordVaccination={canRecordVaccination}
      isConclusionVisible={conclusionOpen}
      onToggleConclusion={() => setConclusionOpen((v) => !v)}
      onEdit={handleEdit}
      onPay={handlePay}
      onConfirmVisit={handleConfirmVisit}
      onArrived={handleArrived}
      onStartAppointment={handleStartAppointment}
      onRecordVaccination={(a, prefill) => {
        setVaccineAppt(a);
        setVaccinePrefill(prefill ?? null);
      }}
      onRecordVaccinationMulti={(a, doses) => {
        setMultiVaccineAppt(a);
        setMultiVaccineDoses(doses);
      }}
      onCancelAppt={(a) => setConfirm({ mode: "cancel", appt: a })}
      onDelete={(a) => setConfirm({ mode: "delete", appt: a })}
      onPriceOverrideSaved={handlePriceOverrideSaved}
      onClose={onClose}
    />
  );

  // Details panel: drawer on mobile, inline panel on desktop
  const detailsPanel = selectedAppt
    ? renderDetailsPanel(selectedAppt, () => setSelectedAppt(null))
    : null;

  return (
    <>
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pt: { xs: 1, md: 1.5 },
        }}
      >
        {/* ── Top controls: like the original Регистратура ──
            «Добавить прием» (large, left) + horizontal date pills. */}
        {viewMode === "list" && (
          <PageHeader
            title={pageTitle}
            showTitle={false}
            addButtonText={addButtonText}
            onAdd={canCreate ? () => setCreateOpen(true) : undefined}
            dateNavigation={
              <DateNavigation date={dateStr} setDate={handleSetDate} dayCounts={dayCounts} />
            }
            showSearch
            searchVal={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("list.searchPlaceholder")}
            loading={loading}
            actions={
              <Stack direction="row" spacing={1} alignItems="center">
                {canCreate && (
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={viewMode}
                    onChange={(_, v) => v && handleViewModeChange(v)}
                  >
                    <ToggleButton value="list" sx={{ textTransform: "none", px: 1.25 }}>
                      <FormatListBulletedOutlined sx={{ fontSize: 16, mr: 0.5 }} />
                      {t("page.tabList")}
                    </ToggleButton>
                    <ToggleButton value="slots" sx={{ textTransform: "none", px: 1.25 }}>
                      <EventAvailableOutlined sx={{ fontSize: 16, mr: 0.5 }} />
                      {t("page.tabSlots")}
                    </ToggleButton>
                  </ToggleButtonGroup>
                )}
              </Stack>
            }
          />
        )}

        {/* ── Error ── */}
        {error && (
          <Alert
            severity="error"
            sx={(t) => ({ mx: t.appLayout.page.paddingX, mb: 1, flexShrink: 0 })}
            onClose={() => { void refresh(); }}
          >
            {error}
          </Alert>
        )}

        {/* ── Вид «Свободные окна» ── */}
        {viewMode === "slots" && (
          <Box
            sx={(t) => ({
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              px: t.appLayout.page.paddingX,
              pb: 1,
            })}
          >
            <FreeSlotsView
              branchId={branchId}
              organizationId={isSuperAdmin() ? activeOrganization?.id ?? undefined : undefined}
              headerActions={
                canCreate && (
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={viewMode}
                    onChange={(_, v) => v && handleViewModeChange(v)}
                  >
                    <ToggleButton value="list" sx={{ textTransform: "none", px: 1.25 }}>
                      <FormatListBulletedOutlined sx={{ fontSize: 16, mr: 0.5 }} />
                      {t("page.tabList")}
                    </ToggleButton>
                    <ToggleButton value="slots" sx={{ textTransform: "none", px: 1.25 }}>
                      <EventAvailableOutlined sx={{ fontSize: 16, mr: 0.5 }} />
                      {t("page.tabSlots")}
                    </ToggleButton>
                  </ToggleButtonGroup>
                )
              }
              onBook={(employeeId, dateTime) => {
                // Услугу регистратор выбирает уже в форме записи. Из режима
                // «Окна» открывается обычный приём, а не бронь без пациента.
                setSlotPrefill({ employeeId, dateTime, serviceId: null, booking: false });
                setCreateOpen(true);
              }}
              onOpenAppointment={(appointmentId) => {
                setConclusionOpen(false);
                setSlotApptId(appointmentId);
              }}
            />
          </Box>
        )}

        {/* ── Two columns: list (left) + details/placeholder (right) ── */}
        {viewMode === "list" && (
        <Box
          sx={(t) => ({
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            px: t.appLayout.page.paddingX,
            pb: 1,
            display: "flex",
            flexDirection: "row",
            gap: 2,
          })}
        >
          {/* List panel — ~50% */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <AppointmentListPanel
              items={visibleItems}
              loading={loading}
              error={null}
              date={date}
              selectedId={selectedAppt?.id ?? null}
              canUpdate={canUpdate}
              canManageFinance={canManageFinance}
              canViewFinance={canViewFinance}
              notificationsMap={notificationsMap}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onPay={handlePay}
              onAddSlot={canCreate ? (dateIso, employeeId) => {
                // Клик по «Есть окно на HH:mm» — в форму попадают время окна и
                // исполнитель группы, в которой это окно показано.
                setSlotPrefill({ employeeId, dateTime: dateIso, serviceId: null, booking: false });
                setCreateOpen(true);
              } : undefined}
              hideDoctorStrip={hideEmployeeStrip}
              doctorFilter={doctorFilter}
              onDoctorFilterChange={setDoctorFilter}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              paymentFilter={paymentFilter}
              onPaymentFilterChange={setPaymentFilter}
              onResetChipFilters={resetChipFilters}
              showPaymentFilter
              showGroupTotals
              groupEmployeeIds={groupEmployeeIds}
              dayShifts={dayShifts}
            />
          </Box>

          {/* Details panel — ~50%, always visible on desktop */}
          {!isMobile && (
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {showDetails ? (
                detailsPanel
              ) : (
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
                    bgcolor: "background.paper",
                    p: 2,
                  }}
                >
                  <Typography align="center">
                    {t("page.noSelection")}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* Conclusion panel — третья колонка (как в оригинале), только при
              открытом заключении и выбранном приёме на десктопе. Панель сама
              рисует шапку (одно заключение → сразу полное; несколько → список). */}
          {!isMobile && showDetails && conclusionOpen && selectedAppt && (
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Card
                variant="outlined"
                sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}
              >
                <DjangoConclusionSlotsPanel
                  appointmentId={selectedAppt.id}
                  onClose={() => setConclusionOpen(false)}
                />
              </Card>
            </Box>
          )}
        </Box>
        )}
      </Box>

      {/* Mobile details drawer */}
      {isMobile && (
        <Drawer
          anchor="bottom"
          open={showDetails}
          onClose={() => setSelectedAppt(null)}
          PaperProps={{
            sx: (theme) => ({
              // Единая высота мобильных листов — токен темы, а не хардкод:
              // список, «Окна» и реестр открывали одну карточку на разную высоту.
              height: theme.appLayout.drawer.bottomSheet.height,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }),
          }}
        >
          <Box sx={{ flex: conclusionOpen ? "0 0 50%" : 1, minHeight: 0, overflow: "hidden" }}>
            {detailsPanel}
          </Box>
          {/* На мобиле заключение показывается снизу под деталями. */}
          {conclusionOpen && selectedAppt && (
            <>
              <Divider />
              <Box sx={{ flex: "1 1 50%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <DjangoConclusionSlotsPanel
                  appointmentId={selectedAppt.id}
                  onClose={() => setConclusionOpen(false)}
                />
              </Box>
            </>
          )}
        </Drawer>
      )}

      {/* Карточка приёма поверх вида «Окна»: клик по занятому времени открывает
          ту же полную карточку, что и в списке — с оплатой, правкой, отменой и
          заключением. Регистратор не теряет из вида поиск окон. */}
      <Drawer
        anchor={isMobile ? "bottom" : "right"}
        open={slotApptId != null}
        onClose={closeSlotAppt}
        PaperProps={{
          sx: (theme) => ({
            ...(isMobile
              ? {
                  height: theme.appLayout.drawer.bottomSheet.height,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                }
              : {
                  // 760px — чтобы весь ряд действий шапки («Подтвердить»,
                  // «Пациент здесь», «Изменить», «Отменить запись», «⋯»)
                  // помещался в одну строку; на 620px он не влезал.
                  // Заключение открывается второй колонкой — дровер расширяется.
                  width: conclusionOpen ? { xs: "100%", md: 1240 } : { xs: "100%", sm: 760 },
                  maxWidth: "100vw",
                }),
            overflow: "hidden",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
          }),
        }}
      >
        {slotAppt ? (
          <>
            <Box
              sx={{
                flex: conclusionOpen && isMobile ? "0 0 50%" : 1,
                minWidth: 0,
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {renderDetailsPanel(slotAppt, closeSlotAppt)}
            </Box>
            {conclusionOpen && (
              <>
                <Divider orientation={isMobile ? "horizontal" : "vertical"} flexItem />
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 0,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <DjangoConclusionSlotsPanel
                    appointmentId={slotAppt.id}
                    onClose={() => setConclusionOpen(false)}
                  />
                </Box>
              </>
            )}
          </>
        ) : (
          <Stack
            alignItems="center"
            justifyContent="center"
            spacing={2}
            sx={{ flex: 1, p: 3 }}
          >
            {slotApptQuery.isError ? (
              <>
                <Alert severity="error">{parseBackendError(slotApptQuery.error)}</Alert>
                <Button onClick={closeSlotAppt} color="inherit">
                  {t("confirm.dismiss")}
                </Button>
              </>
            ) : (
              <CircularProgress size={32} />
            )}
          </Stack>
        )}
      </Drawer>

      {/* ── Drawers ── */}
      <DjangoAddAppointmentDrawer
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setSlotPrefill(null);
          setRebookPatientId(null);
          setRebookEmployeeId(null);
          setRebookServiceId(null);
        }}
        onCreated={() => {
          setSlotPrefill(null);
          setRebookPatientId(null);
          setRebookEmployeeId(null);
          setRebookServiceId(null);
          handleCreated();
        }}
        initialDate={
          slotPrefill
            ? slotPrefill.dateTime
            : date
              ? date.format("YYYY-MM-DD") + "T" + dayjs().format("HH:mm")
              : undefined
        }
        initialDateExact={!!slotPrefill}
        // Без предзаполнения из окна — исполнитель, отобранный в ленте аватарок.
        // Повторная запись из брони приходит со «своим» врачом — он важнее
        // выбранного в ленте аватарок фильтра.
        initialEmployeeId={
          slotPrefill ? slotPrefill.employeeId : rebookEmployeeId ?? filterEmployeeId
        }
        initialServiceId={slotPrefill?.serviceId ?? rebookServiceId}
        initialPatientId={rebookPatientId}
        initialBooking={slotPrefill?.booking ?? false}
        showAllFieldsInitially={slotPrefill?.employeeId != null || rebookServiceId != null}
      />

      <DjangoEditAppointmentDrawer
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        appointment={editTarget}
        onSaved={handleSaved}
      />

      <DjangoPaymentDrawer
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        appointment={paymentTarget}
        onSaved={handlePaymentSaved}
      />

      {/* Ввод вакцины из карточки приёма (регистратура): пациент и appointmentId
          подставляются из выбранного приёма, строка вакцины уйдёт в его счёт. */}
      <RecordVaccinationDrawer
        open={vaccineAppt != null}
        onClose={() => {
          setVaccineAppt(null);
          setVaccinePrefill(null);
        }}
        initialPatient={vaccinePatientStub}
        initialAppointmentId={vaccineAppt?.id ?? null}
        lockedScenario="ours"
        initialVaccineId={vaccinePrefill?.vaccineId ?? null}
        initialDoseNumber={vaccinePrefill?.doseNumber ?? null}
      />

      <BatchRecordVaccinationDrawer
        open={multiVaccineAppt != null}
        onClose={() => {
          setMultiVaccineAppt(null);
          setMultiVaccineDoses([]);
        }}
        patient={multiVaccinePatientStub}
        appointmentId={multiVaccineAppt?.id ?? null}
        doses={multiVaccineDoses}
      />

      {/* Confirm cancel / delete */}
      <Dialog open={!!confirm} onClose={() => (confirmBusy ? undefined : setConfirm(null))}>
        <DialogTitle>
          {confirm?.mode === "delete" ? t("confirm.deleteTitle") : t("confirm.cancelTitle")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm?.mode === "delete" ? t("confirm.deleteText") : t("confirm.cancelText")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={confirmBusy} color="inherit">
            {t("confirm.dismiss")}
          </Button>
          <Button onClick={handleConfirm} disabled={confirmBusy} color="error" variant="contained">
            {confirm?.mode === "delete" ? t("confirm.deleteSubmit") : t("confirm.cancelSubmit")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AppointmentsPage;
