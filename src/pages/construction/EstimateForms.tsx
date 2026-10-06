import React from "react";
import { Alert, Autocomplete, Box, Button, Drawer, IconButton, Link, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";
import { useSnackbar } from "notistack";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";

import {
  addEstimateItem,
  getEstimateItem,
  importEstimate,
  reindexEstimate,
  supplyKeys,
  updateEstimateItem,
  updateEstimateProgress,
  type Estimate,
  type EstimatePosition,
} from "../../api/supply";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { ConfirmDialog, FormDrawer, InfoRow } from "../realty-finance/shared";
import { parseNumber } from "./format";
import { useRefreshSupply } from "./hooks";
import { ProgressBar, SubPillRow } from "./shared";

const qty = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Карточка позиции (`?item=`): объём, выполнение, этап графика; правка — `supply.manage`. */
export function EstimateItemDrawer({ id, preview, projectId, canManage, onClose }: { id: number | null; preview: EstimatePosition | null; projectId: number | null; canManage: boolean; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const [dialog, setDialog] = React.useState<"progress" | "edit" | null>(null);
  const query = useQuery({
    queryKey: supplyKeys.estimateItem(scope, id ?? 0),
    queryFn: ({ signal }) => getEstimateItem(id as number, scope, signal),
    enabled: id != null && scope.orgReady !== false,
    staleTime: 15_000,
  });
  React.useEffect(() => setDialog(null), [id]);
  const item = (query.data && query.data.id === id ? query.data : null) ?? (preview && preview.id === id ? preview : null);
  return (
    <Drawer anchor="right" open={id != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{item ? t("smeta.item.title", { code: item.code }) : ""}</Typography>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {item?.name ?? ""}
          </Typography>
        </Box>
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
        {!item && query.isLoading && <Skeleton variant="rounded" height={240} />}
        {!item && query.error && <Alert severity="error">{message(query.error, t("smeta.item.notFound"))}</Alert>}
        {item && (
          <>
            <Box>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.75 }}>
                <Typography sx={{ fontSize: "1.6rem", fontWeight: 700 }}>{item.donePct}%</Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                  {qty(item.doneQty)} / {qty(item.qty)} {item.unit}
                </Typography>
              </Box>
              <ProgressBar value={item.donePct} height={8} />
            </Box>
            <Box>
              <InfoRow label={t("smeta.item.section")} value={item.section || "—"} />
              <InfoRow label={t("smeta.item.qty")} value={`${qty(item.qty)} ${item.unit}`} />
              <InfoRow label={t("smeta.item.price")} value={formatKGS(item.price)} />
              <InfoRow label={t("smeta.item.amount")} value={formatKGS(item.amount)} />
              <InfoRow label={t("smeta.item.remaining")} value={formatKGS(item.remaining)} />
              {item.lastAct && <InfoRow label={t("smeta.item.lastAct")} value={item.lastAct} />}
              <InfoRow
                label={t("smeta.item.stage")}
                value={
                  item.stageId != null ? (
                    <Link component={RouterLink} to={`/construction/schedule?${projectId != null ? `project=${projectId}&` : ""}stage=${item.stageId}`} underline="hover">
                      {item.stageName || t("smeta.item.openStage")}
                    </Link>
                  ) : (
                    t("smeta.item.noStage")
                  )
                }
              />
            </Box>
          </>
        )}
      </Box>
      {item && canManage && (
        <Box sx={{ px: 2.5, py: 1.5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderTop: 1, borderColor: "divider" }}>
          <Button variant="contained" onClick={() => setDialog("progress")}>
            {t("smeta.item.progress")}
          </Button>
          <Button variant="outlined" onClick={() => setDialog("edit")}>
            {t("smeta.item.edit")}
          </Button>
        </Box>
      )}
      <ProgressDialog item={dialog === "progress" ? item : null} onClose={() => setDialog(null)} />
      <EditDialog item={dialog === "edit" ? item : null} onClose={() => setDialog(null)} />
    </Drawer>
  );
}

function ProgressDialog({ item, onClose }: { item: EstimatePosition | null; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const [doneQty, setDoneQty] = React.useState("");
  const [act, setAct] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => updateEstimateProgress(item?.id as number, { doneQty: parseNumber(doneQty) as number, act }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("smeta.progressDialog.saved"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!item) return;
    setDoneQty(String(item.doneQty));
    setAct("");
    setTouched(false);
    save.reset();
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const n = parseNumber(doneQty);
  const bad = n == null || n < 0 || (item != null && n > item.qty);
  return (
    <ConfirmDialog
      open={item != null}
      title={t("smeta.progressDialog.title")}
      text={item?.name}
      confirmLabel={t("smeta.progressDialog.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!bad) save.mutate();
      }}
      onClose={onClose}
    >
      <TextField
        size="small"
        label={t("smeta.progressDialog.doneQty", { unit: item?.unit ?? "" })}
        value={doneQty}
        inputMode="decimal"
        onChange={(e) => setDoneQty(e.target.value)}
        error={touched && bad}
        helperText={
          touched && bad
            ? t("smeta.progressDialog.bad")
            : item
              ? `${t("smeta.progressDialog.doneHint", { qty: qty(item.qty), unit: item.unit })}${n != null && item.qty > 0 ? ` · ${Math.round((n / item.qty) * 100)}%` : ""}`
              : undefined
        }
      />
      <TextField size="small" label={t("smeta.progressDialog.act")} value={act} onChange={(e) => setAct(e.target.value)} />
    </ConfirmDialog>
  );
}

function EditDialog({ item, onClose }: { item: EstimatePosition | null; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const [name, setName] = React.useState("");
  const [qtyText, setQty] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (!item) return;
    setName(item.name);
    setQty(String(item.qty));
    setPrice(String(item.price));
    setReason("");
    setTouched(false);
  }, [item]);
  const patch = () => {
    const body: { name?: string; qty?: number; price?: number } = {};
    if (!item) return body;
    if (name.trim() && name.trim() !== item.name) body.name = name.trim();
    const q = parseNumber(qtyText);
    if (q != null && q !== item.qty) body.qty = q;
    const p = parseNumber(price);
    if (p != null && p !== item.price) body.price = p;
    return body;
  };
  const save = useMutation({
    mutationFn: () => updateEstimateItem(item?.id as number, { ...patch(), reason }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("smeta.editDialog.saved"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => save.reset(), [item]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  const qtyBad = parseNumber(qtyText) == null || (parseNumber(qtyText) as number) < 0;
  const priceBad = parseNumber(price) == null || (parseNumber(price) as number) < 0;
  const nothing = Object.keys(patch()).length === 0;
  return (
    <ConfirmDialog
      open={item != null}
      title={t("smeta.editDialog.title")}
      confirmLabel={t("smeta.editDialog.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!qtyBad && !priceBad && reason.trim() && !nothing) save.mutate();
      }}
      onClose={onClose}
    >
      <TextField size="small" label={t("smeta.editDialog.name")} value={name} onChange={(e) => setName(e.target.value)} />
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField size="small" label={`${t("smeta.editDialog.qty")}, ${item?.unit ?? ""}`} value={qtyText} inputMode="decimal" onChange={(e) => setQty(e.target.value)} error={touched && qtyBad} helperText={touched && qtyBad ? t("common.number") : undefined} />
        <TextField size="small" label={t("smeta.editDialog.price")} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} error={touched && priceBad} helperText={touched && priceBad ? t("common.number") : undefined} />
      </Box>
      <TextField size="small" label={t("smeta.editDialog.reason")} value={reason} onChange={(e) => setReason(e.target.value)} error={touched && !reason.trim()} helperText={touched && !reason.trim() ? t("common.required") : undefined} />
      {touched && nothing && <Alert severity="info">{t("smeta.editDialog.nothing")}</Alert>}
    </ConfirmDialog>
  );
}

/** «＋ Позиция» — раздел из существующих или новый; версия сметы +1. */
export function AddEstimateItemDrawer({ estimate, open, onClose }: { estimate: Estimate | null; open: boolean; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const [section, setSection] = React.useState("");
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [qtyText, setQty] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => addEstimateItem(estimate?.id as number, { section, name, unit, qty: parseNumber(qtyText) as number, price: parseNumber(price) as number }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("smeta.addForm.created"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setSection("");
    setName("");
    setUnit("");
    setQty("");
    setPrice("");
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const num = (v: string) => parseNumber(v) != null && (parseNumber(v) as number) >= 0;
  const invalid = { section: !section.trim(), name: !name.trim(), unit: !unit.trim(), qty: !num(qtyText), price: !num(price) };
  const hasErrors = Object.values(invalid).some(Boolean);
  const req = (bad: boolean, text = t("common.required")) => (touched && bad ? text : undefined);
  return (
    <FormDrawer
      open={open && estimate != null}
      title={t("smeta.addForm.title")}
      submitLabel={t("smeta.addForm.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!hasErrors) save.mutate();
      }}
    >
      <Autocomplete
        freeSolo
        options={(estimate?.sections ?? []).map((s) => s.name)}
        inputValue={section}
        onInputChange={(_, value) => setSection(value)}
        renderInput={(params) => <TextField {...params} size="small" label={t("smeta.addForm.section")} error={touched && invalid.section} helperText={req(invalid.section) ?? t("smeta.addForm.sectionHint")} />}
      />
      <TextField size="small" label={t("smeta.addForm.name")} value={name} onChange={(e) => setName(e.target.value)} error={touched && invalid.name} helperText={req(invalid.name)} />
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1.5 }}>
        <TextField size="small" label={t("smeta.addForm.unit")} value={unit} onChange={(e) => setUnit(e.target.value)} error={touched && invalid.unit} helperText={req(invalid.unit)} />
        <TextField size="small" label={t("smeta.addForm.qty")} value={qtyText} inputMode="decimal" onChange={(e) => setQty(e.target.value)} error={touched && invalid.qty} helperText={req(invalid.qty, t("common.number"))} />
        <TextField size="small" label={t("smeta.addForm.price")} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} error={touched && invalid.price} helperText={req(invalid.price, t("common.number"))} />
      </Box>
      {!invalid.qty && !invalid.price && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>= {formatKGS((parseNumber(qtyText) as number) * (parseNumber(price) as number))}</Typography>}
    </FormDrawer>
  );
}

export function ReindexDialog({ estimate, open, onClose }: { estimate: Estimate | null; open: boolean; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const [index, setIndex] = React.useState("");
  const [target, setTarget] = React.useState<"materials" | "all">("materials");
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => reindexEstimate(estimate?.id as number, { index: parseNumber(index) as number, scope: target, reason }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("smeta.indexForm.saved"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setIndex("");
    setTarget("materials");
    setReason("");
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const n = parseNumber(index);
  const indexBad = n == null || n === 0 || n <= -100;
  return (
    <ConfirmDialog
      open={open && estimate != null}
      title={t("smeta.indexForm.title")}
      text={estimate?.projectName}
      confirmLabel={t("smeta.indexForm.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!indexBad && reason.trim()) save.mutate();
      }}
      onClose={onClose}
    >
      <TextField size="small" label={t("smeta.indexForm.index")} value={index} inputMode="decimal" onChange={(e) => setIndex(e.target.value)} error={touched && indexBad} helperText={touched && indexBad ? t("smeta.indexForm.bad") : t("smeta.indexForm.indexHint")} />
      <TextField select size="small" label={t("smeta.indexForm.scope")} value={target} onChange={(e) => setTarget(e.target.value as "materials" | "all")}>
        <MenuItem value="materials">{t("smeta.indexForm.scope_materials")}</MenuItem>
        <MenuItem value="all">{t("smeta.indexForm.scope_all")}</MenuItem>
      </TextField>
      <TextField size="small" label={t("smeta.indexForm.reason")} value={reason} onChange={(e) => setReason(e.target.value)} error={touched && !reason.trim()} helperText={touched && !reason.trim() ? t("common.required") : undefined} />
    </ConfirmDialog>
  );
}

/** Импорт CSV из Smeta.kg: файл читаем как текст и шлём `content` (гайд §6). */
export function ImportDialog({ estimate, open, onClose }: { estimate: Estimate | null; open: boolean; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshSupply();
  const { enqueueSnackbar } = useSnackbar();
  const input = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [mode, setMode] = React.useState<"append" | "replace">("append");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: async () => importEstimate(estimate?.id as number, await (file as File).text(), mode, scope),
    onSuccess: ({ imported }) => {
      refresh();
      enqueueSnackbar(t("smeta.importForm.saved", { count: imported }), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setMode("append");
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  return (
    <ConfirmDialog
      open={open && estimate != null}
      title={t("smeta.importForm.title")}
      text={t("smeta.importForm.hint")}
      confirmLabel={t("smeta.importForm.save")}
      busy={save.isPending}
      error={save.error}
      danger={mode === "replace"}
      onConfirm={() => {
        setTouched(true);
        if (file) save.mutate();
      }}
      onClose={onClose}
    >
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" startIcon={<UploadFileOutlined />} onClick={() => input.current?.click()}>
          {t("smeta.importForm.pick")}
        </Button>
        <Typography sx={{ fontSize: "0.8125rem", color: touched && !file ? "error.main" : "text.secondary" }}>
          {file ? t("smeta.importForm.picked", { name: file.name, size: Math.max(1, Math.round(file.size / 1024)) }) : touched ? t("smeta.importForm.noFile") : ""}
        </Typography>
      </Box>
      <SubPillRow
        value={mode}
        onChange={(v) => setMode(v as "append" | "replace")}
        options={[
          { key: "append", label: t("smeta.importForm.mode_append") },
          { key: "replace", label: t("smeta.importForm.mode_replace") },
        ]}
      />
    </ConfirmDialog>
  );
}
