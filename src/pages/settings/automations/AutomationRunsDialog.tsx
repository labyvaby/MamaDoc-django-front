import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import {
  getAutomationRuns,
  type Automation,
  type AutomationJobStatus,
  type AutomationRunStatus,
} from "../../../api/automations";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { useT } from "../../../i18n/VerticalProvider";

const RUN_COLOR: Record<AutomationRunStatus, "default" | "info" | "success" | "error"> = {
  matched: "info",
  skipped: "default",
  completed: "success",
  failed: "error",
};

const JOB_COLOR: Record<AutomationJobStatus, "default" | "success" | "error" | "warning"> = {
  pending: "warning",
  sent: "success",
  failed: "error",
  cancelled: "default",
};

export interface AutomationRunsDialogProps {
  open: boolean;
  automation: Automation | null;
  organizationId: number | undefined;
  onClose: () => void;
}

/** История запусков правила: последние 100 Run с их отправками (без пагинации). */
export const AutomationRunsDialog: React.FC<AutomationRunsDialogProps> = ({
  open,
  automation,
  organizationId,
  onClose,
}) => {
  const { t } = useT("settings");

  const runsQuery = useQuery({
    queryKey: djangoQueryKeys.automations.runs(automation?.id ?? 0, organizationId ?? null),
    queryFn: ({ signal }) =>
      getAutomationRuns(automation!.id, { organizationId }, signal),
    enabled: open && automation != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const runs = runsQuery.data ?? [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>
        {t("automations.runs.title")}
        <Typography variant="caption" color="text.secondary" display="block">
          {t("automations.runs.subtitle", { name: automation?.name ?? "" })}
        </Typography>
      </DialogTitle>
      <Divider />

      <DialogContent dividers sx={{ bgcolor: "background.default" }}>
        {runsQuery.isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
            <CircularProgress />
          </Box>
        ) : runsQuery.isError ? (
          <Alert severity="error">{t("automations.runs.loadError")}</Alert>
        ) : runs.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            {t("automations.runs.empty")}
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            <Alert severity="info">{t("automations.runs.sentHint")}</Alert>
            {runs.map((run) => (
              <Paper key={run.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={1.25}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip
                      size="small"
                      label={t(`automations.runs.status.${run.status}`, {
                        defaultValue: run.status,
                      })}
                      color={RUN_COLOR[run.status] ?? "default"}
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {dayjs(run.createdAt).format("DD.MM.YYYY HH:mm")}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                      {run.eventCode}
                    </Typography>
                  </Stack>

                  {run.error && <Alert severity="error">{run.error}</Alert>}

                  {run.jobs.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      {t("automations.runs.noJobs")}
                    </Typography>
                  ) : (
                    run.jobs.map((job) => (
                      <Box
                        key={job.id}
                        sx={{
                          borderLeft: 2,
                          borderColor: "divider",
                          pl: 1.5,
                          py: 0.5,
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip
                            size="small"
                            label={t(`automations.runs.jobStatus.${job.status}`, {
                              defaultValue: job.status,
                            })}
                            color={JOB_COLOR[job.status] ?? "default"}
                            sx={{ fontWeight: 600 }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {t("automations.runs.scheduledFor")}:{" "}
                            {dayjs(job.scheduledFor).format("DD.MM.YYYY HH:mm")}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {job.recipient || "—"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t("automations.runs.attempts", { count: job.attemptsCount })}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                          {job.renderedBody}
                        </Typography>
                        {job.error && (
                          <Typography variant="caption" color="error">
                            {job.error}
                          </Typography>
                        )}
                      </Box>
                    ))
                  )}

                  <details>
                    <summary
                      style={{ cursor: "pointer", fontSize: 12, opacity: 0.7 }}
                    >
                      {t("automations.runs.payload")}
                    </summary>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        mt: 1,
                        p: 1,
                        fontSize: 12,
                        overflowX: "auto",
                        bgcolor: "action.hover",
                        borderRadius: 1,
                      }}
                    >
                      {JSON.stringify(run.eventPayload, null, 2)}
                    </Box>
                  </details>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common:actions.close")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AutomationRunsDialog;
