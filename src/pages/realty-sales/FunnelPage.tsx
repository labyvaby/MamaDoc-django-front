import React from "react";
import { Alert, Box, Button, ButtonBase, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import WhatshotOutlined from "@mui/icons-material/WhatshotOutlined";

import { ApiError, isModuleDisabled } from "../../api/client";
import { estateDashboardKeys } from "../../api/estateDashboard";
import {
  LEAD_STAGES,
  getLeads,
  getLeadsConversion,
  groupByStage,
  realtyLeadKeys,
  updateLead,
  type Lead,
  type LeadStage,
} from "../../api/realtyLeads";
import { Board, type BoardCardSpec, type BoardColumnDef } from "../../components/board";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { compactMoney } from "../estate-dashboard/format";
import { LeadDrawer } from "./LeadDrawer";
import { NewLeadDrawer } from "./NewLeadDrawer";
import { LeadsKpis, SearchBox } from "./shared";
import { useLeadParam } from "./useLeadParam";
import { tempColor } from "./format";

/**
 * «CRM · воронка» застройщика (AIVIO): канбан из 6 фиксированных этапов на
 * лидах `/api/v2/realty/leads/` (гайд `frontend-sales.md` §2). Перенос —
 * `PATCH {stage, position}`, карточка — шторка `?lead=<id>`. Смотреть —
 * `realty.view`, менять — `realty.manage`.
 */
export default function RealtyFunnelPage() {
  const { t } = useT("realtySales");
  usePageTitle(t("funnel.title"));
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <FunnelScreen />
    </Box>
  );
}

function FunnelScreen() {
  const { t } = useT("realtySales");
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const scope = useRealtyScope();
  const canManage = useCan("realty.manage");
  const [leadId, openLead] = useLeadParam();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [hot, setHot] = React.useState(false);
  const [managerId, setManagerId] = React.useState<number | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Менеджера фильтруем на клиенте: иначе при выборе одного пропали бы чипы остальных.
  const params = React.useMemo(() => ({ search: debouncedSearch, hot }), [debouncedSearch, hot]);
  const listKey = realtyLeadKeys.list(scope, params);
  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => getLeads(params, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const conversion = useQuery({
    queryKey: realtyLeadKeys.conversion(scope),
    queryFn: ({ signal }) => getLeadsConversion(scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const move = useMutation({
    mutationFn: ({ lead, stage, position }: { lead: Lead; stage: LeadStage; position: number }) => updateLead(lead.id, { stage, position }, scope),
    // Карточка встаёт в новую колонку сразу; при ошибке список перечитается.
    onMutate: ({ lead, stage, position }) => {
      queryClient.setQueryData<Lead[]>(listKey, (prev) => {
        if (!prev) return prev;
        const rest = prev.filter((x) => x.id !== lead.id);
        const column = rest.filter((x) => x.stage === stage).sort((a, b) => a.position - b.position);
        column.splice(position, 0, { ...lead, stage });
        const renumbered = new Map(column.map((x, i) => [x.id, i]));
        return [...rest.filter((x) => x.stage !== stage), ...column].map((x) => (renumbered.has(x.id) ? { ...x, position: renumbered.get(x.id) as number } : x));
      });
    },
    onSuccess: (fresh, { lead }) => {
      if (fresh.stage !== lead.stage) enqueueSnackbar(t("board.moved", { stage: fresh.stageName }), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("board.moveFailed"), { variant: "error" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: realtyLeadKeys.all });
      void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
    },
  });

  if (list.error) {
    const error = list.error;
    if (isModuleDisabled(error)) return <AccessDenied title={t("common.moduleOff")} description={t("common.moduleOffHint")} showBack={false} />;
    if (error instanceof ApiError && error.status === 403) return <AccessDenied />;
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void list.refetch()}>
            {t("common.retry")}
          </Button>
        }
      >
        {t("common.loadError")}: {error instanceof Error ? error.message : ""}
      </Alert>
    );
  }

  const all = list.data;
  const shown = all?.filter((lead) => managerId == null || lead.managerId === managerId);
  const columns = groupByStage(shown ?? []);
  const managers = [...new Map((all ?? []).filter((l) => l.managerId != null).map((l) => [l.managerId as number, l.manager ?? String(l.managerId)])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1], "ru"),
  );

  const boardColumns: BoardColumnDef<LeadStage>[] = LEAD_STAGES.map((stage) => {
    const items = columns[stage];
    return {
      id: stage,
      title: items[0]?.stageName || t(`stages.${stage}`),
      count: items.length,
      headerMeta: (
        <Typography variant="caption" color="text.secondary" noWrap>
          {compactMoney(
            items.reduce((sum, x) => sum + x.budget, 0),
            t,
          )}
        </Typography>
      ),
      loading: list.isLoading,
      emptyHint: t("board.emptyColumn"),
    };
  });

  const card = (lead: Lead): BoardCardSpec => ({
    ariaLabel: t("board.cardLabel", { name: lead.client }),
    alert: lead.overdue,
    actions: canManage
      ? LEAD_STAGES.filter((stage) => stage !== lead.stage).map((stage) => ({
          key: stage,
          label: t(`stages.${stage}`),
          onSelect: () => move.mutate({ lead, stage, position: 0 }),
        }))
      : undefined,
    actionsTooltip: t("board.moveTo"),
    onOpen: () => openLead(lead.id),
    content: <LeadCardBody lead={lead} />,
  });

  return (
    <>
      <Box sx={{ flexShrink: 0, pt: 0.5 }}>
        <Typography sx={{ mb: 1.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("funnel.subtitle")}</Typography>
        <LeadsKpis list={shown} conversion={conversion.data} />
        <Box sx={{ mb: 1.5, pr: 0.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
          <ButtonBase aria-pressed={managerId == null} onClick={() => setManagerId(null)} sx={(th) => ({ ...pillSx(th, managerId == null), whiteSpace: "nowrap" })}>
            {t("toolbar.team")}
          </ButtonBase>
          {managers.map(([id, name]) => (
            <ButtonBase key={id} aria-pressed={managerId === id} onClick={() => setManagerId(id)} sx={(th) => ({ ...pillSx(th, managerId === id), whiteSpace: "nowrap" })}>
              {name}
            </ButtonBase>
          ))}
          <ButtonBase aria-pressed={hot} onClick={() => setHot((v) => !v)} sx={(th) => ({ ...pillSx(th, hot), whiteSpace: "nowrap", gap: 0.5 })}>
            <WhatshotOutlined sx={{ fontSize: 16 }} />
            {t("toolbar.hotOnly")}
          </ButtonBase>
          <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
            <SearchBox value={search} onChange={setSearch} placeholder={t("toolbar.search")} />
            {canManage && (
              <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setCreateOpen(true)} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                {t("toolbar.newLead")}
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Board<Lead, LeadStage>
          columns={boardColumns}
          itemsOf={(stage) => columns[stage]}
          getItemId={(lead) => lead.id}
          columnOf={(lead) => ((LEAD_STAGES as readonly string[]).includes(lead.stage) ? (lead.stage as LeadStage) : "new")}
          canDrop={() => canManage}
          onDrop={(lead, stage, index) => move.mutate({ lead, stage, position: index })}
          card={card}
          dropHint={t("board.dropHint")}
        />
      </Box>

      <LeadDrawer leadId={leadId} onClose={() => openLead(null)} />
      {canManage && (
        <NewLeadDrawer
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(lead) => {
            setCreateOpen(false);
            openLead(lead.id);
          }}
        />
      )}
    </>
  );
}

function LeadCardBody({ lead }: { lead: Lead }) {
  const { t } = useT("realtySales");
  const theme = useTheme();
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Box aria-label={t(`temp.${lead.temp}`)} sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: tempColor(theme, lead.temp) }} />
        <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.875rem", flex: 1, minWidth: 0 }}>
          {lead.client}
        </Typography>
      </Box>
      {(lead.project || lead.projectName) && (
        <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {[lead.project, lead.projectName].filter(Boolean).join(" · ")}
        </Typography>
      )}
      <Box sx={{ mt: 0.75, display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", fontVariantNumeric: "tabular-nums" }}>{lead.budget > 0 ? compactMoney(lead.budget, t) : "—"}</Typography>
        <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary", flex: 1, minWidth: 0, textAlign: "right" }}>
          {lead.manager}
        </Typography>
      </Box>
      {lead.task && (
        <Typography noWrap sx={{ mt: 0.5, fontSize: "0.75rem", color: lead.overdue ? "error.main" : "text.secondary" }}>
          {lead.task}
        </Typography>
      )}
    </Box>
  );
}
