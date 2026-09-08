import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { getAutomationRuns, type Automation } from "../../../api/automations";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { useT } from "../../../i18n/VerticalProvider";
import { RunList } from "./RunList";

export interface AutomationRunsDialogProps {
  open: boolean;
  automation: Automation | null;
  organizationId: number | undefined;
  onClose: () => void;
}

/** История запусков одного правила: последние 100 Run с их отправками. */
export const AutomationRunsDialog: React.FC<AutomationRunsDialogProps> = ({
  open,
  automation,
  organizationId,
  onClose,
}) => {
  const { t } = useT("settings");

  const runsQuery = useQuery({
    queryKey: djangoQueryKeys.automations.runs(automation?.id ?? 0, organizationId ?? null),
    queryFn: ({ signal }) => getAutomationRuns(automation!.id, { organizationId }, signal),
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
          <RunList runs={runs} />
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common:actions.close")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AutomationRunsDialog;
