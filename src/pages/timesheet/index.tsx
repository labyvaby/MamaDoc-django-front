import React from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonBase,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import EventRepeatRounded from "@mui/icons-material/EventRepeatRounded";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import LockOpenOutlined from "@mui/icons-material/LockOpenOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import InboxOutlined from "@mui/icons-material/InboxOutlined";
import GridViewRounded from "@mui/icons-material/GridViewRounded";
import WhatshotOutlined from "@mui/icons-material/WhatshotOutlined";
import InsertChartOutlined from "@mui/icons-material/InsertChartOutlined";
import TouchAppOutlined from "@mui/icons-material/TouchAppOutlined";
import KeyboardOutlined from "@mui/icons-material/KeyboardOutlined";
import FiberManualRecord from "@mui/icons-material/FiberManualRecord";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";

import {
  closeTimesheetMonth,
  exportTimesheet,
  fillTimesheetBySchedule,
  getTimesheet,
  reopenTimesheetMonth,
  type TimesheetCellRef,
  type TimesheetGrid as TimesheetGridData,
  type TimesheetMarksResult,
  type TimesheetRow,
} from "../../api/timesheet";
import { getSpecializations } from "../../api/staff";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ConfirmDialog, ListEmptyState, SegmentedTabs } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useChangesSocket, type ChangeMessage } from "../../hooks/useChangesSocket";
import { useOrgRoles } from "../../hooks/useOrgRoles";
import { downloadBlob } from "../../utility/download";
import { CellDrawer } from "./CellDrawer";
import { FillScheduleDialog, type FillRange } from "./FillScheduleDialog";
import { RequestsDrawer } from "./RequestsDrawer";
import { SelectionBar } from "./SelectionBar";
import { TimesheetCharts } from "./TimesheetCharts";
import { TimesheetGrid, type TotalsColumn } from "./TimesheetGrid";
import { codeFill, codeInk } from "./codeColors";
import { TimesheetKpis } from "./TimesheetKpis";
import { TimesheetSettingsDialog } from "./TimesheetSettingsDialog";
import { buildTimesheetXlsx, timesheetFileName } from "./exportTimesheetXlsx";
import {
  changedCells,
  codesByKey,
  compactHours,
  currentMonth,
  dayDate,
  describeSelection,
  formatHours,
  hotkeyLabel,
  markableCodes,
  MONTH_NAMES_GENITIVE,
  monthLabel,
  parseCellKey,
  plural,
  shiftMonth,
  toNumber,
  type GridPoint,
} from "./model";
import { useTimesheetEditor } from "./useTimesheetEditor";

const MotionBox = motion.create(Box);

type View = "codes" | "heat" | "charts";
const VIEW_STORAGE_KEY = "erkinai:timesheet:view";
const PAGE_SIZE = 100;
const REALTIME_DEBOUNCE_MS = 450;

function readStoredView(): View {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return value === "heat" || value === "charts" ? value : "codes";
  } catch {
    return "codes";
  }
}

const TOTALS: TotalsColumn[] = [
  { key: "days", label: "Дни", hint: "Отработано дней", value: (row) => row.totals.workedDays },
  {
    key: "hours",
    label: "Часы",
    hint: "Отработано часов (из них ночных — в подсказке ячеек)",
    value: (row) => compactHours(row.totals.hours) || "0",
  },
  {
    key: "overtime",
    label: "+Ч",
    hint: "Переработка сверх графика, часов",
    value: (row) => (toNumber(row.totals.overtimeHours) ? compactHours(row.totals.overtimeHours) : "—"),
    tone: (row) => (toNumber(row.totals.overtimeHours) ? "warning" : null),
  },
  {
    key: "leave",
    label: "О/Б",
    hint: "Отпуск / больничный, дней",
    value: (row) => `${row.totals.vacationDays}/${row.totals.sickDays}`,
  },
  {
    key: "missing",
    label: "Пропуск",
    hint: "Рабочих дней по графику без отметок",
    value: (row) => row.totals.missingDays || "—",
    tone: (row) => (row.totals.missingDays ? "error" : null),
  },
];

const TimesheetPage: React.FC = () => {
  usePageTitle("Табель");
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const organizationId = useApiOrgId();
  const { activeOrganization } = usePermissions();

  const month = searchParams.get("month") || currentMonth();
  const setMonth = React.useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set("month", next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [roleId, setRoleId] = React.useState<number | null>(null);
  const [specializationId, setSpecializationId] = React.useState<number | null>(null);
  const [view, setView] = React.useState<View>(readStoredView);
  const [missingOnly, setMissingOnly] = React.useState(false);
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [selectMode, setSelectMode] = React.useState(false);
  const [openCell, setOpenCell] = React.useState<TimesheetCellRef | null>(null);
  const [requestsOpen, setRequestsOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [fillOpen, setFillOpen] = React.useState(false);
  const [lockDialog, setLockDialog] = React.useState<"close" | "reopen" | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [monthDirection, setMonthDirection] = React.useState(0);
  const gridRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Режим вида — удобство, не данные: без хранилища просто не запомнится.
    }
  }, [view]);

  React.useEffect(() => setLimit(PAGE_SIZE), [month, debouncedSearch, roleId, specializationId]);

  const params = React.useMemo(
    () => ({ month, search: debouncedSearch, roleId, specializationId, limit }),
    [month, debouncedSearch, roleId, specializationId, limit],
  );
  const queryKey = djangoQueryKeys.timesheet.grid(organizationId, params);
  const [socketConnected, setSocketConnected] = React.useState(false);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getTimesheet(params, organizationId, signal),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    // WebSocket — ускоритель, а не замена: без него подтягиваем раз в минуту.
    refetchInterval: socketConnected ? false : 60_000,
  });
  const grid = query.data;

  const { roles, available: rolesAvailable } = useOrgRoles(Boolean(grid?.access.viewAll));
  const specializationsQuery = useQuery({
    queryKey: djangoQueryKeys.staff.specializations(organizationId),
    queryFn: ({ signal }) => getSpecializations(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    enabled: Boolean(grid?.access.viewAll),
    retry: false,
  });

  const updateRows = React.useCallback(
    (updater: (rows: TimesheetRow[]) => TimesheetRow[]) => {
      queryClient.setQueryData<TimesheetGridData>(queryKey, (old) =>
        old ? { ...old, rows: updater(old.rows) } : old,
      );
    },
    [queryClient, queryKey],
  );

  const allRows = React.useMemo(() => grid?.rows ?? [], [grid]);
  const rows = React.useMemo(
    () => (missingOnly ? allRows.filter((row) => row.totals.missingDays > 0) : allRows),
    [allRows, missingOnly],
  );
  const codes = React.useMemo(() => grid?.codes ?? [], [grid]);
  const codeMap = React.useMemo(() => codesByKey(codes), [codes]);
  const markable = React.useMemo(() => markableCodes(codes), [codes]);
  const access = grid?.access ?? null;
  // Закрытый месяц только смотрят: клик открывает ячейку, выделения нет.
  const canWrite = Boolean(access && (access.create || access.update || access.delete)) && !grid?.closed;
  const monthIndex = Number(month.split("-")[1]) - 1;
  const monthGenitive = MONTH_NAMES_GENITIVE[monthIndex] ?? "";
  const isCurrentMonth = grid ? grid.today.startsWith(month) : month === currentMonth();

  const openCellAt = React.useCallback(
    (point: GridPoint) => {
      const row = rows[point.row];
      if (row) setOpenCell({ employeeId: row.employee.id, date: dayDate(month, point.day) });
    },
    [month, rows],
  );

  const onBookingClosed = React.useCallback(
    (cells: TimesheetCellRef[]) => {
      notify?.({
        type: "success",
        message: `Запись клиентов закрыта: ${plural(cells.length, "день", "дня", "дней")}`,
        description: "Проверьте уже назначенные записи на эти дни в расписании",
      });
    },
    [notify],
  );

  const editor = useTimesheetEditor({
    month,
    rows,
    codes,
    access,
    organizationId,
    updateRows,
    notify,
    onOpenCell: openCellAt,
    onBookingClosed,
  });

  // ── Realtime ──────────────────────────────────────────────────────────────

  const realtimeTimer = React.useRef<number | undefined>(undefined);
  const flashNextRef = React.useRef(false);
  const lastRowsRef = React.useRef<TimesheetRow[]>([]);

  React.useEffect(() => {
    if (flashNextRef.current && lastRowsRef.current.length) {
      editor.flash(changedCells(lastRowsRef.current, allRows));
      flashNextRef.current = false;
    }
    lastRowsRef.current = allRows;
    // editor.flash стабилен (useCallback без зависимостей).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows]);

  const scheduleRefetch = React.useCallback(() => {
    window.clearTimeout(realtimeTimer.current);
    realtimeTimer.current = window.setTimeout(() => {
      flashNextRef.current = true;
      void query.refetch();
    }, REALTIME_DEBOUNCE_MS);
  }, [query]);

  const connected = useChangesSocket({
    enabled: Boolean(grid),
    onMessage: (msg: ChangeMessage) => {
      if (msg.entity === "timesheet") {
        const target = typeof msg.meta?.month === "string" ? msg.meta.month : null;
        if (!target || target === month) scheduleRefetch();
        return;
      }
      if (msg.entity !== "work_shift") return;
      if (!isCurrentMonth) return;
      scheduleRefetch();
      const employeeId = Number(msg.meta?.employeeId);
      const row = allRows.find((r) => r.employee.id === employeeId);
      if (row && (msg.action === "created" || msg.action === "updated")) {
        notify?.({
          type: "success",
          message:
            msg.action === "created"
              ? `${row.employee.fullName}: отметка прихода`
              : `${row.employee.fullName}: смена обновлена`,
        });
      }
    },
  });
  React.useEffect(() => setSocketConnected(connected), [connected]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const goMonth = (delta: number) => {
    setMonthDirection(delta);
    setMonth(shiftMonth(month, delta));
  };

  const selectedEmployees = React.useMemo(() => {
    const ids = new Set<number>();
    for (const key of editor.selection) ids.add(parseCellKey(key).employeeId);
    return ids;
  }, [editor.selection]);

  const fill = async (range: FillRange, onlySelected: boolean) => {
    if (!grid) return;
    setActionBusy(true);
    const previousRows = allRows;
    try {
      const last = grid.days[grid.days.length - 1]?.date;
      const result = await fillTimesheetBySchedule(
        {
          month,
          ...(range === "month" && last ? { dateTo: last } : {}),
          ...(onlySelected ? { employeeIds: [...selectedEmployees] } : {}),
        },
        organizationId,
      );
      updateRows((current) => {
        const byId = new Map(result.rows.map((row) => [row.employee.id, row]));
        return current.map((row) => byId.get(row.employee.id) ?? row);
      });
      editor.recordExternal("Заполнение по графику", previousRows, result);
      notify?.({
        type: "success",
        message: result.created
          ? `Заполнено по графику: ${plural(result.created, "ячейка", "ячейки", "ячеек")}`
          : "Пустых рабочих дней по графику нет",
        description: result.skippedClosed ? `В закрытом месяце пропущено ${result.skippedClosed}` : undefined,
      });
      setFillOpen(false);
      void query.refetch();
    } catch (error) {
      notify?.({ type: "error", message: error instanceof Error ? error.message : "Не удалось заполнить" });
    } finally {
      setActionBusy(false);
    }
  };

  const toggleLock = async () => {
    if (!lockDialog) return;
    setActionBusy(true);
    try {
      if (lockDialog === "close") {
        await closeTimesheetMonth(month, organizationId);
        notify?.({ type: "success", message: `Табель за ${monthLabel(month).toLowerCase()} закрыт` });
      } else {
        await reopenTimesheetMonth(month, organizationId);
        notify?.({ type: "success", message: "Табель переоткрыт — правки снова доступны" });
      }
      setLockDialog(null);
      await query.refetch();
    } catch (error) {
      notify?.({ type: "error", message: error instanceof Error ? error.message : "Не удалось" });
    } finally {
      setActionBusy(false);
    }
  };

  const doExport = async () => {
    setActionBusy(true);
    try {
      const full = await exportTimesheet(
        { month, search: debouncedSearch, roleId, specializationId },
        organizationId,
      );
      const blob = await buildTimesheetXlsx(full, {
        organizationName: activeOrganization?.name,
      });
      downloadBlob(blob, timesheetFileName(month));
      notify?.({ type: "success", message: "Табель выгружен в Excel" });
    } catch (error) {
      notify?.({ type: "error", message: error instanceof Error ? error.message : "Не удалось выгрузить" });
    } finally {
      setActionBusy(false);
    }
  };

  const refreshAfterCell = (result: TimesheetMarksResult | null) => {
    if (result?.rows.length) {
      const previous = allRows;
      updateRows((current) => {
        const byId = new Map(result.rows.map((row) => [row.employee.id, row]));
        return current.map((row) => byId.get(row.employee.id) ?? row);
      });
      editor.flash(
        changedCells(
          previous,
          previous.map((row) => result.rows.find((r) => r.employee.id === row.employee.id) ?? row),
        ),
      );
    } else {
      void query.refetch();
    }
  };

  const onCellPointerDown = (point: GridPoint, event: React.MouseEvent) => {
    if ((isPhone && !selectMode) || !canWrite) {
      openCellAt(point);
      return;
    }
    editor.onCellPointerDown(point, isPhone ? ({ ...event, ctrlKey: true } as React.MouseEvent) : event);
  };

  const legend = (
    <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", py: 0.25, "&::-webkit-scrollbar": { display: "none" } }}>
      {codes
        .filter((code) => code.isActive || (grid?.rows ?? []).some((row) => row.totals.codes[code.key]))
        .map((code) => {
          const hotkey = code.markable ? hotkeyLabel(codes, code.key) : null;
          const clickable = code.markable && canWrite && editor.selection.size > 0;
          return (
            <Tooltip
              key={code.key}
              title={
                clickable
                  ? `Поставить «${code.letter}» в выделенные ячейки${hotkey ? ` (клавиша ${hotkey})` : ""}`
                  : hotkey
                    ? `Клавиша ${hotkey}`
                    : ""
              }
            >
              <Box component="span" sx={{ display: "inline-flex", flexShrink: 0 }}>
              <ButtonBase
                disabled={!clickable}
                onClick={() => void editor.applyCode(code.key)}
                sx={{
                  flexShrink: 0,
                  gap: 0.75,
                  pl: 0.5,
                  pr: 1,
                  height: 30,
                  borderRadius: "9px",
                  border: 1,
                  borderColor: clickable ? alpha(code.color, 0.45) : "divider",
                  bgcolor: clickable ? codeFill(theme, code.color, 0.6) : "transparent",
                  transition: "all .15s ease",
                  "&.Mui-disabled": { opacity: 1 },
                  "&:hover": clickable ? { transform: "translateY(-1px)" } : undefined,
                }}
              >
                <Box
                  sx={{
                    minWidth: 22,
                    height: 22,
                    px: 0.5,
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11.5,
                    fontWeight: 900,
                    color: codeInk(theme, code.color),
                    bgcolor: codeFill(theme, code.color, 1.4),
                  }}
                >
                  {code.letter}
                </Box>
                <Typography variant="caption" fontWeight={700} noWrap>
                  {code.name}
                </Typography>
              </ButtonBase>
              </Box>
            </Tooltip>
          );
        })}
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ pl: 1, flexShrink: 0, color: "text.secondary" }}>
        <Box sx={{ width: 22, height: 22, borderRadius: "6px", border: "1px dashed", borderColor: "error.main", backgroundImage: `repeating-linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.24)} 0 3px, transparent 3px 7px)` }} />
        <Typography variant="caption" fontWeight={700} noWrap>
          Пропуск
        </Typography>
        <Box sx={{ width: 6, height: 6, ml: 1, borderRadius: "50%", bgcolor: "primary.main" }} />
        <Typography variant="caption" fontWeight={700} noWrap>
          ручная
        </Typography>
        <Box sx={{ width: 6, height: 6, ml: 1, borderRadius: "50%", bgcolor: "warning.main" }} />
        <Typography variant="caption" fontWeight={700} noWrap>
          заявка
        </Typography>
      </Stack>
    </Stack>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, pb: { xs: 12, md: 12 }, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      {/* Toolbar */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ xs: "stretch", md: "center" }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton onClick={() => goMonth(-1)} aria-label="Предыдущий месяц" sx={{ borderRadius: "10px", border: 1, borderColor: "divider" }}>
            <ChevronLeftRounded />
          </IconButton>
          <Box sx={{ position: "relative", overflow: "hidden", minWidth: { xs: 0, md: 190 }, flex: { xs: 1, md: "none" }, height: 40 }}>
            <AnimatePresence initial={false} custom={monthDirection} mode="popLayout">
              <MotionBox
                key={month}
                custom={monthDirection}
                initial={{ opacity: 0, x: monthDirection * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: monthDirection * -40 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Typography variant="h6" fontWeight={900} letterSpacing={-0.4} noWrap>
                  {monthLabel(month)}
                </Typography>
              </MotionBox>
            </AnimatePresence>
          </Box>
          <IconButton onClick={() => goMonth(1)} aria-label="Следующий месяц" sx={{ borderRadius: "10px", border: 1, borderColor: "divider" }}>
            <ChevronRightRounded />
          </IconButton>
          {!isCurrentMonth && (
            <Button size="small" onClick={() => setMonth(currentMonth())} sx={{ borderRadius: "10px", ml: 0.5 }}>
              Сегодня
            </Button>
          )}
          {grid?.closed && (
            <Chip
              icon={<LockOutlined />}
              label="Закрыт"
              size="small"
              color="default"
              sx={{ ml: 1, fontWeight: 700, borderRadius: "8px" }}
            />
          )}
          {connected && (
            <Tooltip title="Табель обновляется сам — изменения коллег и отметки СКУД приходят сразу">
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 1, color: "success.main" }}>
                <FiberManualRecord sx={{ fontSize: 10 }} />
                {!isPhone && (
                  <Typography variant="caption" fontWeight={700}>
                    вживую
                  </Typography>
                )}
              </Stack>
            </Tooltip>
          )}
        </Stack>

        <Box sx={{ flex: 1 }} />

        <Stack direction="row" spacing={1} sx={{ overflowX: "auto", "&::-webkit-scrollbar": { display: "none" } }}>
          <TextField
            size="small"
            placeholder="Поиск сотрудника"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: { xs: 180, md: 220 } }}
          />
          {rolesAvailable && roles.length > 0 && (
            <TextField
              select
              size="small"
              label="Роль"
              value={roleId ?? ""}
              onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : null)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">Все роли</MenuItem>
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  {role.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {(specializationsQuery.data?.length ?? 0) > 0 && (
            <TextField
              select
              size="small"
              label="Специализация"
              value={specializationId ?? ""}
              onChange={(e) => setSpecializationId(e.target.value ? Number(e.target.value) : null)}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">Все</MenuItem>
              {specializationsQuery.data?.map((spec) => (
                <MenuItem key={spec.id} value={spec.id}>
                  {spec.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </Stack>

      {/* KPIs */}
      {grid ? (
        <TimesheetKpis
          summary={grid.summary}
          daily={grid.daily}
          pendingRequests={grid.pendingRequests}
          canApprove={grid.access.approve}
          missingOnly={missingOnly}
          onToggleMissing={() => setMissingOnly((v) => !v)}
          onOpenRequests={() => setRequestsOpen(true)}
        />
      ) : (
        <Stack direction="row" spacing={1.5}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" height={108} sx={{ flex: 1, borderRadius: "14px" }} />
          ))}
        </Stack>
      )}

      {/* Actions + view */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ xs: "stretch", md: "center" }}>
        <SegmentedTabs<View>
          layoutId="timesheet-view"
          value={view}
          onChange={setView}
          tabs={[
            { key: "codes", label: "Табель", icon: <GridViewRounded /> },
            { key: "heat", label: isPhone ? "Тепловая" : "Тепловая карта", icon: <WhatshotOutlined /> },
            { key: "charts", label: "Графики", icon: <InsertChartOutlined /> },
          ]}
        />
        <Box sx={{ flex: 1 }} />
        <Stack
          direction="row"
          spacing={1}
          sx={{
            overflowX: "auto",
            py: 0.25,
            "& > *": { flexShrink: 0 },
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {isPhone && canWrite && view !== "charts" && (
            <Button
              size="small"
              variant={selectMode ? "contained" : "outlined"}
              startIcon={<TouchAppOutlined />}
              onClick={() => {
                setSelectMode((v) => !v);
                editor.clearSelection();
              }}
              sx={{ borderRadius: "10px", whiteSpace: "nowrap" }}
            >
              {selectMode ? "Выделение" : "Выделить"}
            </Button>
          )}
          {access?.approve && (
            <Badge color="warning" badgeContent={grid?.pendingRequests ?? 0} overlap="rectangular">
              <Button
                size="small"
                variant="outlined"
                startIcon={<InboxOutlined />}
                onClick={() => setRequestsOpen(true)}
                sx={{ borderRadius: "10px", whiteSpace: "nowrap" }}
              >
                Заявки
              </Button>
            </Badge>
          )}
          {access?.fillSchedule && !grid?.closed && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<EventRepeatRounded />}
              onClick={() => setFillOpen(true)}
              sx={{ borderRadius: "10px", whiteSpace: "nowrap" }}
            >
              Заполнить по графику
            </Button>
          )}
          {access?.export && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadOutlined />}
              onClick={() => void doExport()}
              disabled={actionBusy}
              sx={{ borderRadius: "10px", whiteSpace: "nowrap" }}
            >
              Excel
            </Button>
          )}
          {grid && !grid.closed && access?.close && (
            <Button
              size="small"
              variant="contained"
              startIcon={<LockOutlined />}
              onClick={() => setLockDialog("close")}
              sx={{ borderRadius: "10px", whiteSpace: "nowrap" }}
            >
              Закрыть месяц
            </Button>
          )}
          {grid && grid.closures.length > 0 && access?.reopen && (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<LockOpenOutlined />}
              onClick={() => setLockDialog("reopen")}
              sx={{ borderRadius: "10px", whiteSpace: "nowrap" }}
            >
              Переоткрыть
            </Button>
          )}
          {access?.settings && (
            <Tooltip title="Настройки табеля">
              <IconButton onClick={() => setSettingsOpen(true)} sx={{ borderRadius: "10px", border: 1, borderColor: "divider" }}>
                <SettingsOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      {grid?.closed && grid.closures.length > 0 && (
        <Alert severity="info" icon={<LockOutlined fontSize="inherit" />} sx={{ borderRadius: "12px" }}>
          Табель за {monthLabel(month).toLowerCase()} закрыт
          {grid.closures[0]?.closedByName ? ` · ${grid.closures[0].closedByName}` : ""}
          {grid.closures[0] ? `, ${new Date(grid.closures[0].closedAt).toLocaleDateString("ru-RU")}` : ""}. Отметки
          можно только смотреть.
        </Alert>
      )}

      {query.error && !grid && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void query.refetch()}>
              Повторить
            </Button>
          }
          sx={{ borderRadius: "12px" }}
        >
          {query.error instanceof Error ? query.error.message : "Не удалось загрузить табель"}
        </Alert>
      )}

      {view !== "charts" && legend}

      {/* Body */}
      {!grid ? (
        <Skeleton variant="rounded" height={420} sx={{ borderRadius: "14px" }} />
      ) : view === "charts" ? (
        <TimesheetCharts daily={grid.daily} rows={allRows} codes={codes} today={grid.today} month={month} />
      ) : rows.length === 0 ? (
        <ListEmptyState
          icon={missingOnly ? <TaskAltRounded /> : <GroupsOutlined />}
          title={missingOnly ? "Пропусков нет" : "Сотрудников нет"}
          description={
            missingOnly
              ? "У всех сотрудников рабочие дни закрыты отметками 🎉"
              : debouncedSearch || roleId || specializationId
                ? "Под фильтр никто не подходит"
                : "В этом филиале пока нет сотрудников"
          }
        />
      ) : (
        <Box sx={{ position: "relative" }}>
          <TimesheetGrid
            gridRef={gridRef}
            rows={rows}
            days={grid.days}
            codes={codeMap}
            daily={grid.daily}
            viewMode={view === "heat" ? "heat" : "codes"}
            selection={editor.selection}
            active={editor.active}
            flashing={editor.flashing}
            pending={editor.pending}
            compact={isPhone}
            totals={isPhone ? TOTALS.slice(0, 2) : TOTALS}
            monthGenitive={monthGenitive}
            highlightEmployeeId={grid.scope.callerEmployeeId}
            onCellPointerDown={onCellPointerDown}
            onCellPointerEnter={editor.onCellPointerEnter}
            onCellOpen={openCellAt}
            onRowSelect={(rowIndex, event) => {
              if (canWrite) editor.onRowSelect(rowIndex, event);
            }}
            onDaySelect={(day, event) => {
              if (canWrite) editor.onDaySelect(day, event);
            }}
            onKeyDown={editor.onKeyDown}
          />
          {query.isFetching && (
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 14,
                right: 14,
                height: 2,
                overflow: "hidden",
                borderRadius: 2,
                "&::after": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  background: `linear-gradient(90deg, transparent, ${theme.palette.primary.main}, transparent)`,
                  animation: "ts-loading 1.1s ease-in-out infinite",
                },
                "@keyframes ts-loading": {
                  "0%": { transform: "translateX(-100%)" },
                  "100%": { transform: "translateX(100%)" },
                },
              }}
            />
          )}
        </Box>
      )}

      {grid && view !== "charts" && rows.length > 0 && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ xs: "flex-start", md: "center" }}>
          {canWrite && !isPhone && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: "text.secondary" }}>
              <KeyboardOutlined fontSize="small" />
              <Typography variant="caption">
                Выделяйте мышью (Shift — диапазон, Ctrl — точечно), жмите <b>Я В О Б К Н</b> или цифры часов,
                Del — снять, двойной клик или Enter — подробно, Ctrl+Z — отменить.
              </Typography>
            </Stack>
          )}
          <Box sx={{ flex: 1 }} />
          {grid.total > allRows.length && (
            <Button size="small" onClick={() => setLimit((value) => value + PAGE_SIZE)} sx={{ borderRadius: "10px" }}>
              Показать ещё ({grid.total - allRows.length})
            </Button>
          )}
          <Typography variant="caption" color="text.secondary">
            {plural(grid.total, "сотрудник", "сотрудника", "сотрудников")}
            {grid.scope.branchName ? ` · ${grid.scope.branchName}` : ""}
          </Typography>
        </Stack>
      )}

      <SelectionBar
        open={canWrite && editor.selection.size > 0 && view !== "charts"}
        label={describeSelection(editor.selection, month)}
        codes={markable}
        allCodes={codes}
        canSet={Boolean(access?.create || access?.update)}
        canClear={Boolean(access?.delete)}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        busy={editor.busy}
        compact={isPhone}
        onApply={(code) => void editor.applyCode(code)}
        onApplyHours={(day, night) => void editor.applyCode("presence", { day, night })}
        onClear={() => void editor.clearMarks()}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onClose={editor.clearSelection}
      />

      {access && (
        <CellDrawer
          open={openCell != null}
          employeeId={openCell?.employeeId ?? null}
          date={openCell?.date ?? null}
          codes={codes}
          access={access}
          organizationId={organizationId}
          callerEmployeeId={grid?.scope.callerEmployeeId}
          onClose={() => setOpenCell(null)}
          onChanged={refreshAfterCell}
        />
      )}

      {access?.approve && (
        <RequestsDrawer
          open={requestsOpen}
          organizationId={organizationId}
          callerEmployeeId={grid?.scope.callerEmployeeId}
          codes={codes}
          onClose={() => setRequestsOpen(false)}
          onOpenCell={(employeeId, date) => {
            setRequestsOpen(false);
            if (!date.startsWith(month)) setMonth(date.slice(0, 7));
            setOpenCell({ employeeId, date });
          }}
          onReviewed={() => void query.refetch()}
        />
      )}

      {access?.settings && (
        <TimesheetSettingsDialog
          open={settingsOpen}
          organizationId={organizationId}
          onClose={() => setSettingsOpen(false)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.timesheet.all })}
        />
      )}

      {grid && (
        <FillScheduleDialog
          open={fillOpen}
          month={month}
          isCurrentMonth={isCurrentMonth}
          missingDays={grid.summary.missingDays}
          selectedEmployees={selectedEmployees.size}
          busy={actionBusy}
          onClose={() => setFillOpen(false)}
          onConfirm={(range, onlySelected) => void fill(range, onlySelected)}
        />
      )}

      <ConfirmDialog
        open={lockDialog != null}
        onClose={() => setLockDialog(null)}
        onConfirm={() => void toggleLock()}
        loading={actionBusy}
        variant={lockDialog === "close" ? "question" : "warning"}
        title={lockDialog === "close" ? `Закрыть табель за ${monthLabel(month).toLowerCase()}?` : "Переоткрыть табель?"}
        message={
          lockDialog === "close"
            ? `После закрытия отметки ${grid?.scope.branchName ? `филиала «${grid.scope.branchName}» ` : ""}нельзя менять, пока табель не переоткроют. Сейчас пропусков: ${grid?.summary.missingDays ?? 0}.`
            : "Отметки месяца снова можно будет менять. Если зарплата уже посчитана по этому табелю — пересчитайте её после правок."
        }
        confirmText={lockDialog === "close" ? "Закрыть месяц" : "Переоткрыть"}
      />

    </Box>
  );
};

export default TimesheetPage;
