import React from "react";
import { Alert, Box, Button, Checkbox, Drawer, FormControlLabel, IconButton, Link, MenuItem, Rating, Skeleton, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";

import {
  NOTICE_CHANNEL_PRESETS,
  assignRequest,
  createNotice,
  createResidentRequest,
  estateOpsKeys,
  getResidentRequest,
  replyRequest,
  requestActions,
  requestToQuality,
  runRequestAction,
  type RequestAction,
  type ResidentRequest,
} from "../../api/estateOps";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatPhoneDisplay } from "../../utility/phone";
import { useConstructionProjects, useContractorOptions } from "../construction/hooks";
import { HistoryList, SectionTitle, StatusPill } from "../construction/shared";
import { ConfirmDialog, FormDrawer, InfoRow } from "../realty-finance/shared";
import { isoDate, parseNumber, requestTone } from "./format";
import { useRefreshOps, useWorkingEmployees } from "./hooks";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** SLA-бейдж: просрочен — красный, < 4 ч — янтарный (гайд §5). */
export function SlaBadge({ r }: { r: Pick<ResidentRequest, "slaOverdue" | "slaLeftHours" | "status" | "rating"> }) {
  const { t } = useT("estateOps");
  if (r.status === "done" || r.status === "closed") return r.rating != null ? <Rating value={r.rating} readOnly size="small" /> : <>—</>;
  if (r.slaOverdue) return <StatusPill label={t("residents.slaOverdue")} tone="error" />;
  if (r.slaLeftHours == null) return <>—</>;
  return <StatusPill label={t("residents.sla", { hours: Math.max(0, Math.round(r.slaLeftHours)) })} tone={r.slaLeftHours < 4 ? "warning" : null} />;
}

/** Карточка обращения (`?request=`): SLA, переписка, история; действия по статусу. */
export function RequestDrawer({ id, preview, canManage, onClose }: { id: number | null; preview: ResidentRequest | null; canManage: boolean; onClose: () => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const [dialog, setDialog] = React.useState<"assign" | "quality" | null>(null);
  const [reply, setReply] = React.useState("");
  const key = estateOpsKeys.request(scope, id ?? 0);
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getResidentRequest(id as number, scope, signal), enabled: id != null && scope.orgReady !== false, staleTime: 15_000 });
  const detail = query.data && query.data.id === id ? query.data : null;
  const r = detail ?? (preview && preview.id === id ? preview : null);
  const onError = (error: unknown) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" });
  const apply = (fresh: ResidentRequest, text: string) => {
    queryClient.setQueryData(key, fresh);
    refresh();
    enqueueSnackbar(text, { variant: "success" });
  };
  const done: Record<RequestAction, string> = { take: t("residents.card.taken"), done: t("residents.card.doneOk"), close: t("residents.card.closedOk") };
  const run = useMutation({ mutationFn: (action: RequestAction) => runRequestAction(id as number, action, scope), onSuccess: (f, action) => apply(f, done[action]), onError });
  const send = useMutation({
    mutationFn: () => replyRequest(id as number, reply, scope),
    onSuccess: () => {
      setReply("");
      void query.refetch();
    },
    onError,
  });
  React.useEffect(() => {
    setDialog(null);
    setReply("");
  }, [id]);

  const actions = r && canManage ? requestActions(r.status, r.defectId != null) : [];
  const busy = run.isPending;

  return (
    <Drawer anchor="right" open={id != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 560 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{r ? [r.number, r.categoryLabel, r.urgent && t("residents.urgent")].filter(Boolean).join(" · ") : ""}</Typography>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {r?.title ?? ""}
          </Typography>
        </Box>
        {r && <StatusPill label={r.statusLabel || r.status} tone={requestTone(r.status)} />}
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
        {!r && query.isLoading && <Skeleton variant="rounded" height={300} />}
        {!r && query.error && <Alert severity="error">{message(query.error, t("residents.card.notFound"))}</Alert>}
        {r && (
          <>
            <Box>
              <SlaBadge r={r} />
            </Box>
            {r.description && <Typography sx={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>{r.description}</Typography>}
            <Box>
              <InfoRow label={t("residents.card.resident")} value={r.resident || "—"} />
              {r.residentPhone && <InfoRow label={t("residents.card.phone")} value={<Link href={`tel:${r.residentPhone}`}>{formatPhoneDisplay(r.residentPhone)}</Link>} />}
              <InfoRow label={t("residents.card.unit")} value={[r.projectName, r.unitNumber != null && `кв. ${r.unitNumber}`].filter(Boolean).join(" · ") || "—"} />
              {r.fromApp && <InfoRow label={t("residents.card.channel")} value={t("residents.fromApp")} />}
              <InfoRow label={t("residents.card.created")} value={r.created ? dayjs(r.created).format("DD.MM.YYYY HH:mm") : "—"} />
              {r.slaDeadline && <InfoRow label={t("residents.card.deadline")} value={dayjs(r.slaDeadline).format("DD.MM.YYYY HH:mm")} tone={r.slaOverdue ? "error" : null} />}
              <InfoRow label={t("residents.card.assignee")} value={r.assignee || t("residents.card.noAssignee")} />
              {r.rating != null && <InfoRow label={t("residents.card.rating")} value={<Rating value={r.rating} readOnly size="small" />} />}
              {r.defectId != null && (
                <InfoRow
                  label={t("residents.card.quality")}
                  value={
                    <Link component={RouterLink} to={`/construction/quality?defect=${r.defectId}`} underline="hover">
                      #{r.defectId}
                    </Link>
                  }
                />
              )}
            </Box>
            {detail && (
              <Box>
                <SectionTitle>{t("residents.card.chat")}</SectionTitle>
                {detail.messages.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("residents.card.chatEmpty")}</Typography>}
                <Box sx={{ display: "grid", gap: 0.75 }}>
                  {detail.messages.map((m) => (
                    <Box
                      key={m.id}
                      sx={(th) => ({
                        maxWidth: "85%",
                        justifySelf: m.fromResident ? "start" : "end",
                        px: 1.25,
                        py: 0.75,
                        borderRadius: "12px",
                        bgcolor: m.fromResident ? subtleBg(th, true) : th.palette.primary.main,
                        color: m.fromResident ? "text.primary" : th.palette.primary.contrastText,
                      })}
                    >
                      <Typography sx={{ fontSize: "0.8125rem", whiteSpace: "pre-wrap" }}>{m.text}</Typography>
                      <Typography sx={{ mt: 0.25, fontSize: "0.68rem", opacity: 0.75 }}>{[m.by, m.at && dayjs(m.at).format("DD.MM HH:mm")].filter(Boolean).join(" · ")}</Typography>
                    </Box>
                  ))}
                </Box>
                {canManage && r.status !== "closed" && (
                  <Box sx={{ mt: 1, display: "flex", gap: 1, alignItems: "flex-end" }}>
                    <TextField size="small" fullWidth multiline maxRows={4} label={t("residents.card.reply")} value={reply} onChange={(e) => setReply(e.target.value)} />
                    <IconButton color="primary" aria-label={t("residents.card.send")} disabled={!reply.trim() || send.isPending} onClick={() => send.mutate()}>
                      <SendOutlined />
                    </IconButton>
                  </Box>
                )}
              </Box>
            )}
            {detail && detail.similar.length > 0 && (
              <Box>
                <SectionTitle>{t("residents.card.similar")}</SectionTitle>
                {detail.similar.map((s) => (
                  <Typography key={s.id} sx={{ fontSize: "0.8125rem" }}>
                    {s.number} · {s.title} <Box component="span" sx={{ color: "text.secondary" }}>· {s.statusLabel}</Box>
                  </Typography>
                ))}
              </Box>
            )}
            {detail && (
              <Box>
                <SectionTitle>{t("common.history")}</SectionTitle>
                <HistoryList items={detail.history} empty="—" />
              </Box>
            )}
          </>
        )}
      </Box>
      {actions.length > 0 && (
        <Box sx={{ px: 2.5, py: 1.5, display: "flex", flexWrap: "wrap", gap: 1, borderTop: 1, borderColor: "divider" }}>
          {actions.includes("take") && (
            <Button variant="contained" onClick={() => run.mutate("take")} disabled={busy}>
              {t("residents.card.take")}
            </Button>
          )}
          {actions.includes("done") && (
            <Button variant="contained" onClick={() => run.mutate("done")} disabled={busy}>
              ✓ {t("residents.card.done")}
            </Button>
          )}
          {actions.includes("close") && (
            <Button variant="contained" onClick={() => run.mutate("close")} disabled={busy}>
              {t("residents.card.close")}
            </Button>
          )}
          {actions.includes("assign") && <Button onClick={() => setDialog("assign")}>{t("residents.card.assign")}</Button>}
          {actions.includes("toQuality") && (
            <Button color="warning" onClick={() => setDialog("quality")} sx={{ ml: "auto" }}>
              {t("residents.card.toQuality")}
            </Button>
          )}
        </Box>
      )}
      <AssignDialog request={dialog === "assign" ? r : null} onClose={() => setDialog(null)} onDone={(f) => apply(f, t("residents.card.assigned"))} />
      <QualityDialog request={dialog === "quality" ? r : null} onClose={() => setDialog(null)} onDone={(f) => apply(f, t("residents.card.toQualityOk"))} />
    </Drawer>
  );
}

function AssignDialog({ request, onClose, onDone }: { request: ResidentRequest | null; onClose: () => void; onDone: (r: ResidentRequest) => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const employees = useWorkingEmployees(request != null);
  const [assigneeId, setAssigneeId] = React.useState<number | "">("");
  const [external, setExternal] = React.useState("");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => assignRequest(request?.id as number, { ...(assigneeId !== "" ? { assigneeId } : { assigneeName: external.trim() }), ...(note.trim() ? { note: note.trim() } : {}) }, scope),
    onSuccess: (f) => {
      onClose();
      onDone(f);
    },
  });
  React.useEffect(() => {
    if (!request) return;
    setAssigneeId(request.assigneeId ?? "");
    setExternal("");
    setNote("");
    setTouched(false);
    save.reset();
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const empty = assigneeId === "" && !external.trim();
  return (
    <ConfirmDialog
      open={request != null}
      title={t("residents.assignForm.title")}
      text={request?.title}
      confirmLabel={t("residents.assignForm.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!empty) save.mutate();
      }}
      onClose={onClose}
    >
      <TextField select size="small" label={t("residents.assignForm.employee")} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value === "" ? "" : Number(e.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
        <MenuItem value="">—</MenuItem>
        {employees.map((e) => (
          <MenuItem key={e.id} value={e.id}>
            {[e.name, e.position].filter(Boolean).join(" · ")}
          </MenuItem>
        ))}
      </TextField>
      <TextField size="small" label={t("residents.assignForm.external")} value={external} disabled={assigneeId !== ""} onChange={(e) => setExternal(e.target.value)} helperText={t("residents.assignForm.externalHint")} />
      <TextField size="small" label={t("residents.assignForm.note")} value={note} onChange={(e) => setNote(e.target.value)} />
      {touched && empty && <Alert severity="warning">{t("residents.assignForm.pick")}</Alert>}
    </ConfirmDialog>
  );
}

function QualityDialog({ request, onClose, onDone }: { request: ResidentRequest | null; onClose: () => void; onDone: (r: ResidentRequest) => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const contractors = useContractorOptions(request != null);
  const [contractorId, setContractorId] = React.useState<number | "">("");
  const [deadline, setDeadline] = React.useState<Dayjs | null>(null);
  const save = useMutation({
    mutationFn: () => requestToQuality(request?.id as number, { contractorId: contractorId === "" ? null : contractorId, deadline: isoDate(deadline) }, scope),
    onSuccess: (f) => {
      onClose();
      onDone(f);
    },
  });
  React.useEffect(() => {
    if (!request) return;
    setContractorId("");
    setDeadline(dayjs().add(7, "day"));
    save.reset();
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  return (
    <ConfirmDialog open={request != null} title={t("residents.qualityForm.title")} text={request?.title} confirmLabel={t("residents.qualityForm.save")} busy={save.isPending} error={save.error} onConfirm={() => save.mutate()} onClose={onClose}>
      <TextField select size="small" label={t("residents.qualityForm.contractor")} value={contractorId} onChange={(e) => setContractorId(e.target.value === "" ? "" : Number(e.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
        <MenuItem value="">{t("common.ownForces")}</MenuItem>
        {contractors.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      <CustomDatePicker label={t("residents.qualityForm.deadline")} value={deadline} onChange={(v) => setDeadline(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
    </ConfirmDialog>
  );
}

/**
 * «＋ Обращение». ⚠ Коды категорий описаны в справочнике бэка
 * (`docs/aivio-api/ops.md` §2.1), у фронта его нет — список собираем из уже
 * пришедших категорий (сводка, список).
 */
export function NewRequestDrawer({ open, categories, onClose, onCreated }: { open: boolean; categories: { category: string; categoryLabel: string }[]; onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const projects = useConstructionProjects(open).data ?? [];
  const [resident, setResident] = React.useState("");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [unit, setUnit] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [sla, setSla] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [urgent, setUrgent] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => createResidentRequest({ resident, projectId: projectId as number, unitNumber: unit, category, sla: sla.trim() ? Math.round(parseNumber(sla) as number) : null, title, description, urgent }, scope),
    onSuccess: (r) => {
      refresh();
      enqueueSnackbar(t("residents.form.created"), { variant: "success" });
      onClose();
      onCreated(r.id);
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setResident("");
    setProjectId("");
    setUnit("");
    setCategory(categories[0]?.category ?? "");
    setSla("");
    setTitle("");
    setDescription("");
    setUrgent(false);
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const slaBad = sla.trim() !== "" && (parseNumber(sla) == null || (parseNumber(sla) as number) <= 0);
  const invalid = { resident: !resident.trim(), project: projectId === "", category: !category, title: !title.trim(), description: !description.trim(), sla: slaBad };
  const req = (bad: boolean) => (touched && bad ? t("common.required") : undefined);
  return (
    <FormDrawer
      open={open}
      title={t("residents.form.title")}
      submitLabel={t("residents.form.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!Object.values(invalid).some(Boolean)) save.mutate();
      }}
    >
      <TextField size="small" label={t("residents.form.resident")} value={resident} onChange={(e) => setResident(e.target.value)} error={touched && invalid.resident} helperText={req(invalid.resident)} />
      <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1.5 }}>
        <TextField select size="small" label={t("residents.form.project")} value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} error={touched && invalid.project} helperText={req(invalid.project)}>
          {projects.map((p) => (
            <MenuItem key={p.projectId} value={p.projectId}>
              {p.projectName}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" label={t("residents.form.unit")} value={unit} onChange={(e) => setUnit(e.target.value)} />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1.5 }}>
        <TextField select size="small" label={t("residents.form.category")} value={category} onChange={(e) => setCategory(e.target.value)} error={touched && invalid.category} helperText={categories.length === 0 ? t("residents.form.noCategories") : req(invalid.category)}>
          {categories.map((c) => (
            <MenuItem key={c.category} value={c.category}>
              {c.categoryLabel}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" label={t("residents.form.sla")} value={sla} inputMode="numeric" onChange={(e) => setSla(e.target.value)} error={touched && invalid.sla} helperText={touched && invalid.sla ? t("common.number") : t("residents.form.slaHint")} />
      </Box>
      <TextField size="small" label={t("residents.form.titleField")} value={title} onChange={(e) => setTitle(e.target.value)} error={touched && invalid.title} helperText={req(invalid.title)} />
      <TextField size="small" label={t("residents.form.description")} value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={3} error={touched && invalid.description} helperText={req(invalid.description)} />
      <FormControlLabel control={<Checkbox size="small" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />} label={t("residents.form.urgent")} />
    </FormDrawer>
  );
}

/** «＋ Уведомление» жильцам дома: каналы — пресеты select макета (гайд §5). */
export function NoticeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const projects = useConstructionProjects(open).data ?? [];
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [preset, setPreset] = React.useState("push_whatsapp");
  const [title, setTitle] = React.useState("");
  const [text, setText] = React.useState("");
  const [later, setLater] = React.useState(false);
  const [at, setAt] = React.useState<Dayjs | null>(null);
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () =>
      createNotice(
        {
          projectId: projectId as number,
          channels: NOTICE_CHANNEL_PRESETS.find((p) => p.key === preset)?.channels ?? ["push"],
          title,
          text,
          scheduledAt: later && at ? at.hour(10).minute(0).second(0).format() : null,
        },
        scope,
      ),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("residents.noticeForm.created"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setProjectId("");
    setPreset("push_whatsapp");
    setTitle("");
    setText("");
    setLater(false);
    setAt(dayjs().add(1, "day"));
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const invalid = { project: projectId === "", title: !title.trim(), text: !text.trim(), at: later && !isoDate(at) };
  return (
    <FormDrawer
      open={open}
      title={t("residents.noticeForm.title")}
      submitLabel={t("residents.noticeForm.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!Object.values(invalid).some(Boolean)) save.mutate();
      }}
    >
      <TextField select size="small" label={t("residents.noticeForm.project")} value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} error={touched && invalid.project} helperText={touched && invalid.project ? t("common.required") : undefined}>
        {projects.map((p) => (
          <MenuItem key={p.projectId} value={p.projectId}>
            {p.projectName}
          </MenuItem>
        ))}
      </TextField>
      <TextField select size="small" label={t("residents.noticeForm.channels")} value={preset} onChange={(e) => setPreset(e.target.value)}>
        {NOTICE_CHANNEL_PRESETS.map((p) => (
          <MenuItem key={p.key} value={p.key}>
            {t(`residents.noticeForm.preset_${p.key}`)}
          </MenuItem>
        ))}
      </TextField>
      <TextField size="small" label={t("residents.noticeForm.titleField")} value={title} onChange={(e) => setTitle(e.target.value)} error={touched && invalid.title} helperText={touched && invalid.title ? t("common.required") : undefined} />
      <TextField size="small" label={t("residents.noticeForm.text")} value={text} onChange={(e) => setText(e.target.value)} multiline minRows={3} error={touched && invalid.text} helperText={touched && invalid.text ? t("common.required") : undefined} />
      <FormControlLabel control={<Checkbox size="small" checked={later} onChange={(e) => setLater(e.target.checked)} />} label={t("residents.noticeForm.later")} />
      {later && <CustomDatePicker label={t("residents.noticeForm.when")} value={at} onChange={(v) => setAt(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true, error: touched && invalid.at } }} />}
    </FormDrawer>
  );
}
