import React from "react";
import { Alert, Badge, Box, Button, IconButton, MenuItem, Popover, Select, Skeleton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";

import { ApiError, isModuleDisabled } from "../../api/client";
import {
  ESTATE_ROLES,
  estateDashboardKeys,
  getEstateAlerts,
  getEstateDashboard,
  type DashboardKpis,
  type EstateRole,
  type RealtyTask,
} from "../../api/estateDashboard";
import { realtyTaskKeys, updateRealtyTask } from "../../api/realtyTasks";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { useCanChecker } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { cardSx, compactMoney, estateHref, toneColor } from "./format";
import { DashboardPanel } from "./panels";

/**
 * «Рабочий стол» застройщика (AIVIO, группа меню «ОСНОВНОЕ»): KPI-ряд и
 * виджеты в раскладке роли. Раскладку, состав панелей и запрет по правам
 * решает бэк (`GET /api/v2/estate-dashboard/summary/`), фронт рисует ряды как
 * пришли. Гайд — `frontend-dashboard-analytics.md` §3. API — `src/api/estateDashboard.ts`.
 */
export default function EstateDashboardPage() {
  const { t } = useT("estateDashboard");
  usePageTitle(t("page.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <DashboardScreen />
    </Box>
  );
}

const isEstateRole = (value: string | null): value is EstateRole => ESTATE_ROLES.includes(value as EstateRole);

function DashboardScreen() {
  const { t } = useT("estateDashboard");
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const scope = useRealtyScope();
  const { can } = useCanChecker();
  const canManageTasks = can("realty.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const roleParam = searchParams.get("role");
  const previewRole = isEstateRole(roleParam) ? roleParam : null;
  const setPreviewRole = (role: EstateRole | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (role) next.set("role", role);
        else next.delete("role");
        return next;
      },
      { replace: true },
    );

  const enabled = scope.orgReady !== false;
  const summary = useQuery({
    queryKey: estateDashboardKeys.summary(scope, previewRole),
    queryFn: ({ signal }) => getEstateDashboard(previewRole, scope, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const toggleTask = useMutation({
    mutationFn: ({ task, done }: { task: RealtyTask; done: boolean }) => updateRealtyTask(task.id, { done }, scope),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
      void queryClient.invalidateQueries({ queryKey: realtyTaskKeys.all });
    },
    onError: (error) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("panels.tasks.failed"), { variant: "error" }),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });

  if (summary.error) {
    const error = summary.error;
    if (isModuleDisabled(error)) return <AccessDenied title={t("page.moduleOff")} description={t("page.moduleOffHint")} showBack={false} />;
    if (error instanceof ApiError && error.status === 403) return <AccessDenied />;
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={refresh}>
            {t("common.retry")}
          </Button>
        }
      >
        {t("page.loadError")}: {error instanceof Error ? error.message : ""}
      </Alert>
    );
  }

  const data = summary.data;
  return (
    <>
      {/* pt — под бейдж колокольчика: контейнер страницы режет вылезшее за край. */}
      <Box sx={{ pt: 1, mb: 2, display: "flex", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {data ? (
            <>
              <Typography component="h1" sx={{ fontWeight: 700, fontSize: { xs: "1.25rem", md: "1.5rem" } }}>
                {greeting(t, data.user.firstName || data.user.name)}
              </Typography>
              <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                {[data.user.position, dayjs(data.date).locale("ru").format("D MMMM, dddd")].filter(Boolean).join(" · ")}
              </Typography>
            </>
          ) : (
            <Skeleton width={280} height={40} />
          )}
        </Box>
        <Tooltip title={t("page.rolePreviewHint")}>
          <Select
            size="small"
            value={previewRole ?? ""}
            displayEmpty
            onChange={(e) => setPreviewRole(isEstateRole(e.target.value) ? e.target.value : null)}
            inputProps={{ "aria-label": t("page.rolePreview") }}
            sx={{ minWidth: 190, fontSize: "0.875rem" }}
          >
            <MenuItem value="">{t("page.roleOwn")}</MenuItem>
            {ESTATE_ROLES.map((role) => (
              <MenuItem key={role} value={role}>
                {t(`roles.${role}`)}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>
        <AlertsBell />
      </Box>

      <Kpis kpis={data?.kpis} />

      {data && data.layout.length === 0 && (
        <Typography sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>{t("page.empty")}</Typography>
      )}
      {data
        ? data.layout.map((row) => (
            <Box
              key={row.join("+")}
              sx={{
                mb: 2,
                display: "grid",
                gap: 2,
                // Пара виджетов в ряду — одной высоты.
                alignItems: "stretch",
                gridTemplateColumns: { xs: "minmax(0, 1fr)", md: row.length > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" },
              }}
            >
              {row.map((name) => (
                <DashboardPanel
                  key={name}
                  name={name}
                  panels={data.panels}
                  // Предпросмотр чужой роли — только смотреть.
                  canManageTasks={canManageTasks && !previewRole}
                  onToggleTask={(task, done) => toggleTask.mutate({ task, done })}
                />
              ))}
            </Box>
          ))
        : [0, 1].map((i) => <Skeleton key={i} variant="rounded" height={220} sx={{ mb: 2, borderRadius: "14px" }} />)}
    </>
  );
}

function greeting(t: (key: string, opts?: Record<string, unknown>) => string, name: string): string {
  if (!name) return t("page.greeting.noName");
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "day" : "evening";
  return t(`page.greeting.${part}`, { name });
}

// ─── KPI ───────────────────────────────────────────────────────────────────

function Kpis({ kpis }: { kpis: DashboardKpis | undefined }) {
  const { t } = useT("estateDashboard");
  const navigate = useNavigate();
  if (!kpis) {
    return (
      <Box sx={{ mb: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={104} sx={{ borderRadius: "14px" }} />
        ))}
      </Box>
    );
  }
  type Item = { key: string; label: string; value: string; hint: string | null; to?: string | null };
  const items: Item[] = [];
  if (kpis.deals) items.push({ key: "deals", label: t("kpi.deals"), value: String(kpis.deals.value), hint: t("kpi.dealsNew", { count: kpis.deals.newThisWeek }) });
  if (kpis.freeUnits)
    items.push({
      key: "free",
      label: t("kpi.freeUnits"),
      value: String(kpis.freeUnits.value),
      hint: t("kpi.freeUnitsOf", { total: kpis.freeUnits.total }),
      to: "/realestate/chessboard",
    });
  if (kpis.cash) {
    // Счетов нет — вместо остатков выручка месяца (как макет).
    items.push(
      kpis.cash.accountsCount > 0
        ? { key: "cash", label: t("kpi.liquid"), value: compactMoney(kpis.cash.liquid, t), hint: t("kpi.escrow", { value: compactMoney(kpis.cash.escrow, t) }) }
        : { key: "cash", label: t("kpi.revenueMonth"), value: formatKGS(kpis.cash.revenueMonth), hint: null },
    );
  }
  // Без edo.view бэк не отдаёт approvals — на его месте «Задач сегодня».
  if (kpis.approvals)
    items.push({
      key: "approvals",
      label: t("kpi.approvals"),
      value: String(kpis.approvals.review),
      hint: t("kpi.signing", { count: kpis.approvals.signing }),
      to: "/edo",
    });
  else if (kpis.tasksToday)
    items.push({ key: "tasks", label: t("kpi.tasksToday"), value: String(kpis.tasksToday.open), hint: t("kpi.tasksDone", { count: kpis.tasksToday.done }) });

  return (
    <Box sx={{ mb: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` } }}>
      {items.map((item) => (
        <Box
          key={item.key}
          onClick={item.to ? () => navigate(item.to as string) : undefined}
          sx={{ ...cardSx, p: { xs: 1.75, md: 2.25 }, minWidth: 0, cursor: item.to ? "pointer" : "default" }}
        >
          <Typography noWrap sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
            {item.label}
          </Typography>
          <Typography noWrap sx={{ mt: 0.75, fontSize: { xs: "1.2rem", md: "1.6rem" }, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>
            {item.value}
          </Typography>
          {item.hint && (
            <Typography
              component="span"
              sx={(th) => ({ mt: 0.75, display: "inline-block", px: 0.75, py: 0.2, borderRadius: "6px", fontSize: "0.72rem", bgcolor: subtleBg(th, true), color: "text.secondary" })}
            >
              {item.hint}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

// ─── Уведомления ───────────────────────────────────────────────────────────

function AlertsBell() {
  const { t } = useT("estateDashboard");
  const theme = useTheme();
  const navigate = useNavigate();
  const scope = useRealtyScope();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const alerts = useQuery({
    queryKey: estateDashboardKeys.alerts(scope),
    queryFn: ({ signal }) => getEstateAlerts(scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const items = alerts.data?.items ?? [];
  return (
    <>
      <IconButton aria-label={t("alerts.open")} onClick={(e) => setAnchor(e.currentTarget)} sx={{ mr: 1, border: 1, borderColor: "divider", borderRadius: "10px" }}>
        <Badge color="error" badgeContent={alerts.data?.count ?? 0} max={99}>
          <NotificationsNoneOutlined />
        </Badge>
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: 480, borderRadius: "14px" } } }}
      >
        <Typography sx={{ px: 2, pt: 1.75, pb: 1, fontWeight: 700 }}>{t("alerts.title")}</Typography>
        {items.length === 0 ? (
          <Typography sx={{ px: 2, pb: 2, fontSize: "0.875rem", color: "text.secondary" }}>{t("alerts.empty")}</Typography>
        ) : (
          items.map((alert, index) => {
            const to = estateHref(alert.view, alert.objectId);
            return (
              <Box
                key={`${alert.kind}-${alert.objectId ?? index}-${index}`}
                onClick={
                  to
                    ? () => {
                        setAnchor(null);
                        navigate(to);
                      }
                    : undefined
                }
                sx={(th) => ({
                  display: "flex",
                  gap: 1.25,
                  px: 2,
                  py: 1,
                  cursor: to ? "pointer" : "default",
                  "&:hover": to ? { bgcolor: subtleBg(th) } : undefined,
                })}
              >
                <Box aria-hidden sx={{ mt: "7px", width: 8, height: 8, flexShrink: 0, borderRadius: "50%", bgcolor: toneColor(theme, alert.tone) }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.875rem" }}>{alert.title}</Typography>
                  {alert.sub && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{alert.sub}</Typography>}
                </Box>
              </Box>
            );
          })
        )}
      </Popover>
    </>
  );
}
