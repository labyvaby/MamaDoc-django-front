import React from "react";
import { Alert, Box, Button, ButtonBase, Drawer, IconButton, InputBase, MenuItem, Skeleton, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import AttachFileOutlined from "@mui/icons-material/AttachFileOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DrawOutlined from "@mui/icons-material/DrawOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";

import { ApiError, isModuleDisabled } from "../../api/client";
import { EDO_FILE_ACCEPT, EDO_FILE_MAX_BYTES, edoKeys } from "../../api/edo";
import { downloadProtectedFile } from "../../api/protectedFile";
import { getProjectUnits, getRealEstateProjects, realEstateKeys } from "../../api/realestate";
import {
  SALES_DOC_CHIPS,
  SALES_DOC_TYPES,
  getSalesDocsSummary,
  getSalesDocuments,
  salesDocsKeys,
  sendSalesDocumentToSign,
  uploadSalesDocument,
  type SalesDocChip,
  type SalesDocType,
  type SalesDocument,
} from "../../api/salesDocuments";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { CustomDatePicker, pillSx } from "../../components/ui";
import { useCanChecker } from "../../hooks/useCan";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu, formatKGS } from "../../utility/format";

const cardSx = { border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" } as const;

/** Тон статуса бэк присылает словом; приводим к палитре темы, незнакомое — нейтральное. */
function toneOf(t: Theme, color: string) {
  const key = color.toLowerCase();
  if (["green", "success", "emerald"].includes(key)) return t.palette.success;
  if (["orange", "amber", "warning", "yellow"].includes(key)) return t.palette.warning;
  if (["red", "error", "danger"].includes(key)) return t.palette.error;
  if (["blue", "info", "sky"].includes(key)) return t.palette.info;
  if (["violet", "purple"].includes(key)) return t.palette.purple;
  return null;
}

/**
 * «Документы (CRM)» — файлы сделок застройщика. Загрузка и «На подпись» —
 * `realty.manage`; подписанный в ЭДО документ сам становится «Подписан».
 */
export default function SalesDocumentsPage() {
  const { t } = useT("edo");
  usePageTitle(t("sales.title"));
  const theme = useTheme();
  const navigate = useNavigate();
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { can } = useCanChecker();
  const canManage = can("realty.manage");
  const canEdo = can("edo.view");
  const enabled = scope.orgReady !== false;

  const [chip, setChip] = React.useState<SalesDocChip>("all");
  const [search, setSearch] = React.useState("");
  const [from, setFrom] = React.useState<Dayjs | null>(null);
  const [to, setTo] = React.useState<Dayjs | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const params = React.useMemo(
    () => ({ chip, search: debouncedSearch, from: from ? from.format("YYYY-MM-DD") : null, to: to ? to.format("YYYY-MM-DD") : null }),
    [chip, debouncedSearch, from, to],
  );

  const summary = useQuery({ queryKey: salesDocsKeys.summary(scope), queryFn: ({ signal }) => getSalesDocsSummary(scope, signal), enabled, staleTime: 30_000 });
  const list = useQuery({
    queryKey: salesDocsKeys.list(scope, params),
    queryFn: ({ signal }) => getSalesDocuments(params, scope, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: salesDocsKeys.all });
    void queryClient.invalidateQueries({ queryKey: edoKeys.all });
  };
  const toSign = useMutation({
    mutationFn: (doc: SalesDocument) => sendSalesDocumentToSign(doc.id, scope),
    onSuccess: (doc) => {
      enqueueSnackbar(t("sales.toSignDone", { number: doc.edoNumber ?? "" }), { variant: "success" });
      refresh();
    },
    onError: (error) => enqueueSnackbar(error instanceof Error ? error.message : t("action.failed"), { variant: "error" }),
  });
  const download = async (doc: SalesDocument) => {
    if (!doc.fileUrl) return;
    try {
      await downloadProtectedFile(doc.fileUrl, doc.fileName, scope);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t("card.downloadFailed"), { variant: "error" });
    }
  };

  const columns = React.useMemo<GridColDef<SalesDocument>[]>(
    () => [
      {
        field: "name",
        headerName: t("sales.colName"),
        flex: 1.6,
        minWidth: 220,
        renderCell: ({ row }) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
              {row.name}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
              {[row.number, row.typeLabel, row.originLabel].filter(Boolean).join(" · ")}
            </Typography>
          </Box>
        ),
      },
      {
        field: "object",
        headerName: t("sales.colObject"),
        flex: 1,
        minWidth: 150,
        valueGetter: (_, row) => row.object || [row.projectName, row.unitNumber ? `№${row.unitNumber}` : null].filter(Boolean).join(" · ") || "—",
      },
      { field: "buyer", headerName: t("sales.colBuyer"), flex: 1, minWidth: 140, valueGetter: (_, row) => row.buyer || "—" },
      { field: "amount", headerName: t("sales.colAmount"), minWidth: 120, align: "right", headerAlign: "right", valueGetter: (_, row) => (row.amount ? formatKGS(row.amount) : "—") },
      { field: "date", headerName: t("sales.colDate"), minWidth: 110, valueGetter: (_, row) => row.dateLabel || formatDateRu(row.date) },
      {
        field: "status",
        headerName: t("sales.colStatus"),
        minWidth: 140,
        renderCell: ({ row }) => (
          <Box
            component="span"
            sx={(th) => {
              const tone = toneOf(th, row.statusColor);
              return {
                px: 1,
                py: 0.25,
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                color: tone ? tone.onSurface ?? tone.main : "text.secondary",
                bgcolor: tone ? alpha(tone.main, th.palette.mode === "dark" ? 0.18 : 0.1) : subtleBg(th, true),
              };
            }}
          >
            {row.statusLabel}
          </Box>
        ),
      },
      {
        field: "edo",
        headerName: t("sales.colEdo"),
        minWidth: 130,
        sortable: false,
        renderCell: ({ row }) =>
          row.edoNumber ? (
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                {row.edoNumber}
              </Typography>
              <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                {row.edoStatusLabel}
              </Typography>
            </Box>
          ) : (
            "—"
          ),
      },
      {
        field: "actions",
        headerName: "",
        minWidth: 130,
        sortable: false,
        align: "right",
        renderCell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.25 }}>
            <Tooltip title={row.fileUrl ? t("card.download") : t("sales.noFile")}>
              <span>
                <IconButton size="small" aria-label={t("card.download")} disabled={!row.fileUrl} onClick={() => void download(row)}>
                  <FileDownloadOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            {canManage && !row.edoDocumentId && (
              <Tooltip title={t("sales.toSign")}>
                <IconButton size="small" aria-label={t("sales.toSign")} disabled={toSign.isPending} onClick={() => toSign.mutate(row)}>
                  <DrawOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canEdo && row.edoDocumentId && (
              <Tooltip title={t("sales.openEdo")}>
                <IconButton size="small" aria-label={t("sales.openEdo")} onClick={() => navigate(`/edo?doc=${row.edoDocumentId}`)}>
                  <OpenInNewOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ),
      },
    ],
    // download и toSign пересоздаются на каждый рендер, но читают только row — колонки от них не зависят.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage, canEdo, toSign.isPending],
  );

  const error = list.error ?? summary.error;
  if (error) {
    if (isModuleDisabled(error)) return <AccessDenied title={t("page.moduleOff")} description={t("page.moduleOffHint")} showBack={false} />;
    if (error instanceof ApiError && error.status === 403) return <AccessDenied />;
    return <Alert severity="error">{error instanceof Error ? error.message : t("page.loadError")}</Alert>;
  }

  const s = summary.data;
  const kpis = s
    ? [
        [t("sales.kpiTotal"), s.total],
        [t("sales.kpiReview"), s.review],
        [t("sales.kpiSigning"), s.signing],
        [t("sales.kpiSigned"), s.signedMonth],
      ]
    : null;

  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <Typography sx={{ mb: 2, fontSize: "0.875rem", color: "text.secondary" }}>{t("sales.subtitle")}</Typography>
      <Box sx={{ mb: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
        {kpis
          ? kpis.map(([label, value]) => (
              <Box key={String(label)} sx={{ ...cardSx, p: { xs: 1.75, md: 2.25 } }}>
                <Typography noWrap sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                  {label}
                </Typography>
                <Typography sx={{ mt: 0.75, fontSize: { xs: "1.3rem", md: "1.75rem" }, fontWeight: 700 }}>{value}</Typography>
              </Box>
            ))
          : [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={92} sx={{ borderRadius: "14px" }} />)}
      </Box>

      <Box sx={{ mb: 1.5, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {SALES_DOC_CHIPS.map((key) => (
          <ButtonBase key={key} aria-pressed={chip === key} onClick={() => setChip(key)} sx={(th) => pillSx(th, chip === key)}>
            {t(`sales.chip.${key}`)}
            {s ? ` · ${s.counts[key]}` : ""}
          </ButtonBase>
        ))}
      </Box>
      <Box sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Box
          sx={(th) => ({
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.25,
            height: 36,
            flex: { xs: "1 1 100%", md: "0 1 280px" },
            border: 1,
            borderColor: "divider",
            borderRadius: "9px",
            bgcolor: subtleBg(th),
            "& .MuiSvgIcon-root": { fontSize: 18, color: "text.secondary" },
          })}
        >
          <SearchOutlined />
          <InputBase value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("filter.search")} inputProps={{ "aria-label": t("filter.search") }} sx={{ flex: 1, fontSize: "0.875rem" }} />
        </Box>
        <CustomDatePicker label={t("sales.from")} value={from} onChange={(v) => setFrom(v as Dayjs | null)} slotProps={{ textField: { size: "small", sx: { width: 160 } } }} />
        <CustomDatePicker label={t("sales.to")} value={to} onChange={(v) => setTo(v as Dayjs | null)} slotProps={{ textField: { size: "small", sx: { width: 160 } } }} />
        {canManage && (
          <Button variant="contained" size="small" startIcon={<UploadFileOutlined />} onClick={() => setUploadOpen(true)} sx={{ ml: { md: "auto" } }}>
            {t("sales.upload")}
          </Button>
        )}
      </Box>

      <Box sx={{ ...cardSx, overflow: "hidden" }}>
        <DataGrid<SalesDocument>
          rows={list.data ?? []}
          columns={columns}
          getRowId={(row) => row.id}
          loading={list.isFetching}
          rowHeight={60}
          columnHeaderHeight={theme.appLayout?.table?.headerRowHeight ?? 44}
          disableColumnMenu
          disableRowSelectionOnClick
          autoHeight
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          pageSizeOptions={[25, 50, 100]}
          localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("sales.empty") }}
          sx={(th) => ({
            border: 0,
            "& .MuiDataGrid-columnHeaders": { bgcolor: subtleBg(th) },
            "& .MuiDataGrid-cell": { display: "flex", alignItems: "center", lineHeight: 1.4 },
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
          })}
        />
      </Box>

      {canManage && <UploadDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={refresh} />}
    </Box>
  );
}

function UploadDrawer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useT("edo");
  const scope = useRealtyScope();
  const { enqueueSnackbar } = useSnackbar();
  const input = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SalesDocType>("contract");
  const [projectId, setProjectId] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [buyer, setBuyer] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [comment, setComment] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setName("");
    setType("contract");
    setProjectId("");
    setUnitId("");
    setBuyer("");
    setAmount("");
    setDate(dayjs());
    setComment("");
    setTouched(false);
  }, [open]);

  const projects = useQuery({ queryKey: realEstateKeys.projects(scope), queryFn: () => getRealEstateProjects(scope), enabled: open && scope.orgReady !== false, staleTime: 5 * 60_000 }).data;
  const units = useQuery({ queryKey: realEstateKeys.units(scope, projectId), queryFn: () => getProjectUnits(projectId, scope), enabled: open && Boolean(projectId), staleTime: 30_000 }).data;

  const upload = useMutation({
    mutationFn: () =>
      uploadSalesDocument(
        {
          file: file as File,
          name: name.trim(),
          type,
          projectId: projectId ? Number(projectId) : null,
          unitId: unitId ? Number(unitId) : null,
          buyer: buyer.trim(),
          amount: amount.trim() ? Number(amount.replace(/\s/g, "").replace(",", ".")) : null,
          date: date ? date.format("YYYY-MM-DD") : null,
          comment: comment.trim(),
        },
        scope,
      ),
    onSuccess: () => {
      enqueueSnackbar(t("sales.uploadDone"), { variant: "success" });
      onDone();
      onClose();
    },
  });

  const submit = () => {
    setTouched(true);
    if (!file || !name.trim()) return;
    upload.mutate();
  };

  return (
    <Drawer anchor="right" open={open} onClose={upload.isPending ? undefined : onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, fontWeight: 700, fontSize: "1.1rem" }}>
          {t("sales.uploadTitle")}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={upload.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gap: 2, alignContent: "start" }}>
        <Box>
          <Button variant="outlined" color={touched && !file ? "error" : "primary"} startIcon={<AttachFileOutlined />} onClick={() => input.current?.click()}>
            {file ? file.name : t("dialog.pickFile")}
          </Button>
          <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: touched && !file ? "error.main" : "text.secondary" }}>{touched && !file ? t("sales.fileRequired") : t("dialog.fileHint")}</Typography>
          <input
            ref={input}
            type="file"
            hidden
            accept={EDO_FILE_ACCEPT}
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (picked && picked.size > EDO_FILE_MAX_BYTES) return void enqueueSnackbar(t("action.fileTooBig"), { variant: "error" });
              setFile(picked);
              if (picked && !name.trim()) setName(picked.name.replace(/\.[^.]+$/, ""));
            }}
          />
        </Box>
        <TextField size="small" label={t("sales.name")} value={name} onChange={(e) => setName(e.target.value)} error={touched && !name.trim()} helperText={touched && !name.trim() ? t("create.required") : undefined} />
        <TextField select size="small" label={t("sales.type")} value={type} onChange={(e) => setType(e.target.value as SalesDocType)}>
          {SALES_DOC_TYPES.map((item) => (
            <MenuItem key={item} value={item}>
              {t(`salesType.${item}`)}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <TextField
            select
            size="small"
            label={t("sales.project")}
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setUnitId("");
            }}
          >
            <MenuItem value="">{t("create.projectNone")}</MenuItem>
            {(projects ?? []).map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label={t("sales.unit")} value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!projectId}>
            <MenuItem value="">{t("sales.unitNone")}</MenuItem>
            {(units ?? []).map((unit) => (
              <MenuItem key={unit.id} value={unit.id}>
                №{unit.number}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label={t("sales.buyer")} value={buyer} onChange={(e) => setBuyer(e.target.value)} />
          <TextField size="small" inputMode="decimal" label={t("sales.amount")} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <CustomDatePicker label={t("sales.date")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small" } }} />
        </Box>
        <TextField size="small" multiline minRows={2} label={t("sales.comment")} value={comment} onChange={(e) => setComment(e.target.value)} />
        {upload.isError && <Alert severity="error">{upload.error instanceof Error ? upload.error.message : ""}</Alert>}
      </Box>
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", justifyContent: "flex-end", gap: 1, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={upload.isPending}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" disabled={upload.isPending} onClick={submit}>
          {t("sales.upload")}
        </Button>
      </Box>
    </Drawer>
  );
}
