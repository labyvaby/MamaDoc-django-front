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
  Drawer,
  IconButton,
  LinearProgress,
  MenuItem,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { Controller, useForm } from "react-hook-form";
import dayjs, { type Dayjs } from "dayjs";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";

import { LEAD_SOURCES } from "../../api/realtyLeads";
import {
  CAMPAIGN_STATUSES,
  MARKETING_PERIODS,
  createCampaign,
  deleteCampaign,
  getCampaigns,
  getMarketingSummary,
  realtyMarketingKeys,
  updateCampaign,
  type Campaign,
  type MarketingChannel,
  type MarketingPeriod,
} from "../../api/realtyMarketing";
import { CustomDatePicker, pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu, formatKGS } from "../../utility/format";
import { cardSx, compactMoney } from "../estate-dashboard/format";
import { amountText, isoDate, parseAmount } from "./catalogFormat";
import { CardHeader, KpiCards, ScreenError } from "./shared";

/**
 * «Маркетинг и ROI» застройщика (AIVIO, гайд `frontend-sales.md` §10):
 * KPI и каналы — `/marketing/summary/?period=`, кампании — `/marketing/campaigns/`
 * (план расхода по каналу; без него нет «Расхода», цены заявки и ROMI).
 * Запускать, править и удалять кампании — `realty.manage`.
 */
export default function RealtyMarketingPage() {
  const { t } = useT("realtySales");
  usePageTitle(t("marketing.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <MarketingScreen />
    </Box>
  );
}

const pct = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

function MarketingScreen() {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("realty.manage");
  const [period, setPeriod] = React.useState<MarketingPeriod>(30);
  const [status, setStatus] = React.useState<string>("all");
  const [editing, setEditing] = React.useState<{ campaign: Campaign | null } | null>(null);
  const [toDelete, setToDelete] = React.useState<Campaign | null>(null);
  const enabled = scope.orgReady !== false;

  const summary = useQuery({
    queryKey: realtyMarketingKeys.summary(scope, period),
    queryFn: ({ signal }) => getMarketingSummary(period, scope, signal),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const campaigns = useQuery({ queryKey: realtyMarketingKeys.campaigns(scope), queryFn: ({ signal }) => getCampaigns(scope, signal), enabled, staleTime: 60_000 });

  const remove = useMutation({
    mutationFn: (campaign: Campaign) => deleteCampaign(campaign.id, scope),
    onSuccess: () => {
      setToDelete(null);
      void queryClient.invalidateQueries({ queryKey: realtyMarketingKeys.all });
      enqueueSnackbar(t("marketing.campaigns.deleted"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" }),
  });

  if (summary.error) return <ScreenError error={summary.error} title={t("marketing.loadError")} onRetry={() => void summary.refetch()} />;

  const s = summary.data;
  const channels = s ? [...s.channels].sort((a, b) => b.leads - a.leads || b.spend - a.spend) : null;
  const shownCampaigns = (campaigns.data ?? []).filter((c) => status === "all" || c.status === status);

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>
          {t("marketing.subtitle")}
          {s?.dateFrom && s.dateTo ? ` · ${t("marketing.range", { from: formatDateRu(s.dateFrom), to: formatDateRu(s.dateTo) })}` : ""}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          {MARKETING_PERIODS.map((value) => (
            <ButtonBase key={value} aria-pressed={period === value} onClick={() => setPeriod(value)} sx={(th) => ({ ...pillSx(th, period === value), whiteSpace: "nowrap" })}>
              {t(`marketing.period.${value}`)}
            </ButtonBase>
          ))}
        </Box>
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "budget", label: t("marketing.kpi.budget"), value: compactMoney(s.budget, t), hint: t("marketing.kpi.campaigns", { count: s.campaigns }) },
                {
                  key: "leads",
                  label: t("marketing.kpi.leads"),
                  value: String(s.leads),
                  hint: s.leadsChangePct != null ? `${s.leadsChangePct > 0 ? "+" : ""}${pct(s.leadsChangePct)}%` : null,
                },
                { key: "costPerLead", label: t("marketing.kpi.costPerLead"), value: s.costPerLead != null ? formatKGS(s.costPerLead) : "—" },
                {
                  key: "romi",
                  label: t("marketing.kpi.romi"),
                  value: s.romi != null ? `${pct(s.romi)}%` : "—",
                  hint: t("marketing.kpi.romiHint"),
                  tone: s.romi == null ? null : s.romi >= 0 ? "success" : "error",
                },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.5, display: "grid", gap: 1.5, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 340px" } }}>
        <Box sx={{ ...cardSx, overflow: "hidden", minWidth: 0 }}>
          <ChannelsTable channels={channels} />
        </Box>
        <Box sx={{ ...cardSx, pb: 2, minWidth: 0 }}>
          <CardHeader title={t("marketing.efficiency.title")} subtitle={t("marketing.efficiency.hint")} />
          <Box sx={{ px: 2.25, display: "grid", gap: 1.25 }}>
            {!channels && <Skeleton variant="rounded" height={120} />}
            {channels?.map((c) => (
              <Box key={c.source || "—"}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                  <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {c.source || t("marketing.table.noSource")}
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{pct(c.conversion)}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.max(0, Math.min(100, c.conversion))}
                  aria-label={c.source}
                  sx={(th) => ({ mt: 0.5, height: 6, borderRadius: 3, bgcolor: subtleBg(th, true), "& .MuiLinearProgress-bar": { borderRadius: 3 } })}
                />
              </Box>
            ))}
            {canManage && (
              <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setEditing({ campaign: null })} sx={{ mt: 0.5 }}>
                {t("marketing.launch")}
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ ...cardSx, overflow: "hidden" }}>
        <CardHeader
          title={t("marketing.campaigns.title")}
          subtitle={t("marketing.campaigns.hint")}
          action={
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {(["all", ...CAMPAIGN_STATUSES] as const).map((key) => (
                <ButtonBase
                  key={key}
                  aria-pressed={status === key}
                  onClick={() => setStatus(key)}
                  sx={(th) => ({
                    px: 1.1,
                    py: 0.35,
                    borderRadius: "8px",
                    fontSize: "0.8125rem",
                    whiteSpace: "nowrap",
                    color: status === key ? "text.primary" : "text.secondary",
                    fontWeight: status === key ? 700 : 500,
                    bgcolor: status === key ? subtleBg(th, true) : "transparent",
                  })}
                >
                  {key === "all" ? t("marketing.campaigns.all") : t(`marketing.status.${key}`)}
                </ButtonBase>
              ))}
            </Box>
          }
        />
        {!campaigns.data && (
          <Box sx={{ px: 2.25, pb: 2 }}>
            <Skeleton variant="rounded" height={64} />
          </Box>
        )}
        {campaigns.data && shownCampaigns.length === 0 && (
          <Typography sx={{ py: 4, borderTop: 1, borderColor: "divider", textAlign: "center", color: "text.secondary" }}>{t("marketing.campaigns.empty")}</Typography>
        )}
        {shownCampaigns.map((c) => (
          <Box key={c.id} sx={{ px: 2.25, py: 1.25, borderTop: 1, borderColor: "divider", display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{c.name}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                {[
                  c.source,
                  c.endDate && c.endDate !== c.startDate
                    ? t("marketing.campaigns.dates", { from: formatDateRu(c.startDate), to: formatDateRu(c.endDate) })
                    : t("marketing.campaigns.oneDay", { date: formatDateRu(c.startDate) }),
                  c.branchName,
                  c.note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography>
            </Box>
            <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatKGS(c.budget)}</Typography>
            <Box
              component="span"
              sx={(th) => ({
                px: 1,
                py: 0.3,
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                color: c.status === "active" ? "success.main" : c.status === "planned" ? "info.main" : "text.secondary",
                bgcolor: subtleBg(th, true),
              })}
            >
              {c.statusLabel || ((CAMPAIGN_STATUSES as readonly string[]).includes(c.status) ? t(`marketing.status.${c.status}`) : c.status)}
            </Box>
            {canManage && (
              <Box sx={{ display: "flex" }}>
                <Tooltip title={t("marketing.campaigns.edit")}>
                  <IconButton size="small" aria-label={`${t("marketing.campaigns.edit")}: ${c.name}`} onClick={() => setEditing({ campaign: c })}>
                    <EditOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t("marketing.campaigns.delete")}>
                  <IconButton size="small" aria-label={`${t("marketing.campaigns.delete")}: ${c.name}`} onClick={() => setToDelete(c)} sx={{ color: "error.main" }}>
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {canManage && <CampaignDrawer editing={editing} onClose={() => setEditing(null)} />}
      <Dialog open={toDelete != null} onClose={remove.isPending ? undefined : () => setToDelete(null)} maxWidth={false} PaperProps={{ sx: { width: 420, maxWidth: "calc(100vw - 32px)" } }}>
        <DialogTitle>{t("marketing.campaigns.deleteTitle", { name: toDelete?.name ?? "" })}</DialogTitle>
        <DialogContent>
          <Typography>{t("marketing.campaigns.deleteText")}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)} disabled={remove.isPending}>
            {t("common.cancel")}
          </Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete)}>
            {t("marketing.campaigns.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function ChannelsTable({ channels }: { channels: MarketingChannel[] | null }) {
  const { t } = useT("realtySales");
  const cols = ["channel", "leads", "deals", "spend", "costPerLead", "conversion", "revenue", "romi"] as const;
  if (!channels) return <Skeleton variant="rounded" height={220} />;
  if (channels.length === 0) return <Typography sx={{ py: 5, textAlign: "center", color: "text.secondary" }}>{t("marketing.table.empty")}</Typography>;
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box component="table" sx={{ width: "100%", minWidth: 720, borderCollapse: "collapse", "& td, & th": { px: 1.5, py: 1.1, textAlign: "left", fontSize: "0.8125rem", borderTop: 1, borderColor: "divider", whiteSpace: "nowrap" } }}>
        <thead>
          <tr>
            {cols.map((key) => (
              <Box component="th" key={key} scope="col" sx={{ fontWeight: 600, color: "text.secondary", borderTop: "0 !important", textAlign: key === "channel" ? "left" : "right !important" }}>
                {t(`marketing.table.${key}`)}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.source || "—"}>
              <Box component="td" sx={{ fontWeight: 700 }}>
                {c.source || t("marketing.table.noSource")}
              </Box>
              <Num>{c.leads}</Num>
              <Num>{c.deals}</Num>
              <Num>{formatKGS(c.spend)}</Num>
              <Num>{c.costPerLead != null ? formatKGS(c.costPerLead) : "—"}</Num>
              <Num>{pct(c.conversion)}%</Num>
              <Num>{compactMoney(c.revenue, t)}</Num>
              <Num color={c.romi == null ? undefined : c.romi >= 0 ? "success.main" : "error.main"}>{c.romi != null ? `${pct(c.romi)}%` : "—"}</Num>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

function Num({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <Box component="td" sx={{ textAlign: "right !important", fontVariantNumeric: "tabular-nums", color: color ?? "text.primary" }}>
      {children}
    </Box>
  );
}

interface CampaignForm {
  name: string;
  source: string;
  budget: string;
  startDate: Dayjs | null;
  endDate: Dayjs | null;
  note: string;
}

function CampaignDrawer({ editing, onClose }: { editing: { campaign: Campaign | null } | null; onClose: () => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const campaign = editing?.campaign ?? null;
  const { control, handleSubmit, reset, getValues } = useForm<CampaignForm>();
  React.useEffect(() => {
    if (!editing) return;
    reset(
      campaign
        ? { name: campaign.name, source: campaign.source, budget: String(campaign.budget), startDate: campaign.startDate ? dayjs(campaign.startDate) : null, endDate: campaign.endDate ? dayjs(campaign.endDate) : null, note: campaign.note }
        : { name: "", source: LEAD_SOURCES[0], budget: "", startDate: dayjs(), endDate: dayjs().add(30, "day"), note: "" },
    );
  }, [editing, campaign, reset]);
  const save = useMutation({
    mutationFn: (form: CampaignForm) => {
      const input = { name: form.name, source: form.source, budget: amountText(form.budget) ?? "0", startDate: isoDate(form.startDate), endDate: isoDate(form.endDate), note: form.note };
      return campaign ? updateCampaign(campaign.id, input, scope) : createCampaign(input, scope);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: realtyMarketingKeys.all });
      enqueueSnackbar(campaign ? t("marketing.form.saved") : t("marketing.form.created"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => save.reset(), [editing]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  // Канал из старых данных, которого нет в списке, — не теряем.
  const sources = campaign && campaign.source && !(LEAD_SOURCES as readonly string[]).includes(campaign.source) ? [...LEAD_SOURCES, campaign.source] : [...LEAD_SOURCES];
  return (
    <Drawer
      anchor="right"
      open={editing != null}
      onClose={save.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.1rem" }}>
          {campaign ? t("marketing.form.editTitle", { name: campaign.name }) : t("marketing.form.newTitle")}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={save.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box component="form" id="campaign-form" noValidate onSubmit={handleSubmit((form) => save.mutate(form))} sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, alignContent: "start" }}>
        <Controller
          control={control}
          name="name"
          rules={{ validate: (v) => (v ?? "").trim() !== "" || t("marketing.form.required") }}
          render={({ field, fieldState }) => (
            <TextField {...field} value={field.value ?? ""} size="small" required label={t("marketing.form.name")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
          )}
        />
        <Controller
          control={control}
          name="source"
          rules={{ validate: (v) => Boolean(v) || t("marketing.form.required") }}
          render={({ field }) => (
            <TextField {...field} value={field.value ?? ""} select size="small" required label={t("marketing.form.source")} helperText={t("marketing.form.sourceHint")}>
              {sources.map((source) => (
                <MenuItem key={source} value={source}>
                  {source}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="budget"
          rules={{ validate: (v) => ((v ?? "").trim() !== "" && parseAmount(v) != null) || t("marketing.form.number") }}
          render={({ field, fieldState }) => (
            <TextField {...field} value={field.value ?? ""} size="small" required inputMode="decimal" label={t("marketing.form.budget")} error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
          )}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <CustomDatePicker label={t("marketing.form.startDate")} value={field.value ?? null} onChange={(v) => field.onChange(v)} slotProps={{ textField: { size: "small", fullWidth: true, helperText: t("marketing.form.startHint") } }} />
            )}
          />
          <Controller
            control={control}
            name="endDate"
            rules={{
              validate: (end) => {
                const start = getValues("startDate");
                return !end || !start || !end.isBefore(start, "day") || t("marketing.form.endBeforeStart");
              },
            }}
            render={({ field, fieldState }) => (
              <CustomDatePicker
                label={t("marketing.form.endDate")}
                value={field.value ?? null}
                onChange={(v) => field.onChange(v)}
                slotProps={{ textField: { size: "small", fullWidth: true, error: Boolean(fieldState.error), helperText: fieldState.error?.message ?? t("marketing.form.endHint") } }}
              />
            )}
          />
        </Box>
        <Controller
          control={control}
          name="note"
          render={({ field }) => <TextField {...field} value={field.value ?? ""} size="small" multiline minRows={2} label={t("marketing.form.note")} helperText={t("marketing.form.noteHint")} />}
        />
        {save.isError && <Alert severity="error">{save.error instanceof Error && save.error.message ? save.error.message : t("common.failed")}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={save.isPending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form="campaign-form" variant="contained" disabled={save.isPending}>
          {campaign ? t("marketing.form.save") : t("marketing.form.create")}
        </Button>
      </Box>
    </Drawer>
  );
}
