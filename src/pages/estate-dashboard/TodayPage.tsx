import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
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
import { useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import MoreHorizOutlined from "@mui/icons-material/MoreHorizOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";

import { ApiError, isModuleDisabled } from "../../api/client";
import { estateDashboardKeys } from "../../api/estateDashboard";
import {
  REALTY_TASK_KINDS,
  deleteRealtyTask,
  getRealtyTasks,
  realtyTaskKeys,
  realtyTaskStats,
  updateRealtyTask,
  type RealtyTaskItem,
  type RealtyTaskKind,
} from "../../api/realtyTasks";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { cardSx } from "./format";
import { TaskDrawer, type TaskDrawerMode } from "./TaskDrawer";

/**
 * «Мой день» застройщика (AIVIO, группа меню «ОСНОВНОЕ»): задачи CRM на день —
 * звонки, встречи, показы, дела. Гайд — `frontend-dashboard-analytics.md` §4,
 * API — `src/api/realtyTasks.ts`. Смотреть — `realty.view`, менять —
 * `realty.manage` (галочка, «＋ Задача», перенос, передача, удаление).
 */
export default function RealtyTodayPage() {
  const { t } = useT("estateDashboard");
  usePageTitle(t("today.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <TodayScreen />
    </Box>
  );
}

type KindFilter = "all" | RealtyTaskKind;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function TodayScreen() {
  const { t } = useT("estateDashboard");
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const scope = useRealtyScope();
  const canManage = useCan("realty.manage");
  const { activeEmployee } = usePermissions();
  const myId = activeEmployee?.id != null ? Number(activeEmployee.id) : null;

  const [searchParams, setSearchParams] = useSearchParams();
  const today = dayjs().format("YYYY-MM-DD");
  const dateParam = searchParams.get("date");
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : today;
  const mine = searchParams.get("mine") === "1" && myId != null;
  const setParam = (key: string, value: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const goTo = (next: string) => setParam("date", next === today ? null : next);

  const [kind, setKind] = React.useState<KindFilter>("all");
  const [drawer, setDrawer] = React.useState<TaskDrawerMode | null>(null);
  const [toDelete, setToDelete] = React.useState<RealtyTaskItem | null>(null);

  // Тип фильтруем на клиенте: KPI считаются по всему дню, не по срезу.
  const params = React.useMemo(() => ({ date, managerId: mine ? myId : null }), [date, mine, myId]);
  const list = useQuery({
    queryKey: realtyTaskKeys.list(scope, params),
    queryFn: ({ signal }) => getRealtyTasks(params, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: realtyTaskKeys.all });
    void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
  };
  const failed = (error: unknown) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("today.toast.failed"), { variant: "error" });
  const toggle = useMutation({
    mutationFn: ({ task, done }: { task: RealtyTaskItem; done: boolean }) => updateRealtyTask(task.id, { done }, scope),
    // Галочка ставится сразу, не дожидаясь ответа.
    onMutate: ({ task, done }) => {
      queryClient.setQueryData<RealtyTaskItem[]>(realtyTaskKeys.list(scope, params), (prev) => prev?.map((x) => (x.id === task.id ? { ...x, done } : x)));
    },
    onError: failed,
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (task: RealtyTaskItem) => deleteRealtyTask(task.id, scope),
    onSuccess: () => {
      enqueueSnackbar(t("today.toast.deleted"), { variant: "success" });
      setToDelete(null);
      invalidate();
    },
    onError: failed,
  });

  if (list.error) {
    const error = list.error;
    if (isModuleDisabled(error)) return <AccessDenied title={t("page.moduleOff")} description={t("page.moduleOffHint")} showBack={false} />;
    if (error instanceof ApiError && error.status === 403) return <AccessDenied />;
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={invalidate}>
            {t("common.retry")}
          </Button>
        }
      >
        {t("today.loadError")}: {error instanceof Error ? error.message : ""}
      </Alert>
    );
  }

  const tasks = list.data;
  const stats = tasks ? realtyTaskStats(tasks) : null;
  const shown = (tasks ?? [])
    .filter((task) => kind === "all" || task.kind === kind)
    // По времени; без времени — в конце дня.
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  const dayLabel = dayjs(date).locale("ru").format("D MMMM, dddd");

  return (
    <>
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
          <Typography component="h1" sx={{ fontWeight: 700, fontSize: { xs: "1.25rem", md: "1.5rem" } }}>
            {dayLabel}
          </Typography>
          <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t("today.subtitle")}</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton aria-label={t("today.prevDay")} onClick={() => goTo(dayjs(date).subtract(1, "day").format("YYYY-MM-DD"))}>
            <ChevronLeftOutlined />
          </IconButton>
          <Button size="small" variant={date === today ? "contained" : "outlined"} onClick={() => goTo(today)}>
            {t("today.today")}
          </Button>
          <IconButton aria-label={t("today.nextDay")} onClick={() => goTo(dayjs(date).add(1, "day").format("YYYY-MM-DD"))}>
            <ChevronRightOutlined />
          </IconButton>
        </Box>
        {canManage && (
          <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setDrawer({ kind: "create", date })}>
            {t("today.add")}
          </Button>
        )}
      </Box>

      <Box sx={{ mb: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
        {stats
          ? (
              [
                ["total", stats.total, null],
                ["done", stats.done, "success"],
                ["visits", stats.visits, null],
                ["overdue", stats.overdue, stats.overdue > 0 ? "error" : null],
              ] as const
            ).map(([key, value, tone]) => (
              <Box key={key} sx={{ ...cardSx, p: { xs: 1.75, md: 2.25 }, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                  {t(`today.kpi.${key}`)}
                </Typography>
                <Typography
                  sx={{ mt: 0.75, fontSize: { xs: "1.2rem", md: "1.6rem" }, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: "tabular-nums", color: tone ? `${tone}.main` : "text.primary" }}
                >
                  {value}
                </Typography>
              </Box>
            ))
          : [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={88} sx={{ borderRadius: "14px" }} />)}
      </Box>

      {/* pr — рамка крайней пилюли: контейнер страницы режет всё, что у самого края. */}
      <Box sx={{ mb: 1.5, pr: 0.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
        {(["all", ...REALTY_TASK_KINDS] as KindFilter[]).map((key) => (
          <ButtonBase key={key} aria-pressed={kind === key} onClick={() => setKind(key)} sx={(th) => ({ ...pillSx(th, kind === key), whiteSpace: "nowrap" })}>
            {t(`today.kinds.${key}`)}
            {tasks ? ` · ${key === "all" ? tasks.length : tasks.filter((x) => x.kind === key).length}` : ""}
          </ButtonBase>
        ))}
        {/* «Мои» — только у кого есть карточка сотрудника: иначе фильтровать не по кому. */}
        {myId != null && (
          <Box sx={{ ml: { md: "auto" }, display: "flex", gap: 0.75 }}>
            {(["all", "mine"] as const).map((key) => (
              <ButtonBase
                key={key}
                aria-pressed={(key === "mine") === mine}
                onClick={() => setParam("mine", key === "mine" ? "1" : null)}
                sx={(th) => ({ ...pillSx(th, (key === "mine") === mine), whiteSpace: "nowrap" })}
              >
                {t(`today.scope.${key}`)}
              </ButtonBase>
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ ...cardSx, overflow: "hidden" }}>
        {!tasks ? (
          <Box sx={{ p: 2, display: "grid", gap: 1 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={52} />
            ))}
          </Box>
        ) : shown.length === 0 ? (
          <Typography sx={{ py: 5, textAlign: "center", color: "text.secondary" }}>{tasks.length === 0 ? t("today.empty") : t("today.emptyFiltered")}</Typography>
        ) : (
          shown.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              divider={index > 0}
              canManage={canManage}
              onToggle={(done) => toggle.mutate({ task, done })}
              onReschedule={() => setDrawer({ kind: "reschedule", task })}
              onDelegate={() => setDrawer({ kind: "delegate", task })}
              onDelete={() => setToDelete(task)}
            />
          ))
        )}
      </Box>

      {canManage && <TaskDrawer mode={drawer} onClose={() => setDrawer(null)} />}
      <Dialog open={Boolean(toDelete)} onClose={remove.isPending ? undefined : () => setToDelete(null)} maxWidth={false} PaperProps={{ sx: { width: 420, maxWidth: "calc(100vw - 32px)" } }}>
        <DialogTitle>{t("today.deleteConfirm.title")}</DialogTitle>
        <DialogContent>
          <Typography>{t("today.deleteConfirm.text", { text: toDelete?.text ?? "" })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)} disabled={remove.isPending}>
            {t("today.form.cancel")}
          </Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete)}>
            {t("today.deleteConfirm.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function TaskRow({
  task,
  divider,
  canManage,
  onToggle,
  onReschedule,
  onDelegate,
  onDelete,
}: {
  task: RealtyTaskItem;
  divider: boolean;
  canManage: boolean;
  onToggle: (done: boolean) => void;
  onReschedule: () => void;
  onDelegate: () => void;
  onDelete: () => void;
}) {
  const { t } = useT("estateDashboard");
  const [menu, setMenu] = React.useState<HTMLElement | null>(null);
  const pick = (action: () => void) => () => {
    setMenu(null);
    action();
  };
  const kindLabel = (REALTY_TASK_KINDS as readonly string[]).includes(task.kind) ? t(`today.kindOne.${task.kind}`) : task.kind;
  const late = task.overdue && !task.done;
  const details = [
    task.meta,
    task.leadClient && t("today.lead", { name: task.leadClient }),
    // Номер квартиры бэк часто уже кладёт в meta («квартира №1093») — не повторяем.
    task.unitNumber != null && !task.meta.includes(String(task.unitNumber)) && t("today.unit", { number: task.unitNumber }),
    task.manager,
  ].filter(Boolean);
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, px: { xs: 1, md: 1.5 }, py: 1.25, borderTop: divider ? 1 : 0, borderColor: "divider" }}>
      {canManage && (
        <Checkbox checked={task.done} onChange={(e) => onToggle(e.target.checked)} inputProps={{ "aria-label": task.text }} size="small" sx={{ mt: -0.25 }} />
      )}
      <Box sx={{ width: 56, flexShrink: 0, pt: 0.25 }}>
        <Typography sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: late ? "error.main" : "text.primary" }}>{task.time || "—"}</Typography>
        {!task.time && <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>{t("today.noTime")}</Typography>}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, opacity: task.done ? 0.55 : 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <Typography
            component="span"
            sx={(th) => ({ px: 0.75, py: 0.1, borderRadius: "6px", fontSize: "0.72rem", bgcolor: subtleBg(th, true), color: "text.secondary", whiteSpace: "nowrap" })}
          >
            {kindLabel}
          </Typography>
          <Typography sx={{ fontWeight: 500, textDecoration: task.done ? "line-through" : "none", minWidth: 0 }}>{task.text}</Typography>
          {task.statusLabel && task.kind === "show" && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>· {task.statusLabel}</Typography>}
          {late && <Typography sx={{ fontSize: "0.75rem", color: "error.main" }}>· {t("today.overdue")}</Typography>}
        </Box>
        {details.length > 0 && <Typography sx={{ mt: 0.25, fontSize: "0.8125rem", color: "text.secondary" }}>{details.join(" · ")}</Typography>}
      </Box>
      {canManage && (
        <>
          <Tooltip title={t("today.menu.open")}>
            <IconButton size="small" aria-label={t("today.menu.open")} onClick={(e) => setMenu(e.currentTarget)}>
              <MoreHorizOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
            <MenuItem onClick={pick(onReschedule)}>
              <ListItemIcon>
                <EventOutlined fontSize="small" />
              </ListItemIcon>
              {t("today.menu.reschedule")}
            </MenuItem>
            <MenuItem onClick={pick(onDelegate)}>
              <ListItemIcon>
                <PersonOutlineOutlined fontSize="small" />
              </ListItemIcon>
              {t("today.menu.delegate")}
            </MenuItem>
            <MenuItem onClick={pick(onDelete)} sx={{ color: "error.main" }}>
              <ListItemIcon sx={{ color: "error.main" }}>
                <DeleteOutlineOutlined fontSize="small" />
              </ListItemIcon>
              {t("today.menu.delete")}
            </MenuItem>
          </Menu>
        </>
      )}
    </Box>
  );
}
