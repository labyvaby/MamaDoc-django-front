import React from "react";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";

import type {
  AutomationJobStatus,
  AutomationRun,
  AutomationRunStatus,
} from "../../../api/automations";
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

export interface RunListProps {
  runs: AutomationRun[];
  /**
   * Показывать название правила в карточке. В общей истории оно обязательно —
   * там запуски разных правил идут вперемешку; в карточке одного правила это
   * был бы повтор заголовка.
   */
  showAutomationName?: boolean;
}

/** Список запусков с их отправками — общий для вкладки и карточки правила. */
export const RunList: React.FC<RunListProps> = ({ runs, showAutomationName = false }) => {
  const { t } = useT("settings");

  return (
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
              {showAutomationName && (
                <Typography variant="body2" fontWeight={600}>
                  {run.automationName}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {dayjs(run.createdAt).format("DD.MM.YYYY HH:mm")}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: "monospace" }}
              >
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
                <Box key={job.id} sx={{ borderLeft: 2, borderColor: "divider", pl: 1.5, py: 0.5 }}>
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
              <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.7 }}>
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
  );
};

export default RunList;
