import React from "react";
import { Alert, Box, Button, Skeleton, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";

import { COMPANY_FIELDS, estateSettingsKeys, getCompany, getDictionaries, updateCompany, type CompanyDetails, type CompanyField, type Dictionary, type DictionaryItem } from "../../api/estateSettings";
import { useCanChecker } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { cardSx } from "../estate-dashboard/format";
import { EmptyNote, FormDrawer, InfoRow, PillTabs } from "../realty-finance/shared";
import { KpiCards, ScreenError } from "../realty-sales/shared";
import { errorMessage, useRefreshSettings, useSettingsCan } from "./hooks";
import { buildTableXlsx, downloadBlob } from "./xlsx";

type Cell = string | number | null;
interface Column {
  key: string;
  get: (item: DictionaryItem) => Cell;
  numeric?: boolean;
  flex?: number;
  width?: number;
}

const s = (value: unknown): string => (value == null ? "" : String(value));
const n = (value: unknown): number | null => (value == null || value === "" ? null : Number(value));
const pct = (value: unknown) => (value == null || value === "" ? null : `${s(value)}%`);

/** Колонки вкладок — по таблице гайда §3.1; неизвестный справочник — колонки из полей первой записи. */
const COLUMNS: Record<string, Column[]> = {
  projects: [
    { key: "name", get: (i) => s(i.name), flex: 1.2 },
    { key: "address", get: (i) => s(i.address), flex: 1.4 },
    { key: "className", get: (i) => s(i.className), width: 110 },
    { key: "floors", get: (i) => n(i.floors), numeric: true, width: 90 },
    { key: "sections", get: (i) => n(i.sections), numeric: true, width: 90 },
    { key: "units", get: (i) => n(i.units), numeric: true, width: 90 },
    { key: "deadline", get: (i) => s(i.deadlineLabel || i.deadline), width: 150 },
  ],
  docTypes: [
    { key: "name", get: (i) => s(i.name), flex: 1.2 },
    { key: "short", get: (i) => s(i.short), width: 120 },
    { key: "group", get: (i) => s(i.groupLabel || i.group), width: 140 },
    { key: "route", get: (i) => s(i.routeLabel), flex: 1.6 },
  ],
  budgetArticles: [
    { key: "id", get: (i) => s(i.id), width: 160 },
    { key: "name", get: (i) => s(i.name), flex: 1 },
  ],
  nomenclature: [
    { key: "code", get: (i) => s(i.code), width: 120 },
    { key: "name", get: (i) => s(i.name), flex: 1.4 },
    { key: "category", get: (i) => s(i.category), width: 140 },
    { key: "unit", get: (i) => s(i.unit), width: 70 },
    { key: "price", get: (i) => n(i.price), numeric: true, width: 130 },
    { key: "min", get: (i) => n(i.min), numeric: true, width: 120 },
  ],
  banks: [
    { key: "name", get: (i) => s(i.name), flex: 1 },
    { key: "rate", get: (i) => pct(i.mortgageRate), width: 100 },
    { key: "maxTerm", get: (i) => n(i.maxTerm), numeric: true, width: 100 },
    { key: "minDown", get: (i) => pct(i.minDown), width: 100 },
    { key: "approvalDays", get: (i) => n(i.approvalDays), numeric: true, width: 120 },
    { key: "partner", get: (i) => (i.partner ? "✓" : ""), width: 90 },
  ],
  contractors: [
    { key: "name", get: (i) => s(i.name), flex: 1.2 },
    { key: "inn", get: (i) => s(i.inn), width: 150 },
    { key: "spec", get: (i) => s(i.spec), flex: 1.2 },
    { key: "contact", get: (i) => [s(i.contact), i.phone ? formatPhoneDisplay(s(i.phone)) : ""].filter(Boolean).join(" · "), flex: 1.2 },
    { key: "rating", get: (i) => n(i.rating), numeric: true, width: 90 },
  ],
  suppliers: [
    { key: "name", get: (i) => s(i.name), flex: 1.2 },
    { key: "inn", get: (i) => s(i.inn), width: 150 },
    { key: "category", get: (i) => s(i.category), flex: 1 },
    { key: "terms", get: (i) => s(i.terms), flex: 1 },
    { key: "rating", get: (i) => n(i.rating), numeric: true, width: 90 },
  ],
  departments: [
    { key: "name", get: (i) => s(i.name), flex: 1 },
    { key: "head", get: (i) => s(i.head), flex: 1 },
    { key: "staffCount", get: (i) => n(i.staffCount), numeric: true, width: 120 },
    { key: "positions", get: (i) => (Array.isArray(i.positions) ? i.positions.join(", ") : s(i.positions)), flex: 1.6 },
  ],
};

/**
 * Где запись добавляется (гайд §3.1, `editEndpoint`) → наш экран-владелец и право кнопки.
 * Номенклатуры и банков ипотеки своих экранов в CRM пока нет — кнопки нет.
 */
const OWNERS: Record<string, { to: string; permission: string }> = {
  projects: { to: "/realestate/catalog", permission: "realty.catalog.manage" },
  docTypes: { to: "/edo/templates", permission: "edo.templates.manage" },
  contractors: { to: "/construction/contractors", permission: "construction.manage" },
  suppliers: { to: "/supply/procurement?tab=suppliers", permission: "supply.manage" },
  departments: { to: "/personnel/staff?tab=org", permission: "personnel.manage" },
};

const COMPANY = "company";

function columnsFor(dict: Dictionary): Column[] {
  if (COLUMNS[dict.key]) return COLUMNS[dict.key];
  const first = dict.items[0] ?? {};
  return Object.keys(first)
    .filter((key) => key !== "id" && (typeof first[key] === "string" || typeof first[key] === "number"))
    .slice(0, 6)
    .map((key) => ({ key, get: (i: DictionaryItem) => (typeof i[key] === "number" ? (i[key] as number) : s(i[key])), flex: 1 }));
}

/**
 * «Справочники» застройщика (AIVIO, гайд `frontend-settings.md` §3): вкладки
 * общих справочников только для чтения (`GET /dictionaries/`, вкладка — `?tab=`);
 * «Добавить» ведёт в раздел-владелец. Девятая вкладка — реквизиты компании
 * (`/company/`, правка — `integrations.manage`). Право экрана — `integrations.view`.
 */
export default function EstateDictionariesPage() {
  const { t } = useT("estateSettings");
  usePageTitle(t("dictionaries.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <DictionariesScreen />
    </Box>
  );
}

function DictionariesScreen() {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { can } = useCanChecker();
  const [searchParams, setSearchParams] = useSearchParams();
  const dicts = useQuery({ queryKey: estateSettingsKeys.dictionaries(scope), queryFn: ({ signal }) => getDictionaries(scope, signal), enabled: scope.orgReady !== false, staleTime: 5 * 60_000 });
  const exportXlsx = useMutation({
    mutationFn: async (dict: Dictionary) => {
      const columns = columnsFor(dict);
      const blob = await buildTableXlsx(
        dict.label,
        columns.map((c) => t(`dictionaries.col.${c.key}`, { defaultValue: c.key })),
        dict.items.map((item) => columns.map((c) => c.get(item))),
      );
      downloadBlob(blob, `${dict.key}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    },
    onError: () => enqueueSnackbar(t("dictionaries.exportFailed"), { variant: "error" }),
  });

  if (dicts.error) return <ScreenError error={dicts.error} title={t("common.loadError")} onRetry={() => void dicts.refetch()} />;
  const list = (dicts.data ?? []).filter((d) => d.available);
  const tabs = list.filter((d) => d.key !== COMPANY);
  const hasCompany = list.some((d) => d.key === COMPANY) || dicts.data != null;
  const tabParam = searchParams.get("tab");
  const active = tabParam === COMPANY && hasCompany ? COMPANY : (tabs.find((d) => d.key === tabParam)?.key ?? tabs[0]?.key ?? COMPANY);
  const dict = tabs.find((d) => d.key === active) ?? null;
  const owner = dict ? OWNERS[dict.key] : undefined;
  const canAdd = Boolean(dict?.editable && owner && can(owner.permission));

  const setTab = (key: string) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("tab", key);
        return p;
      },
      { replace: true },
    );

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("dictionaries.subtitle")}</Typography>
      <KpiCards items={dicts.data ? tabs.slice(0, 4).map((d) => ({ key: d.key, label: d.label, value: String(d.count) })) : null} />
      <Box sx={{ mb: 1.25, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          {dicts.data ? (
            <PillTabs<string>
              value={active}
              onChange={setTab}
              tabs={[...tabs.map((d) => ({ key: d.key, label: d.label, count: d.count })), ...(hasCompany ? [{ key: COMPANY, label: t("dictionaries.company.label") }] : [])]}
            />
          ) : (
            <Skeleton variant="rounded" height={32} width={480} />
          )}
        </Box>
        {dict && (
          <Box sx={{ display: "flex", gap: 1 }}>
            {canAdd && owner && (
              <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => navigate(owner.to)} sx={{ whiteSpace: "nowrap" }}>
                {t("dictionaries.add")}
              </Button>
            )}
            <Button size="small" variant="outlined" startIcon={<FileDownloadOutlined />} disabled={exportXlsx.isPending || dict.items.length === 0} onClick={() => exportXlsx.mutate(dict)} sx={{ whiteSpace: "nowrap" }}>
              {t("dictionaries.export")}
            </Button>
          </Box>
        )}
      </Box>

      {!dicts.data ? (
        <Skeleton variant="rounded" height={320} sx={{ borderRadius: "14px" }} />
      ) : active === COMPANY ? (
        <CompanyTab />
      ) : dict ? (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          {!dict.editable && <Typography sx={{ px: 2.25, pt: 1.5, fontSize: "0.75rem", color: "text.secondary" }}>{t("dictionaries.notEditable")}</Typography>}
          <DictionaryGrid dict={dict} />
        </Box>
      ) : (
        <EmptyNote text={t("common.empty")} />
      )}
    </>
  );
}

function DictionaryGrid({ dict }: { dict: Dictionary }) {
  const { t } = useT("estateSettings");
  const columns: GridColDef<DictionaryItem & { __rowId: string }>[] = columnsFor(dict).map((c) => ({
    field: c.key,
    headerName: t(`dictionaries.col.${c.key}`, { defaultValue: c.key }),
    flex: c.width ? undefined : (c.flex ?? 1),
    width: c.width,
    minWidth: c.width ? undefined : 140,
    type: c.numeric ? "number" : "string",
    valueGetter: (_value, row) => c.get(row),
    valueFormatter: c.key === "price" ? (value: number | null) => (value == null ? "" : formatKGS(value)) : undefined,
  }));
  const rows = dict.items.map((item, i) => ({ ...item, __rowId: `${s(item.id) || "row"}-${i}` }));
  return (
    <DataGrid
      rows={rows}
      columns={columns}
      getRowId={(row) => row.__rowId}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
      getRowHeight={() => "auto"}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      hideFooter={rows.length <= 100}
      initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
      pageSizeOptions={[100]}
      sx={{ border: 0, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center", py: 0.75 } }}
    />
  );
}

function CompanyTab() {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const perms = useSettingsCan();
  const [editOpen, setEditOpen] = React.useState(false);
  const company = useQuery({ queryKey: estateSettingsKeys.company(scope), queryFn: ({ signal }) => getCompany(scope, signal), enabled: scope.orgReady !== false, staleTime: 5 * 60_000 });
  if (company.error) return <ScreenError error={company.error} title={t("common.loadError")} onRetry={() => void company.refetch()} />;
  const c = company.data;
  return (
    <Box sx={{ ...cardSx, p: 2.25 }}>
      <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ flex: 1, fontWeight: 700 }}>{t("dictionaries.company.label")}</Typography>
        {perms.manage && c && (
          <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            {t("dictionaries.company.edit")}
          </Button>
        )}
      </Box>
      {!c ? (
        <Skeleton variant="rounded" height={240} />
      ) : (
        <>
          {!c.configured && (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              {t("dictionaries.company.notConfigured")}
            </Alert>
          )}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, columnGap: 4 }}>
            {COMPANY_FIELDS.map((field) => (
              <InfoRow key={field} label={t(`dictionaries.company.${field}`)} value={(field === "phone" && c.phone ? formatPhoneDisplay(c.phone) : c[field]) || "—"} />
            ))}
          </Box>
        </>
      )}
      {c && <CompanyDrawer open={editOpen} company={c} onClose={() => setEditOpen(false)} />}
    </Box>
  );
}

/** Правка реквизитов: `PATCH /company/` только изменёнными полями; ошибка поля — под полем (`details.fields`). */
function CompanyDrawer({ open, company, onClose }: { open: boolean; company: CompanyDetails; onClose: () => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const [values, setValues] = React.useState<Record<CompanyField, string>>(() => ({ ...company }));
  const save = useMutation({
    mutationFn: (body: Partial<Record<CompanyField, string>>) => updateCompany(body, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("common.saved"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setValues({ ...company });
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- значения берём при открытии
  const fieldErrors = fieldErrorsOf(save.error);
  const changed = COMPANY_FIELDS.filter((f) => values[f].trim() !== company[f]);
  return (
    <FormDrawer
      open={open}
      title={t("dictionaries.company.editTitle")}
      submitLabel={t("common.save")}
      busy={save.isPending}
      error={Object.keys(fieldErrors).length ? null : save.error}
      onClose={onClose}
      onSubmit={() => {
        if (changed.length === 0) {
          enqueueSnackbar(t("dictionaries.company.nothingChanged"), { variant: "info" });
          onClose();
          return;
        }
        save.mutate(Object.fromEntries(changed.map((f) => [f, values[f].trim()])));
      }}
    >
      {COMPANY_FIELDS.map((field) => (
        <TextField
          key={field}
          size="small"
          label={t(`dictionaries.company.${field}`)}
          value={values[field]}
          type={field === "email" ? "email" : "text"}
          multiline={field === "address" || field === "name"}
          onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
          error={Boolean(fieldErrors[field])}
          helperText={fieldErrors[field]}
        />
      ))}
      {save.error && Object.keys(fieldErrors).length > 0 && <Alert severity="error">{errorMessage(save.error, t("common.failed"))}</Alert>}
    </FormDrawer>
  );
}

/** `error.details.fields.<поле>` → текст под полем (общий контракт ошибок, гайд §0.5). */
function fieldErrorsOf(error: unknown): Record<string, string> {
  const details = (error as { details?: { fields?: Record<string, unknown> } } | null)?.details;
  const fields = details?.fields;
  if (!fields || typeof fields !== "object") return {};
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value.join(" ") : String(value)]));
}
