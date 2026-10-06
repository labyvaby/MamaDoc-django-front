import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Skeleton,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router";
import dayjs from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import AddIcCallOutlined from "@mui/icons-material/AddIcCallOutlined";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";

import { getSalesManagers, realEstateKeys } from "../../api/realestate";
import { estateDashboardKeys } from "../../api/estateDashboard";
import { formatCallDuration, getCalls, realtyCallKeys } from "../../api/realtyCalls";
import {
  LEAD_STAGES,
  LEAD_TEMPS,
  addLeadComment,
  deleteLead,
  getLead,
  realtyLeadKeys,
  updateLead,
  type LeadDetail,
} from "../../api/realtyLeads";
import { realtyTaskKeys } from "../../api/realtyTasks";
import { useCan } from "../../hooks/useCan";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatDateRu, formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { TaskDrawer, type TaskDrawerMode } from "../estate-dashboard/TaskDrawer";
import { CallDirectionChip } from "./CallDirectionChip";
import { callTimeLabel, tempColor } from "./format";
import { NewCallDrawer, type CallPreset } from "./NewCallDrawer";

/**
 * Карточка заявки — шторка справа на воронке и в «Лидах» (`?lead=<id>`).
 * Этап, температура и ответственный меняются прямо здесь; комментарии,
 * задачи по заявке и история этапов — снизу. Менять — `realty.manage`.
 * «☎ Позвонить» записывает звонок по заявке, «⌖ Показ» ставит задачу-показ,
 * «▣ Бронь» открывает шахматку в режиме подбора для заявки.
 */
export function LeadDrawer({ leadId, onClose }: { leadId: number | null; onClose: () => void }) {
  const { t } = useT("realtySales");
  const theme = useTheme();
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("realty.manage");
  const canStaff = useCan("staff.view");
  const [comment, setComment] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [taskMode, setTaskMode] = React.useState<TaskDrawerMode | null>(null);
  // Данные заявки держим и после закрытия шторки звонка — иначе форма мигнёт пустой на анимации.
  const [callPreset, setCallPreset] = React.useState<CallPreset | null>(null);
  const [callOpen, setCallOpen] = React.useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    setComment("");
    setConfirmDelete(false);
  }, [leadId]);

  const lead = useQuery({
    queryKey: realtyLeadKeys.detail(scope, leadId ?? 0),
    queryFn: ({ signal }) => getLead(leadId as number, scope, signal),
    enabled: leadId != null && scope.orgReady !== false,
    staleTime: 15_000,
  });
  const callsParams = React.useMemo(() => ({ leadId }), [leadId]);
  const calls = useQuery({
    queryKey: realtyCallKeys.list(scope, callsParams),
    queryFn: ({ signal }) => getCalls(callsParams, scope, signal),
    enabled: leadId != null && scope.orgReady !== false,
    staleTime: 30_000,
  });
  const managers = useQuery({
    queryKey: realEstateKeys.managers(scope),
    queryFn: () => getSalesManagers(scope),
    enabled: leadId != null && canManage && canStaff && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: realtyLeadKeys.all });
    void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
  };
  const failed = (error: unknown) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });

  const patch = useMutation({
    mutationFn: (body: Parameters<typeof updateLead>[1]) => updateLead(leadId as number, body, scope),
    onSuccess: (fresh) => {
      queryClient.setQueryData(realtyLeadKeys.detail(scope, fresh.id), fresh);
      invalidate();
    },
    onError: failed,
  });
  const addComment = useMutation({
    mutationFn: (text: string) => addLeadComment(leadId as number, text, scope),
    onSuccess: () => {
      setComment("");
      invalidate();
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: () => deleteLead(leadId as number, scope),
    onSuccess: () => {
      enqueueSnackbar(t("card.deleted"), { variant: "success" });
      setConfirmDelete(false);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: realtyTaskKeys.all });
      onClose();
    },
    onError: failed,
  });

  const data = lead.data;
  const busy = patch.isPending || remove.isPending;
  const canPickManager = canManage && canStaff && (managers.data?.length ?? 0) > 0;

  return (
    <>
      <Drawer
        anchor="right"
        open={leadId != null}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: "100vw", sm: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
      >
        <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("card.title")}</Typography>
            {data ? (
              <>
                <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.15rem" }}>
                  {data.client}
                </Typography>
                {data.phone && (
                  <Box component="a" href={`tel:${data.phone}`} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "primary.main", fontSize: "0.875rem", textDecoration: "none" }}>
                    <PhoneOutlined sx={{ fontSize: 16 }} />
                    {formatPhoneDisplay(data.phone)}
                  </Box>
                )}
              </>
            ) : (
              <Skeleton width={220} height={32} />
            )}
          </Box>
          <IconButton aria-label={t("common.close")} onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
          {lead.isError && <Alert severity="error">{lead.error instanceof Error ? lead.error.message : t("common.loadError")}</Alert>}
          {!data && !lead.isError && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={48} />)}
          {data && (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                <TextField
                  select
                  size="small"
                  label={t("card.stage")}
                  value={data.stage}
                  disabled={!canManage || busy}
                  onChange={(e) => patch.mutate({ stage: e.target.value })}
                >
                  {LEAD_STAGES.map((stage) => (
                    <MenuItem key={stage} value={stage}>
                      {t(`stages.${stage}`)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label={t("card.temp")}
                  value={data.temp}
                  disabled={!canManage || busy}
                  onChange={(e) => patch.mutate({ temp: e.target.value })}
                >
                  {LEAD_TEMPS.map((temp) => (
                    <MenuItem key={temp} value={temp}>
                      <Box component="span" sx={{ display: "inline-block", width: 8, height: 8, mr: 1, borderRadius: "50%", bgcolor: tempColor(theme, temp) }} />
                      {t(`temp.${temp}`)}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              {/* Ответственный — либо списком (можно сменить), либо строкой фактов, не дважды. */}
              <Facts lead={data} hideManager={canPickManager} />

              {canPickManager && (
                <TextField
                  select
                  size="small"
                  label={t("card.manager")}
                  value={data.managerId != null ? String(data.managerId) : ""}
                  disabled={busy}
                  onChange={(e) => patch.mutate({ managerId: e.target.value ? Number(e.target.value) : null })}
                  slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
                >
                  <MenuItem value="">{t("form.managerNone")}</MenuItem>
                  {data.managerId != null && !(managers.data ?? []).some((m) => m.id === String(data.managerId)) && (
                    <MenuItem value={String(data.managerId)}>{data.manager}</MenuItem>
                  )}
                  {(managers.data ?? [])
                    .filter((m) => m.id)
                    .map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.name}
                      </MenuItem>
                    ))}
                </TextField>
              )}

              {canManage && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcCallOutlined />}
                    onClick={() => {
                      setCallPreset({ leadId: data.id, client: data.client, phone: data.phone, projectId: data.projectId, deal: data.project });
                      setCallOpen(true);
                    }}
                  >
                    {t("card.call")}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<PlaceOutlined />}
                    onClick={() =>
                      setTaskMode({
                        kind: "create",
                        date: dayjs().format("YYYY-MM-DD"),
                        preset: { kind: "show", text: t("card.showTaskText", { client: data.client }), managerId: data.managerId, leadId: data.id },
                      })
                    }
                  >
                    {t("card.show")}
                  </Button>
                  <Button variant="outlined" size="small" startIcon={<ApartmentOutlined />} onClick={() => navigate(reserveHref(data))}>
                    {t("card.reserve")}
                  </Button>
                </Box>
              )}

              <Divider />
              <Section title={t("card.comments")}>
                {data.comments.length === 0 && <Muted>{t("card.noComments")}</Muted>}
                {data.comments.map((c) => (
                  <Box key={c.id} sx={{ py: 0.75 }}>
                    <Typography sx={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>{c.text}</Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {[c.author, c.createdAt && dayjs(c.createdAt).format("DD.MM.YYYY HH:mm")].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                ))}
                {canManage && (
                  <Box
                    component="form"
                    onSubmit={(e: React.FormEvent) => {
                      e.preventDefault();
                      if (comment.trim()) addComment.mutate(comment.trim());
                    }}
                    sx={{ mt: 1, display: "flex", gap: 1, alignItems: "flex-start" }}
                  >
                    <TextField size="small" fullWidth multiline maxRows={4} placeholder={t("card.commentPlaceholder")} value={comment} onChange={(e) => setComment(e.target.value)} />
                    <Button type="submit" variant="contained" size="small" disabled={!comment.trim() || addComment.isPending} sx={{ mt: 0.25 }}>
                      {t("card.commentAdd")}
                    </Button>
                  </Box>
                )}
              </Section>

              <Section title={t("card.tasks")}>
                {data.tasks.length === 0 && <Muted>{t("card.noTasks")}</Muted>}
                {data.tasks.map((task) => (
                  <Box key={task.id} sx={{ py: 0.5, display: "flex", gap: 1, opacity: task.done ? 0.55 : 1 }}>
                    <Typography sx={{ width: 128, flexShrink: 0, whiteSpace: "nowrap", fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums", color: task.overdue && !task.done ? "error.main" : "text.secondary" }}>
                      {formatDateRu(task.date)} {task.time}
                    </Typography>
                    <Typography sx={{ fontSize: "0.875rem", textDecoration: task.done ? "line-through" : "none" }}>{task.text}</Typography>
                  </Box>
                ))}
              </Section>

              <Section title={t("card.calls")}>
                {calls.data?.length === 0 && <Muted>{t("card.noCalls")}</Muted>}
                {calls.data?.map((call) => (
                  <Box
                    key={call.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/realestate/calls?call=${call.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/realestate/calls?call=${call.id}`);
                    }}
                    sx={{ py: 0.75, display: "flex", alignItems: "center", gap: 1, cursor: "pointer", borderRadius: "8px", "&:hover .call-result": { textDecoration: "underline" } }}
                  >
                    <CallDirectionChip call={call} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography className="call-result" noWrap sx={{ fontSize: "0.875rem" }}>
                        {call.result || call.statusLabel}
                      </Typography>
                      <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                        {[callTimeLabel(call.at, t), call.seconds > 0 && formatCallDuration(call.seconds), call.manager].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Section>

              <Section title={t("card.history")}>
                {data.stageHistory.map((h) => (
                  <Box key={h.id} sx={{ py: 0.5 }}>
                    <Typography sx={{ fontSize: "0.875rem" }}>
                      {h.fromStage ? t("card.historyEntry", { from: h.fromName, to: h.toName }) : t("card.historyStart", { to: h.toName })}
                    </Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {[h.by, h.at && dayjs(h.at).format("DD.MM.YYYY HH:mm")].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                ))}
              </Section>
            </>
          )}
        </Box>

        {canManage && data && (
          <Box sx={{ px: 2.5, py: 1.5, display: "flex", borderTop: 1, borderColor: "divider" }}>
            <Button color="error" startIcon={<DeleteOutlineOutlined />} onClick={() => setConfirmDelete(true)} disabled={busy}>
              {t("card.delete")}
            </Button>
          </Box>
        )}
      </Drawer>

      <Dialog open={confirmDelete} onClose={remove.isPending ? undefined : () => setConfirmDelete(false)} maxWidth={false} PaperProps={{ sx: { width: 420, maxWidth: "calc(100vw - 32px)" } }}>
        <DialogTitle>{t("card.deleteTitle")}</DialogTitle>
        <DialogContent>
          <Typography>{t("card.deleteText", { client: data?.client ?? "" })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
            {t("common.cancel")}
          </Button>
          <Button color="error" variant="contained" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {t("card.delete")}
          </Button>
        </DialogActions>
      </Dialog>

      {canManage && <TaskDrawer mode={taskMode} onClose={() => setTaskMode(null)} />}
      {canManage && (
        <NewCallDrawer
          open={callOpen}
          preset={callPreset}
          onClose={() => setCallOpen(false)}
          onCreated={() => {
            setCallOpen(false);
            invalidate();
          }}
        />
      )}
    </>
  );
}

/** «▣ Бронь»: шахматка ЖК заявки в режиме подбора (`?lead=`); выбранная квартира — сразу её карточка. */
function reserveHref(lead: LeadDetail): string {
  const params = new URLSearchParams();
  if (lead.projectId != null) params.set("project", String(lead.projectId));
  if (lead.unitId != null) params.set("unit", String(lead.unitId));
  else params.set("status", "free");
  params.set("lead", String(lead.id));
  return `/realestate/chessboard?${params}`;
}

function Facts({ lead, hideManager }: { lead: LeadDetail; hideManager: boolean }) {
  const { t } = useT("realtySales");
  const rows: [string, React.ReactNode][] = [
    [t("card.project"), [lead.project, lead.location].filter(Boolean).join(" · ") || "—"],
    [t("card.budget"), lead.budget > 0 ? formatKGS(lead.budget) : "—"],
    [t("card.source"), lead.source || "—"],
    ...(hideManager ? [] : ([[t("card.manager"), lead.manager || "—"]] as [string, React.ReactNode][])),
    [
      t("card.task"),
      lead.task ? (
        <Box component="span" sx={{ color: lead.overdue ? "error.main" : "text.primary" }}>
          {lead.task}
        </Box>
      ) : (
        "—"
      ),
    ],
  ];
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)", rowGap: 0.75, columnGap: 1.5 }}>
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{label}</Typography>
          <Typography sx={{ fontSize: "0.875rem", minWidth: 0 }}>{value}</Typography>
        </React.Fragment>
      ))}
      <Typography sx={{ gridColumn: "1 / -1", fontSize: "0.72rem", color: "text.secondary" }}>
        {t("card.created", { date: lead.created ? formatDateRu(lead.created) : "—" })}
      </Typography>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ mb: 0.5, fontWeight: 700, fontSize: "0.9rem" }}>{title}</Typography>
      {children}
    </Box>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{children}</Typography>;
}
