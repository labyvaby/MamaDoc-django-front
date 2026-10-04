import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import dayjs from "dayjs";

import AddOutlined from "@mui/icons-material/AddOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import UpcomingOutlined from "@mui/icons-material/UpcomingOutlined";
import AssignmentLateOutlined from "@mui/icons-material/AssignmentLateOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import MedicationOutlined from "@mui/icons-material/MedicationOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteSweepOutlined from "@mui/icons-material/DeleteSweepOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import SummarizeOutlined from "@mui/icons-material/SummarizeOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";

import {
  AppButton,
  PageHeader,
  UserAvatar,
} from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import {
  deleteCalendarTemplate,
  getBatches,
  getDraftCount,
  SCHEDULE_DASHBOARD_PAGE_SIZE,
  VACCINATION_BATCH_WRITEOFF_ENABLED,
  VACCINATION_SCHEDULE_BRANCH_SCOPING,
  getCalendarTemplate,
  getMonthlyReport,
  getScheduleDashboard,
  getVaccines,
  updateSchedule,
  type CalendarTemplateRow,
  type MonthlyReportRow,
  type ScheduleStatus,
  type Vaccine,
  type VaccineBatch,
  type VaccinationScheduleSlot,
} from "../../api/vaccinations";
import { getPatient, type DjangoPatient } from "../../api/patients";
import DjangoEditPatientDrawer from "../../components/patients/DjangoEditPatientDrawer";
import { ScheduleStatusChip } from "../../components/vaccinations/VaccinationChips";
import RecordVaccinationDrawer from "../../components/vaccinations/RecordVaccinationDrawer";
import VaccineDialog from "../../components/vaccinations/VaccineDialog";
import BatchDialog from "../../components/vaccinations/BatchDialog";
import BatchWriteOffDialog from "../../components/vaccinations/BatchWriteOffDialog";
import CalendarTemplateDialog from "../../components/vaccinations/CalendarTemplateDialog";
import DraftsTab from "./DraftsTab";
import Form5Tab from "./Form5Tab";
import RecordsTab from "./RecordsTab";
import DashboardTab from "./DashboardTab";
import DuePlaceholder from "./DuePlaceholder";
import { PROGRAM_LABEL, batchUsed, countText, expiryInfo, stockByVaccine, type Tone as StockTone } from "./stockInfo";
import { formatMoney } from "./totalsFormat";
import { doseAgeText } from "../../components/vaccinations/calendarTable";
import CalendarTab from "./CalendarTab";
import PeriodStepper from "../../components/vaccinations/PeriodStepper";
import KrCalendarDialog from "../../components/vaccinations/KrCalendarDialog";
import {
  ExemptionDialog,
  RefusalDialog,
} from "../../components/vaccinations/ExemptionRefusalDialogs";
import { scheduleDateInfo } from "./meta";

/**
 * «Кому пора» — только дети, состоящие на учёте (решение 2026-10-03). Модуля
 * учёта в этой ветке нет, поэтому список выключен и показана заглушка; когда
 * учёт вольётся — фильтр по нему и false здесь.
 */
const DUE_WAITS_FOR_REGISTRY = true;

type VaccTab = "drafts" | "due" | "records" | "vaccines" | "batches" | "calendar" | "report" | "form5" | "dashboard";

/** «Не оформлено» — только тем, кто оформляет прививки (vaccinations.record). */
/** Дашборд — первым: итоги месяца/года, вакцины, возраст и пол детей. */
const DASHBOARD_TABS: { id: VaccTab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Дашборд", icon: InsightsOutlined },
];

const RECORD_TABS: { id: VaccTab; label: string; icon: React.ElementType }[] = [
  { id: "drafts", label: "Не оформлено", icon: AssignmentLateOutlined },
];

const BASE_TABS: { id: VaccTab; label: string; icon: React.ElementType }[] = [
  { id: "due", label: "Кому пора", icon: UpcomingOutlined },
  { id: "records", label: "Записи", icon: HistoryOutlined },
];

/** Справочники-витрины — CRUD только для vaccinations.manage. */
const MANAGE_TABS: { id: VaccTab; label: string; icon: React.ElementType }[] = [
  { id: "vaccines", label: "Вакцины", icon: MedicationOutlined },
  { id: "batches", label: "Партии", icon: Inventory2Outlined },
];

/**
 * Календарь и отчёт: гайд даёт ЧТЕНИЕ на vaccinations.view, запись — manage.
 * Поэтому вкладки видны на view, а кнопки/действия записи гейтятся canManage.
 */
const READ_TABS: { id: VaccTab; label: string; icon: React.ElementType }[] = [
  { id: "calendar", label: "Календарь", icon: EventAvailableOutlined },
  { id: "report", label: "Отчёт", icon: SummarizeOutlined },
  { id: "form5", label: "Форма 5", icon: DescriptionOutlined },
];

/**
 * Смысловые группы вкладок для визуальной кластеризации ленты разделителями:
 * «Работа» (ежедневное) · «Справочники» (настройка) · «Аналитика».
 */
const TAB_GROUP: Record<VaccTab, "overview" | "work" | "ref" | "analytics"> = {
  drafts: "work",
  due: "work",
  records: "work",
  vaccines: "ref",
  batches: "ref",
  calendar: "ref",
  report: "analytics",
  dashboard: "overview",
  form5: "analytics",
};

/** Компактная плитка сводки — тот же стиль, что в задачах/бронях. */
const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "error" | "success" | "warning";
}> = ({ icon, label, value, tone }) => (
  <Stack
    direction="row"
    alignItems="center"
    gap={1.25}
    sx={(t) => ({
      px: 1.5,
      py: 1,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
      minWidth: 130,
    })}
  >
    <Box
      sx={(t) => {
        const accent =
          tone === "error"
            ? t.palette.error
            : tone === "success"
            ? t.palette.success
            : tone === "warning"
            ? t.palette.warning
            : t.palette.primary;
        return {
          width: 34,
          height: 34,
          borderRadius: "9px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tone ? (t.palette.mode === "dark" ? accent.light : accent.dark) : "primary.onSurface",
          bgcolor: alpha(accent.main, t.palette.mode === "dark" ? 0.16 : 0.1),
          "& .MuiSvgIcon-root": { fontSize: 18 },
        };
      }}
    >
      {icon}
    </Box>
    <Box sx={twoLineCellSx}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="subtitle2" fontWeight={600} noWrap>
        {value}
      </Typography>
    </Box>
  </Stack>
);

const VaccinationsPage: React.FC = () => {
  const { t } = useT("vaccinations");
  usePageTitle("Вакцины");
  const theme = useTheme();
  const { can, loading: permLoading } = useCanChecker();
  const { activeBranch } = usePermissions();
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();

  const branchId = activeBranch?.id ?? null;
  const canView = can("vaccinations.view");
  const canRecord = can("vaccinations.record");
  // Дата рождения задаёт схему и дозу, а правят её чаще всего именно здесь.
  const canUpdatePatient = can("patients.update");
  const canManage = can("vaccinations.manage");

  const tabs = React.useMemo(
    () => [
      ...DASHBOARD_TABS,
      ...(canRecord ? RECORD_TABS : []),
      // «Кому пора» скрыта до модуля учёта детей (DUE_WAITS_FOR_REGISTRY).
      ...BASE_TABS.filter((t) => !(DUE_WAITS_FOR_REGISTRY && t.id === "due")),
      ...(canManage ? MANAGE_TABS : []),
      ...READ_TABS,
    ],
    [canManage, canRecord],
  );

  // Бейдж на вкладке «Не оформлено».
  const draftCountQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.draftCount({ branchId, orgId }),
    queryFn: ({ signal }) => getDraftCount(branchId, orgId, signal),
    enabled: !permLoading && canRecord,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const draftCount = draftCountQuery.data ?? 0;

  const [tab, setTab] = React.useState<VaccTab>(() => {
    const saved = sessionStorage.getItem("vaccinations-tab");
    return (saved as VaccTab) ?? "dashboard";
  });

  // Скрыть manage-вкладку, если право пропало (или его и не было).
  React.useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab("dashboard");
  }, [tabs, tab]);
  const [drawerPatient, setDrawerPatient] = React.useState<DjangoPatient | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [vaccineDialog, setVaccineDialog] = React.useState<{ open: boolean; vaccine: Vaccine | null }>({
    open: false,
    vaccine: null,
  });
  const [batchDialog, setBatchDialog] = React.useState<{ open: boolean; batch: VaccineBatch | null }>({
    open: false,
    batch: null,
  });
  // Списание доз партии (порча/срок) — отдельное действие, не правка прихода.
  const [writeOffBatchTarget, setWriteOffBatchTarget] = React.useState<VaccineBatch | null>(null);
  const [calendarDialog, setCalendarDialog] = React.useState<{
    open: boolean;
    row: CalendarTemplateRow | null;
    preset?: { vaccineId: number; doseNumber: number } | null;
  }>({
    open: false,
    row: null,
  });
  const [reportMonth, setReportMonth] = React.useState(() => dayjs().format("YYYY-MM"));
  // Охват отчёта: по активному филиалу (branchId) или по всей организации
  // (branchId не передаём — бэк строит по доступному скоупу орг).
  const [reportOrgWide, setReportOrgWide] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState<CalendarTemplateRow | null>(null);
  const [krDialogOpen, setKrDialogOpen] = React.useState(false);
  // Пропуск дозы с причиной (пишем в notes слота): улучшает семантику календаря
  // и точность отчёта (отказ родителя / медотвод / отложено).
  const [skipTarget, setSkipTarget] = React.useState<VaccinationScheduleSlot | null>(null);
  const [skipReason, setSkipReason] = React.useState("");
  // Медотвод и отказ из строки «Кому пора» (форма 5, разделы 2 и 3).
  const [exemptionTarget, setExemptionTarget] = React.useState<VaccinationScheduleSlot | null>(null);
  const [refusalTarget, setRefusalTarget] = React.useState<VaccinationScheduleSlot | null>(null);

  const handleTabChange = (t: VaccTab) => {
    setTab(t);
    sessionStorage.setItem("vaccinations-tab", t);
  };

  const enabled = !permLoading && canView;

  // Слоты без филиала бэк считает общими и отдаёт при любом ?branchId,
  // см. VACCINATION_SCHEDULE_BRANCH_SCOPING.
  const dueBranchId = VACCINATION_SCHEDULE_BRANCH_SCOPING ? branchId : null;

  // Дашборд пагинируется сервером: доз в базе тысячи, целиком их не тянем.
  const [duePagination, setDuePagination] = React.useState({
    page: 0,
    pageSize: SCHEDULE_DASHBOARD_PAGE_SIZE,
  });
  const [dueStatus, setDueStatus] = React.useState<"all" | "overdue" | "planned" | "exempt">("all");

  const dueFilters = {
    branchId: dueBranchId ?? undefined,
    status: dueStatus === "all" ? undefined : (dueStatus as ScheduleStatus),
    ordering: "scheduledDate",
    organizationId: orgId,
  };

  const dueQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.schedule({
      branchId: dueBranchId,
      orgId,
      status: dueStatus,
      page: duePagination.page,
      pageSize: duePagination.pageSize,
    }),
    queryFn: ({ signal }) =>
      getScheduleDashboard(
        { ...dueFilters, page: duePagination.page + 1, pageSize: duePagination.pageSize },
        signal,
      ),
    enabled: enabled && tab === "due" && !DUE_WAITS_FOR_REGISTRY,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // Старый бэк отдаёт весь список массивом и игнорирует status/pageSize —
  // тогда фильтруем, считаем и листаем на клиенте, как делали до 21.08.2026.
  const serverPaged = dueQuery.data?.paginated ?? true;

  // Плитки «Просрочено» и «На неделю» считаем по всей базе, а не по текущей
  // странице: сервер отдаёт count при pageSize=1, это дешевле, чем тянуть список.
  const weekEdge = dayjs().add(7, "day").format("YYYY-MM-DD");
  const dueCountsQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.schedule({
      branchId: dueBranchId,
      orgId,
      counters: weekEdge,
    }),
    queryFn: async ({ signal }) => {
      const common = { branchId: dueBranchId ?? undefined, organizationId: orgId, pageSize: 1 };
      const [overdue, week] = await Promise.all([
        getScheduleDashboard({ ...common, status: "overdue" }, signal),
        getScheduleDashboard({ ...common, status: "planned", dueBefore: weekEdge }, signal),
      ]);
      return { overdue: overdue.count, week: week.count };
    },
    enabled: enabled && tab === "due" && serverPaged && !DUE_WAITS_FOR_REGISTRY,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const vaccinesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.vaccines({ orgId, tab: "manage" }),
    queryFn: ({ signal }) => getVaccines({ includeInactive: true, organizationId: orgId }, signal),
    enabled: enabled && canManage && tab === "vaccines",
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const batchesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.batches({ branchId, orgId, tab: "manage" }),
    queryFn: ({ signal }) =>
      getBatches({ branchId: branchId ?? undefined, organizationId: orgId }, signal),
    enabled: enabled && canManage && (tab === "batches" || tab === "vaccines"),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const calendarQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.calendarTemplate({ orgId }),
    queryFn: ({ signal }) => getCalendarTemplate(orgId, signal),
    enabled: enabled && (tab === "calendar" || tab === "vaccines"),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const reportBranchId = reportOrgWide ? undefined : branchId ?? undefined;
  const reportQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.monthlyReport({ month: reportMonth, branchId: reportBranchId, orgId }),
    queryFn: ({ signal }) =>
      getMonthlyReport({ month: reportMonth, branchId: reportBranchId, organizationId: orgId }, signal),
    enabled: enabled && tab === "report",
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ slotId, ...payload }: { slotId: number; status?: "skipped"; scheduledDate?: string; notes?: string }) =>
      updateSchedule(slotId, payload, orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Не удалось обновить слот"),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => deleteCalendarTemplate(id, orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Не удалось удалить строку календаря"),
  });

  const openDrawerFor = (patient: DjangoPatient | null) => {
    setDrawerPatient(patient);
    setDrawerOpen(true);
  };

  // Правка карты из списка «Кому пора»: слот отдаёт только id/ФИО/телефон,
  // форме нужна полная карта — догружаем её по клику.
  const [editPatient, setEditPatient] = React.useState<DjangoPatient | null>(null);
  const [editPatientOpen, setEditPatientOpen] = React.useState(false);
  const [editPatientLoadingId, setEditPatientLoadingId] = React.useState<number | null>(null);
  const openEditPatient = React.useCallback(
    async (patientId: number) => {
      setEditPatientLoadingId(patientId);
      try {
        const p = await getPatient(patientId);
        setEditPatient(p);
        setEditPatientOpen(true);
      } catch {
        setActionError(t("page.editPatientFailed"));
      } finally {
        setEditPatientLoadingId(null);
      }
    },
    [t],
  );

  const dueRows = React.useMemo(() => {
    const items = dueQuery.data?.items ?? [];
    if (serverPaged || dueStatus === "all") return items;
    return items.filter((s) => s.status === dueStatus);
  }, [dueQuery.data, serverPaged, dueStatus]);
  const dueTotal = serverPaged ? dueQuery.data?.count ?? 0 : dueRows.length;

  const localCounts = React.useMemo(() => {
    if (serverPaged) return null;
    const all = dueQuery.data?.items ?? [];
    return {
      overdue: all.filter((s) => s.status === "overdue").length,
      week: all.filter((s) => s.status === "planned" && s.scheduledDate <= weekEdge).length,
    };
  }, [serverPaged, dueQuery.data, weekEdge]);

  const overdueCount = (localCounts ?? dueCountsQuery.data)?.overdue ?? 0;
  const weekCount = (localCounts ?? dueCountsQuery.data)?.week ?? 0;

  const dueColumns = React.useMemo<GridColDef<VaccinationScheduleSlot>[]>(
    () => [
      {
        field: "patientName",
        headerName: t("page.patientColumn"),
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" gap={1} sx={{ height: "100%", minWidth: 0 }}>
            <UserAvatar name={row.patientName ?? `#${row.patientId}`} size={28} sx={{ borderRadius: "8px", flexShrink: 0 }} />
            <Box sx={twoLineCellSx}>
              <Typography variant="body2" fontWeight={500} noWrap>
                {row.patientName ?? t("page.patientFallback", { id: row.patientId })}
              </Typography>
              {row.patientPhone && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {row.patientPhone}
                </Typography>
              )}
            </Box>
          </Stack>
        ),
      },
      {
        field: "vaccineName",
        headerName: "Вакцина",
        flex: 1,
        minWidth: 160,
        sortable: false,
        renderCell: ({ row }) => (
          <Typography variant="body2" noWrap>
            {row.vaccineName} · доза {row.doseNumber}
          </Typography>
        ),
      },
      {
        field: "scheduledDate",
        headerName: "Срок",
        width: 170,
        sortable: false,
        renderCell: ({ row }) => {
          const info = scheduleDateInfo(row.scheduledDate, row.status);
          return (
            <Typography
              variant="body2"
              sx={{
                color: info.overdue ? "error.main" : info.soon ? "warning.main" : undefined,
                fontWeight: info.overdue || info.soon ? 600 : 400,
              }}
            >
              {info.text}
            </Typography>
          );
        },
      },
      {
        field: "status",
        headerName: "Статус",
        width: 150,
        sortable: false,
        renderCell: ({ row }) => <ScheduleStatusChip status={row.status} />,
      },
      {
        field: "actions",
        headerName: "",
        width: 320,
        sortable: false,
        // Ввод «со склада» отсюда убран: администрирование вакцины — из
        // регистратуры (по приёму). Здесь оставляем только «Пропустить»
        // (управление календарём). Внешние вакцины — кнопкой в шапке.
        renderCell: ({ row }) => (
          <Stack direction="row" gap={0.75} alignItems="center">
            {canUpdatePatient && (
              <Tooltip title={t("page.editPatient")}>
                <IconButton
                  size="small"
                  disabled={editPatientLoadingId === row.patientId}
                  onClick={(e) => {
                    e.stopPropagation();
                    void openEditPatient(row.patientId);
                  }}
                >
                  <EditOutlined sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
            )}
            {canRecord && (
              <Button
                size="small"
                color="inherit"
                startIcon={<BlockOutlined sx={{ fontSize: 17 }} />}
                disabled={scheduleMutation.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  setSkipReason("");
                  setSkipTarget(row);
                }}
                sx={{ textTransform: "none", borderRadius: "8px", color: "text.secondary" }}
              >
                Пропустить
              </Button>
            )}
            {canRecord && row.status !== "exempt" && (
              <Button
                size="small"
                color="inherit"
                onClick={(e) => {
                  e.stopPropagation();
                  setExemptionTarget(row);
                }}
                sx={{ textTransform: "none", borderRadius: "8px", color: "text.secondary" }}
              >
                Медотвод
              </Button>
            )}
            {canRecord && (
              <Button
                size="small"
                color="inherit"
                onClick={(e) => {
                  e.stopPropagation();
                  setRefusalTarget(row);
                }}
                sx={{ textTransform: "none", borderRadius: "8px", color: "text.secondary" }}
              >
                Отказ
              </Button>
            )}
          </Stack>
        ),
      },
    ],
    [canRecord, canUpdatePatient, editPatientLoadingId, openEditPatient, scheduleMutation.isPending, t],
  );

  // Для «Вакцин»: схема доз из календаря и остаток по партиям — одной строкой.
  const dosesByVaccine = React.useMemo(() => {
    const map = new Map<number, CalendarTemplateRow[]>();
    for (const r of calendarQuery.data ?? []) {
      if (!r.isActive) continue;
      const list = map.get(r.vaccineId) ?? [];
      list.push(r);
      map.set(r.vaccineId, list);
    }
    for (const list of map.values()) list.sort((x, y) => x.doseNumber - y.doseNumber);
    return map;
  }, [calendarQuery.data]);
  const stockMap = React.useMemo(() => stockByVaccine(batchesQuery.data ?? []), [batchesQuery.data]);

  const toneColor = (tone: StockTone) => (tone === "error" ? "error.main" : tone === "warning" ? "warning.main" : "text.secondary");

  const vaccinesColumns = React.useMemo<GridColDef<Vaccine>[]>(
    () => [
      {
        field: "name",
        headerName: "Вакцина",
        flex: 1.2,
        minWidth: 220,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={twoLineCellSx}>
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {row.name}
              </Typography>
              {row.funding === "state" && (
                <Chip size="small" label="гос." color="primary" variant="outlined" sx={{ height: 18, fontSize: 11, borderRadius: "6px" }} />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" noWrap>
              {[row.targetDisease, row.manufacturer].filter(Boolean).join(" · ") || "—"}
            </Typography>
          </Box>
        ),
      },
      {
        field: "schedule",
        headerName: "Схема по календарю",
        flex: 1,
        minWidth: 220,
        sortable: false,
        renderCell: ({ row }) => {
          const doses = dosesByVaccine.get(row.id) ?? [];
          if (doses.length === 0) {
            return (
              <Box sx={twoLineCellSx}>
                <Typography variant="body2">{countText(row.dosesRequired, "доза", "дозы", "доз")}</Typography>
                <Typography variant="caption" color="text.disabled" noWrap>
                  нет в календаре
                </Typography>
              </Box>
            );
          }
          // Дозы в одну строку капсулами «① 2 мес.» — номер и возраст рядом.
          return (
            <Stack direction="row" gap={0.5} alignItems="center" sx={{ height: "100%", minWidth: 0, overflow: "hidden" }}>
              {doses.map((d) => (
                <Stack
                  key={d.id}
                  direction="row"
                  alignItems="center"
                  gap={0.5}
                  sx={{
                    flexShrink: 0,
                    height: 22,
                    pl: 0.25,
                    pr: 0.75,
                    borderRadius: "11px",
                    border: 1,
                    borderColor: alpha(theme.palette.primary.main, 0.4),
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      lineHeight: 1,
                      fontWeight: 700,
                      color: theme.palette.primary.contrastText,
                      bgcolor: theme.palette.primary.main,
                    }}
                  >
                    {d.doseNumber}
                  </Box>
                  <Box component="span" sx={{ fontSize: 12, lineHeight: 1, whiteSpace: "nowrap", color: "text.secondary" }}>
                    {doseAgeText(d)}
                  </Box>
                </Stack>
              ))}
            </Stack>
          );
        },
      },
      {
        field: "stock",
        headerName: "На складе",
        width: 190,
        sortable: false,
        renderCell: ({ row }) => {
          const st = stockMap.get(row.id);
          if (!st) {
            return (
              <Typography variant="body2" color="text.disabled">
                нет партий
              </Typography>
            );
          }
          const exp = st.nearestExpiry ? expiryInfo(st.nearestExpiry) : null;
          return (
            <Box sx={twoLineCellSx}>
              <Typography variant="body2" fontWeight={600} color={st.remaining === 0 ? "error.main" : undefined}>
                {countText(st.remaining, "доза", "дозы", "доз")}
                <Typography component="span" variant="caption" color="text.secondary">
                  {` · ${countText(st.batches, "партия", "партии", "партий")}`}
                </Typography>
              </Typography>
              <Typography variant="caption" noWrap sx={{ color: exp ? toneColor(exp.tone) : "text.disabled" }}>
                {st.nearestExpiry ? `годен до ${dayjs(st.nearestExpiry).format("DD.MM.YY")}` : "годных нет"}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: "price",
        headerName: "Цена",
        width: 130,
        sortable: false,
        renderCell: ({ row }) => {
          if (row.funding === "state" && (row.price == null || Number(row.price) === 0)) {
            return <Typography variant="body2" color="text.secondary">бесплатно</Typography>;
          }
          return row.productId != null && row.price != null ? (
            <Typography variant="body2" fontWeight={600}>
              {formatMoney(row.price)}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.disabled">
              без товара
            </Typography>
          );
        },
      },
      {
        field: "isActive",
        headerName: "Статус",
        width: 110,
        sortable: false,
        renderCell: ({ row }) =>
          row.isActive ? (
            <Chip size="small" label="Активна" color="success" variant="outlined" sx={{ borderRadius: "7px" }} />
          ) : (
            <Chip size="small" label="Скрыта" variant="outlined" sx={{ borderRadius: "7px" }} />
          ),
      },
      {
        field: "actions",
        headerName: "",
        width: 60,
        sortable: false,
        renderCell: ({ row }) => (
          <IconButton
            size="small"
            aria-label="Изменить вакцину"
            onClick={() => setVaccineDialog({ open: true, vaccine: row })}
          >
            <EditOutlined fontSize="small" />
          </IconButton>
        ),
      },
    ],
    [dosesByVaccine, stockMap, theme],
  );

  const batchesColumns = React.useMemo<GridColDef<VaccineBatch>[]>(
    () => [
      {
        field: "vaccineName",
        headerName: "Вакцина / партия",
        flex: 1,
        minWidth: 220,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={twoLineCellSx}>
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {row.vaccineName}
              </Typography>
              {row.program && (
                <Chip
                  size="small"
                  label={PROGRAM_LABEL[row.program]}
                  color={row.program === "commercial" ? "default" : "primary"}
                  variant="outlined"
                  sx={{ height: 18, fontSize: 11, borderRadius: "6px" }}
                />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" noWrap>
              №{row.batchNumber}
              {row.productId == null ? " · без товара склада" : ""}
            </Typography>
          </Box>
        ),
      },
      {
        field: "remaining",
        headerName: "Остаток",
        width: 210,
        sortable: false,
        renderCell: ({ row }) => {
          const share = row.quantityInitial > 0 ? row.remaining / row.quantityInitial : 0;
          return (
            <Box sx={{ ...twoLineCellSx, width: "100%" }}>
              <Stack direction="row" alignItems="center" gap={1}>
                <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "action.hover", overflow: "hidden" }}>
                  <Box
                    sx={{
                      width: `${share * 100}%`,
                      height: "100%",
                      bgcolor: share === 0 ? "error.main" : share < 0.2 ? "warning.main" : "primary.main",
                    }}
                  />
                </Box>
                <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {row.remaining} из {row.quantityInitial}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap>
                использовано {batchUsed(row)}
                {row.writtenOff ? ` · списано ${row.writtenOff}` : ""}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: "expiresAt",
        headerName: "Годен до",
        width: 150,
        sortable: false,
        renderCell: ({ row }) => {
          const exp = expiryInfo(row.expiresAt);
          return (
            <Box sx={twoLineCellSx}>
              <Typography variant="body2" fontWeight={exp.tone === "default" ? 400 : 600} sx={{ color: exp.tone === "default" ? undefined : toneColor(exp.tone) }}>
                {dayjs(row.expiresAt).format("DD.MM.YYYY")}
              </Typography>
              <Typography variant="caption" noWrap sx={{ color: toneColor(exp.tone) }}>
                {exp.text}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: "receivedAt",
        headerName: "Поступила",
        width: 170,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={twoLineCellSx}>
            <Typography variant="body2">{row.receivedAt ? dayjs(row.receivedAt).format("DD.MM.YYYY") : "—"}</Typography>
            <Typography variant="caption" color={row.supplier ? "text.secondary" : "text.disabled"} noWrap>
              {row.supplier || "поставщик не указан"}
            </Typography>
          </Box>
        ),
      },
      {
        field: "costPrice",
        headerName: "Закупка",
        width: 140,
        sortable: false,
        renderCell: ({ row }) => {
          const cost = Number(row.costPrice);
          if (!cost) {
            return <Typography variant="body2" color="text.disabled">—</Typography>;
          }
          return (
            <Box sx={twoLineCellSx}>
              <Typography variant="body2">{formatMoney(row.costPrice)} / доза</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                остаток на {formatMoney(String(cost * row.remaining))}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: "actions",
        headerName: "",
        width: VACCINATION_BATCH_WRITEOFF_ENABLED ? 96 : 60,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" gap={0.25}>
            <IconButton
              size="small"
              aria-label="Изменить партию"
              onClick={() => setBatchDialog({ open: true, batch: row })}
            >
              <EditOutlined fontSize="small" />
            </IconButton>
            {VACCINATION_BATCH_WRITEOFF_ENABLED && (
              <Tooltip
                title={row.remaining > 0 ? "Списать дозы (порча, истёк срок)" : "Нечего списывать"}
              >
                <span>
                  <IconButton
                    size="small"
                    aria-label="Списать дозы партии"
                    disabled={row.remaining <= 0}
                    onClick={() => setWriteOffBatchTarget(row)}
                    sx={{ color: dayjs(row.expiresAt).isBefore(dayjs(), "day") ? "error.main" : undefined }}
                  >
                    <DeleteSweepOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>
        ),
      },
    ],
    [],
  );

  const reportColumns = React.useMemo<GridColDef<MonthlyReportRow>[]>(
    () => [
      {
        field: "vaccineName",
        headerName: "Вакцина",
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={twoLineCellSx}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {row.vaccineName} · доза {row.doseNumber}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.ageMonths} мес
            </Typography>
          </Box>
        ),
      },
      {
        field: "planned",
        headerName: "План",
        width: 100,
        sortable: false,
        renderCell: ({ row }) => <Typography variant="body2">{row.planned}</Typography>,
      },
      {
        field: "done",
        headerName: "Сделано",
        width: 130,
        sortable: false,
        renderCell: ({ row }) => (
          <Typography variant="body2">
            {row.done}
            {row.externalDone > 0 && (
              <Typography component="span" variant="caption" color="text.secondary">
                {" "}(из них внешних {row.externalDone})
              </Typography>
            )}
          </Typography>
        ),
      },
      {
        field: "overdue",
        headerName: "Просрочено",
        width: 130,
        sortable: false,
        renderCell: ({ row }) => (
          <Typography variant="body2" sx={{ color: row.overdue > 0 ? "error.main" : undefined, fontWeight: row.overdue > 0 ? 600 : 400 }}>
            {row.overdue}
          </Typography>
        ),
      },
    ],
    [],
  );

  if (!permLoading && !canView) return <AccessDenied />;

  const NoRows = (label: string) => () =>
    (
      <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", opacity: 0.75 }}>
        <VaccinesOutlined sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Stack>
    );

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Вакцины"
        showTitle={false}
        loading={
          dueQuery.isFetching ||
          vaccinesQuery.isFetching ||
          batchesQuery.isFetching ||
          calendarQuery.isFetching ||
          reportQuery.isFetching
        }
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          px: theme.appLayout.page.paddingX,
          pb: 2,
        }}
      >
        {/* Название раздела уже в шапке приложения — здесь сразу вкладки. */}
        {/* ── Вкладки + сводка + кнопка ── */}
        <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" sx={{ mt: 1.5, mb: 1.5 }}>
          <Stack
            direction="row"
            sx={{
              p: 0.5,
              gap: 0.25,
              border: 1,
              borderColor: "divider",
              borderRadius: "10px",
              bgcolor: "background.paper",
            }}
          >
            {tabs.map(({ id, label, icon: Icon }, i) => {
              const active = tab === id;
              const showDivider = i > 0 && TAB_GROUP[id] !== TAB_GROUP[tabs[i - 1].id];
              return (
                <React.Fragment key={id}>
                  {showDivider && (
                    <Box
                      aria-hidden
                      sx={{ width: "1px", alignSelf: "stretch", mx: 0.75, my: 0.5, bgcolor: "divider" }}
                    />
                  )}
                  <ButtonBase
                    onClick={() => handleTabChange(id)}
                    sx={{
                    position: "relative",
                    px: 1.5,
                    py: 0.75,
                    borderRadius: "7px",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    color: active ? "primary.contrastText" : "text.secondary",
                    transition: "color .15s ease",
                  }}
                >
                  {active && (
                    <Box
                      component={motion.span}
                      layoutId="vaccinations-tab-bg"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      sx={{ position: "absolute", inset: 0, borderRadius: "7px", bgcolor: "primary.main" }}
                    />
                  )}
                    <Stack direction="row" alignItems="center" gap={0.75} sx={{ position: "relative" }}>
                      <Icon sx={{ fontSize: 17 }} />
                      <span>{label}</span>
                      {id === "drafts" && draftCount > 0 && (
                        <Box
                          component="span"
                          sx={{
                            minWidth: 18,
                            px: 0.5,
                            borderRadius: "9px",
                            fontSize: "0.7rem",
                            lineHeight: "18px",
                            textAlign: "center",
                            bgcolor: active ? "primary.contrastText" : "warning.main",
                            color: active ? "primary.main" : "warning.contrastText",
                          }}
                        >
                          {draftCount}
                        </Box>
                      )}
                    </Stack>
                  </ButtonBase>
                </React.Fragment>
              );
            })}
          </Stack>

          <Box sx={{ flex: 1 }} />

          {tab === "due" && !DUE_WAITS_FOR_REGISTRY && (
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              <ToggleButtonGroup
                exclusive
                size="small"
                value={dueStatus}
                onChange={(_, v) => {
                  if (!v) return;
                  setDueStatus(v as typeof dueStatus);
                  setDuePagination((p) => ({ ...p, page: 0 }));
                }}
              >
                <ToggleButton value="all" sx={{ textTransform: "none", px: 1.5 }}>
                  Все
                </ToggleButton>
                <ToggleButton value="overdue" sx={{ textTransform: "none", px: 1.5 }}>
                  Просроченные
                </ToggleButton>
                <ToggleButton value="planned" sx={{ textTransform: "none", px: 1.5 }}>
                  Запланированные
                </ToggleButton>
                <ToggleButton value="exempt" sx={{ textTransform: "none", px: 1.5 }}>
                  Медотвод
                </ToggleButton>
              </ToggleButtonGroup>
              {overdueCount > 0 && (
                <StatTile icon={<EventBusyOutlined />} label="Просрочено" value={overdueCount} tone="error" />
              )}
              <StatTile icon={<UpcomingOutlined />} label="На неделю" value={weekCount} tone="warning" />
            </Stack>
          )}

          {(tab === "due" || tab === "records") && canRecord && (
            <AppButton variant="contained" startIcon={<AddOutlined />} onClick={() => openDrawerFor(null)}>
              Добавить внешнюю вакцину
            </AppButton>
          )}
          {tab === "vaccines" && canManage && (
            <AppButton
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => setVaccineDialog({ open: true, vaccine: null })}
            >
              Добавить вакцину
            </AppButton>
          )}
          {tab === "batches" && canManage && (
            <AppButton
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => setBatchDialog({ open: true, batch: null })}
            >
              Приход партии
            </AppButton>
          )}
          {tab === "calendar" && canManage && (
            <>
              <AppButton variant="outlined" onClick={() => setKrDialogOpen(true)}>
                Загрузить календарь КР
              </AppButton>
              <AppButton
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={() => setCalendarDialog({ open: true, row: null })}
              >
                Добавить строку
              </AppButton>
            </>
          )}
          {tab === "report" && (
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              {branchId != null && (
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={reportOrgWide ? "org" : "branch"}
                  onChange={(_, v) => v && setReportOrgWide(v === "org")}
                >
                  <ToggleButton value="branch" sx={{ textTransform: "none", px: 1.5 }}>
                    Филиал
                  </ToggleButton>
                  <ToggleButton value="org" sx={{ textTransform: "none", px: 1.5 }}>
                    Организация
                  </ToggleButton>
                </ToggleButtonGroup>
              )}
              <PeriodStepper value={reportMonth} onChange={setReportMonth} />
            </Stack>
          )}
        </Stack>

        {branchId == null && tab !== "calendar" && tab !== "report" && tab !== "form5" && tab !== "dashboard" && tab !== "records" && tab !== "due" && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Выберите активный филиал, чтобы увидеть вакцины по нему.
          </Alert>
        )}
        {tab === "due" && !DUE_WAITS_FOR_REGISTRY && !VACCINATION_SCHEDULE_BRANCH_SCOPING && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Плановые дозы показаны по всей организации: филиал у них пока не проставляется.
          </Alert>
        )}
        {tab === "report" && reportBranchId == null && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Отчёт строится по всему доступному скоупу организации
            {branchId != null ? " (выбран охват «Организация»)" : " (филиал не выбран)"}.
          </Alert>
        )}

        {actionError && (
          <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 1.5 }}>
            {actionError}
          </Alert>
        )}

        {/* ── Таблица ── */}
        {tab === "form5" && <Form5Tab branchId={branchId} orgId={orgId} />}

        {tab === "drafts" && canRecord && (
          <DraftsTab
            branchId={branchId}
            orgId={orgId}
            canRecord={canRecord}
            canUpdatePatient={canUpdatePatient}
            onEditPatient={(id) => void openEditPatient(id)}
          />
        )}

        {tab === "due" && DUE_WAITS_FOR_REGISTRY && <DuePlaceholder />}
        {tab === "due" && !DUE_WAITS_FOR_REGISTRY &&
          (dueQuery.error ? (
            <Alert severity="error">
              {dueQuery.error instanceof Error ? dueQuery.error.message : "Ошибка загрузки"}
            </Alert>
          ) : (
            <Box sx={{ flex: 1, minHeight: 360 }}>
              <DataGrid<VaccinationScheduleSlot>
                rows={dueRows}
                columns={dueColumns}
                loading={dueQuery.isLoading}
                disableColumnMenu
                disableRowSelectionOnClick
                rowHeight={64}
                columnHeaderHeight={theme.appLayout.table.headerRowHeight}
                getRowClassName={(p) => (p.row.status === "overdue" ? "row-overdue" : "")}
                slots={{ noRowsOverlay: NoRows("Нет запланированных вакцин") }}
                localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
                sx={gridSx}
                paginationMode={serverPaged ? "server" : "client"}
                rowCount={serverPaged ? dueTotal : undefined}
                paginationModel={duePagination}
                onPaginationModelChange={setDuePagination}
                pageSizeOptions={[25, 50, 100]}
              />
            </Box>
          ))}

        {tab === "dashboard" && <DashboardTab branchId={branchId} orgId={orgId} />}
        {tab === "records" && <RecordsTab branchId={branchId} orgId={orgId} />}

        {tab === "vaccines" && canManage &&
          (vaccinesQuery.error ? (
            <Alert severity="error">
              {vaccinesQuery.error instanceof Error ? vaccinesQuery.error.message : "Ошибка загрузки"}
            </Alert>
          ) : (
            <Box sx={{ flex: 1, minHeight: 360 }}>
              <DataGrid<Vaccine>
                rows={vaccinesQuery.data ?? []}
                columns={vaccinesColumns}
                loading={vaccinesQuery.isLoading}
                disableColumnMenu
                disableRowSelectionOnClick
                rowHeight={60}
                columnHeaderHeight={theme.appLayout.table.headerRowHeight}
                slots={{ noRowsOverlay: NoRows("Справочник вакцин пуст") }}
                localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
                sx={gridSx}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                pageSizeOptions={[25, 50, 100]}
              />
            </Box>
          ))}

        {tab === "batches" && canManage &&
          (batchesQuery.error ? (
            <Alert severity="error">
              {batchesQuery.error instanceof Error ? batchesQuery.error.message : "Ошибка загрузки"}
            </Alert>
          ) : (
            <Box sx={{ flex: 1, minHeight: 360 }}>
              <DataGrid<VaccineBatch>
                rows={batchesQuery.data ?? []}
                columns={batchesColumns}
                loading={batchesQuery.isLoading}
                disableColumnMenu
                disableRowSelectionOnClick
                rowHeight={60}
                columnHeaderHeight={theme.appLayout.table.headerRowHeight}
                slots={{ noRowsOverlay: NoRows("Нет партий на складе филиала") }}
                localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
                sx={gridSx}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                pageSizeOptions={[25, 50, 100]}
              />
            </Box>
          ))}

        {tab === "calendar" && (
          <CalendarTab
            rows={calendarQuery.data ?? []}
            loading={calendarQuery.isLoading}
            error={calendarQuery.error}
            canManage={canManage}
            onEdit={(row) => setCalendarDialog({ open: true, row, preset: null })}
            onDelete={(row) => setDeleteConfirm(row)}
            onAddDose={(vaccineId, doseNumber) =>
              setCalendarDialog({ open: true, row: null, preset: { vaccineId, doseNumber } })
            }
          />
        )}

        {tab === "report" &&
          (reportQuery.error ? (
            <Alert severity="error">
              {reportQuery.error instanceof Error ? reportQuery.error.message : "Ошибка загрузки"}
            </Alert>
          ) : (
            <>
              {reportQuery.data && (
                <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
                  <StatTile icon={<UpcomingOutlined />} label="План" value={reportQuery.data.totals.planned} />
                  <StatTile icon={<VaccinesOutlined />} label="Сделано" value={reportQuery.data.totals.done} tone="success" />
                  <StatTile icon={<HistoryOutlined />} label="Внешних" value={reportQuery.data.totals.externalDone} />
                  <StatTile icon={<EventBusyOutlined />} label="Просрочено" value={reportQuery.data.totals.overdue} tone="error" />
                </Stack>
              )}
              <Box sx={{ flex: 1, minHeight: 320 }}>
                <DataGrid<MonthlyReportRow>
                  rows={reportQuery.data?.rows ?? []}
                  columns={reportColumns}
                  getRowId={(r) => r.templateId}
                  loading={reportQuery.isLoading}
                  disableColumnMenu
                  disableRowSelectionOnClick
                  rowHeight={60}
                  columnHeaderHeight={theme.appLayout.table.headerRowHeight}
                  slots={{ noRowsOverlay: NoRows("Нет данных за месяц") }}
                  localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
                  sx={gridSx}
                  initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
                  pageSizeOptions={[25, 50, 100]}
                />
              </Box>
            </>
          ))}
      </Box>

      <RecordVaccinationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initialPatient={drawerPatient}
        lockedScenario="external"
      />

      <KrCalendarDialog open={krDialogOpen} onClose={() => setKrDialogOpen(false)} />

      <ExemptionDialog
        open={exemptionTarget != null}
        onClose={() => setExemptionTarget(null)}
        patientId={exemptionTarget?.patientId ?? null}
        vaccineId={exemptionTarget?.vaccineId ?? null}
      />
      <RefusalDialog
        open={refusalTarget != null}
        onClose={() => setRefusalTarget(null)}
        patientId={refusalTarget?.patientId ?? null}
        vaccineId={refusalTarget?.vaccineId ?? null}
      />

      <DjangoEditPatientDrawer
        open={editPatientOpen}
        patient={editPatient}
        onClose={() => setEditPatientOpen(false)}
        onUpdated={(p) => {
          setEditPatientOpen(false);
          setEditPatient(p);
          // ФИО и телефон приходят внутри слотов календаря — обновляем список.
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
          void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.patients.detail(p.id) });
        }}
      />

      <VaccineDialog
        open={vaccineDialog.open}
        vaccine={vaccineDialog.vaccine}
        onClose={() => setVaccineDialog({ open: false, vaccine: null })}
      />

      <BatchDialog
        open={batchDialog.open}
        batch={batchDialog.batch}
        onClose={() => setBatchDialog({ open: false, batch: null })}
      />

      <BatchWriteOffDialog
        open={writeOffBatchTarget != null}
        batch={writeOffBatchTarget}
        onClose={() => setWriteOffBatchTarget(null)}
      />

      <CalendarTemplateDialog
        open={calendarDialog.open}
        row={calendarDialog.row}
        preset={calendarDialog.preset}
        onClose={() => setCalendarDialog({ open: false, row: null })}
      />

      <Dialog open={deleteConfirm != null} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить строку календаря?</DialogTitle>
        <DialogContent>
          {/* Ошибка действия видна в самом диалоге, а не под ним. */}
          {actionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {actionError}
            </Alert>
          )}
          <DialogContentText>
            {deleteConfirm
              ? t("page.deleteRowMessage", {
                  details: `${deleteConfirm.vaccineName} · доза ${deleteConfirm.doseNumber} · ${deleteConfirm.label || `${deleteConfirm.ageMonths} мес`}`,
                })
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <AppButton variant="outlined" onClick={() => setDeleteConfirm(null)} disabled={deleteTemplateMutation.isPending}>
            Отмена
          </AppButton>
          <AppButton
            variant="contained"
            color="error"
            disabled={deleteTemplateMutation.isPending}
            onClick={() => {
              if (!deleteConfirm) return;
              deleteTemplateMutation.mutate(deleteConfirm.id, {
                onSuccess: () => setDeleteConfirm(null),
              });
            }}
          >
            Удалить
          </AppButton>
        </DialogActions>
      </Dialog>

      {/* Пропуск дозы с причиной */}
      <Dialog open={skipTarget != null} onClose={() => setSkipTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Пропустить дозу</DialogTitle>
        <DialogContent>
          {/* Ошибка действия видна в самом диалоге, а не под ним. */}
          {actionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {actionError}
            </Alert>
          )}
          <DialogContentText sx={{ mb: 2 }}>
            {skipTarget ? `${skipTarget.vaccineName} · доза ${skipTarget.doseNumber}. Укажите причину — она сохранится в календаре.` : ""}
          </DialogContentText>
          <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mb: 2 }}>
            {["Отказ родителя", "Медотвод", "Отложено"].map((r) => (
              <Chip
                key={r}
                label={r}
                size="small"
                variant={skipReason === r ? "filled" : "outlined"}
                color={skipReason === r ? "primary" : "default"}
                onClick={() => setSkipReason(r)}
                sx={{ borderRadius: "7px" }}
              />
            ))}
          </Stack>
          <TextField
            fullWidth
            size="small"
            label="Причина"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            multiline
            minRows={2}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <AppButton variant="outlined" onClick={() => setSkipTarget(null)} disabled={scheduleMutation.isPending}>
            Отмена
          </AppButton>
          <AppButton
            variant="contained"
            disabled={skipReason.trim() === "" || scheduleMutation.isPending}
            onClick={() => {
              if (!skipTarget) return;
              scheduleMutation.mutate(
                { slotId: skipTarget.id, status: "skipped", notes: skipReason.trim() },
                { onSuccess: () => setSkipTarget(null) },
              );
            }}
          >
            Пропустить
          </AppButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

/** Обёртка для двухстрочной ячейки DataGrid: флекс на .MuiDataGrid-cell
 *  центрирует только одну строку — многострочную центрируем явно. */
const twoLineCellSx = {
  minWidth: 0,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
} as const;

const gridSx = (t: import("@mui/material/styles").Theme) => ({
  bgcolor: "background.paper",
  borderRadius: "14px",
  "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
  "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
  "& .MuiDataGrid-virtualScroller": { overflowAnchor: "none" },
  "& .row-overdue": {
    bgcolor: alpha(t.palette.error.main, t.palette.mode === "dark" ? 0.08 : 0.05),
    "&:hover": { bgcolor: alpha(t.palette.error.main, t.palette.mode === "dark" ? 0.12 : 0.08) },
  },
});

export default VaccinationsPage;
