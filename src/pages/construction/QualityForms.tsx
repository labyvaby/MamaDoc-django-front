import React from "react";
import { Alert, Box, Button, Drawer, IconButton, Link, MenuItem, Skeleton, TextField, Tooltip, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import {
  INSPECTION_RESULTS,
  constructionKeys,
  createInspection,
  defectActions,
  deleteDefectPhoto,
  getDefect,
  moveDefectDeadline,
  runDefectAction,
  uploadDefectPhoto,
  type Defect,
  type DefectAction,
  type Inspection,
  type InspectionResult,
} from "../../api/construction";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { ConfirmDialog, FormDrawer, InfoRow } from "../realty-finance/shared";
import { defectTone, fullDate, isoDate, severityTone } from "./format";
import { useConstructionProjects, useRefreshConstruction } from "./hooks";
import { HistoryList, SectionTitle, StatusPill } from "./shared";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const MAX_PHOTO = 20 * 1024 * 1024;

/** Карточка дефекта (`?defect=`): место, сроки, фото, история; действия по статусу. */
export function DefectDrawer({ id, preview, canManage, onClose }: { id: number | null; preview: Defect | null; canManage: boolean; onClose: () => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = React.useState<"verify" | "deadline" | null>(null);
  const [note, setNote] = React.useState("");
  const [deadline, setDeadline] = React.useState<Dayjs | null>(null);
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const query = useQuery({
    queryKey: constructionKeys.defect(scope, id ?? 0),
    queryFn: ({ signal }) => getDefect(id as number, scope, signal),
    enabled: id != null && scope.orgReady !== false,
    staleTime: 15_000,
  });
  const detail = query.data && query.data.id === id ? query.data : null;
  const d: Defect | null = detail ?? (preview && preview.id === id ? preview : null);
  const onError = (error: unknown) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" });
  const done: Record<DefectAction, string> = {
    prescribe: t("quality.drawer.prescribed"),
    "to-verify": t("quality.drawer.verifying"),
    close: t("quality.drawer.closedDone"),
    reopen: t("quality.drawer.reopened"),
  };
  const run = useMutation({
    mutationFn: (action: DefectAction) => runDefectAction(id as number, action, scope, action === "to-verify" ? note : ""),
    onSuccess: (_, action) => {
      setDialog(null);
      refresh();
      enqueueSnackbar(done[action], { variant: "success" });
    },
    onError: (error) => {
      if (dialog == null) onError(error);
    },
  });
  const move = useMutation({
    mutationFn: () => moveDefectDeadline(id as number, isoDate(deadline) as string, reason, scope),
    onSuccess: () => {
      setDialog(null);
      refresh();
      enqueueSnackbar(t("quality.drawer.deadlineMoved"), { variant: "success" });
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadDefectPhoto(id as number, file, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("quality.drawer.photoUploaded"), { variant: "success" });
    },
    onError,
  });
  const removePhoto = useMutation({
    mutationFn: (photoId: number) => deleteDefectPhoto(id as number, photoId, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("quality.drawer.photoDeleted"), { variant: "success" });
    },
    onError,
  });
  React.useEffect(() => {
    setDialog(null);
    setNote("");
    setReason("");
    setTouched(false);
    run.reset();
    move.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- новый дефект — новые формы

  const actions = d && canManage ? defectActions(d.status) : [];
  const busy = run.isPending || move.isPending;
  const actionLabel: Record<DefectAction, string> = {
    prescribe: t("quality.drawer.prescribe"),
    "to-verify": t("quality.drawer.toVerify"),
    close: `✓ ${t("quality.drawer.close")}`,
    reopen: t("quality.drawer.reopen"),
  };

  return (
    <Drawer anchor="right" open={id != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{d ? [d.number, d.projectName].filter(Boolean).join(" · ") : ""}</Typography>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {d?.title ?? ""}
          </Typography>
        </Box>
        {d && <StatusPill label={d.statusLabel || d.status} tone={defectTone(d.status)} />}
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
        {!d && query.isLoading && <Skeleton variant="rounded" height={280} />}
        {!d && query.error && <Alert severity="error">{message(query.error, t("quality.drawer.notFound"))}</Alert>}
        {d && (
          <>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <StatusPill label={d.severityLabel || d.severity} tone={severityTone(d.severity)} />
              {d.isOverdue && d.status !== "closed" && <StatusPill label={t("quality.drawer.overdueDays", { days: t("common.days", { count: d.overdueDays }) })} tone="error" />}
            </Box>
            {d.description && <Typography sx={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>{d.description}</Typography>}
            <Box>
              {(d.section || d.floor != null) && <InfoRow label={t("quality.drawer.place")} value={t("quality.table.placeValue", { section: d.section || "—", floor: d.floor ?? "—" })} />}
              <InfoRow label={t("quality.drawer.category")} value={d.category || "—"} />
              <InfoRow label={t("common.contractor")} value={d.contractorName || t("common.ownForces")} />
              <InfoRow label={t("quality.drawer.found")} value={`${fullDate(d.found)}${d.foundBy ? ` · ${d.foundBy}` : ""}`} />
              <InfoRow label={t("quality.drawer.deadline")} value={fullDate(d.deadline)} tone={d.isOverdue && d.status !== "closed" ? "error" : null} />
              {d.closed && <InfoRow label={t("quality.drawer.closed")} value={fullDate(d.closed)} tone="success" />}
              {d.responsible && <InfoRow label={t("quality.drawer.responsible")} value={d.responsible} />}
              {d.prescription && <InfoRow label={t("quality.drawer.prescription")} value={d.prescription} />}
              {d.stageId != null && (
                <InfoRow
                  label={t("quality.drawer.stage")}
                  value={
                    <Link component={RouterLink} to={`/construction/schedule?project=${d.projectId ?? ""}&stage=${d.stageId}`} underline="hover">
                      {d.stageName || `#${d.stageId}`}
                    </Link>
                  }
                />
              )}
              {d.actId != null && (
                <InfoRow
                  label={t("quality.drawer.act")}
                  value={
                    <Link component={RouterLink} to={`/construction/contractors?act=${d.actId}`} underline="hover">
                      {d.actNumber || `#${d.actId}`}
                    </Link>
                  }
                />
              )}
            </Box>
            <Box>
              <SectionTitle
                action={
                  canManage && d.status !== "closed" ? (
                    <Button size="small" startIcon={<AddPhotoAlternateOutlined />} onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
                      {t("quality.drawer.addPhoto")}
                    </Button>
                  ) : undefined
                }
              >
                {t("quality.drawer.photos")}
              </SectionTitle>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,.heic"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > MAX_PHOTO) enqueueSnackbar(t("quality.drawer.photoTooBig"), { variant: "error" });
                  else upload.mutate(file);
                }}
              />
              {detail && detail.photoFiles.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("quality.drawer.photosEmpty")}</Typography>}
              {detail && detail.photoFiles.length > 0 && (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 1 }}>
                  {detail.photoFiles.map((p) => (
                    <Box key={p.id} sx={{ position: "relative", aspectRatio: "1", borderRadius: "10px", overflow: "hidden", border: 1, borderColor: "divider" }}>
                      <Box component="a" href={p.url} target="_blank" rel="noreferrer" sx={{ display: "block", width: "100%", height: "100%" }}>
                        <Box component="img" src={p.url} alt={p.name} loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </Box>
                      {canManage && (
                        <Tooltip title={t("quality.drawer.deletePhoto")}>
                          <IconButton
                            size="small"
                            aria-label={t("quality.drawer.deletePhoto")}
                            onClick={() => removePhoto.mutate(p.id)}
                            disabled={removePhoto.isPending}
                            sx={{ position: "absolute", top: 4, right: 4, bgcolor: "background.paper", "&:hover": { bgcolor: "background.paper" } }}
                          >
                            <DeleteOutlineOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
            {detail && (
              <Box>
                <SectionTitle>{t("common.history")}</SectionTitle>
                <HistoryList items={detail.history} empty="—" />
              </Box>
            )}
          </>
        )}
      </Box>
      {d && canManage && d.status !== "closed" && (
        <Box sx={{ px: 2.5, py: 1.5, display: "grid", gap: 1, borderTop: 1, borderColor: "divider" }}>
          {actions.map((action) => (
            <Button
              key={action}
              fullWidth
              variant={action === "reopen" ? "outlined" : "contained"}
              color={action === "reopen" ? "error" : "primary"}
              disabled={busy}
              onClick={() => (action === "to-verify" ? setDialog("verify") : run.mutate(action))}
            >
              {actionLabel[action]}
            </Button>
          ))}
          <Button
            onClick={() => {
              setDeadline(d.deadline ? dayjs(d.deadline).add(7, "day") : dayjs().add(7, "day"));
              setReason("");
              setTouched(false);
              move.reset();
              setDialog("deadline");
            }}
            disabled={busy}
          >
            {t("quality.drawer.moveDeadline")}
          </Button>
        </Box>
      )}
      <ConfirmDialog
        open={dialog === "verify"}
        title={t("quality.drawer.verifyTitle")}
        text={d?.title}
        confirmLabel={t("quality.drawer.toVerify")}
        busy={run.isPending}
        error={dialog === "verify" ? run.error : null}
        onConfirm={() => run.mutate("to-verify")}
        onClose={() => setDialog(null)}
      >
        <TextField size="small" label={t("quality.drawer.verifyNote")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "deadline"}
        title={t("quality.drawer.deadlineTitle")}
        text={d?.title}
        confirmLabel={t("quality.drawer.moveDeadline")}
        busy={move.isPending}
        error={move.error}
        onConfirm={() => {
          setTouched(true);
          if (isoDate(deadline) && reason.trim()) move.mutate();
        }}
        onClose={() => setDialog(null)}
      >
        <CustomDatePicker
          label={t("quality.drawer.newDeadline")}
          value={deadline}
          onChange={(v) => setDeadline(v as Dayjs | null)}
          slotProps={{ textField: { size: "small", fullWidth: true, error: touched && !isoDate(deadline), helperText: touched && !isoDate(deadline) ? t("common.required") : undefined } }}
        />
        <TextField size="small" label={t("quality.drawer.reason")} value={reason} onChange={(e) => setReason(e.target.value)} error={touched && !reason.trim()} helperText={touched && !reason.trim() ? t("common.required") : undefined} />
      </ConfirmDialog>
    </Drawer>
  );
}

/** «＋ Проверка»: при результате с замечаниями сразу открывается форма дефекта (гайд §5). */
export function InspectionDrawer({ open, projectId, onClose, onCreated }: { open: boolean; projectId: number | null; onClose: () => void; onCreated: (inspection: Inspection) => void }) {
  const { t } = useT("construction");
  const scope = useRealtyScope();
  const refresh = useRefreshConstruction();
  const { enqueueSnackbar } = useSnackbar();
  const projects = useConstructionProjects(open).data ?? [];
  const [project, setProject] = React.useState<number | "">("");
  const [type, setType] = React.useState("");
  const [result, setResult] = React.useState<InspectionResult>("ok");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => createInspection({ projectId: project as number, type, result, note }, scope),
    onSuccess: (inspection) => {
      refresh();
      enqueueSnackbar(result === "ok" ? t("quality.inspectionForm.created") : t("quality.inspectionForm.createdDefect"), { variant: "success" });
      onClose();
      onCreated(inspection);
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setProject(projectId ?? "");
    setType("");
    setResult("ok");
    setNote("");
    setTouched(false);
    save.reset();
  }, [open, projectId]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const invalid = { project: project === "", type: !type.trim() };
  return (
    <FormDrawer
      open={open}
      title={t("quality.inspectionForm.title")}
      submitLabel={t("quality.inspectionForm.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!invalid.project && !invalid.type) save.mutate();
      }}
    >
      <TextField select size="small" label={t("quality.inspectionForm.project")} value={project} onChange={(e) => setProject(Number(e.target.value))} error={touched && invalid.project} helperText={touched && invalid.project ? t("common.required") : undefined}>
        {projects.map((p) => (
          <MenuItem key={p.projectId} value={p.projectId}>
            {p.projectName}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        label={t("quality.inspectionForm.type")}
        value={type}
        onChange={(e) => setType(e.target.value)}
        error={touched && invalid.type}
        helperText={touched && invalid.type ? t("common.required") : t("quality.inspectionForm.typeHint")}
      />
      <TextField select size="small" label={t("quality.inspectionForm.result")} value={result} onChange={(e) => setResult(e.target.value as InspectionResult)}>
        {INSPECTION_RESULTS.map((r) => (
          <MenuItem key={r} value={r}>
            {t(`quality.result_${r}`)}
          </MenuItem>
        ))}
      </TextField>
      <TextField size="small" label={t("quality.inspectionForm.note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
    </FormDrawer>
  );
}
