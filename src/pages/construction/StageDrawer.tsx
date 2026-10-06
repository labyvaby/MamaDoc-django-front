import React from "react";
import { Alert, Box, Button, Checkbox, Drawer, FormControlLabel, IconButton, Link, Skeleton, TextField, Typography, useTheme } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "react-router";
import { useSnackbar } from "notistack";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { claimStage, constructionKeys, getStage, shiftStage, updateStageProgress, type Stage, type StageDetail } from "../../api/construction";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { ConfirmDialog, InfoRow } from "../realty-finance/shared";
import { ActFormDrawer, DefectFormDrawer, type ActPreset, type DefectPreset } from "./ConstructionForms";
import { fullDate, groupColor, parseNumber, severityTone, stageTone } from "./format";
import { useRefreshConstruction } from "./hooks";
import { HistoryList, ProgressBar, SectionTitle, StatusPill } from "./shared";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const qty = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

/** Карточка этапа (`?stage=`): сроки, прогресс, акты и дефекты; действия — `construction.manage`. */
export function StageDrawer({ id, preview, canManage, onClose }: { id: number | null; preview: Stage | null; canManage: boolean; onClose: () => void }) {
  const { t } = useT("construction");
  const theme = useTheme();
  const scope = useRealtyScope();
  const [dialog, setDialog] = React.useState<"progress" | "shift" | "claim" | null>(null);
  const [actPreset, setActPreset] = React.useState<ActPreset | null>(null);
  const [defectPreset, setDefectPreset] = React.useState<DefectPreset | null>(null);
  const query = useQuery({
    queryKey: constructionKeys.stage(scope, id ?? 0),
    queryFn: ({ signal }) => getStage(id as number, scope, signal),
    enabled: id != null && scope.orgReady !== false,
    staleTime: 15_000,
  });
  React.useEffect(() => setDialog(null), [id]);
  const detail = query.data && query.data.id === id ? query.data : null;
  const stage: Stage | StageDetail | null = detail ?? (preview && preview.id === id ? preview : null);
  const color = stage ? groupColor(theme, stage.group) : theme.palette.primary.main;

  return (
    <Drawer anchor="right" open={id != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {stage ? `${stage.projectName} · ${stage.groupLabel}` : t("schedule.drawer.title")}
          </Typography>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {stage?.name ?? ""}
          </Typography>
        </Box>
        {stage && <StatusPill label={stage.statusLabel || t(`schedule.status.${stage.status}`, { defaultValue: stage.status })} tone={stageTone(stage.status)} />}
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
        {!stage && query.isLoading && <Skeleton variant="rounded" height={280} />}
        {!stage && query.error && <Alert severity="error">{message(query.error, t("schedule.drawer.notFound"))}</Alert>}
        {stage && (
          <>
            <Box>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.75 }}>
                <Typography sx={{ fontSize: "1.6rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{stage.progress}%</Typography>
                {stage.volume > 0 && (
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                    {t("schedule.drawer.volumeValue", { done: qty(stage.done), volume: qty(stage.volume), unit: stage.unit })}
                  </Typography>
                )}
              </Box>
              <ProgressBar value={stage.progress} color={color} height={8} />
            </Box>
            <Box>
              <InfoRow label={t("schedule.drawer.contractor")} value={stage.contractorName ?? t("common.ownForces")} />
              {stage.responsible && <InfoRow label={t("schedule.drawer.responsible")} value={stage.responsible} />}
              <InfoRow label={t("schedule.drawer.plan")} value={`${fullDate(stage.start)} – ${fullDate(stage.end)}`} />
              {(stage.factStart || stage.factEnd) && <InfoRow label={t("schedule.drawer.fact")} value={`${fullDate(stage.factStart)} – ${stage.factEnd ? fullDate(stage.factEnd) : "…"}`} />}
              {stage.status !== "done" && stage.forecastEnd && (
                <InfoRow label={t("schedule.drawer.forecast")} value={fullDate(stage.forecastEnd)} tone={stage.forecastEnd > stage.end ? "error" : null} />
              )}
              {stage.delayDays > 0 && <InfoRow label={t("schedule.drawer.delay")} value={t("common.days", { count: stage.delayDays })} tone="error" />}
              {stage.shiftDays !== 0 && <InfoRow label={t("schedule.drawer.shift")} value={t("common.days", { count: stage.shiftDays })} />}
            </Box>

            {detail && (
              <>
                <Box>
                  <SectionTitle>{t("schedule.drawer.acts")}</SectionTitle>
                  {detail.acts.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("schedule.drawer.actsEmpty")}</Typography>}
                  {detail.acts.map((a) => (
                    <Box key={a.id} sx={{ py: 0.75, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Link component={RouterLink} to={`/construction/contractors?act=${a.id}`} underline="hover" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                          {a.number}
                        </Link>
                        <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                          {[a.period, a.subject].filter(Boolean).join(" · ")}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, whiteSpace: "nowrap" }}>{formatKGS(a.amount)}</Typography>
                      <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", whiteSpace: "nowrap" }}>{a.statusLabel}</Typography>
                    </Box>
                  ))}
                </Box>
                <Box>
                  <SectionTitle>{t("schedule.drawer.defects")}</SectionTitle>
                  {detail.openDefects.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("schedule.drawer.defectsEmpty")}</Typography>}
                  {detail.openDefects.map((d) => (
                    <Box key={d.id} sx={{ py: 0.75, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Link component={RouterLink} to={`/construction/quality?defect=${d.id}`} underline="hover" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                          {d.number} · {d.title}
                        </Link>
                        {(d.section || d.floor != null) && (
                          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("schedule.drawer.defectPlace", { section: d.section || "—", floor: d.floor ?? "—" })}</Typography>
                        )}
                      </Box>
                      <StatusPill label={d.severityLabel} tone={severityTone(d.severity)} />
                    </Box>
                  ))}
                </Box>
                <Box>
                  <SectionTitle>{t("common.history")}</SectionTitle>
                  <HistoryList items={detail.history} empty="—" />
                </Box>
              </>
            )}
          </>
        )}
      </Box>

      {stage && canManage && (
        <Box sx={{ px: 2.5, py: 1.5, display: "grid", gap: 1, borderTop: 1, borderColor: "divider" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            <Button variant="contained" onClick={() => setDialog("progress")} disabled={stage.status === "done" && stage.progress >= 100}>
              {t("schedule.drawer.progress")}
            </Button>
            <Button variant="outlined" onClick={() => setDialog("shift")} disabled={stage.status === "done"}>
              {t("schedule.drawer.shiftAction")}
            </Button>
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {stage.contractorId != null && (
              <Button size="small" onClick={() => setActPreset({ contractorId: stage.contractorId, projectId: stage.projectId, subject: stage.name })}>
                {t("schedule.drawer.act")}
              </Button>
            )}
            <Button size="small" onClick={() => setDefectPreset({ projectId: stage.projectId, contractorId: stage.contractorId, stageId: stage.id, inspectionId: null })}>
              {t("schedule.drawer.defect")}
            </Button>
            {stage.contractorId != null && stage.delayDays > 0 && (
              <Button size="small" color="error" onClick={() => setDialog("claim")} sx={{ ml: "auto" }}>
                {t("schedule.drawer.claim")}
              </Button>
            )}
          </Box>
        </Box>
      )}

      <ProgressDialog stage={dialog === "progress" ? stage : null} onClose={() => setDialog(null)} />
      <ShiftDialog stage={dialog === "shift" ? stage : null} onClose={() => setDialog(null)} />
      <ClaimDialog stage={dialog === "claim" ? stage : null} onClose={() => setDialog(null)} />
      <ActFormDrawer preset={actPreset} onClose={() => setActPreset(null)} />
      <DefectFormDrawer preset={defectPreset} onClose={() => setDefectPreset(null)} />
    </Drawer>
  );
}

function ProgressDialog({ stage, onClose }: { stage: Stage | null; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const [progress, setProgress] = React.useState("");
  const [done, setDone] = React.useState("");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => updateStageProgress(stage?.id as number, { progress: Math.round(parseNumber(progress) as number), done: done.trim() ? parseNumber(done) : null, note }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("schedule.progressDialog.saved"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!stage) return;
    setProgress(String(stage.progress));
    setDone(stage.volume > 0 ? String(stage.done) : "");
    setNote("");
    setTouched(false);
    save.reset();
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  // Объём задан — готовность считается из выполненного объёма.
  const onDone = (value: string) => {
    setDone(value);
    const n = parseNumber(value);
    if (stage && stage.volume > 0 && n != null && n >= 0) setProgress(String(Math.min(100, Math.round((n / stage.volume) * 100))));
  };
  const p = parseNumber(progress);
  const progressBad = p == null || p < 0 || p > 100;
  const doneBad = done.trim() !== "" && (parseNumber(done) == null || (parseNumber(done) as number) < 0);
  return (
    <ConfirmDialog
      open={stage != null}
      title={t("schedule.progressDialog.title")}
      text={stage?.name}
      confirmLabel={t("schedule.progressDialog.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!progressBad && !doneBad) save.mutate();
      }}
      onClose={onClose}
    >
      {stage && stage.volume > 0 && (
        <TextField
          size="small"
          label={t("schedule.progressDialog.done", { unit: stage.unit })}
          value={done}
          inputMode="decimal"
          onChange={(e) => onDone(e.target.value)}
          error={touched && doneBad}
          helperText={touched && doneBad ? t("common.number") : t("schedule.progressDialog.doneHint", { volume: qty(stage.volume), unit: stage.unit })}
        />
      )}
      <TextField
        size="small"
        label={t("schedule.progressDialog.progress")}
        value={progress}
        inputMode="numeric"
        onChange={(e) => setProgress(e.target.value)}
        error={touched && progressBad}
        helperText={touched && progressBad ? t("schedule.progressDialog.range") : undefined}
      />
      <TextField size="small" label={t("schedule.progressDialog.note")} value={note} onChange={(e) => setNote(e.target.value)} />
    </ConfirmDialog>
  );
}

function ShiftDialog({ stage, onClose }: { stage: Stage | null; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const [days, setDays] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [cascade, setCascade] = React.useState(true);
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => shiftStage(stage?.id as number, { days: parseNumber(days) as number, reason, cascade }, scope),
    onSuccess: ({ shifted }) => {
      refresh();
      enqueueSnackbar(cascade && shifted > 0 ? t("schedule.shiftDialog.savedCascade", { count: shifted }) : t("schedule.shiftDialog.saved"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!stage) return;
    setDays("7");
    setReason("");
    setCascade(true);
    setTouched(false);
    save.reset();
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const d = parseNumber(days);
  const daysBad = d == null || !Number.isInteger(d) || d === 0;
  const reasonBad = !reason.trim();
  return (
    <ConfirmDialog
      open={stage != null}
      title={t("schedule.shiftDialog.title")}
      text={stage?.name}
      confirmLabel={t("schedule.shiftDialog.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!daysBad && !reasonBad) save.mutate();
      }}
      onClose={onClose}
    >
      <TextField
        size="small"
        label={t("schedule.shiftDialog.days")}
        value={days}
        inputMode="numeric"
        onChange={(e) => setDays(e.target.value)}
        error={touched && daysBad}
        helperText={touched && daysBad ? t("schedule.shiftDialog.nonZero") : t("schedule.shiftDialog.daysHint")}
      />
      <TextField size="small" label={t("schedule.shiftDialog.reason")} value={reason} onChange={(e) => setReason(e.target.value)} error={touched && reasonBad} helperText={touched && reasonBad ? t("common.required") : undefined} />
      <FormControlLabel control={<Checkbox size="small" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />} label={t("schedule.shiftDialog.cascade")} />
    </ConfirmDialog>
  );
}

function ClaimDialog({ stage, onClose }: { stage: Stage | null; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const save = useMutation({
    mutationFn: () => claimStage(stage?.id as number, scope),
    onSuccess: ({ documentId }) => {
      refresh();
      enqueueSnackbar(t("schedule.claimDialog.created"), { variant: "success" });
      onClose();
      if (documentId != null) navigate(`/edo?doc=${documentId}`);
    },
  });
  React.useEffect(() => save.reset(), [stage]); // eslint-disable-line react-hooks/exhaustive-deps -- сбросить ошибку при открытии
  return (
    <ConfirmDialog
      open={stage != null}
      title={t("schedule.claimDialog.title")}
      text={stage ? t("schedule.claimDialog.text", { contractor: stage.contractorName ?? "", stage: stage.name }) : null}
      confirmLabel={t("schedule.claimDialog.confirm")}
      busy={save.isPending}
      error={save.error}
      danger
      onConfirm={() => save.mutate()}
      onClose={onClose}
    />
  );
}
