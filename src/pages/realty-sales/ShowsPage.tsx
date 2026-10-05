import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import MoreHorizOutlined from "@mui/icons-material/MoreHorizOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";

import { estateDashboardKeys } from "../../api/estateDashboard";
import { realtyLeadKeys } from "../../api/realtyLeads";
import {
  deleteRealtyTask,
  getRealtyTasks,
  getShowsSummary,
  realtyTaskKeys,
  updateRealtyTask,
  type RealtyTaskItem,
  type ShowStatus,
} from "../../api/realtyTasks";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { TaskDrawer, type TaskDrawerMode } from "../estate-dashboard/TaskDrawer";
import { cardSx } from "../estate-dashboard/format";
import { LeadDrawer } from "./LeadDrawer";
import { CardHeader, KpiCards, ScreenError } from "./shared";
import { useLeadParam } from "./useLeadParam";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * «Показы» застройщика (AIVIO, гайд `frontend-sales.md` §5): показы — это
 * задачи CRM `kind=show` на выбранный день (`?date=`), KPI — `/shows/summary/`.
 * Подтвердить / провести / перенести / передать — `PATCH /tasks/<id>/`,
 * «Карточка» — шторка заявки. Менять — `realty.manage`.
 */
export default function RealtyShowsPage() {
  const { t } = useT("realtySales");
  usePageTitle(t("shows.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <ShowsScreen />
    </Box>
  );
}

type Patch = Parameters<typeof updateRealtyTask>[1];

function ShowsScreen() {
  const { t } = useT("realtySales");
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const scope = useRealtyScope();
  const canManage = useCan("realty.manage");
  const [leadId, openLead] = useLeadParam();

  const [searchParams, setSearchParams] = useSearchParams();
  const today = dayjs().format("YYYY-MM-DD");
  const dateParam = searchParams.get("date");
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : today;
  const goTo = (next: string) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === today) params.delete("date");
        else params.set("date", next);
        return params;
      },
      { replace: true },
    );

  const [drawer, setDrawer] = React.useState<TaskDrawerMode | null>(null);
  const [toDelete, setToDelete] = React.useState<RealtyTaskItem | null>(null);

  const params = React.useMemo(() => ({ date, kind: "show" as const }), [date]);
  const listKey = realtyTaskKeys.list(scope, params);
  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => getRealtyTasks(params, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: realtyTaskKeys.showsSummary(scope, date),
    queryFn: ({ signal }) => getShowsSummary(date, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: realtyTaskKeys.all });
    void queryClient.invalidateQueries({ queryKey: realtyLeadKeys.all });
    void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
  };
  const failed = (error: unknown) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("shows.toast.failed"), { variant: "error" });
  const patch = useMutation({
    mutationFn: ({ show, body }: { show: RealtyTaskItem; body: Patch; toast: string }) => updateRealtyTask(show.id, body, scope),
    // Статус и галочка меняются сразу, ответ бэка лишь подтверждает.
    onMutate: ({ show, body }) => {
      queryClient.setQueryData<RealtyTaskItem[]>(listKey, (prev) => prev?.map((x) => (x.id === show.id ? { ...x, ...body, ...(body.status ? { statusLabel: "" } : {}) } : x)));
    },
    onSuccess: (_, { toast }) => enqueueSnackbar(toast, { variant: "success" }),
    onError: failed,
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (show: RealtyTaskItem) => deleteRealtyTask(show.id, scope),
    onSuccess: () => {
      enqueueSnackbar(t("shows.toast.deleted"), { variant: "success" });
      setToDelete(null);
      invalidate();
    },
    onError: failed,
  });

  if (list.error) return <ScreenError error={list.error} onRetry={() => void list.refetch()} title={t("shows.loadError")} />;

  const s = summary.data;
  const shows = [...(list.data ?? [])].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  const dayLabel = dayjs(date).locale("ru").format("D MMMM, dddd");
  const short = (value: string) => (value ? dayjs(value).locale("ru").format("D MMM") : "");

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 260px", fontSize: "0.875rem", color: "text.secondary" }}>{t("shows.subtitle")}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton aria-label={t("shows.prevDay")} onClick={() => goTo(dayjs(date).subtract(1, "day").format("YYYY-MM-DD"))}>
            <ChevronLeftOutlined />
          </IconButton>
          <Button size="small" variant={date === today ? "contained" : "outlined"} onClick={() => goTo(today)}>
            {t("shows.today")}
          </Button>
          <IconButton aria-label={t("shows.nextDay")} onClick={() => goTo(dayjs(date).add(1, "day").format("YYYY-MM-DD"))}>
            <ChevronRightOutlined />
          </IconButton>
        </Box>
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "today", label: t("shows.kpi.today"), value: String(s.today), hint: t("shows.kpi.doneHint", { count: s.todayDone }) },
                { key: "week", label: t("shows.kpi.week"), value: String(s.week), hint: s.weekFrom && s.weekTo ? t("shows.kpi.weekHint", { from: short(s.weekFrom), to: short(s.weekTo) }) : null },
                { key: "toChoice", label: t("shows.kpi.toChoice"), value: `${s.toChoicePct}%`, hint: t("shows.kpi.pctHint"), tone: s.toChoicePct > 0 ? "success" : null },
                { key: "toBooking", label: t("shows.kpi.toBooking"), value: `${s.toBookingPct}%`, hint: t("shows.kpi.pctHint") },
              ]
            : null
        }
      />

      <Box sx={{ ...cardSx, overflow: "hidden" }}>
        <CardHeader
          title={t("shows.listTitle", { date: dayLabel })}
          subtitle={t("shows.listHint")}
          action={
            canManage && (
              <Button
                variant="contained"
                size="small"
                startIcon={<AddOutlined />}
                onClick={() => setDrawer({ kind: "create", date, preset: { kind: "show", text: t("shows.defaultText") } })}
                sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {t("shows.add")}
              </Button>
            )
          }
        />
        {!list.data ? (
          <Box sx={{ px: 2.25, pb: 2, display: "grid", gap: 1 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={52} />
            ))}
          </Box>
        ) : shows.length === 0 ? (
          <Typography sx={{ py: 5, borderTop: 1, borderColor: "divider", textAlign: "center", color: "text.secondary" }}>{t("shows.empty")}</Typography>
        ) : (
          shows.map((show) => (
            <ShowRow
              key={show.id}
              show={show}
              canManage={canManage}
              onPatch={(body, toast) => patch.mutate({ show, body, toast })}
              onOpenLead={show.leadId != null ? () => openLead(show.leadId) : null}
              onReschedule={() => setDrawer({ kind: "reschedule", task: show })}
              onDelegate={() => setDrawer({ kind: "delegate", task: show })}
              onDelete={() => setToDelete(show)}
            />
          ))
        )}
      </Box>

      <LeadDrawer leadId={leadId} onClose={() => openLead(null)} />
      {canManage && <TaskDrawer mode={drawer} onClose={() => setDrawer(null)} />}
      <Dialog open={Boolean(toDelete)} onClose={remove.isPending ? undefined : () => setToDelete(null)} maxWidth={false} PaperProps={{ sx: { width: 420, maxWidth: "calc(100vw - 32px)" } }}>
        <DialogTitle>{t("shows.deleteTitle")}</DialogTitle>
        <DialogContent>
          <Typography>{t("shows.deleteText", { text: toDelete?.text ?? "" })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)} disabled={remove.isPending}>
            {t("shows.keep")}
          </Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete)}>
            {t("shows.deleteConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function ShowStatusChip({ show }: { show: RealtyTaskItem }) {
  const { t } = useT("realtySales");
  const status = show.done ? "done" : show.status;
  const color = status === "done" || status === "confirmed" ? "success.main" : status === "online" ? "info.main" : "text.secondary";
  const label = show.done ? t("shows.status.done") : show.statusLabel || (["planned", "confirmed", "online"].includes(status) ? t(`shows.status.${status}`) : status);
  return (
    <Box
      component="span"
      sx={(th) => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.35,
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
        color,
        bgcolor: subtleBg(th, true),
      })}
    >
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor" }} />
      {label}
    </Box>
  );
}

function ShowRow({
  show,
  canManage,
  onPatch,
  onOpenLead,
  onReschedule,
  onDelegate,
  onDelete,
}: {
  show: RealtyTaskItem;
  canManage: boolean;
  onPatch: (body: Patch, toast: string) => void;
  onOpenLead: (() => void) | null;
  onReschedule: () => void;
  onDelegate: () => void;
  onDelete: () => void;
}) {
  const { t } = useT("realtySales");
  const [menu, setMenu] = React.useState<HTMLElement | null>(null);
  const pick = (action: () => void) => () => {
    setMenu(null);
    action();
  };
  const late = show.overdue && !show.done;
  const status = show.status as ShowStatus | string;
  // Номер квартиры бэк часто уже кладёт в текст или meta — не повторяем.
  const unit = show.unitNumber != null && ![show.text, show.meta].some((x) => x.includes(String(show.unitNumber))) ? t("shows.unit", { number: show.unitNumber }) : null;
  const details = [show.meta, unit, show.manager].filter(Boolean);

  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 2.25 },
        py: 1.25,
        borderTop: 1,
        borderColor: "divider",
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        flexWrap: { xs: "wrap", sm: "nowrap" },
        gap: 1.25,
      }}
    >
      <Box
        sx={(th) => ({
          px: 1,
          py: 0.5,
          borderRadius: "8px",
          flexShrink: 0,
          fontWeight: 700,
          fontSize: "0.8125rem",
          fontVariantNumeric: "tabular-nums",
          bgcolor: subtleBg(th, true),
          color: late ? "error.main" : "text.primary",
        })}
      >
        {show.time || "—"}
      </Box>
      <Box sx={{ flex: "1 1 200px", minWidth: 0, opacity: show.done ? 0.6 : 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: "0.875rem", textDecoration: show.done ? "line-through" : "none" }}>{show.text}</Typography>
        {(details.length > 0 || late) && (
          <Typography sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>
            <PlaceOutlined sx={{ fontSize: 13 }} />
            <span>
              {details.join(" · ")}
              {late && (
                <Box component="span" sx={{ color: "error.main" }}>
                  {details.length > 0 ? " · " : ""}
                  {t("shows.overdue")}
                </Box>
              )}
            </span>
          </Typography>
        )}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0, ml: { xs: "auto", sm: 0 } }}>
        <ShowStatusChip show={show} />
        {canManage && !show.done && status === "planned" && (
          <Button size="small" variant="outlined" startIcon={<CheckOutlined />} onClick={() => onPatch({ status: "confirmed" }, t("shows.toast.confirmed"))} sx={{ whiteSpace: "nowrap" }}>
            {t("shows.actions.confirm")}
          </Button>
        )}
        {canManage && !show.done && (
          <Button size="small" variant="outlined" startIcon={<TaskAltOutlined />} onClick={() => onPatch({ done: true }, t("shows.toast.done"))} sx={{ whiteSpace: "nowrap" }}>
            {t("shows.actions.done")}
          </Button>
        )}
        {onOpenLead && (
          <Button size="small" onClick={onOpenLead} sx={{ whiteSpace: "nowrap" }}>
            {t("shows.actions.card")}
          </Button>
        )}
        {canManage && (
          <>
            <Tooltip title={t("shows.actions.more")}>
              <IconButton size="small" aria-label={t("shows.actions.more")} onClick={(e) => setMenu(e.currentTarget)}>
                <MoreHorizOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
              {show.done && (
                <MenuItem onClick={pick(() => onPatch({ done: false }, t("shows.toast.status")))}>
                  <ListItemIcon>
                    <ReplayOutlined fontSize="small" />
                  </ListItemIcon>
                  {t("shows.actions.undone")}
                </MenuItem>
              )}
              {!show.done && status !== "online" && (
                <MenuItem onClick={pick(() => onPatch({ status: "online" }, t("shows.toast.status")))}>
                  <ListItemIcon>
                    <VideocamOutlined fontSize="small" />
                  </ListItemIcon>
                  {t("shows.actions.makeOnline")}
                </MenuItem>
              )}
              {!show.done && status !== "planned" && (
                <MenuItem onClick={pick(() => onPatch({ status: "planned" }, t("shows.toast.status")))}>
                  <ListItemIcon>
                    <ReplayOutlined fontSize="small" />
                  </ListItemIcon>
                  {t("shows.actions.makePlanned")}
                </MenuItem>
              )}
              <MenuItem onClick={pick(onReschedule)}>
                <ListItemIcon>
                  <EventOutlined fontSize="small" />
                </ListItemIcon>
                {t("shows.actions.reschedule")}
              </MenuItem>
              <MenuItem onClick={pick(onDelegate)}>
                <ListItemIcon>
                  <PersonOutlineOutlined fontSize="small" />
                </ListItemIcon>
                {t("shows.actions.delegate")}
              </MenuItem>
              <MenuItem onClick={pick(onDelete)} sx={{ color: "error.main" }}>
                <ListItemIcon sx={{ color: "error.main" }}>
                  <DeleteOutlineOutlined fontSize="small" />
                </ListItemIcon>
                {t("shows.actions.delete")}
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
    </Box>
  );
}
