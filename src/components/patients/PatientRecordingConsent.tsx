import React from "react";
import { Divider, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useNotification } from "@refinedev/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getErrorMessage } from "../../api/client";
import { getPatientRecordingConsent, setPatientRecordingConsent } from "../../api/scribe";
import { useCan } from "../../hooks/useCan";
import { useT } from "../../i18n/VerticalProvider";

const consentKey = (patientId: number) => ["scribe", "consent", patientId] as const;

/**
 * Согласие на аудиозапись приёма (ИИ-запись): ставится один раз и
 * сохраняется сразу, отдельно от формы пациента. Без права
 * `scribe.consent.set` (или с выключенным модулем) блока нет.
 */
export const PatientRecordingConsent: React.FC<{ patientId: number; disabled?: boolean }> = ({
  patientId,
  disabled,
}) => {
  const canSet = useCan("scribe.consent.set");
  const { t } = useT("scribe");
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: consentKey(patientId),
    queryFn: ({ signal }) => getPatientRecordingConsent(patientId, signal),
    enabled: canSet,
  });
  const [saving, setSaving] = React.useState(false);
  if (!canSet || !query.data) return null;

  const save = async (status: "yes" | "no" | null) => {
    if (!status) return;
    setSaving(true);
    try {
      queryClient.setQueryData(consentKey(patientId), await setPatientRecordingConsent(patientId, status));
      notify?.({ type: "success", message: t("consent.saved") });
    } catch (err) {
      notify?.({ type: "error", message: getErrorMessage(err, t("consent.title")) });
    } finally {
      setSaving(false);
    }
  };

  const data = query.data;
  const caption =
    data.status === "unknown"
      ? t("consent.unknown")
      : data.setByName && data.setAt
        ? t("consent.setBy", {
            name: data.setByName,
            date: new Date(data.setAt).toLocaleDateString("ru-RU"),
          })
        : null;
  return (
    <Stack spacing={1}>
      <Divider />
      <Typography variant="body2" fontWeight={600}>
        {t("consent.title")}
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={data.status === "unknown" ? null : data.status}
        onChange={(_e, value: "yes" | "no" | null) => void save(value)}
        disabled={disabled || saving}
      >
        <ToggleButton value="yes">{t("consent.yes")}</ToggleButton>
        <ToggleButton value="no">{t("consent.no")}</ToggleButton>
      </ToggleButtonGroup>
      {caption && (
        <Typography variant="caption" color="text.secondary">
          {caption}
        </Typography>
      )}
    </Stack>
  );
};
