import React from "react";
import { Box, Button, Chip, Collapse, IconButton, Stack, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";

import type { ProgramModuleRecord } from "../../../api/programs";
import { subtleBg } from "../../../theme/uiHelpers";
import { DIAGNOSIS_STATES, optionLabel } from "./visionCatalog";
import { formatDiopter, type VisionDiagnosis } from "./visionData";
import type { VisionSignal } from "./visionSignals";

const DiagnosisRow: React.FC<{
  item: VisionDiagnosis;
  progression: number | null;
  canManage: boolean;
  onEdit: () => void;
}> = ({ item, progression, canManage, onEdit }) => {
  const details = [
    item.icd,
    `с ${dayjs(item.record.occurredAt).format("MM.YYYY")}`,
    item.cylinder != null ? `cyl ${formatDiopter(item.cylinder)}${item.axis != null ? ` × ${item.axis}°` : ""}` : "",
    item.dispensary ? "на Д-учёте у офтальмолога" : "",
    item.state === "resolved" && item.resolvedOn ? `снят ${dayjs(item.resolvedOn).format("DD.MM.YYYY")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Box
      sx={(theme) => ({
        px: 1.5,
        py: 1.25,
        border: 1,
        borderColor: "divider",
        borderRadius: "12px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
        bgcolor: subtleBg(theme),
      })}
    >
      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} color={item.state === "resolved" ? "text.secondary" : "text.primary"}>
          {item.label}
          {item.eye ? ` · ${item.eye}` : ""}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {details}
        </Typography>
      </Box>
      <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
        {progression != null && (
          <Chip
            size="small"
            color="warning"
            label={`прогрессирует −${progression.toFixed(2).replace(".", ",")} D/год`}
            sx={{ borderRadius: "6px", fontWeight: 600 }}
          />
        )}
        <Chip
          size="small"
          variant="outlined"
          color={item.state === "treatment" ? "info" : "default"}
          label={optionLabel(DIAGNOSIS_STATES, item.state)}
          sx={{ borderRadius: "6px" }}
        />
        {canManage && (
          <IconButton size="small" aria-label={`Изменить: ${item.label}`} onClick={onEdit}>
            <EditOutlined fontSize="small" />
          </IconButton>
        )}
      </Stack>
    </Box>
  );
};

interface VisionDiagnosesProps {
  diagnoses: VisionDiagnosis[];
  signals: VisionSignal[];
  canManage: boolean;
  onEdit: (record: ProgramModuleRecord) => void;
}

/** Хронические диагнозы глаз: действующие сверху, снятые — свёрнуты. */
export const VisionDiagnoses: React.FC<VisionDiagnosesProps> = ({ diagnoses, signals, canManage, onEdit }) => {
  const [showResolved, setShowResolved] = React.useState(false);
  const active = diagnoses.filter((item) => item.state !== "resolved");
  const resolved = diagnoses.filter((item) => item.state === "resolved");
  const progression = (item: VisionDiagnosis): number | null => {
    if (item.diagnosis !== "myopia") return null;
    const found = signals.find(
      (signal) => signal.kind === "myopia-progression" && (item.eye == null || item.eye === "OU" || item.eye === signal.eye),
    );
    return found ? found.value : null;
  };
  const row = (item: VisionDiagnosis) => (
    <DiagnosisRow
      key={item.record.id}
      item={item}
      progression={progression(item)}
      canManage={canManage}
      onEdit={() => onEdit(item.record)}
    />
  );
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Хронические диагнозы
      </Typography>
      <Stack gap={1}>
        {active.map(row)}
        {active.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Действующих диагнозов нет
          </Typography>
        )}
      </Stack>
      {resolved.length > 0 && (
        <>
          <Button size="small" onClick={() => setShowResolved((value) => !value)} sx={{ mt: 0.5, textTransform: "none" }}>
            {showResolved ? "Скрыть снятые" : `Снятые (${resolved.length})`}
          </Button>
          <Collapse in={showResolved} unmountOnExit>
            <Stack gap={1} sx={{ mt: 0.5 }}>
              {resolved.map(row)}
            </Stack>
          </Collapse>
        </>
      )}
    </Box>
  );
};
