import React from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import dayjs from "dayjs";

import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";

import { AppButton, ListEmptyState, PageHeader } from "../../components/ui";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCanChecker } from "../../hooks/useCan";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { formatPhoneDisplay } from "../../utility/phone";
import {
  cancelWaitlistEntry,
  contactWaitlistEntry,
  getWaitlist,
  reopenWaitlistEntry,
  WAITLIST_ACTIVE_STATUSES,
  WAITLIST_CLOSED_STATUSES,
  WAITLIST_USE_MOCKS,
  type WaitlistEntry,
  type WaitlistFilters,
} from "../../api/waitlist";
import WaitlistDrawer from "../../components/waitlist/WaitlistDrawer";
import {
  WaitlistPriorityChip,
  WaitlistSourceChip,
  WaitlistStatusChip,
} from "../../components/waitlist/WaitlistChips";
import {
  displayName,
  periodLabel,
  timeRangeLabel,
  waitingDays,
  waitingForLabel,
  WAITLIST_CONTACT_RESULT_META,
  WAITLIST_REFRESH_MS,
  waitlistErrorMessage,
} from "./meta";

const PAGE_SIZE = 20;

/** Вкладки-пилюли: очередь / закрытые. */
type WaitlistTab = "active" | "closed";

const WaitlistPage: React.FC = () => {
  const { t } = useT("waitlist");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const { can, loading: permLoading } = useCanChecker();

  usePageTitle(t("title"));

  const canView = can("waitlist.view") || can("waitlist.manage");
  const canCreate = can("waitlist.create") || can("waitlist.manage");
  const canManage = can("waitlist.manage");

  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = React.useState<WaitlistTab>(
    (searchParams.get("tab") as WaitlistTab) || "active",
  );
  // Поиск держим в локальном state и пишем в URL с задержкой: setSearchParams
  // не батчится, и запись на каждый символ теряет буквы.
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [employeeId, setEmployeeId] = React.useState<number | "">(
    searchParams.get("employee") ? Number(searchParams.get("employee")) : "",
  );
  const [onlyUrgent, setOnlyUrgent] = React.useState(searchParams.get("urgent") === "1");
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (tab !== "active") next.set("tab", tab);
    if (debouncedSearch) next.set("q", debouncedSearch);
    if (employeeId !== "") next.set("employee", String(employeeId));
    if (onlyUrgent) next.set("urgent", "1");
    setSearchParams(next, { replace: true });
  }, [tab, debouncedSearch, employeeId, onlyUrgent, setSearchParams]);

  const { employees } = useAllActiveEmployees(true);

  const filters: WaitlistFilters = React.useMemo(
    () => ({
      status: tab === "active" ? WAITLIST_ACTIVE_STATUSES : WAITLIST_CLOSED_STATUSES,
      search: debouncedSearch || undefined,
      employeeId: employeeId === "" ? undefined : employeeId,
      priority: onlyUrgent ? "urgent" : undefined,
      page: page + 1,
      pageSize: PAGE_SIZE,
      organizationId: orgId,
    }),
    [tab, debouncedSearch, employeeId, onlyUrgent, page, orgId],
  );

  const query = useQuery({
    queryKey: djangoQueryKeys.waitlist.list(filters as Record<string, unknown>),
    queryFn: ({ signal }) => getWaitlist(filters, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchInterval: WAITLIST_REFRESH_MS,
    placeholderData: keepPreviousData,
    enabled: canView,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.waitlist.all });
  };

  const [toast, setToast] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WaitlistEntry | null>(null);

  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [menuEntry, setMenuEntry] = React.useState<WaitlistEntry | null>(null);

  const [cancelTarget, setCancelTarget] = React.useState<WaitlistEntry | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");

  const cancelMutation = useMutation({
    mutationFn: (entry: WaitlistEntry) =>
      cancelWaitlistEntry(entry.id, { reason: cancelReason.trim() }, orgId),
    onSuccess: () => {
      setCancelTarget(null);
      setCancelReason("");
      setToast(t("actions.cancelled"));
      invalidate();
    },
    onError: (e) => setError(waitlistErrorMessage(e, "Не удалось снять запись")),
  });

  const reopenMutation = useMutation({
    mutationFn: (entry: WaitlistEntry) => reopenWaitlistEntry(entry.id, orgId),
    onSuccess: () => {
      setToast(t("actions.reopened"));
      invalidate();
    },
    onError: (e) => setError(waitlistErrorMessage(e, "Не удалось вернуть запись в очередь")),
  });

  const contactMutation = useMutation({
    mutationFn: (entry: WaitlistEntry) =>
      contactWaitlistEntry(entry.id, { result: "no_answer" }, orgId),
    onSuccess: () => {
      setToast(t("actions.contactSaved"));
      invalidate();
    },
    onError: (e) => setError(waitlistErrorMessage(e, "Не удалось отметить контакт")),
  });

  /**
   * «Записать» — уводим в приёмы с предзаполнением. Запись листа закрывается
   * не здесь, а после того, как приём действительно создан (см. §6.4 ТЗ):
   * пока приёма нет, человек по-прежнему ждёт.
   */
  const handleBook = (entry: WaitlistEntry) => {
    const params = new URLSearchParams({ new: "1", waitlistId: String(entry.id) });
    if (entry.employeeId != null) params.set("employee", String(entry.employeeId));
    if (entry.patientId != null) params.set("patient", String(entry.patientId));
    if (entry.services[0]) params.set("service", String(entry.services[0].id));
    navigate(`/appointments?${params.toString()}`);
  };

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;

  const columns: GridColDef<WaitlistEntry>[] = [
    {
      field: "name",
      headerName: t("columns.patient"),
      flex: 1.4,
      minWidth: 200,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack sx={{ py: 0.5, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={0.75}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
              {displayName(row)}
            </Typography>
            <WaitlistPriorityChip priority={row.priority} />
            <WaitlistSourceChip source={row.source} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {formatPhoneDisplay(row.phone)}
          </Typography>
        </Stack>
      ),
    },
    {
      field: "waitingFor",
      headerName: t("columns.waitingFor"),
      flex: 1,
      minWidth: 160,
      sortable: false,
      renderCell: ({ row }) => (
        <Typography variant="body2" noWrap>
          {waitingForLabel(row)}
        </Typography>
      ),
    },
    {
      field: "period",
      headerName: t("columns.period"),
      flex: 1,
      minWidth: 160,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack sx={{ py: 0.5, minWidth: 0 }}>
          <Typography variant="body2" noWrap>
            {periodLabel(row)}
          </Typography>
          {timeRangeLabel(row) && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {timeRangeLabel(row)}
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      field: "waitingDays",
      headerName: t("columns.waitingDays"),
      width: 120,
      sortable: false,
      renderCell: ({ row }) => (
        <Typography variant="body2">{t("waitingDays", { count: waitingDays(row) })}</Typography>
      ),
    },
    {
      field: "lastContact",
      headerName: t("columns.lastContact"),
      width: 170,
      sortable: false,
      renderCell: ({ row }) =>
        row.lastContactAt ? (
          <Stack sx={{ py: 0.5 }}>
            <Typography variant="body2">{dayjs(row.lastContactAt).format("DD.MM HH:mm")}</Typography>
            {row.lastContactResult && (
              <Typography variant="caption" color="text.secondary">
                {WAITLIST_CONTACT_RESULT_META[row.lastContactResult].label}
              </Typography>
            )}
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {t("neverContacted")}
          </Typography>
        ),
    },
    {
      field: "status",
      headerName: t("columns.status"),
      width: 150,
      sortable: false,
      renderCell: ({ row }) => <WaitlistStatusChip status={row.status} />,
    },
    {
      field: "actions",
      headerName: "",
      width: 120,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" gap={0.25}>
          <Tooltip title={t("actions.call")}>
            <IconButton size="small" href={`tel:${row.phone}`}>
              <PhoneOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          {canCreate && (
            <Tooltip title={t("actions.book")}>
              <IconButton size="small" onClick={() => handleBook(row)}>
                <EventAvailableOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton
            size="small"
            onClick={(e) => {
              setMenuAnchor(e.currentTarget);
              setMenuEntry(row);
            }}
          >
            <MoreVertOutlined fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  if (!permLoading && !canView) return <AccessDenied />;

  const statusFilterChips: { value: WaitlistTab; label: string }[] = [
    { value: "active", label: t("filters.active") },
    { value: "closed", label: t("filters.closed") },
  ];

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 } }}>
      <PageHeader
        title={t("title")}
        showSearch
        searchVal={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("filters.search")}
        onAdd={canCreate ? () => {
          setEditing(null);
          setDrawerOpen(true);
        } : undefined}
        addButtonText={t("add")}
        loading={query.isFetching}
      />

      {WAITLIST_USE_MOCKS && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {t("mockNotice")}
        </Alert>
      )}

      {/* ── Ряд фильтров пилюлями (паттерн /tasks) ── */}
      <Stack direction="row" gap={1} sx={{ mb: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        {statusFilterChips.map((chip) => (
          <Chip
            key={chip.value}
            label={chip.label}
            size="small"
            color={tab === chip.value ? "primary" : "default"}
            variant={tab === chip.value ? "filled" : "outlined"}
            onClick={() => {
              setTab(chip.value);
              setPage(0);
            }}
          />
        ))}
        <TextField
          select
          size="small"
          value={employeeId}
          onChange={(e) => {
            setEmployeeId(e.target.value === "" ? "" : Number(e.target.value));
            setPage(0);
          }}
          sx={{ minWidth: 180 }}
          SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">{t("filters.employee")}: {t("filters.all")}</MenuItem>
          {employees.map((emp) => (
            <MenuItem key={emp.id} value={emp.id}>
              {emp.fullName}
            </MenuItem>
          ))}
        </TextField>
        <Chip
          label={t("priority.urgent")}
          size="small"
          color={onlyUrgent ? "error" : "default"}
          variant={onlyUrgent ? "filled" : "outlined"}
          onClick={() => {
            setOnlyUrgent((v) => !v);
            setPage(0);
          }}
        />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {query.isError && <Alert severity="error">{t("loadError")}</Alert>}

      {query.isLoading && (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={64} />
          ))}
        </Stack>
      )}

      {!query.isLoading && rows.length === 0 && (
        <ListEmptyState
          icon={<HourglassEmptyOutlined sx={{ fontSize: 40 }} />}
          title={debouncedSearch || employeeId !== "" ? t("emptyFiltered") : t("empty")}
          description={t("emptyHint")}
          action={
            canCreate ? (
              <AppButton
                variant="contained"
                onClick={() => {
                  setEditing(null);
                  setDrawerOpen(true);
                }}
              >
                {t("add")}
              </AppButton>
            ) : undefined
          }
        />
      )}

      {/* На телефоне таблица нечитаема — там карточки. */}
      {!query.isLoading && rows.length > 0 && isMobile && (
        <Stack spacing={1}>
          {rows.map((row) => (
            <Stack
              key={row.id}
              spacing={0.75}
              sx={(th) => ({ p: 1.5, borderRadius: "10px", bgcolor: subtleBg(th, true) })}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                <Typography sx={{ fontWeight: 600 }}>{displayName(row)}</Typography>
                <WaitlistStatusChip status={row.status} />
              </Stack>
              <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
                <WaitlistPriorityChip priority={row.priority} />
                <WaitlistSourceChip source={row.source} />
                <Typography variant="body2" color="text.secondary">
                  {formatPhoneDisplay(row.phone)}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {waitingForLabel(row)} · {periodLabel(row)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("waitingDays", { count: waitingDays(row) })}
              </Typography>
              <Stack direction="row" gap={1}>
                <AppButton size="small" variant="outlined" href={`tel:${row.phone}`}>
                  {t("actions.call")}
                </AppButton>
                {canCreate && (
                  <AppButton size="small" variant="contained" onClick={() => handleBook(row)}>
                    {t("actions.book")}
                  </AppButton>
                )}
                <IconButton
                  size="small"
                  onClick={(e) => {
                    setMenuAnchor(e.currentTarget);
                    setMenuEntry(row);
                  }}
                >
                  <MoreVertOutlined fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}

      {!query.isLoading && rows.length > 0 && !isMobile && (
        <Box sx={{ width: "100%" }}>
          <DataGrid<WaitlistEntry>
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            autoHeight
            rowHeight={64}
            disableColumnMenu
            disableRowSelectionOnClick
            localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
            paginationMode="server"
            rowCount={total}
            paginationModel={{ page, pageSize: PAGE_SIZE }}
            onPaginationModelChange={(model) => setPage(model.page)}
            pageSizeOptions={[PAGE_SIZE]}
            onRowClick={({ row }) => {
              if (!canCreate) return;
              setEditing(row);
              setDrawerOpen(true);
            }}
          />
        </Box>
      )}

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {menuEntry && WAITLIST_ACTIVE_STATUSES.includes(menuEntry.status) && (
          <MenuItem
            onClick={() => {
              contactMutation.mutate(menuEntry);
              setMenuAnchor(null);
            }}
          >
            {t("actions.contact")}
          </MenuItem>
        )}
        {menuEntry && canCreate && (
          <MenuItem
            onClick={() => {
              setEditing(menuEntry);
              setDrawerOpen(true);
              setMenuAnchor(null);
            }}
          >
            {t("actions.edit")}
          </MenuItem>
        )}
        {menuEntry && WAITLIST_ACTIVE_STATUSES.includes(menuEntry.status) && (
          <MenuItem
            onClick={() => {
              setCancelTarget(menuEntry);
              setMenuAnchor(null);
            }}
          >
            {t("actions.cancel")}
          </MenuItem>
        )}
        {menuEntry && canManage && WAITLIST_CLOSED_STATUSES.includes(menuEntry.status) && (
          <MenuItem
            onClick={() => {
              reopenMutation.mutate(menuEntry);
              setMenuAnchor(null);
            }}
          >
            {t("actions.reopen")}
          </MenuItem>
        )}
      </Menu>

      <Dialog open={cancelTarget != null} onClose={() => setCancelTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t("actions.cancelTitle")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t("actions.cancelReason")}
            placeholder={t("actions.cancelReasonPlaceholder")}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <AppButton color="inherit" onClick={() => setCancelTarget(null)}>
            Отмена
          </AppButton>
          <AppButton
            variant="contained"
            color="error"
            disabled={cancelMutation.isPending}
            onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget)}
          >
            {t("actions.cancelConfirm")}
          </AppButton>
        </DialogActions>
      </Dialog>

      <WaitlistDrawer
        open={drawerOpen}
        entry={editing}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setToast(editing ? t("form.updated") : t("form.created"));
          invalidate();
        }}
      />

      <Snackbar
        open={toast != null}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast ?? ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
};

export default WaitlistPage;
