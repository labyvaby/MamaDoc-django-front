import React from "react";
import { Box, Button, ButtonBase, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import AddOutlined from "@mui/icons-material/AddOutlined";
import PercentOutlined from "@mui/icons-material/PercentOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";

import { filterPositions, getEstimate, getEstimates, supplyKeys, type Estimate, type EstimatePosition } from "../../api/supply";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { cardSx } from "../estate-dashboard/format";
import { AmountBars, EmptyNote } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { AddEstimateItemDrawer, EstimateItemDrawer, ImportDialog, ReindexDialog } from "./EstimateForms";
import { compactSum, fullDate } from "./format";
import { ProgressBar } from "./shared";

/**
 * «Сметы» застройщика (AIVIO, гайд `frontend-construction.md` §6): по одной
 * смете на ЖК (`/estimates/`, чипы `?project=`), позиции по разделам с поиском
 * и фильтром на клиенте, структура и версии сметы. Карточка позиции — `?item=`.
 * Кнопки — `supply.manage`.
 *
 * ⚠ «Сравнение с бюджетом» макета не сделано: бюджет ЖК живёт по статьям
 * казначейства, соответствие разделов сметы статьям бэк не описал.
 */
export default function EstimatesPage() {
  const { t } = useT("construction");
  usePageTitle(t("smeta.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <EstimatesScreen />
    </Box>
  );
}

const qty = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function EstimatesScreen() {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const canManage = useCan("supply.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [itemId, openItem] = useIdParam("item");
  const [search, setSearch] = React.useState("");
  const [section, setSection] = React.useState("");
  const [dialog, setDialog] = React.useState<"add" | "index" | "import" | null>(null);
  const enabled = scope.orgReady !== false;

  const list = useQuery({ queryKey: supplyKeys.estimates(scope), queryFn: ({ signal }) => getEstimates(scope, signal), enabled, staleTime: 60_000 });
  const projectParam = Number(searchParams.get("project")) || null;
  const current = list.data?.find((e) => e.projectId === projectParam) ?? list.data?.[0] ?? null;
  const detail = useQuery({
    queryKey: supplyKeys.estimate(scope, current?.id ?? 0),
    queryFn: ({ signal }) => getEstimate(current?.id as number, scope, signal),
    enabled: enabled && current != null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  React.useEffect(() => setSection(""), [current?.id]);

  const select = (projectId: number) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("project", String(projectId));
        next.delete("item");
        return next;
      },
      { replace: true },
    );

  const error = list.error ?? detail.error;
  if (error) {
    return (
      <ScreenError
        error={error}
        title={t("smeta.loadError")}
        onRetry={() => {
          void list.refetch();
          void detail.refetch();
        }}
      />
    );
  }

  const e: Estimate | null = detail.data && detail.data.id === current?.id ? detail.data : (current ?? null);
  const positions = e ? filterPositions(e.positions, search, section) : [];
  const groups = e
    ? e.sections
        .filter((s) => !section || s.name === section)
        .map((s) => ({ section: s, items: positions.filter((p) => p.section === s.name) }))
        .filter((g) => g.items.length > 0 || (!search.trim() && !section))
    : [];
  // Позиции без раздела из `sections[]` (бэк не должен такое отдавать — но не терять).
  const known = new Set(e?.sections.map((s) => s.name) ?? []);
  const orphans = positions.filter((p) => !known.has(p.section));

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>
          {t("smeta.subtitle")}
          {e ? ` · ${t("smeta.version", { version: e.version, date: fullDate(e.updated) })}${e.index ? ` · ${t("smeta.indexed", { index: e.index.toLocaleString("ru-RU") })}` : ""}` : ""}
        </Typography>
        {canManage && e && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button size="small" startIcon={<UploadFileOutlined />} onClick={() => setDialog("import")} sx={{ whiteSpace: "nowrap" }}>
              {t("smeta.import")}
            </Button>
            <Button size="small" variant="outlined" startIcon={<PercentOutlined />} onClick={() => setDialog("index")} sx={{ whiteSpace: "nowrap" }}>
              {t("smeta.reindex")}
            </Button>
            <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setDialog("add")} sx={{ whiteSpace: "nowrap" }}>
              {t("smeta.addItem")}
            </Button>
          </Box>
        )}
      </Box>

      <Box sx={{ mb: 1.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
        {!list.data && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} variant="rounded" width={150} height={32} sx={{ borderRadius: "9px" }} />)}
        {list.data?.map((est) => (
          <ButtonBase key={est.id} aria-pressed={est.id === current?.id} onClick={() => select(est.projectId)} sx={(th) => ({ ...pillSx(th, est.id === current?.id), whiteSpace: "nowrap" })}>
            {est.projectName}
          </ButtonBase>
        ))}
      </Box>
      {list.data && list.data.length === 0 && (
        <Box sx={cardSx}>
          <EmptyNote text={t("smeta.empty")} />
        </Box>
      )}

      {current && (
        <KpiCards
          items={
            e
              ? [
                  { key: "total", label: t("smeta.kpi.total"), value: compactSum(e.total, t), hint: t("smeta.kpi.positions", { count: e.positionsCount }) },
                  { key: "done", label: t("smeta.kpi.done"), value: `${e.donePct.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`, hint: compactSum(e.done, t), tone: "success" },
                  { key: "remaining", label: t("smeta.kpi.remaining"), value: compactSum(e.remaining, t) },
                  { key: "version", label: t("smeta.kpi.version"), value: String(e.version), hint: e.updated ? t("smeta.kpi.versionHint", { date: fullDate(e.updated) }) : null },
                ]
              : null
          }
        />
      )}

      {e && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" }, alignItems: "start" }}>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
              <TextField
                select
                size="small"
                value={section}
                onChange={(ev) => setSection(ev.target.value)}
                SelectProps={{ displayEmpty: true }}
                sx={{ minWidth: 200, "& .MuiInputBase-root": { height: 32, fontSize: "0.875rem" } }}
                inputProps={{ "aria-label": t("smeta.allSections") }}
              >
                <MenuItem value="">{t("smeta.allSections")}</MenuItem>
                {e.sections.map((s) => (
                  <MenuItem key={s.name} value={s.name}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
              <SearchBox value={search} onChange={setSearch} placeholder={t("smeta.search")} />
            </Box>
            <Box sx={{ ...cardSx, overflow: "hidden" }}>
              {groups.length === 0 && orphans.length === 0 ? (
                <EmptyNote text={search.trim() || section ? t("common.emptyFiltered") : t("common.empty")} />
              ) : (
                <Box sx={{ overflowX: "auto" }}>
                  <Box
                    component="table"
                    sx={{
                      width: "100%",
                      minWidth: 820,
                      borderCollapse: "collapse",
                      "& td, & th": { px: 1.25, py: 0.9, fontSize: "0.8125rem", borderTop: 1, borderColor: "divider", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
                      "& th": { fontWeight: 600, color: "text.secondary", borderTop: 0 },
                      "& td:nth-of-type(2), & th:nth-of-type(2)": { textAlign: "left", whiteSpace: "normal" },
                      "& td:first-of-type, & th:first-of-type": { pl: 2, textAlign: "left" },
                    }}
                  >
                    <thead>
                      <tr>
                        <th>{t("smeta.table.code")}</th>
                        <th>{t("smeta.table.name")}</th>
                        <th>{t("smeta.table.qty")}</th>
                        <th>{t("smeta.table.price")}</th>
                        <th>{t("smeta.table.amount")}</th>
                        <Box component="th" sx={{ width: 130 }}>
                          {t("smeta.table.done")}
                        </Box>
                        <th>{t("smeta.table.remaining")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g) => (
                        <React.Fragment key={g.section.name}>
                          <Box component="tr" sx={(th) => ({ bgcolor: th.palette.action.hover })}>
                            <Box component="td" colSpan={4} sx={{ fontWeight: 700 }}>
                              {t("smeta.table.section", { name: g.section.name, count: g.section.positions })}
                            </Box>
                            <Box component="td" sx={{ fontWeight: 700 }}>
                              {formatKGS(g.section.total)}
                            </Box>
                            <td>{g.section.donePct.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</td>
                            <td>{formatKGS(g.section.total - g.section.done)}</td>
                          </Box>
                          {g.items.map((p) => (
                            <PositionRow key={p.id} p={p} onOpen={() => openItem(p.id)} />
                          ))}
                        </React.Fragment>
                      ))}
                      {orphans.map((p) => (
                        <PositionRow key={p.id} p={p} onOpen={() => openItem(p.id)} />
                      ))}
                    </tbody>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
            <Box sx={{ ...cardSx, minWidth: 0 }}>
              <CardHeader title={t("smeta.structure")} subtitle={formatKGS(e.total)} />
              <AmountBars empty={t("common.empty")} items={e.sections.map((s) => ({ key: s.name, label: s.name, amount: s.total, hint: `${s.donePct.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` }))} />
            </Box>
            <Box sx={{ ...cardSx, minWidth: 0 }}>
              <CardHeader title={t("smeta.versions")} />
              <Box sx={{ px: 2.25, pb: 1.5 }}>
                {e.versions.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>—</Typography>}
                {e.versions.map((v) => (
                  <Box key={v.version} sx={{ py: 0.9, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                      <Typography sx={{ flex: 1, fontSize: "0.8125rem", fontWeight: 700 }}>
                        v{v.version}
                        {v.current ? ` · ${t("smeta.current")}` : ""}
                      </Typography>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{compactSum(v.total, t)}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{v.reason || v.title}</Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{[fullDate(v.date), v.by].filter(Boolean).join(" · ")}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      <EstimateItemDrawer id={itemId} preview={e?.positions.find((p) => p.id === itemId) ?? null} projectId={e?.projectId ?? null} canManage={canManage} onClose={() => openItem(null)} />
      <AddEstimateItemDrawer estimate={e} open={dialog === "add"} onClose={() => setDialog(null)} />
      <ReindexDialog estimate={e} open={dialog === "index"} onClose={() => setDialog(null)} />
      <ImportDialog estimate={e} open={dialog === "import"} onClose={() => setDialog(null)} />
    </>
  );
}

function PositionRow({ p, onOpen }: { p: EstimatePosition; onOpen: () => void }) {
  return (
    <Box component="tr" onClick={onOpen} sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
      <Box component="td" sx={{ color: "text.secondary" }}>
        {p.code}
      </Box>
      <td>{p.name}</td>
      <td>
        {qty(p.qty)} {p.unit}
      </td>
      <td>{formatKGS(p.price)}</td>
      <Box component="td" sx={{ fontWeight: 600 }}>
        {formatKGS(p.amount)}
      </Box>
      <td>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <ProgressBar value={p.donePct} />
          </Box>
          <Box component="span" sx={{ width: 36 }}>
            {p.donePct}%
          </Box>
        </Box>
      </td>
      <td>{formatKGS(p.remaining)}</td>
    </Box>
  );
}
