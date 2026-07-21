import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  IconButton,
  Stack,
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
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import MedicationOutlined from "@mui/icons-material/MedicationOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import EditOutlined from "@mui/icons-material/EditOutlined";

import {
  AppButton,
  DateRangeField,
  PageHeader,
  UserAvatar,
  type DateRange,
} from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { subtleBg } from "../../theme/uiHelpers";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import {
  getBatches,
  getRecords,
  getScheduleDashboard,
  getVaccines,
  updateSchedule,
  type Vaccine,
  type VaccineBatch,
  type VaccinationRecord,
  type VaccinationScheduleSlot,
} from "../../api/vaccinations";
import type { DjangoPatient } from "../../api/patients";
import { RecordStatusChip, ScheduleStatusChip } from "../../components/vaccinations/VaccinationChips";
import RecordVaccinationDrawer from "../../components/vaccinations/RecordVaccinationDrawer";
import VaccineDialog from "../../components/vaccinations/VaccineDialog";
import BatchDialog from "../../components/vaccinations/BatchDialog";
import { injectionSiteLabel, scheduleDateInfo } from "./meta";

type VaccTab = "due" | "records" | "vaccines" | "batches";

const BASE_TABS: { id: VaccTab; label: string; icon: React.ElementType }[] = [
  { id: "due", label: "Кому пора", icon: UpcomingOutlined },
  { id: "records", label: "Записи", icon: HistoryOutlined },
];

/** Вкладки-справочники — только для vaccinations.manage. */
const MANAGE_TABS: { id: VaccTab; label: string; icon: React.ElementType }[] = [
  { id: "vaccines", label: "Вакцины", icon: MedicationOutlined },
  { id: "batches", label: "Партии", icon: Inventory2Outlined },
];

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

/** Минимальный пациент из слота календаря — для предзаполнения дровера. */
function patientStubFromSlot(slot: VaccinationScheduleSlot): DjangoPatient {
  return {
    id: slot.patientId,
    organizationId: slot.organizationId,
    branch: null,
    fullName: slot.patientName ?? `Пациент #${slot.patientId}`,
    phone: slot.patientPhone ?? "",
    secondaryPhone: null,
    birthDate: null,
    gender: "unknown",
    address: null,
    notes: null,
    source: null,
    photoUrl: null,
    inn: "",
    isBlacklisted: false,
    blacklistReason: "",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  };
}

const VaccinationsPage: React.FC = () => {
  usePageTitle("Прививки");
  const theme = useTheme();
  const { can, loading: permLoading } = useCanChecker();
  const { activeBranch } = usePermissions();
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();

  const branchId = activeBranch?.id ?? null;
  const canView = can("vaccinations.view");
  const canRecord = can("vaccinations.record");
  const canManage = can("vaccinations.manage");

  const tabs = React.useMemo(
    () => (canManage ? [...BASE_TABS, ...MANAGE_TABS] : BASE_TABS),
    [canManage],
  );

  const [tab, setTab] = React.useState<VaccTab>(() => {
    const saved = sessionStorage.getItem("vaccinations-tab");
    return (saved as VaccTab) ?? "due";
  });

  // Скрыть manage-вкладку, если право пропало (или его и не было).
  React.useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab("due");
  }, [tabs, tab]);
  const [recordsRange, setRecordsRange] = React.useState<DateRange>({
    from: dayjs().subtract(29, "day").startOf("day"),
    to: dayjs().endOf("day"),
  });
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

  const handleTabChange = (t: VaccTab) => {
    setTab(t);
    sessionStorage.setItem("vaccinations-tab", t);
  };

  const enabled = !permLoading && canView;

  const dueQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.schedule({ branchId, orgId }),
    queryFn: ({ signal }) =>
      getScheduleDashboard({ branchId: branchId ?? undefined, organizationId: orgId }, signal),
    enabled: enabled && tab === "due",
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const recordsQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.records({
      branchId,
      orgId,
      from: recordsRange.from.format("YYYY-MM-DD"),
      to: recordsRange.to.format("YYYY-MM-DD"),
    }),
    queryFn: ({ signal }) =>
      getRecords(
        {
          branchId: branchId ?? undefined,
          dateFrom: recordsRange.from.format("YYYY-MM-DD"),
          dateTo: recordsRange.to.format("YYYY-MM-DD"),
          organizationId: orgId,
        },
        signal,
      ),
    enabled: enabled && tab === "records",
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
    enabled: enabled && canManage && tab === "batches",
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ slotId, ...payload }: { slotId: number; status?: "skipped"; scheduledDate?: string }) =>
      updateSchedule(slotId, payload, orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.vaccinations.all });
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : "Не удалось обновить слот"),
  });

  const openDrawerFor = (patient: DjangoPatient | null) => {
    setDrawerPatient(patient);
    setDrawerOpen(true);
  };

  const dueRows = dueQuery.data ?? [];
  const overdueCount = dueRows.filter((s) => s.status === "overdue").length;
  const weekCount = dueRows.filter((s) => {
    const d = dayjs(s.scheduledDate);
    return s.status === "planned" && d.diff(dayjs(), "day") <= 7;
  }).length;

  // Живая подпись под заголовком: на «Кому пора» подсвечивает главное —
  // сколько всего запланировано и сколько из них просрочено; на других
  // вкладках — нейтральное описание раздела.
  const heroSubtitle = React.useMemo(() => {
    if (tab !== "due") return "Иммунопрофилактика и календарь прививок";
    if (dueRows.length === 0) return "Иммунопрофилактика и календарь прививок";
    const total = `${dueRows.length} ${pluralSlots(dueRows.length)}`;
    return overdueCount > 0 ? `${total} · ${overdueCount} просрочено` : total;
  }, [tab, dueRows.length, overdueCount]);

  const dueColumns = React.useMemo<GridColDef<VaccinationScheduleSlot>[]>(
    () => [
      {
        field: "patientName",
        headerName: "Пациент",
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" gap={1} sx={{ height: "100%", minWidth: 0 }}>
            <UserAvatar name={row.patientName ?? `#${row.patientId}`} size={28} sx={{ borderRadius: "8px", flexShrink: 0 }} />
            <Box sx={twoLineCellSx}>
              <Typography variant="body2" fontWeight={500} noWrap>
                {row.patientName ?? `Пациент #${row.patientId}`}
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
        width: 220,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" gap={0.75}>
            {canRecord && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<VaccinesOutlined sx={{ fontSize: 17 }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  openDrawerFor(patientStubFromSlot(row));
                }}
                sx={{ textTransform: "none", borderRadius: "8px" }}
              >
                Ввести
              </Button>
            )}
            {canRecord && (
              <Button
                size="small"
                color="inherit"
                startIcon={<BlockOutlined sx={{ fontSize: 17 }} />}
                disabled={scheduleMutation.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  scheduleMutation.mutate({ slotId: row.id, status: "skipped" });
                }}
                sx={{ textTransform: "none", borderRadius: "8px", color: "text.secondary" }}
              >
                Пропустить
              </Button>
            )}
          </Stack>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canRecord, scheduleMutation.isPending],
  );

  const recordsColumns = React.useMemo<GridColDef<VaccinationRecord>[]>(
    () => [
      {
        field: "administeredAt",
        headerName: "Дата",
        width: 130,
        sortable: false,
        renderCell: ({ row }) => (
          <Typography variant="body2">{dayjs(row.administeredAt).format("DD.MM.YYYY")}</Typography>
        ),
      },
      {
        field: "vaccineName",
        headerName: "Вакцина",
        flex: 1,
        minWidth: 180,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={twoLineCellSx}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {row.vaccineName} · доза {row.doseNumber}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.isExternal ? "Внешняя" : "Со склада"} · {injectionSiteLabel(row.injectionSite)}
            </Typography>
          </Box>
        ),
      },
      {
        field: "administeredBy",
        headerName: "Кто вводил",
        width: 190,
        sortable: false,
        renderCell: ({ row }) =>
          row.administeredBy ? (
            <Stack direction="row" alignItems="center" gap={1} sx={{ height: "100%", minWidth: 0 }}>
              <UserAvatar name={row.administeredBy.fullName} size={28} sx={{ borderRadius: "8px", flexShrink: 0 }} />
              <Typography variant="body2" noWrap>
                {row.administeredBy.fullName}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.disabled">
              —
            </Typography>
          ),
      },
      {
        field: "status",
        headerName: "Статус",
        width: 150,
        sortable: false,
        renderCell: ({ row }) => <RecordStatusChip status={row.status} />,
      },
    ],
    [],
  );

  const vaccinesColumns = React.useMemo<GridColDef<Vaccine>[]>(
    () => [
      {
        field: "name",
        headerName: "Вакцина",
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={twoLineCellSx}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {row.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {[row.manufacturer, row.targetDisease].filter(Boolean).join(" · ") || "—"}
            </Typography>
          </Box>
        ),
      },
      {
        field: "dosesRequired",
        headerName: "Доз / интервал",
        width: 160,
        sortable: false,
        renderCell: ({ row }) => (
          <Typography variant="body2">
            {row.dosesRequired} доз
            {row.intervalDays != null ? ` · ${row.intervalDays} дн` : ""}
          </Typography>
        ),
      },
      {
        field: "recommendedAgeMonths",
        headerName: "Возраст",
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <Typography variant="body2" color={row.recommendedAgeMonths == null ? "text.disabled" : undefined}>
            {row.recommendedAgeMonths != null ? `${row.recommendedAgeMonths} мес` : "—"}
          </Typography>
        ),
      },
      {
        field: "isActive",
        headerName: "Статус",
        width: 130,
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
    [],
  );

  const batchesColumns = React.useMemo<GridColDef<VaccineBatch>[]>(
    () => [
      {
        field: "vaccineName",
        headerName: "Вакцина",
        flex: 1,
        minWidth: 180,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={twoLineCellSx}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {row.vaccineName}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              №{row.batchNumber}
              {row.productId == null ? " · без склада" : ""}
            </Typography>
          </Box>
        ),
      },
      {
        field: "remaining",
        headerName: "Остаток",
        width: 130,
        sortable: false,
        renderCell: ({ row }) => (
          <Typography variant="body2">
            {row.remaining} / {row.quantityInitial}
          </Typography>
        ),
      },
      {
        field: "expiresAt",
        headerName: "Годен до",
        width: 140,
        sortable: false,
        renderCell: ({ row }) => {
          const expired = dayjs(row.expiresAt).isBefore(dayjs(), "day");
          return (
            <Typography variant="body2" sx={{ color: expired ? "error.main" : undefined, fontWeight: expired ? 600 : 400 }}>
              {dayjs(row.expiresAt).format("DD.MM.YYYY")}
            </Typography>
          );
        },
      },
      {
        field: "supplier",
        headerName: "Поставщик",
        width: 160,
        sortable: false,
        renderCell: ({ row }) => (
          <Typography variant="body2" color={row.supplier ? undefined : "text.disabled"} noWrap>
            {row.supplier || "—"}
          </Typography>
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
            aria-label="Изменить партию"
            onClick={() => setBatchDialog({ open: true, batch: row })}
          >
            <EditOutlined fontSize="small" />
          </IconButton>
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
        title="Прививки"
        showTitle={false}
        loading={
          dueQuery.isFetching ||
          recordsQuery.isFetching ||
          vaccinesQuery.isFetching ||
          batchesQuery.isFetching
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
        {/* ── Hero: иконка-плашка + название раздела + живая подпись ── */}
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ mt: 2, mb: 0.5 }}>
          <Box
            sx={(t) => ({
              width: 44,
              height: 44,
              borderRadius: "12px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "primary.onSurface",
              bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
              "& .MuiSvgIcon-root": { fontSize: 24 },
            })}
          >
            <VaccinesOutlined />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: -0.2, lineHeight: 1.2 }}>
              Прививки
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {heroSubtitle}
            </Typography>
          </Box>
        </Stack>

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
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <ButtonBase
                  key={id}
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
                  </Stack>
                </ButtonBase>
              );
            })}
          </Stack>

          <Box sx={{ flex: 1 }} />

          {tab === "due" && (
            <Stack direction="row" gap={1} flexWrap="wrap">
              {overdueCount > 0 && (
                <StatTile icon={<EventBusyOutlined />} label="Просрочено" value={overdueCount} tone="error" />
              )}
              <StatTile icon={<UpcomingOutlined />} label="На неделю" value={weekCount} tone="warning" />
            </Stack>
          )}

          {tab === "records" && (
            <DateRangeField value={recordsRange} onChange={setRecordsRange} minWidth={220} />
          )}

          {(tab === "due" || tab === "records") && canRecord && (
            <AppButton variant="contained" startIcon={<AddOutlined />} onClick={() => openDrawerFor(null)}>
              Ввести прививку
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
        </Stack>

        {branchId == null && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Выберите активный филиал, чтобы увидеть прививки по нему.
          </Alert>
        )}

        {actionError && (
          <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 1.5 }}>
            {actionError}
          </Alert>
        )}

        {/* ── Таблица ── */}
        {tab === "due" &&
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
                slots={{ noRowsOverlay: NoRows("Нет запланированных прививок") }}
                localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
                sx={gridSx}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                pageSizeOptions={[25, 50, 100]}
              />
            </Box>
          ))}

        {tab === "records" &&
          (recordsQuery.error ? (
            <Alert severity="error">
              {recordsQuery.error instanceof Error ? recordsQuery.error.message : "Ошибка загрузки"}
            </Alert>
          ) : (
            <Box sx={{ flex: 1, minHeight: 360 }}>
              <DataGrid<VaccinationRecord>
                rows={recordsQuery.data ?? []}
                columns={recordsColumns}
                loading={recordsQuery.isLoading}
                disableColumnMenu
                disableRowSelectionOnClick
                rowHeight={64}
                columnHeaderHeight={theme.appLayout.table.headerRowHeight}
                slots={{ noRowsOverlay: NoRows("Нет записей за период") }}
                localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
                sx={gridSx}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                pageSizeOptions={[25, 50, 100]}
              />
            </Box>
          ))}

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
      </Box>

      <RecordVaccinationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initialPatient={drawerPatient}
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
    </Box>
  );
};

/** Склонение «запланирована/запланировано/запланированы» для подписи hero. */
function pluralSlots(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "прививка запланирована";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "прививки запланированы";
  return "прививок запланировано";
}

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
