import React, { useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";

import {
  getOrganizationRuns,
  type Automation,
  type AutomationRunStatus,
} from "../../../api/automations";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { useT } from "../../../i18n/VerticalProvider";
import { RunList } from "./RunList";

const STATUSES: AutomationRunStatus[] = ["matched", "skipped", "completed", "failed"];

export interface AutomationHistoryTabProps {
  automations: Automation[];
  organizationId: number | undefined;
  enabled: boolean;
}

/**
 * Общая история: последние 100 запусков всех правил организации.
 *
 * Один запрос к `/v2/automations/runs/`, а не обход правил по одному —
 * иначе на организацию с двумя десятками автоматизаций вкладка открывалась
 * бы двумя десятками запросов.
 */
export const AutomationHistoryTab: React.FC<AutomationHistoryTabProps> = ({
  automations,
  organizationId,
  enabled,
}) => {
  const { t } = useT("settings");
  const [automationId, setAutomationId] = useState<number | "">("");
  const [status, setStatus] = useState<AutomationRunStatus | "">("");

  const runsQuery = useQuery({
    queryKey: djangoQueryKeys.automations.history(organizationId ?? null, {
      automationId: automationId === "" ? null : automationId,
      status: status || null,
    }),
    queryFn: ({ signal }) =>
      getOrganizationRuns(
        {
          ...(automationId === "" ? {} : { automationId }),
          ...(status === "" ? {} : { status }),
        },
        { organizationId },
        signal,
      ),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    // Фильтры меняются часто; без этого таблица мигает спиннером на каждый клик.
    placeholderData: keepPreviousData,
  });

  const runs = runsQuery.data ?? [];

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <TextField
          select
          size="small"
          label={t("automations.history.filterAutomation")}
          value={automationId === "" ? "" : String(automationId)}
          onChange={(e) => setAutomationId(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ minWidth: { xs: "100%", sm: 260 } }}
        >
          <MenuItem value="">{t("automations.history.filterAll")}</MenuItem>
          {automations.map((item) => (
            <MenuItem key={item.id} value={String(item.id)}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label={t("automations.history.filterStatus")}
          value={status}
          onChange={(e) => setStatus(e.target.value as AutomationRunStatus | "")}
          sx={{ minWidth: { xs: "100%", sm: 220 } }}
        >
          <MenuItem value="">{t("automations.history.filterAll")}</MenuItem>
          {STATUSES.map((item) => (
            <MenuItem key={item} value={item}>
              {t(`automations.runs.status.${item}`)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {runsQuery.isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
          <CircularProgress />
        </Box>
      ) : runsQuery.isError ? (
        <Alert severity="error">{t("automations.runs.loadError")}</Alert>
      ) : runs.length === 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, py: 8, textAlign: "center" }}>
          <Stack alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
            <HistoryOutlined fontSize="large" />
            <Typography>{t("automations.runs.empty")}</Typography>
            <Typography variant="body2">{t("automations.history.emptyHint")}</Typography>
          </Stack>
        </Paper>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary">
            {t("automations.history.limitHint")}
          </Typography>
          <RunList runs={runs} showAutomationName />
        </>
      )}
    </Stack>
  );
};

export default AutomationHistoryTab;
