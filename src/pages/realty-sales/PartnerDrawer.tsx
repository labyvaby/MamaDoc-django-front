import React from "react";
import { Alert, Box, Button, Divider, Drawer, IconButton, Rating, Skeleton, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PauseCircleOutlined from "@mui/icons-material/PauseCircleOutlined";
import PercentOutlined from "@mui/icons-material/PercentOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";

import { getRealEstateProjects, realEstateKeys } from "../../api/realestate";
import { getCommissions, getPartner, getPartnerLeads, getPartners, realtyPartnerKeys, togglePartner, type Partner } from "../../api/realtyPartners";
import { useCan } from "../../hooks/useCan";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { PartnerLeadDrawer, RatesDrawer } from "./PartnerForms";
import { CommissionsTable, PartnerLeadsTable } from "./PartnerTables";

/**
 * Карточка партнёра — шторка `?partner=<id>`: контакты, агенты, деньги,
 * ставки по ЖК, лиды и комиссии партнёра (только видимые по филиалу).
 * «Изменить ставки», пауза и «＋ Лид» — `realty.manage`.
 */
export function PartnerDrawer({ partnerId, onClose }: { partnerId: number | null; onClose: () => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("realty.manage");
  const [ratesFor, setRatesFor] = React.useState<Partner | null>(null);
  const [leadOpen, setLeadOpen] = React.useState(false);
  const open = partnerId != null;
  const enabled = open && scope.orgReady !== false;

  React.useEffect(() => {
    setRatesFor(null);
    setLeadOpen(false);
  }, [partnerId]);

  const partner = useQuery({ queryKey: realtyPartnerKeys.detail(scope, partnerId ?? 0), queryFn: ({ signal }) => getPartner(partnerId as number, scope, signal), enabled, staleTime: 15_000 });
  const leads = useQuery({ queryKey: realtyPartnerKeys.leads(scope, partnerId), queryFn: ({ signal }) => getPartnerLeads(partnerId, scope, signal), enabled, staleTime: 30_000 });
  const commissions = useQuery({ queryKey: realtyPartnerKeys.commissions(scope, partnerId), queryFn: ({ signal }) => getCommissions(partnerId, scope, signal), enabled, staleTime: 30_000 });
  const projects = useQuery({ queryKey: realEstateKeys.projects(scope), queryFn: () => getRealEstateProjects(scope), enabled, staleTime: 5 * 60_000 }).data;
  // Для формы лида — весь список (выбор партнёра в ней не нужен, но форма общая).
  const allPartners = useQuery({ queryKey: realtyPartnerKeys.list(scope), queryFn: ({ signal }) => getPartners(scope, signal), enabled: enabled && canManage, staleTime: 30_000 }).data;

  const refresh = (fresh?: Partner) => {
    if (fresh) queryClient.setQueryData(realtyPartnerKeys.detail(scope, fresh.id), fresh);
    void queryClient.invalidateQueries({ queryKey: realtyPartnerKeys.all });
  };
  const toggle = useMutation({
    mutationFn: () => togglePartner(partnerId as number, scope),
    onSuccess: (fresh) => {
      refresh(fresh);
      enqueueSnackbar(fresh.status === "paused" ? t("partners.drawer.paused") : t("partners.drawer.activated"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" }),
  });

  const data = partner.data;
  const projectName = (id: string) => projects?.find((p) => p.id === id)?.name ?? t("partners.drawer.projectFallback", { id });
  const rates = data ? Object.entries(data.commission) : [];

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: "100vw", sm: 720 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
      >
        <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{data ? [data.number, data.typeLabel].filter(Boolean).join(" · ") : t("partners.drawer.title")}</Typography>
            {data ? (
              <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.2rem" }}>
                {data.name}
              </Typography>
            ) : (
              <Skeleton width={240} height={32} />
            )}
            {data?.rating != null && <Rating value={data.rating} precision={0.1} readOnly size="small" />}
          </Box>
          <IconButton aria-label={t("common.close")} onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gap: 2.25, alignContent: "start" }}>
          {partner.isError && <Alert severity="error">{partner.error instanceof Error ? partner.error.message : t("partners.loadError")}</Alert>}
          {!data && !partner.isError && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={56} />)}
          {data && (
            <>
              {data.status === "paused" && <Alert severity="warning">{t("partners.drawer.paused")}</Alert>}
              <Box sx={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", rowGap: 0.75, columnGap: 1.5 }}>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("partners.drawer.contact")}</Typography>
                <Typography sx={{ fontSize: "0.875rem" }}>{data.contact || "—"}</Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("partners.drawer.phone")}</Typography>
                <Typography sx={{ fontSize: "0.875rem" }}>
                  {data.phone ? (
                    <Box component="a" href={`tel:${data.phone}`} sx={{ color: "primary.main", textDecoration: "none" }}>
                      {formatPhoneDisplay(data.phone)}
                    </Box>
                  ) : (
                    "—"
                  )}
                </Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("partners.drawer.agents")}</Typography>
                <Typography sx={{ fontSize: "0.875rem" }}>{data.agents.join(", ") || "—"}</Typography>
              </Box>

              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" } }}>
                {(
                  [
                    ["revenue", data.revenue, null],
                    ["commissionTotal", data.commissionTotal, null],
                    ["commissionPaid", data.commissionPaid, "success.main"],
                    ["toPay", data.toPay, data.toPay > 0 ? "warning.main" : null],
                  ] as const
                ).map(([key, value, color]) => (
                  <Box key={key} sx={{ px: 1.25, py: 1, border: 1, borderColor: "divider", borderRadius: "10px", minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {t(`partners.drawer.${key}`)}
                    </Typography>
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.95rem", color: color ?? "text.primary", fontVariantNumeric: "tabular-nums" }}>
                      {formatKGS(value)}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box>
                <Box sx={{ mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ flex: 1, fontWeight: 700, fontSize: "0.9rem" }}>{t("partners.drawer.rates")}</Typography>
                  {canManage && (
                    <Button size="small" startIcon={<PercentOutlined />} onClick={() => setRatesFor(data)}>
                      {t("partners.drawer.editRates")}
                    </Button>
                  )}
                </Box>
                {rates.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("partners.drawer.noRates")}</Typography>}
                {rates.map(([id, rate]) => (
                  <Box key={id} sx={{ py: 0.5, display: "flex", gap: 1, borderTop: 1, borderColor: "divider" }}>
                    <Typography sx={{ flex: 1, fontSize: "0.875rem" }}>{projectName(id)}</Typography>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{rate.toLocaleString("ru-RU")} %</Typography>
                  </Box>
                ))}
              </Box>

              <Divider />
              <Box>
                <Box sx={{ mb: 0.75, display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ flex: 1, fontWeight: 700, fontSize: "0.9rem" }}>{t("partners.drawer.leads")}</Typography>
                  {canManage && data.status !== "paused" && (
                    <Button size="small" startIcon={<AddOutlined />} onClick={() => setLeadOpen(true)}>
                      {t("partners.newLead")}
                    </Button>
                  )}
                </Box>
                <Box sx={{ border: 1, borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
                  <PartnerLeadsTable rows={leads.data ?? []} empty={t("partners.drawer.none")} hidePartner />
                </Box>
              </Box>
              <Box>
                <Typography sx={{ mb: 0.75, fontWeight: 700, fontSize: "0.9rem" }}>{t("partners.drawer.commissions")}</Typography>
                <Box sx={{ border: 1, borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
                  <CommissionsTable rows={commissions.data ?? []} empty={t("partners.drawer.none")} hidePartner />
                </Box>
              </Box>
            </>
          )}
        </Box>

        {canManage && data && (
          <Box sx={{ px: 2.5, py: 1.5, display: "flex", borderTop: 1, borderColor: "divider" }}>
            <Button
              color={data.status === "paused" ? "primary" : "warning"}
              startIcon={data.status === "paused" ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
              disabled={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {data.status === "paused" ? t("partners.drawer.activate") : t("partners.drawer.pause")}
            </Button>
          </Box>
        )}
      </Drawer>

      {canManage && (
        <>
          <RatesDrawer
            partner={ratesFor}
            onClose={() => setRatesFor(null)}
            onSaved={(fresh) => {
              setRatesFor(null);
              refresh(fresh);
              enqueueSnackbar(t("partners.toast.ratesSaved"), { variant: "success" });
            }}
          />
          <PartnerLeadDrawer
            open={leadOpen}
            partners={allPartners ?? (data ? [data] : [])}
            defaultPartnerId={partnerId}
            onClose={() => setLeadOpen(false)}
            onCreated={(lead) => {
              setLeadOpen(false);
              refresh();
              enqueueSnackbar(t("partners.toast.leadCreated", { number: lead.number }), { variant: "success" });
            }}
          />
        </>
      )}
    </>
  );
}
