import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useNavigate, useSearchParams } from "react-router";
import dayjs from "dayjs";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import GavelOutlined from "@mui/icons-material/GavelOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";

import { getLeads, realtyLeadKeys, type Lead } from "../../api/realtyLeads";
import { approveBonuses, getMotivation, motivationKeys, type MotivationRow, type MotivationSummary } from "../../api/salaryMotivation";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { cardSx, compactMoney } from "../estate-dashboard/format";
import { PlansDrawer, RowDrawer, SchemeDrawer } from "./MotivationForms";
import { CardHeader, KpiCards, ScreenError } from "./shared";

const MONTH_RE = /^\d{4}-\d{2}$/;
const monthName = (month: string) => (MONTH_RE.test(month) ? dayjs(`${month}-01`).locale("ru").format("MMMM YYYY") : month);
const pct = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

/**
 * «Планы и мотивация» застройщика (AIVIO, группа «Персонал», гайд
 * `frontend-sales.md` §11): сводка месяца `?month=YYYY-MM`, лидерборд,
 * динамика, схема бонусов, будущий факт из CRM. Смотреть — `salary.view`;
 * схема, планы, ✎ и «Утвердить премии → приказ» — `salary.manage`, и только
 * пока премии месяца не утверждены.
 */
export default function RealtyMotivationPage() {
  const { t } = useT("realtySales");
  usePageTitle(t("motivation.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <MotivationScreen />
    </Box>
  );
}

function MotivationScreen() {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("salary.manage");
  const canEdo = useCan("edo.view");
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get("month");
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : null;
  const setMonth = (next: string) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("month", next);
        return params;
      },
      { replace: true },
    );

  const [schemeOpen, setSchemeOpen] = React.useState(false);
  const [plansOpen, setPlansOpen] = React.useState(false);
  const [editRow, setEditRow] = React.useState<MotivationRow | null>(null);
  const [confirmApprove, setConfirmApprove] = React.useState(false);

  const summary = useQuery({
    queryKey: motivationKeys.month(scope, month),
    queryFn: ({ signal }) => getMotivation(month, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: motivationKeys.all });
  const approve = useMutation({
    mutationFn: () => approveBonuses(summary.data?.month as string, scope),
    onSuccess: (order) => {
      setConfirmApprove(false);
      refresh();
      enqueueSnackbar(t("motivation.toast.approved", { number: order.number }), { variant: "success" });
    },
    onError: (error) => {
      setConfirmApprove(false);
      enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });
    },
  });

  if (summary.error) return <ScreenError error={summary.error} title={t("motivation.loadError")} moduleOffHint={t("motivation.moduleOffHint")} onRetry={() => void summary.refetch()} />;

  const s = summary.data;
  const label = s ? s.monthLabel || monthName(s.month) : "";
  const editable = canManage && s != null && s.approved == null;
  const rows = s ? [...s.rows].sort((a, b) => b.pct - a.pct) : [];

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("motivation.subtitle")}</Typography>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          {(s?.months ?? []).map((m) => (
            <ButtonBase key={m} aria-pressed={s?.month === m} onClick={() => setMonth(m)} sx={(th) => ({ ...pillSx(th, s?.month === m), whiteSpace: "nowrap", textTransform: "capitalize" })}>
              {monthName(m)}
            </ButtonBase>
          ))}
        </Box>
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "plan", label: t("motivation.kpi.plan"), value: compactMoney(s.teamPlan, t) },
                {
                  key: "fact",
                  label: t("motivation.kpi.fact"),
                  value: compactMoney(s.teamFact, t),
                  hint: t("motivation.kpi.factHint", { pct: pct(s.teamPct) }),
                  tone: s.teamPct >= 100 ? "success" : null,
                },
                { key: "deals", label: t("motivation.kpi.deals"), value: String(s.dealsTotal), hint: s.avgDeal ? t("motivation.kpi.avgDeal", { amount: compactMoney(s.avgDeal, t) }) : null },
                { key: "fund", label: t("motivation.kpi.fund"), value: compactMoney(s.bonusFund, t), hint: s.teamBonusMet ? t("motivation.kpi.teamMet") : t("motivation.kpi.teamNotMet") },
              ]
            : null
        }
      />

      {s?.approved && (
        <Alert
          severity="success"
          sx={{ mb: 1.5 }}
          action={
            canEdo && s.approved.orderDocumentId != null ? (
              <Button color="inherit" size="small" onClick={() => navigate(`/edo?doc=${s.approved?.orderDocumentId}`)}>
                {t("motivation.openOrder")}
              </Button>
            ) : undefined
          }
        >
          {t("motivation.approved", { number: s.approved.number })}
          {s.approved.total ? ` ${t("motivation.approvedTotal", { total: formatKGS(s.approved.total) })}` : ""}
        </Alert>
      )}

      {editable && (
        <Box sx={{ mb: 1.5, display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="outlined" size="small" startIcon={<TuneOutlined />} onClick={() => setSchemeOpen(true)}>
            {t("motivation.actions.scheme")}
          </Button>
          <Button variant="outlined" size="small" startIcon={<FlagOutlined />} onClick={() => setPlansOpen(true)} disabled={rows.length === 0}>
            {t("motivation.actions.plans")}
          </Button>
          <Button variant="contained" size="small" startIcon={<GavelOutlined />} onClick={() => setConfirmApprove(true)} disabled={rows.length === 0}>
            {t("motivation.actions.approve")}
          </Button>
        </Box>
      )}

      <Box sx={{ display: "grid", gap: 1.5, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 340px" } }}>
        <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
          <Leaderboard rows={s ? rows : null} canEdit={editable} onEdit={setEditRow} />
          <HistoryCard summary={s} />
        </Box>
        <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
          <SchemeCard summary={s} />
          <CrmDeals />
        </Box>
      </Box>

      {editable && s && (
        <>
          <SchemeDrawer
            scheme={schemeOpen ? s.scheme : null}
            onClose={() => setSchemeOpen(false)}
            onSaved={() => {
              setSchemeOpen(false);
              refresh();
              enqueueSnackbar(t("motivation.toast.schemeSaved"), { variant: "success" });
            }}
          />
          <PlansDrawer
            summary={plansOpen ? s : null}
            monthLabel={label}
            onClose={() => setPlansOpen(false)}
            onSaved={(fresh) => {
              setPlansOpen(false);
              queryClient.setQueryData(motivationKeys.month(scope, month), fresh);
              refresh();
              enqueueSnackbar(t("motivation.toast.plansSaved"), { variant: "success" });
            }}
          />
          <RowDrawer
            row={editRow}
            month={s.month}
            monthLabel={label}
            onClose={() => setEditRow(null)}
            onSaved={() => {
              setEditRow(null);
              refresh();
              enqueueSnackbar(t("motivation.toast.rowSaved"), { variant: "success" });
            }}
          />
        </>
      )}
      <Dialog open={confirmApprove} onClose={approve.isPending ? undefined : () => setConfirmApprove(false)} maxWidth={false} PaperProps={{ sx: { width: 460, maxWidth: "calc(100vw - 32px)" } }}>
        <DialogTitle>{t("motivation.approveDialog.title", { month: label })}</DialogTitle>
        <DialogContent>
          <Typography>{t("motivation.approveDialog.text", { total: formatKGS(s?.bonusFund ?? 0) })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmApprove(false)} disabled={approve.isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="contained" disabled={approve.isPending} onClick={() => approve.mutate()}>
            {t("motivation.approveDialog.submit")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function Leaderboard({ rows, canEdit, onEdit }: { rows: MotivationRow[] | null; canEdit: boolean; onEdit: (row: MotivationRow) => void }) {
  const { t } = useT("realtySales");
  return (
    <Box sx={{ ...cardSx, overflow: "hidden", minWidth: 0 }}>
      <CardHeader title={t("motivation.leaderboard.title")} subtitle={t("motivation.leaderboard.hint")} />
      {!rows && (
        <Box sx={{ px: 2.25, pb: 2 }}>
          <Skeleton variant="rounded" height={160} />
        </Box>
      )}
      {rows?.length === 0 && <Typography sx={{ py: 4, borderTop: 1, borderColor: "divider", textAlign: "center", color: "text.secondary" }}>{t("motivation.leaderboard.empty")}</Typography>}
      {rows?.map((row, i) => (
        <Box
          key={row.employeeId}
          sx={{
            px: 2.25,
            py: 1.25,
            borderTop: 1,
            borderColor: "divider",
            display: "grid",
            gap: 1.25,
            alignItems: "center",
            gridTemplateColumns: { xs: "28px minmax(0, 1fr) auto", md: "28px minmax(0, 1.4fr) 1fr 1fr 70px 1.4fr 1fr auto" },
          }}
        >
          <Typography sx={{ fontWeight: 800, color: i < 3 ? "primary.main" : "text.secondary" }}>{i + 1}</Typography>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
              {row.employeeName}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {row.position}
            </Typography>
          </Box>
          <Cell label={t("motivation.leaderboard.plan")} value={compactMoney(row.plan, t)} />
          <Cell
            label={t("motivation.leaderboard.fact")}
            value={compactMoney(row.fact, t)}
            note={row.factSource === "manual" ? t("motivation.leaderboard.manual") : t("motivation.leaderboard.crm")}
            noteColor={row.factSource === "manual" ? "warning.main" : "text.secondary"}
          />
          <Cell label={t("motivation.leaderboard.deals")} value={String(row.deals)} />
          <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("motivation.leaderboard.pct")}</Typography>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: row.pct >= 100 ? "success.main" : "text.primary" }}>{pct(row.pct)}%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.max(0, Math.min(100, row.pct))}
              aria-label={`${row.employeeName}: ${pct(row.pct)}%`}
              color={row.pct >= 100 ? "success" : "primary"}
              sx={(th) => ({ mt: 0.5, height: 6, borderRadius: 3, bgcolor: subtleBg(th, true), "& .MuiLinearProgress-bar": { borderRadius: 3 } })}
            />
          </Box>
          <Cell label={t("motivation.leaderboard.bonus")} value={formatKGS(row.bonus)} strong />
          {canEdit ? (
            <Tooltip title={t("motivation.leaderboard.edit")}>
              <IconButton size="small" aria-label={`${t("motivation.leaderboard.edit")}: ${row.employeeName}`} onClick={() => onEdit(row)}>
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <span />
          )}
        </Box>
      ))}
    </Box>
  );
}

/** Ячейка лидерборда: на телефоне — только премия и правка, остальное прячем. */
function Cell({ label, value, note, noteColor, strong = false }: { label: string; value: string; note?: string; noteColor?: string; strong?: boolean }) {
  return (
    <Box sx={{ display: { xs: strong ? "block" : "none", md: "block" }, minWidth: 0, textAlign: { xs: "right", md: "left" } }}>
      <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: strong ? 700 : 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
      {note && (
        <Typography noWrap sx={{ fontSize: "0.68rem", color: noteColor }}>
          {note}
        </Typography>
      )}
    </Box>
  );
}

function HistoryCard({ summary }: { summary: MotivationSummary | undefined }) {
  const { t } = useT("realtySales");
  const history = summary?.history ?? [];
  const max = Math.max(1, ...history.flatMap((h) => [h.plan, h.fact]));
  return (
    <Box sx={{ ...cardSx, pb: 2, minWidth: 0 }}>
      <CardHeader title={t("motivation.history.title")} subtitle={t("motivation.history.hint")} />
      {!summary ? (
        <Box sx={{ px: 2.25 }}>
          <Skeleton variant="rounded" height={140} />
        </Box>
      ) : (
        <Box sx={{ px: 2.25 }}>
          <Box sx={{ display: "flex", alignItems: "flex-end", gap: 2, height: 150 }}>
            {history.map((h) => (
              <Box key={h.month} sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, height: "100%", justifyContent: "flex-end" }}>
                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, width: "100%", justifyContent: "center", flex: 1 }}>
                  <Tooltip title={`${t("motivation.history.plan")}: ${formatKGS(h.plan)}`}>
                    <Box sx={(th) => ({ width: "40%", maxWidth: 28, height: `${(h.plan / max) * 100}%`, minHeight: 3, borderRadius: "4px", bgcolor: subtleBg(th, true), border: 1, borderColor: "divider" })} />
                  </Tooltip>
                  <Tooltip title={`${t("motivation.history.fact")}: ${formatKGS(h.fact)}`}>
                    <Box sx={{ width: "40%", maxWidth: 28, height: `${(h.fact / max) * 100}%`, minHeight: 3, borderRadius: "4px", bgcolor: h.fact >= h.plan && h.plan > 0 ? "success.main" : "primary.main" }} />
                  </Tooltip>
                </Box>
                <Typography noWrap sx={{ fontSize: "0.72rem", color: summary.month === h.month ? "text.primary" : "text.secondary", fontWeight: summary.month === h.month ? 700 : 400 }}>
                  {dayjs(`${h.month}-01`).locale("ru").format("MMM")}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ mt: 1, display: "flex", gap: 2 }}>
            <Legend swatch={(th) => ({ bgcolor: subtleBg(th, true), border: 1, borderColor: "divider" })} label={t("motivation.history.plan")} />
            <Legend swatch={{ bgcolor: "primary.main" }} label={t("motivation.history.fact")} />
          </Box>
        </Box>
      )}
    </Box>
  );
}

function Legend({ swatch, label }: { swatch: React.ComponentProps<typeof Box>["sx"]; label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Box sx={[{ width: 10, height: 10, borderRadius: "3px" }, ...(Array.isArray(swatch) ? swatch : [swatch])]} />
      <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{label}</Typography>
    </Box>
  );
}

function SchemeCard({ summary }: { summary: MotivationSummary | undefined }) {
  const { t } = useT("realtySales");
  const scheme = summary?.scheme;
  return (
    <Box sx={{ ...cardSx, pb: 1.5, minWidth: 0 }}>
      <CardHeader title={t("motivation.scheme.title")} />
      <Box sx={{ px: 2.25, display: "grid", gap: 0.75 }}>
        {!scheme && <Skeleton variant="rounded" height={80} />}
        {scheme?.tiers.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("motivation.scheme.empty")}</Typography>}
        {scheme?.tiers.map((tier) => (
          <Typography key={tier.from} sx={(th) => ({ px: 1.25, py: 0.75, borderRadius: "8px", bgcolor: subtleBg(th), fontSize: "0.8125rem" })}>
            {t("motivation.scheme.tier", { from: pct(tier.from), pct: pct(tier.pct) })}
          </Typography>
        ))}
        {scheme && scheme.teamBonus > 0 && (
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("motivation.scheme.team", { amount: formatKGS(scheme.teamBonus), threshold: pct(scheme.teamThreshold) })}</Typography>
        )}
      </Box>
    </Box>
  );
}

/** «Из CRM — сделки на этапе договора»: бронь и договор — будущий факт месяца. Нет доступа к CRM — блока нет. */
function CrmDeals() {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const canRealty = useCan("realty.view");
  const enabled = canRealty && scope.orgReady !== false;
  const contractParams = React.useMemo(() => ({ stage: "contract" as const }), []);
  const buildParams = React.useMemo(() => ({ stage: "build" as const }), []);
  const contract = useQuery({ queryKey: realtyLeadKeys.list(scope, contractParams), queryFn: ({ signal }) => getLeads(contractParams, scope, signal), enabled, staleTime: 60_000, retry: false });
  const build = useQuery({ queryKey: realtyLeadKeys.list(scope, buildParams), queryFn: ({ signal }) => getLeads(buildParams, scope, signal), enabled, staleTime: 60_000, retry: false });
  if (!canRealty || contract.isError || build.isError) return null;
  const leads: Lead[] | null = contract.data && build.data ? [...build.data, ...contract.data] : null;
  const shown = leads?.slice(0, 8) ?? [];
  return (
    <Box sx={{ ...cardSx, pb: 1, minWidth: 0 }}>
      <CardHeader title={t("motivation.crm.title")} subtitle={t("motivation.crm.hint")} />
      {!leads && (
        <Box sx={{ px: 2.25, pb: 1 }}>
          <Skeleton variant="rounded" height={80} />
        </Box>
      )}
      {leads?.length === 0 && <Typography sx={{ px: 2.25, pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("motivation.crm.empty")}</Typography>}
      {shown.map((lead) => (
        <ButtonBase
          key={lead.id}
          onClick={() => navigate(`/realestate/leads?lead=${lead.id}`)}
          sx={(th) => ({ width: "100%", px: 2.25, py: 0.9, display: "flex", gap: 1, textAlign: "left", borderTop: 1, borderColor: "divider", "&:hover": { bgcolor: subtleBg(th) } })}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              {lead.client}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
              {[lead.stageName, lead.manager].filter(Boolean).join(" · ")}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, whiteSpace: "nowrap" }}>{lead.budget > 0 ? compactMoney(lead.budget, t) : "—"}</Typography>
        </ButtonBase>
      ))}
      {leads && leads.length > shown.length && <Typography sx={{ px: 2.25, pt: 0.75, fontSize: "0.75rem", color: "text.secondary" }}>{t("motivation.crm.more", { count: leads.length - shown.length })}</Typography>}
    </Box>
  );
}
