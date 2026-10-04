import React from "react";
import { Chip, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";

import type { ScribeDiagnosis } from "../api/scribe";
import { useT } from "../i18n/VerticalProvider";

/** Диагнозы по записи — только предложение: врач добавляет их сам. */
export const ScribeDiagnosisChips: React.FC<{
  items: ScribeDiagnosis[];
  onAdd: (item: ScribeDiagnosis) => void;
}> = ({ items, onAdd }) => {
  const { t } = useT("scribe");
  if (items.length === 0) return null;
  return (
    <Stack spacing={0.5} sx={{ pt: 0.25 }}>
      <Typography variant="caption" color="text.secondary">
        {t("diagnoses.title")}
      </Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {items.map((d) => (
          <Chip
            key={d.id}
            size="small"
            variant="outlined"
            icon={<AddOutlined />}
            label={`${d.code} ${d.displayName || d.title}`}
            onClick={() => onAdd(d)}
          />
        ))}
      </Stack>
    </Stack>
  );
};
