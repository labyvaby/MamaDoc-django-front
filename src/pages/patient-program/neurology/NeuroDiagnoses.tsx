import React from "react";
import { Box, Button, Chip, Collapse, IconButton, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";

import type { ProgramModuleRecord } from "../../../api/programs";
import { subtleBg } from "../../../theme/uiHelpers";
import { DIAGNOSIS_STATES, optionLabel } from "./neuroCatalog";
import type { NeuroDiagnosis } from "./neuroData";

const SIDE_TEXT: Record<"D" | "S" | "both", string> = { D: "справа", S: "слева", both: "с двух сторон" };

const DiagnosisRow: React.FC<{ item: NeuroDiagnosis; canManage: boolean; onEdit: () => void }> = ({ item, canManage, onEdit }) => {
  const since = dayjs(item.record.occurredAt).format("DD.MM.YYYY");
  const resolved = item.state === "resolved";
  const details = [
    item.icd,
    item.side ? SIDE_TEXT[item.side] : "",
    resolved && item.resolvedOn ? `${since} — ${dayjs(item.resolvedOn).format("DD.MM.YYYY")}` : `с ${since}`,
    item.dispensary ? "на Д-учёте у невролога" : "",
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
        <Typography variant="body2" fontWeight={600} color={resolved ? "text.secondary" : "text.primary"}>
          {item.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {details}
        </Typography>
        {item.record.notes && (
          <Typography variant="caption" display="block">
            {item.record.notes}
          </Typography>
        )}
      </Box>
      <Stack direction="row" gap={0.75} alignItems="center">
        <Chip size="small" variant="outlined" color={item.state === "treatment" ? "info" : "default"} label={optionLabel(DIAGNOSIS_STATES, item.state)} sx={{ borderRadius: "6px" }} />
        {canManage && (
          <IconButton size="small" aria-label={`Изменить: ${item.label}`} onClick={onEdit}>
            <EditOutlined fontSize="small" />
          </IconButton>
        )}
      </Stack>
    </Box>
  );
};

/** Вкладка «Диагнозы» (ТЗ §4): действующие, снятые — свёрнуты; «+ Диагноз». */
export const NeuroDiagnoses: React.FC<{
  diagnoses: ReadonlyArray<NeuroDiagnosis>;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (record: ProgramModuleRecord) => void;
}> = ({ diagnoses, canManage, onAdd, onEdit }) => {
  const [showResolved, setShowResolved] = React.useState(false);
  const active = diagnoses.filter((item) => item.state !== "resolved");
  const resolved = diagnoses.filter((item) => item.state === "resolved");
  const row = (item: NeuroDiagnosis) => <DiagnosisRow key={item.record.id} item={item} canManage={canManage} onEdit={() => onEdit(item.record)} />;
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2">Действующие диагнозы</Typography>
        {canManage && (
          <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={onAdd} sx={{ textTransform: "none" }}>
            Диагноз
          </Button>
        )}
      </Stack>
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
          <Button size="small" onClick={() => setShowResolved((value) => !value)} sx={{ mt: 1, textTransform: "none", px: 0 }}>
            {showResolved ? "Скрыть снятые" : `Снятые · ${resolved.length}`}
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
