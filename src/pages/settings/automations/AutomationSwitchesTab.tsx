import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SaveOutlined from "@mui/icons-material/SaveOutlined";

import {
  getNotificationSwitches,
  saveNotificationSwitches,
  type NotificationSwitches,
} from "../../../api/notifications";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../api/queryKeys";
import { useT } from "../../../i18n/VerticalProvider";
import { switchesDirty, toSwitchesInput } from "./notificationSwitches";

export interface AutomationSwitchesTabProps {
  organizationId: number | undefined;
  enabled: boolean;
  onMessage: (message: { type: "success" | "error"; text: string }) => void;
}

/**
 * Вкладка «Настройки» автоматизаций: главный переключатель организации и
 * переключатель каждого филиала на одном экране.
 *
 * Это те же переключатели, что у уведомлений о приёмах (одна строка на
 * филиал на бэке), поэтому после сохранения инвалидируется весь кэш
 * уведомлений. В PUT уходят только тронутые филиалы: филиал, к которому
 * не прикасались, строки не получает и остаётся «ни разу не включали».
 */
export const AutomationSwitchesTab: React.FC<AutomationSwitchesTabProps> = ({
  organizationId,
  enabled,
  onMessage,
}) => {
  const { t } = useT("settings");
  const queryClient = useQueryClient();
  const queryKey = djangoQueryKeys.notifications.switches(organizationId ?? null);

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getNotificationSwitches({ organizationId }, signal),
    enabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const [draft, setDraft] = useState<NotificationSwitches | null>(null);
  useEffect(() => {
    if (query.data) setDraft(structuredClone(query.data));
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: (input: { loaded: NotificationSwitches; draft: NotificationSwitches }) =>
      saveNotificationSwitches(toSwitchesInput(input.loaded, input.draft, organizationId)),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      setDraft(structuredClone(data));
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.notifications.all });
      onMessage({ type: "success", text: t("automations.switches.saveSuccess") });
    },
    onError: (err) => {
      onMessage({
        type: "error",
        text: err instanceof Error ? err.message : t("automations.switches.saveError"),
      });
    },
  });

  if (query.isError) {
    return <Alert severity="error">{t("automations.switches.loadError")}</Alert>;
  }
  if (query.isLoading || !query.data || !draft) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  const loaded = query.data;
  const dirty = switchesDirty(loaded, draft);
  const setBranch = (id: number, on: boolean) =>
    setDraft((prev) =>
      prev
        ? { ...prev, branches: prev.branches.map((b) => (b.id === id ? { ...b, enabled: on } : b)) }
        : prev,
    );

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 720 }}>
      {!loaded.platformEnabled && (
        <Alert severity="warning">{t("automations.switches.platformOff")}</Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2, p: { xs: 2, md: 2.5 } }}>
        <FormControlLabel
          sx={{ alignItems: "flex-start", m: 0 }}
          control={
            <Switch
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              color="primary"
              sx={{ mt: -0.5 }}
            />
          }
          label={
            <Box sx={{ ml: 0.5 }}>
              <Typography fontWeight={600}>{t("automations.switches.orgLabel")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("automations.switches.orgHint")}
              </Typography>
            </Box>
          }
        />
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Box sx={{ px: { xs: 2, md: 2.5 }, pt: 2, pb: 1.5 }}>
          <Typography fontWeight={600}>{t("automations.switches.branchesTitle")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("automations.switches.branchesHint")}
          </Typography>
        </Box>
        <Divider />
        {draft.branches.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: { xs: 2, md: 2.5 }, py: 2 }}>
            {t("automations.switches.noBranches")}
          </Typography>
        ) : (
          <Stack divider={<Divider />}>
            {draft.branches.map((branch) => (
              <FormControlLabel
                key={branch.id}
                sx={{ m: 0, px: { xs: 1.5, md: 2 }, py: 0.5 }}
                control={
                  <Switch
                    checked={branch.enabled}
                    onChange={(e) => setBranch(branch.id, e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Typography variant="body2" sx={{ ml: 0.5 }}>
                    {branch.name}
                  </Typography>
                }
              />
            ))}
          </Stack>
        )}
      </Paper>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          startIcon={
            saveMutation.isPending ? <CircularProgress size={18} color="inherit" /> : <SaveOutlined />
          }
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate({ loaded, draft })}
        >
          {saveMutation.isPending ? t("common:state.saving") : t("automations.switches.save")}
        </Button>
      </Box>
    </Stack>
  );
};
