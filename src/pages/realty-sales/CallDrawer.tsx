import React from "react";
import { Alert, Box, Button, Drawer, IconButton, Skeleton, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router";
import AddTaskOutlined from "@mui/icons-material/AddTaskOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";

import { estateDashboardKeys } from "../../api/estateDashboard";
import { createCallTask, formatCallDuration, getCall, realtyCallKeys, updateCall, type Call } from "../../api/realtyCalls";
import { realtyLeadKeys } from "../../api/realtyLeads";
import { realtyTaskKeys } from "../../api/realtyTasks";
import { useCan } from "../../hooks/useCan";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatPhoneDisplay } from "../../utility/phone";
import { CallDirectionChip } from "./CallDirectionChip";
import { callTimeLabel } from "./format";

interface Draft {
  result: string;
  summary: string;
  nextAction: string;
}

/**
 * Карточка звонка — шторка `?call=<id>`: факты, запись (если есть ссылка),
 * итог с оценкой, следующий шаг, расшифровка. С `realty.manage` — правка
 * итога и «Создать задачу» (задача на +1 час с текстом следующего шага).
 */
export function CallDrawer({ callId, onClose }: { callId: number | null; onClose: () => void }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("realty.manage");
  const [draft, setDraft] = React.useState<Draft | null>(null);

  React.useEffect(() => setDraft(null), [callId]);

  const call = useQuery({
    queryKey: realtyCallKeys.detail(scope, callId ?? 0),
    queryFn: ({ signal }) => getCall(callId as number, scope, signal),
    enabled: callId != null && scope.orgReady !== false,
    staleTime: 15_000,
  });
  const failed = (error: unknown) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" });

  const save = useMutation({
    mutationFn: (patch: Draft) => updateCall(callId as number, patch, scope),
    onSuccess: (fresh) => {
      queryClient.setQueryData(realtyCallKeys.detail(scope, fresh.id), fresh);
      void queryClient.invalidateQueries({ queryKey: realtyCallKeys.all });
      setDraft(null);
      enqueueSnackbar(t("calls.card.saved"), { variant: "success" });
    },
    onError: failed,
  });
  const task = useMutation({
    mutationFn: () => createCallTask(callId as number, scope),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: realtyTaskKeys.all });
      void queryClient.invalidateQueries({ queryKey: realtyLeadKeys.all });
      void queryClient.invalidateQueries({ queryKey: estateDashboardKeys.all });
      enqueueSnackbar(t("calls.card.taskCreated"), { variant: "success" });
    },
    onError: failed,
  });

  const data = call.data;
  const copySummary = async (c: Call) => {
    const text = [c.summary, c.nextAction && `${t("calls.card.nextAction")}: ${c.nextAction}`].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      enqueueSnackbar(t("calls.card.copied"), { variant: "success" });
    } catch {
      failed(null);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={callId != null}
      onClose={save.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 600 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {data ? (
            <>
              <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "text.secondary" }}>
                {[data.number, callTimeLabel(data.at, t)].filter(Boolean).join(" · ")}
              </Typography>
              <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.2rem" }}>
                {data.client || "—"}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", fontSize: "0.875rem", color: "text.secondary" }}>
                {data.phone && (
                  <Box component="a" href={`tel:${data.phone}`} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "primary.main", textDecoration: "none" }}>
                    <PhoneOutlined sx={{ fontSize: 16 }} />
                    {formatPhoneDisplay(data.phone)}
                  </Box>
                )}
                {data.manager && <span>· {data.manager}</span>}
              </Box>
            </>
          ) : (
            <>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("calls.card.title")}</Typography>
              <Skeleton width={220} height={32} />
            </>
          )}
        </Box>
        {data && (
          <Box sx={{ display: "grid", justifyItems: "end", gap: 0.5, pt: 0.25 }}>
            <CallDirectionChip call={data} />
            {data.result && <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{data.result}</Typography>}
          </Box>
        )}
        <IconButton aria-label={t("common.close")} onClick={onClose} disabled={save.isPending}>
          <CloseOutlined />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, alignContent: "start" }}>
        {call.isError && <Alert severity="error">{call.error instanceof Error ? call.error.message : t("calls.loadError")}</Alert>}
        {!data && !call.isError && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={56} />)}
        {data && (
          <>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" } }}>
              {(
                [
                  ["duration", data.seconds > 0 ? formatCallDuration(data.seconds) : "—"],
                  ["project", data.project || "—"],
                  ["deal", data.deal || "—"],
                  ["sentiment", data.sentiment || "—"],
                ] as const
              ).map(([key, value]) => (
                <Box key={key} sx={{ px: 1.25, py: 1, border: 1, borderColor: "divider", borderRadius: "10px", minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                    {t(`calls.card.${key}`)}
                  </Typography>
                  <Typography noWrap title={value} sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Box sx={(th) => ({ px: 2, py: 1.5, borderRadius: "12px", bgcolor: subtleBg(th, true) })}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, mb: data.recordingUrl ? 1 : 0.25 }}>{t("calls.card.recording")}</Typography>
              {data.recordingUrl ? (
                <Box component="audio" controls preload="none" src={data.recordingUrl} sx={{ width: "100%", height: 36 }} />
              ) : (
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{data.recording ? t("calls.card.noRecordingUrl") : t("calls.card.noRecording")}</Typography>
              )}
            </Box>

            <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 2, display: "grid", gap: 1.25 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                <Typography sx={{ flex: 1, fontWeight: 700 }}>{t("calls.card.summary")}</Typography>
                {data.quality != null && (
                  <Typography sx={{ fontWeight: 800, fontSize: "1.25rem", fontVariantNumeric: "tabular-nums" }} aria-label={t("calls.card.quality")}>
                    {data.quality}
                    <Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" }}>
                      /100
                    </Box>
                  </Typography>
                )}
              </Box>

              {draft ? (
                <Box
                  component="form"
                  onSubmit={(e: React.FormEvent) => {
                    e.preventDefault();
                    save.mutate({ result: draft.result.trim(), summary: draft.summary.trim(), nextAction: draft.nextAction.trim() });
                  }}
                  sx={{ display: "grid", gap: 1.5 }}
                >
                  <TextField size="small" label={t("calls.card.result")} value={draft.result} onChange={(e) => setDraft({ ...draft, result: e.target.value })} autoFocus />
                  <TextField size="small" label={t("calls.card.summary")} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} multiline minRows={2} maxRows={6} />
                  <TextField size="small" label={t("calls.card.nextAction")} value={draft.nextAction} onChange={(e) => setDraft({ ...draft, nextAction: e.target.value })} />
                  <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                    <Button onClick={() => setDraft(null)} disabled={save.isPending}>
                      {t("common.cancel")}
                    </Button>
                    <Button type="submit" variant="contained" disabled={save.isPending}>
                      {t("calls.card.save")}
                    </Button>
                  </Box>
                </Box>
              ) : (
                <>
                  <Typography sx={{ fontSize: "0.875rem", whiteSpace: "pre-wrap", color: data.summary ? "text.primary" : "text.secondary" }}>{data.summary || t("calls.card.noSummary")}</Typography>
                  {data.nextAction && (
                    <Box sx={(th) => ({ px: 1.5, py: 1, borderRadius: "10px", bgcolor: subtleBg(th, true) })}>
                      <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("calls.card.nextAction")}</Typography>
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{data.nextAction}</Typography>
                    </Box>
                  )}
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    {canManage && data.nextAction && (
                      <Button size="small" variant="contained" startIcon={<AddTaskOutlined />} disabled={task.isPending} onClick={() => task.mutate()}>
                        {t("calls.card.createTask")}
                      </Button>
                    )}
                    {canManage && (
                      <Button size="small" variant="outlined" startIcon={<EditOutlined />} onClick={() => setDraft({ result: data.result, summary: data.summary, nextAction: data.nextAction })}>
                        {t("calls.card.edit")}
                      </Button>
                    )}
                    {(data.summary || data.nextAction) && (
                      <Button size="small" startIcon={<ContentCopyOutlined />} onClick={() => void copySummary(data)}>
                        {t("calls.card.copy")}
                      </Button>
                    )}
                  </Box>
                </>
              )}
            </Box>

            {data.transcript.length > 0 && (
              <Box>
                <Typography sx={{ mb: 0.75, fontWeight: 700 }}>{t("calls.card.transcript")}</Typography>
                <Transcript lines={data.transcript} />
              </Box>
            )}
          </>
        )}
      </Box>

      {data?.leadId != null && (
        <Box sx={{ px: 2.5, py: 1.5, display: "flex", borderTop: 1, borderColor: "divider" }}>
          <Button startIcon={<OpenInNewOutlined />} onClick={() => navigate(`/realestate/leads?lead=${data.leadId}`)}>
            {t("calls.card.openLead")}
          </Button>
        </Box>
      )}
    </Drawer>
  );
}

/** Расшифровка: реплики по участникам, первый говорящий — акцентом, остальные — вторым цветом. */
function Transcript({ lines }: { lines: Call["transcript"] }) {
  const speakers = [...new Set(lines.map((line) => line.speaker))];
  return (
    <Box sx={{ display: "grid" }}>
      {lines.map((line, i) => (
        <Box key={`${line.time}-${i}`} sx={{ py: 1, display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", gap: 1, borderTop: i ? 1 : 0, borderColor: "divider" }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums", pt: 0.25 }}>{line.time}</Typography>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: speakers.indexOf(line.speaker) === 0 ? "primary.main" : "info.main" }}>{line.speaker}</Typography>
            <Typography sx={{ fontSize: "0.875rem" }}>{line.text}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
