import React from "react";
import { Alert, Box, Button, Drawer, IconButton, Link, MenuItem, Skeleton, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";

import {
  NOTIFY_CHANNELS,
  addHandoverDefect,
  checklistRooms,
  createHandover,
  estateOpsKeys,
  getHandover,
  getWaitingHandovers,
  inspectHandover,
  remindHandover,
  rescheduleHandover,
  resolveHandoverDefect,
  signHandover,
  tickChecklist,
  type Handover,
  type WaitingHandover,
} from "../../api/estateOps";
import { CustomDatePicker } from "../../components/ui";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatPhoneDisplay } from "../../utility/phone";
import { HistoryList, SectionTitle, StatusPill } from "../construction/shared";
import { useContractorOptions } from "../construction/hooks";
import { ConfirmDialog, FormDrawer, InfoRow } from "../realty-finance/shared";
import { handoverTone, isoDate, parseNumber } from "./format";
import { useRefreshOps, useWorkingEmployees } from "./hooks";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Карточка приёмки (`?handover=`): смотровой лист, замечания, акт и ключи. */
export function HandoverDrawer({ id, preview, canManage, onClose }: { id: number | null; preview: Handover | null; canManage: boolean; onClose: () => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const [dialog, setDialog] = React.useState<"reschedule" | "remind" | "defect" | "sign" | null>(null);
  const key = estateOpsKeys.handover(scope, id ?? 0);
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getHandover(id as number, scope, signal), enabled: id != null && scope.orgReady !== false, staleTime: 15_000 });
  const detail = query.data && query.data.id === id ? query.data : null;
  const h = detail ?? (preview && preview.id === id ? preview : null);
  // Ответ любого действия — полная карточка: кладём её и перечитываем списки.
  const apply = (fresh: Handover, text: string) => {
    queryClient.setQueryData(key, fresh);
    refresh();
    if (text) enqueueSnackbar(text, { variant: "success" });
  };
  const onError = (error: unknown) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" });
  const inspect = useMutation({ mutationFn: () => inspectHandover(id as number, scope), onSuccess: (f) => apply(f, t("handover.card.inspected")), onError });
  const tick = useMutation({ mutationFn: ({ itemId, ok }: { itemId: number; ok: boolean | null }) => tickChecklist(id as number, itemId, ok, scope), onSuccess: (f) => apply(f, ""), onError });
  const resolve = useMutation({ mutationFn: (defectId: number) => resolveHandoverDefect(id as number, defectId, scope), onSuccess: (f) => apply(f, t("handover.card.resolved")), onError });
  React.useEffect(() => setDialog(null), [id]);

  const editableChecklist = canManage && h != null && (h.status === "inspected" || h.status === "defects");
  const canSign = editableChecklist;
  const rooms = detail ? checklistRooms(detail.checklist) : [];

  return (
    <Drawer anchor="right" open={id != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 580 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{h ? [h.projectName, h.unitNumber != null && `кв. ${h.unitNumber}`].filter(Boolean).join(" · ") : ""}</Typography>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {h ? t("handover.card.title", { number: h.number }) : ""}
          </Typography>
        </Box>
        {h && <StatusPill label={h.statusLabel || t(`handover.status.${h.status}`, { defaultValue: h.status })} tone={handoverTone(h.status)} />}
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
        {!h && query.isLoading && <Skeleton variant="rounded" height={300} />}
        {!h && query.error && <Alert severity="error">{message(query.error, t("handover.card.notFound"))}</Alert>}
        {h && (
          <>
            <Box>
              <InfoRow label={t("handover.card.buyer")} value={[h.buyer, h.phone && formatPhoneDisplay(h.phone)].filter(Boolean).join(" · ") || "—"} />
              <InfoRow label={t("handover.card.unit")} value={[h.unitNumber != null && `№${h.unitNumber}`, h.floor != null && `${h.floor} эт.`, h.rooms != null && `${h.rooms}-комн.`, h.area != null && `${h.area} м²`].filter(Boolean).join(" · ") || "—"} />
              <InfoRow label={t("handover.card.when")} value={`${h.date ? dayjs(h.date).format("DD.MM.YYYY") : "—"} ${h.time}`} />
              <InfoRow label={t("handover.card.manager")} value={h.manager || "—"} />
              {h.notify && <InfoRow label={t("handover.card.notify")} value={h.notify} />}
              {h.keys && <InfoRow label={t("handover.card.keys")} value={t("handover.card.keysValue", { count: h.keysCount, date: h.keysAt ? dayjs(h.keysAt).format("DD.MM.YYYY") : "" })} tone="success" />}
              {h.actNumber && (
                <InfoRow
                  label={t("handover.card.act")}
                  value={
                    <Link component={RouterLink} to={`/edo?q=${encodeURIComponent(h.actNumber)}`} underline="hover">
                      {h.actNumber}
                    </Link>
                  }
                />
              )}
            </Box>
            {h.meters.length > 0 && (
              <Box>
                <SectionTitle>{t("handover.card.meters")}</SectionTitle>
                {h.meters.map(([name, value]) => (
                  <InfoRow key={name} label={name} value={value} />
                ))}
              </Box>
            )}
            {detail && detail.checklist.length > 0 && (
              <Box>
                <SectionTitle>
                  {t("handover.card.checklist")} · {t("handover.card.checklistValue", { checked: detail.checklistChecked, total: detail.checklistTotal })}
                </SectionTitle>
                {rooms.map((room) => (
                  <Box key={room} sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: "text.secondary", textTransform: "uppercase", mb: 0.25 }}>{room}</Typography>
                    {detail.checklist
                      .filter((c) => c.room === room)
                      .sort((a, b) => a.index - b.index)
                      .map((c) => (
                        <Box key={c.id} sx={{ py: 0.4, display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", color: c.ok === false ? "error.main" : "text.primary" }}>{c.item}</Typography>
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={c.ok === true ? "ok" : c.ok === false ? "bad" : "none"}
                            disabled={!editableChecklist || tick.isPending}
                            onChange={(_, v: string | null) => v && tick.mutate({ itemId: c.id, ok: v === "ok" ? true : v === "bad" ? false : null })}
                          >
                            <ToggleButton value="ok" aria-label={t("handover.card.ok")} sx={{ px: 0.75, py: 0.25, "&.Mui-selected": { color: "success.main" } }}>
                              <CheckOutlined fontSize="small" />
                            </ToggleButton>
                            <ToggleButton value="none" aria-label={t("handover.card.clear")} sx={{ px: 0.75, py: 0.25 }}>
                              <RemoveOutlined fontSize="small" />
                            </ToggleButton>
                            <ToggleButton value="bad" aria-label={t("handover.card.bad")} sx={{ px: 0.75, py: 0.25, "&.Mui-selected": { color: "error.main" } }}>
                              <CloseOutlined fontSize="small" />
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Box>
                      ))}
                  </Box>
                ))}
              </Box>
            )}
            {detail && (
              <Box>
                <SectionTitle
                  action={
                    editableChecklist ? (
                      <Button size="small" onClick={() => setDialog("defect")}>
                        + {t("handover.card.addDefect")}
                      </Button>
                    ) : undefined
                  }
                >
                  {t("handover.card.defects")}
                </SectionTitle>
                {detail.defects.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("handover.card.defectsEmpty")}</Typography>}
                {detail.defects.map((d) => (
                  <Box key={d.id} sx={{ py: 0.75, display: "flex", alignItems: "baseline", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, textDecoration: d.done ? "line-through" : "none", color: d.done ? "text.secondary" : "text.primary" }}>{d.title}</Typography>
                      <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                        {[d.room, d.contractorName || t("common.ownForces"), d.fixBy && t("handover.card.fixBy", { date: dayjs(d.fixBy).format("DD.MM") })].filter(Boolean).join(" · ")}
                        {d.defectId != null && (
                          <>
                            {" · "}
                            <Link component={RouterLink} to={`/construction/quality?defect=${d.defectId}`} underline="hover">
                              {t("handover.card.defectQuality")}
                            </Link>
                          </>
                        )}
                      </Typography>
                    </Box>
                    {canManage && !d.done && (
                      <Button size="small" onClick={() => resolve.mutate(d.id)} disabled={resolve.isPending}>
                        {t("handover.card.resolve")}
                      </Button>
                    )}
                  </Box>
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
      {h && canManage && h.status !== "done" && (
        <Box sx={{ px: 2.5, py: 1.5, display: "grid", gap: 1, borderTop: 1, borderColor: "divider" }}>
          {h.status === "scheduled" && (
            <Button fullWidth variant="contained" onClick={() => inspect.mutate()} disabled={inspect.isPending}>
              {t("handover.card.inspect")}
            </Button>
          )}
          {canSign && (
            <Button fullWidth variant="contained" onClick={() => setDialog("sign")}>
              ✎ {t("handover.card.sign")}
            </Button>
          )}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button onClick={() => setDialog("reschedule")}>{t("handover.card.reschedule")}</Button>
            <Button onClick={() => setDialog("remind")}>{t("handover.card.remind")}</Button>
          </Box>
        </Box>
      )}
      <RescheduleDialog handover={dialog === "reschedule" ? h : null} onClose={() => setDialog(null)} onDone={(f) => apply(f, t("handover.card.rescheduled"))} />
      <RemindDialog handover={dialog === "remind" ? h : null} onClose={() => setDialog(null)} onDone={(f) => apply(f, t("handover.card.reminded"))} />
      <DefectDialog handover={dialog === "defect" ? detail : null} rooms={rooms} onClose={() => setDialog(null)} onDone={(f) => apply(f, t("handover.defectForm.created"))} />
      <SignDialog handover={dialog === "sign" ? detail : null} onClose={() => setDialog(null)} onDone={(f) => apply(f, t("handover.card.signed"))} />
    </Drawer>
  );
}

function RescheduleDialog({ handover, onClose, onDone }: { handover: Handover | null; onClose: () => void; onDone: (h: Handover) => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const [date, setDate] = React.useState<Dayjs | null>(null);
  const [time, setTime] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => rescheduleHandover(handover?.id as number, { date: isoDate(date) as string, time, reason }, scope),
    onSuccess: (f) => {
      onClose();
      onDone(f);
    },
  });
  React.useEffect(() => {
    if (!handover) return;
    setDate(handover.date ? dayjs(handover.date).add(1, "day") : dayjs().add(1, "day"));
    setTime(handover.time || "10:00");
    setReason("");
    setTouched(false);
    save.reset();
  }, [handover]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const invalid = { date: !isoDate(date), time: !TIME_RE.test(time) };
  return (
    <ConfirmDialog
      open={handover != null}
      title={t("handover.rescheduleForm.title")}
      text={handover ? `${handover.number} · ${handover.buyer}` : null}
      confirmLabel={t("handover.rescheduleForm.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!invalid.date && !invalid.time) save.mutate();
      }}
      onClose={onClose}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1.5 }}>
        <CustomDatePicker label={t("handover.rescheduleForm.date")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true, error: touched && invalid.date } }} />
        <TextField size="small" label={t("handover.rescheduleForm.time")} value={time} placeholder="10:00" onChange={(e) => setTime(e.target.value)} error={touched && invalid.time} helperText={touched && invalid.time ? "ЧЧ:ММ" : undefined} />
      </Box>
      <TextField size="small" label={t("handover.rescheduleForm.reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </ConfirmDialog>
  );
}

function RemindDialog({ handover, onClose, onDone }: { handover: Handover | null; onClose: () => void; onDone: (h: Handover) => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const [channel, setChannel] = React.useState<string>("push");
  const save = useMutation({
    mutationFn: () => remindHandover(handover?.id as number, channel, scope),
    onSuccess: (f) => {
      onClose();
      onDone(f);
    },
  });
  React.useEffect(() => {
    if (!handover) return;
    setChannel("push");
    save.reset();
  }, [handover]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  return (
    <ConfirmDialog open={handover != null} title={t("handover.remindForm.title")} text={handover?.buyer} confirmLabel={t("handover.remindForm.save")} busy={save.isPending} error={save.error} onConfirm={() => save.mutate()} onClose={onClose}>
      <TextField select size="small" label={t("handover.remindForm.channel")} value={channel} onChange={(e) => setChannel(e.target.value)}>
        {NOTIFY_CHANNELS.map((c) => (
          <MenuItem key={c} value={c}>
            {t(`common.channel_${c}`)}
          </MenuItem>
        ))}
      </TextField>
    </ConfirmDialog>
  );
}

function DefectDialog({ handover, rooms, onClose, onDone }: { handover: Handover | null; rooms: string[]; onClose: () => void; onDone: (h: Handover) => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const contractors = useContractorOptions(handover != null);
  const [title, setTitle] = React.useState("");
  const [room, setRoom] = React.useState("");
  const [contractorId, setContractorId] = React.useState<number | "">("");
  const [fixBy, setFixBy] = React.useState<Dayjs | null>(null);
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => addHandoverDefect(handover?.id as number, { title, room, contractorId: contractorId === "" ? null : contractorId, fixBy: isoDate(fixBy) }, scope),
    onSuccess: (f) => {
      onClose();
      onDone(f);
    },
  });
  React.useEffect(() => {
    if (!handover) return;
    setTitle("");
    setRoom(rooms[0] ?? "");
    setContractorId("");
    setFixBy(dayjs().add(10, "day"));
    setTouched(false);
    save.reset();
  }, [handover]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  return (
    <ConfirmDialog
      open={handover != null}
      title={t("handover.defectForm.title")}
      confirmLabel={t("handover.defectForm.create")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (title.trim() && room) save.mutate();
      }}
      onClose={onClose}
    >
      <TextField size="small" label={t("handover.defectForm.name")} value={title} onChange={(e) => setTitle(e.target.value)} error={touched && !title.trim()} helperText={touched && !title.trim() ? t("common.required") : undefined} />
      <TextField select size="small" label={t("handover.defectForm.room")} value={room} onChange={(e) => setRoom(e.target.value)} error={touched && !room}>
        {rooms.map((r) => (
          <MenuItem key={r} value={r}>
            {r}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField select size="small" label={t("handover.defectForm.contractor")} value={contractorId} onChange={(e) => setContractorId(e.target.value === "" ? "" : Number(e.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">{t("common.ownForces")}</MenuItem>
          {contractors.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <CustomDatePicker label={t("handover.defectForm.fixBy")} value={fixBy} onChange={(v) => setFixBy(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
      </Box>
    </ConfirmDialog>
  );
}

function SignDialog({ handover, onClose, onDone }: { handover: Handover | null; onClose: () => void; onDone: (h: Handover) => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const [keys, setKeys] = React.useState("2");
  const save = useMutation({
    mutationFn: () => signHandover(handover?.id as number, { keysCount: Math.round(parseNumber(keys) as number) }, scope),
    onSuccess: (f) => {
      onClose();
      onDone(f);
    },
  });
  React.useEffect(() => {
    if (!handover) return;
    setKeys("2");
    save.reset();
  }, [handover]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const bad = parseNumber(keys) == null || (parseNumber(keys) as number) < 1;
  return (
    <ConfirmDialog
      open={handover != null}
      title={t("handover.signForm.title")}
      text={t("handover.signForm.text")}
      confirmLabel={t("handover.signForm.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => !bad && save.mutate()}
      onClose={onClose}
    >
      {handover && handover.defectsOpen > 0 && <Alert severity="warning">{t("handover.signForm.openWarn", { count: handover.defectsOpen })}</Alert>}
      <TextField size="small" label={t("handover.signForm.keys")} value={keys} inputMode="numeric" onChange={(e) => setKeys(e.target.value)} error={bad} />
    </ConfirmDialog>
  );
}

/** «＋ Приёмка» / «Назначить» из «Ждут приёмку» / «＋» в ячейке календаря. */
export function NewHandoverDrawer({ preset, onClose, onCreated }: { preset: { waiting: WaitingHandover | null; date: string | null; managerId: number | null } | null; onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const open = preset != null;
  const waiting = useQuery({ queryKey: estateOpsKeys.waiting(scope), queryFn: ({ signal }) => getWaitingHandovers(scope, signal), enabled: open && scope.orgReady !== false, staleTime: 30_000 }).data ?? [];
  const managers = useWorkingEmployees(open);
  const [billingAccountId, setBillingAccountId] = React.useState<number | "">("");
  const [date, setDate] = React.useState<Dayjs | null>(null);
  const [time, setTime] = React.useState("10:00");
  const [managerId, setManagerId] = React.useState<number | "">("");
  const [notify, setNotify] = React.useState("push");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => createHandover({ billingAccountId: billingAccountId as number, date: isoDate(date) as string, time, managerId: managerId === "" ? null : managerId, notify }, scope),
    onSuccess: (h) => {
      refresh();
      enqueueSnackbar(t("handover.form.created"), { variant: "success" });
      onClose();
      onCreated(h.id);
    },
  });
  React.useEffect(() => {
    if (!preset) return;
    setBillingAccountId(preset.waiting?.billingAccountId ?? "");
    setDate(preset.date ? dayjs(preset.date) : dayjs().add(1, "day"));
    setTime("10:00");
    setManagerId(preset.managerId ?? "");
    setNotify("push");
    setTouched(false);
    save.reset();
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  // Выбранный из «Ждут приёмку» может уже не значиться в списке — показываем его всё равно.
  const options = preset?.waiting && !waiting.some((w) => w.billingAccountId === preset.waiting?.billingAccountId) ? [preset.waiting, ...waiting] : waiting;
  const invalid = { account: billingAccountId === "", date: !isoDate(date), time: !TIME_RE.test(time) };
  return (
    <FormDrawer
      open={open}
      title={t("handover.form.title")}
      submitLabel={t("handover.form.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!Object.values(invalid).some(Boolean)) save.mutate();
      }}
    >
      <TextField select size="small" label={t("handover.form.waiting")} value={billingAccountId} onChange={(e) => setBillingAccountId(Number(e.target.value))} error={touched && invalid.account} helperText={touched && invalid.account ? t("common.required") : undefined}>
        {options.map((w) => (
          <MenuItem key={w.billingAccountId} value={w.billingAccountId}>
            {[w.buyer, w.projectName, w.unitNumber != null && `кв. ${w.unitNumber}`, w.contract].filter(Boolean).join(" · ")}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1.5 }}>
        <CustomDatePicker label={t("handover.form.date")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true, error: touched && invalid.date } }} />
        <TextField size="small" label={t("handover.form.time")} value={time} placeholder="10:00" onChange={(e) => setTime(e.target.value)} error={touched && invalid.time} helperText={touched && invalid.time ? "ЧЧ:ММ" : undefined} />
      </Box>
      <TextField select size="small" label={t("handover.form.manager")} value={managerId} onChange={(e) => setManagerId(e.target.value === "" ? "" : Number(e.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
        <MenuItem value="">—</MenuItem>
        {managers.map((m) => (
          <MenuItem key={m.id} value={m.id}>
            {[m.name, m.position].filter(Boolean).join(" · ")}
          </MenuItem>
        ))}
      </TextField>
      <TextField select size="small" label={t("handover.form.notify")} value={notify} onChange={(e) => setNotify(e.target.value)}>
        {NOTIFY_CHANNELS.map((c) => (
          <MenuItem key={c} value={c}>
            {t(`common.channel_${c}`)}
          </MenuItem>
        ))}
      </TextField>
    </FormDrawer>
  );
}
