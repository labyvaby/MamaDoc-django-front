import React from "react";
import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Rating, Skeleton, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";

import {
  COMMISSION_STATUSES,
  PARTNER_LEAD_STATUSES,
  downloadCommissionsCsv,
  getCommissions,
  getPartnerLeads,
  getPartners,
  getPartnersSummary,
  payAllCommissions,
  rateRange,
  realtyPartnerKeys,
  type Partner,
} from "../../api/realtyPartners";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { cardSx, compactMoney } from "../estate-dashboard/format";
import { initials } from "./format";
import { NewPartnerDrawer, PartnerLeadDrawer } from "./PartnerForms";
import { PartnerDrawer } from "./PartnerDrawer";
import { CommissionsTable, PartnerLeadsTable } from "./PartnerTables";
import { KpiCards, ScreenError } from "./shared";
import { useIdParam } from "./useLeadParam";

type Tab = "partners" | "leads" | "commissions";

/**
 * «Риелторы и партнёры» застройщика (AIVIO, гайд `frontend-sales.md` §9):
 * KPI — `/partners/summary/`, вкладки партнёров, их лидов и комиссий (срезы
 * по статусу на клиенте), карточка партнёра — шторка `?partner=<id>`.
 * Менять — `realty.manage`.
 */
export default function RealtyPartnersPage() {
  const { t } = useT("realtySales");
  usePageTitle(t("partners.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <PartnersScreen />
    </Box>
  );
}

function PartnersScreen() {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("realty.manage");
  const [partnerId, openPartner] = useIdParam("partner");
  const [tab, setTab] = React.useState<Tab>("partners");
  const [partnerStatus, setPartnerStatus] = React.useState<"all" | "active" | "paused">("all");
  const [leadStatus, setLeadStatus] = React.useState<string>("all");
  const [commissionStatus, setCommissionStatus] = React.useState<string>("all");
  const [newPartner, setNewPartner] = React.useState(false);
  const [newLead, setNewLead] = React.useState(false);
  const [confirmPayAll, setConfirmPayAll] = React.useState(false);
  const enabled = scope.orgReady !== false;

  const summary = useQuery({ queryKey: realtyPartnerKeys.summary(scope), queryFn: ({ signal }) => getPartnersSummary(scope, signal), enabled, staleTime: 30_000 });
  const partners = useQuery({ queryKey: realtyPartnerKeys.list(scope), queryFn: ({ signal }) => getPartners(scope, signal), enabled, staleTime: 30_000 });
  const leads = useQuery({ queryKey: realtyPartnerKeys.leads(scope, null), queryFn: ({ signal }) => getPartnerLeads(null, scope, signal), enabled, staleTime: 30_000 });
  const commissions = useQuery({ queryKey: realtyPartnerKeys.commissions(scope, null), queryFn: ({ signal }) => getCommissions(null, scope, signal), enabled, staleTime: 30_000 });

  const exportCsv = useMutation({ mutationFn: () => downloadCommissionsCsv(scope), onError: () => enqueueSnackbar(t("partners.exportFailed"), { variant: "error" }) });
  const payAll = useMutation({
    mutationFn: () => payAllCommissions(scope),
    onSuccess: (result) => {
      setConfirmPayAll(false);
      void queryClient.invalidateQueries({ queryKey: realtyPartnerKeys.all });
      enqueueSnackbar(result.count ? t("partners.payAllDone", { count: result.count, total: formatKGS(result.total) }) : t("partners.payAllNone"), { variant: result.count ? "success" : "info" });
    },
    onError: (error) => {
      setConfirmPayAll(false);
      enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });
    },
  });

  const error = partners.error ?? summary.error;
  if (error) {
    return (
      <ScreenError
        error={error}
        title={t("partners.loadError")}
        onRetry={() => {
          void partners.refetch();
          void summary.refetch();
        }}
      />
    );
  }

  const s = summary.data;
  const approved = (commissions.data ?? []).filter((c) => c.status === "approved");
  const approvedTotal = approved.reduce((sum, c) => sum + c.commission, 0);
  const counts = { partners: partners.data?.length, leads: leads.data?.length, commissions: commissions.data?.length };

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("partners.subtitle")}</Typography>
      <KpiCards
        items={
          s
            ? [
                { key: "partners", label: t("partners.kpi.partners"), value: String(s.partners), hint: t("partners.kpi.agents", { count: s.agents }) },
                { key: "leads", label: t("partners.kpi.leads"), value: String(s.partnerLeads), hint: t("partners.kpi.leadsMonth", { count: s.partnerLeadsMonth }) },
                { key: "share", label: t("partners.kpi.share"), value: `${s.partnerSalesShare.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`, hint: t("partners.kpi.shareHint") },
                {
                  key: "toPay",
                  label: t("partners.kpi.toPay"),
                  value: compactMoney(s.toPay, t),
                  hint: t("partners.kpi.approved", { count: s.approvedCount }),
                  tone: s.toPay > 0 ? "warning" : null,
                },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.5, pr: 0.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
        {(["partners", "leads", "commissions"] as const).map((key) => (
          <ButtonBase key={key} aria-pressed={tab === key} onClick={() => setTab(key)} sx={(th) => ({ ...pillSx(th, tab === key), whiteSpace: "nowrap" })}>
            {t(`partners.tabs.${key}`)}
            {counts[key] != null ? ` · ${counts[key]}` : ""}
          </ButtonBase>
        ))}
        <Box sx={{ ml: { md: "auto" }, display: "flex", gap: 1, flexWrap: "wrap" }}>
          {tab === "commissions" && (
            <Button variant="outlined" size="small" startIcon={<FileDownloadOutlined />} disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()} sx={{ whiteSpace: "nowrap" }}>
              {t("partners.export")}
            </Button>
          )}
          {tab === "commissions" && canManage && (
            <Button variant="contained" size="small" startIcon={<PaymentsOutlined />} disabled={approved.length === 0} onClick={() => setConfirmPayAll(true)} sx={{ whiteSpace: "nowrap" }}>
              {t("partners.payAll")}
            </Button>
          )}
          {tab === "leads" && canManage && (
            <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setNewLead(true)} sx={{ whiteSpace: "nowrap" }}>
              {t("partners.newLead")}
            </Button>
          )}
          {tab === "partners" && canManage && (
            <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setNewPartner(true)} sx={{ whiteSpace: "nowrap" }}>
              {t("partners.newPartner")}
            </Button>
          )}
        </Box>
      </Box>

      {tab === "partners" && (
        <>
          <SubPills
            value={partnerStatus}
            onChange={(v) => setPartnerStatus(v as typeof partnerStatus)}
            options={(["all", "active", "paused"] as const).map((key) => ({
              key,
              label: key === "all" ? t("partners.statusAll") : t(`partners.partnerStatus.${key}`),
              count: partners.data ? (key === "all" ? partners.data.length : partners.data.filter((p) => p.status === key).length) : null,
            }))}
          />
          {!partners.data ? (
            <Skeleton variant="rounded" height={200} />
          ) : (
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" } }}>
              {partners.data
                .filter((p) => partnerStatus === "all" || p.status === partnerStatus)
                .map((partner) => (
                  <PartnerCard key={partner.id} partner={partner} onOpen={() => openPartner(partner.id)} />
                ))}
            </Box>
          )}
        </>
      )}
      {tab === "leads" && (
        <>
          <SubPills
            value={leadStatus}
            onChange={setLeadStatus}
            options={(["all", ...PARTNER_LEAD_STATUSES] as const).map((key) => ({
              key,
              label: key === "all" ? t("partners.statusAll") : t(`partners.leadStatus.${key}`),
              count: leads.data ? (key === "all" ? leads.data.length : leads.data.filter((l) => l.status === key).length) : null,
            }))}
          />
          <Box sx={{ ...cardSx, overflow: "hidden" }}>
            <PartnerLeadsTable
              rows={(leads.data ?? []).filter((l) => leadStatus === "all" || l.status === leadStatus)}
              empty={leadStatus === "all" ? t("partners.table.emptyLeads") : t("partners.table.emptyFiltered")}
            />
          </Box>
        </>
      )}
      {tab === "commissions" && (
        <>
          <SubPills
            value={commissionStatus}
            onChange={setCommissionStatus}
            options={(["all", ...COMMISSION_STATUSES] as const).map((key) => ({
              key,
              label: key === "all" ? t("partners.statusAll") : t(`partners.commissionStatus.${key}`),
              count: commissions.data ? (key === "all" ? commissions.data.length : commissions.data.filter((c) => c.status === key).length) : null,
            }))}
          />
          <Box sx={{ ...cardSx, overflow: "hidden" }}>
            <CommissionsTable
              rows={(commissions.data ?? []).filter((c) => commissionStatus === "all" || c.status === commissionStatus)}
              empty={commissionStatus === "all" ? t("partners.table.emptyCommissions") : t("partners.table.emptyFiltered")}
            />
          </Box>
        </>
      )}

      <PartnerDrawer partnerId={partnerId} onClose={() => openPartner(null)} />
      {canManage && (
        <>
          <NewPartnerDrawer
            open={newPartner}
            onClose={() => setNewPartner(false)}
            onCreated={(partner) => {
              setNewPartner(false);
              void queryClient.invalidateQueries({ queryKey: realtyPartnerKeys.all });
              enqueueSnackbar(t("partners.toast.created"), { variant: "success" });
              openPartner(partner.id);
            }}
          />
          <PartnerLeadDrawer
            open={newLead}
            partners={partners.data ?? []}
            defaultPartnerId={null}
            onClose={() => setNewLead(false)}
            onCreated={(lead) => {
              setNewLead(false);
              void queryClient.invalidateQueries({ queryKey: realtyPartnerKeys.all });
              enqueueSnackbar(t("partners.toast.leadCreated", { number: lead.number }), { variant: "success" });
            }}
          />
        </>
      )}
      <Dialog open={confirmPayAll} onClose={payAll.isPending ? undefined : () => setConfirmPayAll(false)} maxWidth={false} PaperProps={{ sx: { width: 440, maxWidth: "calc(100vw - 32px)" } }}>
        <DialogTitle>{t("partners.payAllTitle")}</DialogTitle>
        <DialogContent>
          <Typography>{t("partners.payAllText", { count: approved.length, total: formatKGS(approvedTotal) })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmPayAll(false)} disabled={payAll.isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="contained" disabled={payAll.isPending} onClick={() => payAll.mutate()}>
            {t("partners.table.pay")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function SubPills({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { key: string; label: string; count: number | null }[] }) {
  return (
    <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
      {options.map(({ key, label, count }) => (
        <ButtonBase
          key={key}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          sx={(th) => ({
            px: 1.25,
            py: 0.4,
            borderRadius: "8px",
            fontSize: "0.8125rem",
            whiteSpace: "nowrap",
            color: value === key ? "text.primary" : "text.secondary",
            fontWeight: value === key ? 700 : 500,
            bgcolor: value === key ? subtleBg(th, true) : "transparent",
          })}
        >
          {label}
          {count != null ? ` · ${count}` : ""}
        </ButtonBase>
      ))}
    </Box>
  );
}

function PartnerCard({ partner, onOpen }: { partner: Partner; onOpen: () => void }) {
  const { t } = useT("realtySales");
  const paused = partner.status === "paused";
  return (
    <ButtonBase onClick={onOpen} sx={{ ...cardSx, p: 2, display: "grid", gap: 1.25, textAlign: "left", alignContent: "start", minWidth: 0, opacity: paused ? 0.7 : 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
        <Box
          aria-hidden
          sx={(th) => ({ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "0.75rem", fontWeight: 700, bgcolor: subtleBg(th, true), color: "text.secondary" })}
        >
          {initials(partner.name.replace(/[«»"]/g, ""))}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
            {partner.name}
          </Typography>
          <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {[partner.typeLabel, partner.agents.length ? t("partners.card.agents", { count: partner.agents.length }) : null].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
        {paused && (
          <Box component="span" sx={(th) => ({ px: 0.9, py: 0.2, borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600, color: "text.secondary", bgcolor: subtleBg(th, true) })}>
            {t("partners.card.paused")}
          </Box>
        )}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
        {(
          [
            ["leads", String(partner.leads)],
            ["deals", String(partner.deals)],
            ["commission", partner.commissionTotal > 0 ? compactMoney(partner.commissionTotal, t) : "0"],
            ["rate", rateRange(partner)],
          ] as const
        ).map(([key, value]) => (
          <Box key={key} sx={{ px: 1.25, py: 0.75, border: 1, borderColor: "divider", borderRadius: "10px", minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
              {t(`partners.card.${key}`)}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {partner.rating != null ? <Rating value={partner.rating} precision={0.1} readOnly size="small" /> : <span />}
        <Typography sx={{ ml: "auto", fontSize: "0.75rem", fontWeight: 600, color: partner.hasUnpaid ? "warning.main" : "success.main" }}>
          {partner.hasUnpaid ? t("partners.card.unpaid") : t("partners.card.settled")}
        </Typography>
      </Box>
    </ButtonBase>
  );
}
