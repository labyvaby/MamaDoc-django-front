import React from "react";
import { Alert, Chip, Stack, Tooltip, Typography } from "@mui/material";
import CheckCircleOutlineRounded from "@mui/icons-material/CheckCircleOutlineRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";

import type { HealthAlert } from "../../api/health";
import { ALLERGY_SEVERITIES, healthGroupLabel, optionLabel } from "./healthMeta";
import { useHealthAlert } from "./useHealth";

function allergensText(alert: HealthAlert): string {
  return alert.allergies
    .map((item) => {
      const severity = item.severity !== "unknown" ? optionLabel(ALLERGY_SEVERITIES, item.severity).toLowerCase() : "";
      return severity ? `${item.allergen} (${severity})` : item.allergen;
    })
    .join(", ");
}

/**
 * Чип в карточке пациента: красный — есть аллергии (список в подсказке),
 * зелёный — подтверждено «аллергий нет»; не уточнено — ничего, чтобы не шуметь.
 */
export const HealthAlertChip: React.FC<{ patientId: number }> = ({ patientId }) => {
  const { data } = useHealthAlert(patientId);
  if (!data) return null;
  if (data.allergyStatus === "has") {
    const first = data.allergies[0]?.allergen ?? "";
    const more = data.allergies.length > 1 ? ` +${data.allergies.length - 1}` : "";
    return (
      <Tooltip title={`Аллергия: ${allergensText(data)}`} arrow>
        <Chip
          size="small"
          color="error"
          icon={<WarningAmberRounded />}
          label={`Аллергия: ${first}${more}`}
          sx={{ fontWeight: 600, maxWidth: 260 }}
        />
      </Tooltip>
    );
  }
  if (data.allergyStatus === "none") {
    return (
      <Chip
        size="small"
        color="success"
        variant="outlined"
        icon={<CheckCircleOutlineRounded />}
        label="Аллергий нет"
      />
    );
  }
  return null;
};

/**
 * Полоса над формой приёма или прививки: аллергии красным, «не уточнены» —
 * напоминанием, плюс Д-учёт и группа здоровья мелко.
 */
export const HealthAlertStrip: React.FC<{ patientId: number; dense?: boolean }> = ({ patientId, dense }) => {
  const { data } = useHealthAlert(patientId);
  if (!data) return null;
  const extra = [
    data.dispensaryCount ? `на Д-учёте: ${data.dispensaryCount}` : "",
    data.healthGroup ? `группа здоровья ${healthGroupLabel(data.healthGroup)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (data.allergyStatus === "has") {
    return (
      <Alert severity="error" icon={<WarningAmberRounded />} sx={{ py: dense ? 0 : 0.5, alignItems: "center" }}>
        <Typography variant="body2" fontWeight={700} component="span">
          Аллергия: {allergensText(data)}
        </Typography>
        {extra && (
          <Typography variant="caption" color="text.secondary" display="block">
            {extra}
          </Typography>
        )}
      </Alert>
    );
  }
  if (data.allergyStatus === "unknown") {
    return (
      <Alert severity="info" sx={{ py: dense ? 0 : 0.5 }}>
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="baseline">
          <Typography variant="body2">Аллергии не уточнены — спросите и отметьте в «Здоровье».</Typography>
          {extra && (
            <Typography variant="caption" color="text.secondary">
              {extra}
            </Typography>
          )}
        </Stack>
      </Alert>
    );
  }
  return extra ? (
    <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
      Аллергий нет · {extra}
    </Typography>
  ) : null;
};
