import React from "react";
import { Alert, Box, Button, ButtonBase, Skeleton, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";

import {
  estateSettingsKeys,
  getOrgUsers,
  getRolesMatrix,
  getSecuritySummary,
  nextLevel,
  resetRolesMatrix,
  setRoleLevel,
  type MatrixModule,
  type MatrixRole,
  type OrgUser,
  type RolesMatrix,
} from "../../api/estateSettings";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { StatusPill } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { ConfirmDialog, EmptyNote, PillTabs, SubPill, TwoLines } from "../realty-finance/shared";
import { KpiCards, ScreenError } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { errorMessage, useRefreshSettings, useSettingsCan } from "./hooks";
import { InviteDrawer, UserDrawer } from "./UserDrawers";

type Tab = "matrix" | "users" | "security";
const TABS: Tab[] = ["matrix", "users", "security"];
type UserFilter = "all" | "active" | "blocked";

/**
 * «Роли и права» застройщика (AIVIO, гайд `frontend-settings.md` §2):
 * матрица «раздел × роль» (`/roles-matrix/`), пользователи организации
 * (`/users/`, карточка — `?user=`) и политики безопасности. Столбцы — все роли
 * организации из API, подписи ролей — с бэка. «Войти как», сессии и резервные
 * копии макета API не имеют — не показываем.
 */
export default function EstateRolesPage() {
  const { t } = useT("estateSettings");
  usePageTitle(t("roles.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <RolesScreen />
    </Box>
  );
}

function RolesScreen() {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const perms = useSettingsCan();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "matrix";
  const enabled = scope.orgReady !== false;
  const security = useQuery({ queryKey: estateSettingsKeys.security(scope), queryFn: ({ signal }) => getSecuritySummary(scope, signal), enabled, staleTime: 60_000 });

  const setTab = (next: Tab) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "matrix") p.delete("tab");
        else p.set("tab", next);
        p.delete("user");
        return p;
      },
      { replace: true },
    );

  if (security.error) return <ScreenError error={security.error} title={t("common.loadError")} onRetry={() => void security.refetch()} />;
  const s = security.data;

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("roles.subtitle")}</Typography>
      <KpiCards
        skeletons={3}
        items={
          s
            ? [
                { key: "roles", label: t("roles.kpi.roles"), value: String(s.roles), hint: t("roles.kpi.rolesHint", { count: s.customizedRoles }) },
                { key: "users", label: t("roles.kpi.users"), value: String(s.users), hint: t("roles.kpi.usersHint", { count: s.activeUsers }) },
                { key: "twoFa", label: t("roles.kpi.twoFa"), value: `${s.twoFaPct}%`, hint: t("roles.kpi.twoFaHint", { count: s.twoFaEnabled, total: s.users }) },
              ]
            : null
        }
      />
      <Box sx={{ mb: 1.25 }}>
        <PillTabs<Tab> value={tab} onChange={setTab} tabs={TABS.map((key) => ({ key, label: t(`roles.tabs.${key}`), count: key === "users" ? (s?.users ?? null) : null }))} />
      </Box>
      {tab === "matrix" ? (
        perms.rolesView ? <MatrixTab /> : <Alert severity="info">{t("roles.matrix.noAccess")}</Alert>
      ) : tab === "users" ? (
        perms.usersView ? <UsersTab /> : <Alert severity="info">{t("roles.users.noAccess")}</Alert>
      ) : (
        <SecurityTab policies={s?.policies ?? null} />
      )}
    </>
  );
}

function levelColor(theme: Theme, level: string): string {
  switch (level) {
    case "view":
      return theme.palette.info.main;
    case "edit":
      return theme.palette.success.main;
    case "approve":
      return theme.palette.warning.main;
    default:
      return theme.palette.text.disabled;
  }
}

/** Подпись уровня в ячейке — первые 5 букв, как в макете («Просм», «Редак», «Согла»). */
const shortLabel = (label: string) => (label.length > 6 ? label.slice(0, 5) : label);

function MatrixTab() {
  const { t } = useT("estateSettings");
  const theme = useTheme();
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const perms = useSettingsCan();
  const [resetOpen, setResetOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const matrix = useQuery({ queryKey: estateSettingsKeys.matrix(scope), queryFn: ({ signal }) => getRolesMatrix(scope, signal), enabled: scope.orgReady !== false, staleTime: 60_000 });

  const levelLabel = React.useCallback((id: string) => matrix.data?.levels.find((l) => l.id === id)?.label ?? id, [matrix.data]);
  const cell = useMutation({
    mutationFn: ({ role, module, level }: { role: MatrixRole; module: MatrixModule; level: ReturnType<typeof nextLevel> }) => setRoleLevel(role.id, module.id, level, scope),
    onMutate: ({ role, module }) => setPending(`${role.id}:${module.id}`),
    onSuccess: (row, { role, module, level }) => {
      // Ответ — строка роли: подменяем её в кэше, чтобы ячейка не мигала до перезапроса.
      queryClient.setQueryData<RolesMatrix>(estateSettingsKeys.matrix(scope), (prev) => (prev ? { ...prev, roles: prev.roles.map((r) => (r.id === row.id ? { ...r, ...row } : r)) } : prev));
      refresh({ access: true });
      enqueueSnackbar(t("roles.matrix.saved", { role: role.label, module: module.label, level: levelLabel(level) }), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(errorMessage(error, t("common.failed")), { variant: "error" }),
    onSettled: () => setPending(null),
  });
  const reset = useMutation({
    mutationFn: () => resetRolesMatrix(null, scope),
    onSuccess: () => {
      setResetOpen(false);
      refresh({ access: true });
      enqueueSnackbar(t("roles.matrix.resetDone"), { variant: "success" });
    },
  });

  if (matrix.error) return <ScreenError error={matrix.error} title={t("common.loadError")} onRetry={() => void matrix.refetch()} />;
  if (!matrix.data) return <Skeleton variant="rounded" height={420} sx={{ borderRadius: "14px" }} />;
  const { modules, roles } = matrix.data;
  const groups: { label: string; items: MatrixModule[] }[] = [];
  for (const m of modules) {
    const last = groups[groups.length - 1];
    if (last && last.label === m.groupLabel) last.items.push(m);
    else groups.push({ label: m.groupLabel, items: [m] });
  }
  const stickyBg = theme.palette.background.paper;

  return (
    <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>
      <Box sx={{ px: 2.25, py: 1.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, display: "flex", gap: 1.25, flexWrap: "wrap", alignItems: "center" }}>
          {matrix.data.levels.map((l) => (
            <Box key={l.id} sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: alpha(levelColor(theme, l.id), l.id === "none" ? 0.25 : 0.7) }} />
              {l.label}
            </Box>
          ))}
          {perms.rolesEdit && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>· {t("roles.matrix.legend")}</Typography>}
        </Box>
        {perms.rolesEdit && (
          <Button size="small" variant="outlined" startIcon={<RestartAltOutlined />} onClick={() => setResetOpen(true)} sx={{ whiteSpace: "nowrap" }}>
            {t("roles.matrix.reset")}
          </Button>
        )}
      </Box>
      {!perms.rolesEdit && <Typography sx={{ px: 2.25, pt: 1, fontSize: "0.75rem", color: "text.secondary" }}>{t("common.readOnly")}</Typography>}
      <Box sx={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
        <Box component="table" sx={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%", fontSize: "0.8125rem" }}>
          <Box component="thead">
            <Box component="tr">
              <Box component="th" sx={{ position: "sticky", left: 0, top: 0, zIndex: 3, bgcolor: stickyBg, textAlign: "left", px: 2, py: 1, minWidth: 200, borderBottom: 1, borderColor: "divider", fontWeight: 600 }}>
                {t("roles.matrix.module")}
              </Box>
              {roles.map((r) => (
                <Box component="th" key={r.id} sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: stickyBg, px: 0.75, py: 1, minWidth: 92, maxWidth: 120, borderBottom: 1, borderColor: "divider", verticalAlign: "bottom" }}>
                  <Tooltip title={[t("roles.matrix.users", { count: r.usersCount }), r.customized ? t("roles.matrix.customized") : null, r.isSystem ? t("roles.matrix.system") : null].filter(Boolean).join(" · ")}>
                    <Box>
                      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.2, wordBreak: "break-word" }}>{r.label}</Typography>
                      {r.customized && <Box sx={{ mx: "auto", mt: 0.4, width: 6, height: 6, borderRadius: "50%", bgcolor: "warning.main" }} />}
                    </Box>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {groups.map((g) => (
              <React.Fragment key={g.label}>
                <Box component="tr">
                  <Box component="td" colSpan={roles.length + 1} sx={(th) => ({ position: "sticky", left: 0, px: 2, pt: 1.25, pb: 0.5, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", bgcolor: subtleBg(th) })}>
                    {g.label}
                  </Box>
                </Box>
                {g.items.map((m) => (
                  <Box component="tr" key={m.id} sx={{ "&:hover td": { bgcolor: "action.hover" } }}>
                    <Box component="td" sx={{ position: "sticky", left: 0, zIndex: 1, bgcolor: stickyBg, px: 2, py: 0.5, borderBottom: 1, borderColor: "divider", whiteSpace: "nowrap" }}>
                      {m.label}
                    </Box>
                    {roles.map((r) => {
                      const level = r.permissions[m.id] ?? "none";
                      const color = levelColor(theme, level);
                      const key = `${r.id}:${m.id}`;
                      const clickable = perms.rolesEdit && !r.isSystem;
                      return (
                        <Box component="td" key={r.id} sx={{ px: 0.5, py: 0.4, textAlign: "center", borderBottom: 1, borderColor: "divider" }}>
                          <Tooltip title={`${r.label} · ${m.label}: ${levelLabel(level)}`} disableInteractive>
                            <span>
                              <ButtonBase
                                disabled={!clickable || cell.isPending}
                                onClick={() => cell.mutate({ role: r, module: m, level: nextLevel(level) })}
                                aria-label={`${r.label} · ${m.label}: ${levelLabel(level)}`}
                                sx={{
                                  minWidth: 64,
                                  px: 0.75,
                                  py: 0.3,
                                  borderRadius: "6px",
                                  fontSize: "0.72rem",
                                  fontWeight: 600,
                                  color: level === "none" ? "text.disabled" : color,
                                  bgcolor: alpha(color, level === "none" ? 0.06 : 0.12),
                                  opacity: pending === key ? 0.5 : 1,
                                  cursor: clickable ? "pointer" : "default",
                                  "&:hover": clickable ? { bgcolor: alpha(color, 0.22) } : undefined,
                                  "&.Mui-disabled": { color: level === "none" ? "text.disabled" : color },
                                }}
                              >
                                {shortLabel(levelLabel(level))}
                              </ButtonBase>
                            </span>
                          </Tooltip>
                        </Box>
                      );
                    })}
                  </Box>
                ))}
              </React.Fragment>
            ))}
          </Box>
        </Box>
      </Box>
      <ConfirmDialog
        open={resetOpen}
        title={t("roles.matrix.resetTitle")}
        text={t("roles.matrix.resetText")}
        confirmLabel={t("roles.matrix.reset")}
        danger
        busy={reset.isPending}
        error={reset.error}
        onConfirm={() => reset.mutate()}
        onClose={() => {
          setResetOpen(false);
          reset.reset();
        }}
      />
    </Box>
  );
}

function UsersTab() {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const perms = useSettingsCan();
  const [filter, setFilter] = React.useState<UserFilter>("all");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [userId, openUser] = useIdParam("user");
  // Один список без фильтра: счётчики фильтров и карточка — из него.
  const users = useQuery({ queryKey: estateSettingsKeys.users(scope, "all"), queryFn: ({ signal }) => getOrgUsers("all", scope, signal), enabled: scope.orgReady !== false, staleTime: 30_000 });
  const matrix = useQuery({ queryKey: estateSettingsKeys.matrix(scope), queryFn: ({ signal }) => getRolesMatrix(scope, signal), enabled: scope.orgReady !== false && perms.rolesView, staleTime: 60_000 });

  if (users.error) return <ScreenError error={users.error} title={t("common.loadError")} onRetry={() => void users.refetch()} />;
  const all = users.data ?? [];
  const rows = all.filter((u) => filter === "all" || u.status === filter);
  const count = (key: UserFilter) => (users.data ? (key === "all" ? all.length : all.filter((u) => u.status === key).length) : null);
  const roles = matrix.data?.roles ?? [];

  const columns: GridColDef<OrgUser>[] = [
    { field: "name", headerName: t("roles.users.name"), flex: 1.2, minWidth: 200, renderCell: ({ row }) => <TwoLines strong top={row.name || row.email} bottom={[row.position, row.isOwner ? t("roles.users.owner") : null].filter(Boolean).join(" · ") || null} /> },
    { field: "roleName", headerName: t("roles.users.role"), flex: 1, minWidth: 160 },
    { field: "email", headerName: t("roles.users.email"), flex: 1, minWidth: 180 },
    { field: "twoFa", headerName: t("roles.users.twoFa"), width: 100, renderCell: ({ row }) => <StatusPill label={row.twoFa ? t("roles.users.twoFaOn") : t("roles.users.twoFaOff")} tone={row.twoFa ? "success" : null} /> },
    {
      field: "lastLogin",
      headerName: t("roles.users.lastLogin"),
      width: 150,
      renderCell: ({ row }) => <TwoLines top={row.lastLogin ? dayjs(row.lastLogin).format("DD.MM.YYYY HH:mm") : t("common.never")} bottom={row.invitedAt ? t("roles.users.invited", { date: dayjs(row.invitedAt).format("DD.MM.YYYY") }) : null} />,
    },
    { field: "status", headerName: t("roles.users.status"), width: 140, renderCell: ({ row }) => <StatusPill label={t(`roles.users.status_${row.status}`, { defaultValue: row.status })} tone={row.status === "blocked" ? "error" : "success"} /> },
  ];

  return (
    <>
      <Box sx={{ mb: 1.25, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {(["all", "active", "blocked"] as const).map((key) => (
            <SubPill key={key} active={filter === key} onClick={() => setFilter(key)} label={`${t(`roles.users.filter_${key}`)}${count(key) != null ? ` · ${count(key)}` : ""}`} />
          ))}
        </Box>
        {perms.usersCreate && (
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setInviteOpen(true)} sx={{ whiteSpace: "nowrap" }}>
            {t("roles.users.invite")}
          </Button>
        )}
      </Box>
      <Box sx={{ ...cardSx, overflow: "hidden" }}>
        <DataGrid<OrgUser>
          rows={rows}
          columns={columns}
          loading={users.isFetching && !users.data}
          localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: filter === "all" ? t("common.empty") : t("common.emptyFiltered") }}
          getRowHeight={() => "auto"}
          onRowClick={({ row }) => openUser(row.id)}
          disableRowSelectionOnClick
          disableColumnMenu
          autoHeight
          hideFooter={rows.length <= 100}
          initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
          pageSizeOptions={[100]}
          sx={{ border: 0, "& .MuiDataGrid-row": { cursor: "pointer" }, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
        />
      </Box>
      <UserDrawer user={all.find((u) => u.id === userId) ?? null} open={userId != null} roles={roles} onClose={() => openUser(null)} />
      {perms.usersCreate && <InviteDrawer open={inviteOpen} roles={roles} users={all} onClose={() => setInviteOpen(false)} onInvited={(u) => openUser(u.id)} />}
    </>
  );
}

function SecurityTab({ policies }: { policies: { code: string; title: string; description: string; status: string; enforced: boolean }[] | null }) {
  const { t } = useT("estateSettings");
  return (
    <Box sx={{ ...cardSx, overflow: "hidden" }}>
      <Typography sx={{ px: 2.25, pt: 2, pb: 1, fontWeight: 700 }}>{t("roles.security.policies")}</Typography>
      {!policies ? (
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={140} />
        </Box>
      ) : policies.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        policies.map((p) => (
          <Box key={p.code} sx={{ px: 2.25, py: 1.25, display: "flex", alignItems: "center", gap: 1.5, borderTop: 1, borderColor: "divider" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{p.title}</Typography>
              {p.description && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{p.description}</Typography>}
            </Box>
            {p.enforced && <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("roles.security.enforced")}</Typography>}
            <StatusPill label={t(`roles.security.status_${p.status}`, { defaultValue: p.status })} tone={p.status === "enabled" ? "success" : p.status === "partial" ? "warning" : null} />
          </Box>
        ))
      )}
    </Box>
  );
}
