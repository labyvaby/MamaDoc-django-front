import React from "react";
import { Box, Divider, IconButton, Stack, Typography, alpha, useTheme } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";

import type { ProgramModuleRecord } from "../../../api/programs";
import { ROW_ACTIONS_CLASS, ShowAllButton, rowActionSx, rowActionsHostSx } from "../../../components/ui";
import { CONCLUSIONS, optionLabel } from "./visionCatalog";
import type { VisionExam } from "./visionData";
import { acuityNorm, acuityStatus, ageInMonths, displayAcuity, parseAcuity, type EyeStatus } from "./visionNorms";
import { statusColor } from "./visionUi";

/** Сколько последних осмотров видно сразу. */
const LIMIT = 5;

const AcuityPill: React.FC<{ side: "OD" | "OS"; raw: string; status: EyeStatus }> = ({ side, raw, status }) => {
  const theme = useTheme();
  const color = statusColor(theme, status);
  return (
    <Box
      sx={{
        px: 1,
        py: 0.25,
        borderRadius: "8px",
        bgcolor: alpha(color, 0.14),
        color: status === "unknown" ? "text.secondary" : color,
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {side} {raw.trim() ? displayAcuity(raw) : "—"}
    </Box>
  );
};

interface VisionHistoryProps {
  exams: VisionExam[];
  birthDate: string | null;
  canManage: boolean;
  onEdit: (record: ProgramModuleRecord) => void;
}

/** Все осмотры, от новых к старым: дата, врач, острота глаз цветом нормы, заключение. */
export const VisionHistory: React.FC<VisionHistoryProps> = ({ exams, birthDate, canManage, onEdit }) => {
  const [all, setAll] = React.useState(false);
  const shown = all ? exams : exams.slice(0, LIMIT);
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        История осмотров
      </Typography>
      <Stack divider={<Divider flexItem />} sx={{ border: 1, borderColor: "divider", borderRadius: "12px", overflow: "hidden" }}>
        {shown.map((exam) => {
          const norm = acuityNorm(ageInMonths(birthDate, exam.record.occurredAt));
          const date = dayjs(exam.record.occurredAt).format("DD.MM.YYYY");
          return (
            <Stack
              key={exam.record.id}
              direction={{ xs: "column", md: "row" }}
              gap={1}
              alignItems={{ md: "center" }}
              sx={{ px: 1.5, py: 1.25, ...rowActionsHostSx }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>
                  {exam.record.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {[date, exam.record.createdByName, exam.record.status === "missed" ? "пропущен" : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
                {exam.conclusions.length > 0 && (
                  <Typography variant="caption" display="block">
                    {exam.conclusions.map((code) => optionLabel(CONCLUSIONS, code)).join(", ")}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" gap={0.75} alignItems="center">
                <AcuityPill side="OD" raw={exam.acuityRight} status={acuityStatus(parseAcuity(exam.acuityRight), norm)} />
                <AcuityPill side="OS" raw={exam.acuityLeft} status={acuityStatus(parseAcuity(exam.acuityLeft), norm)} />
                {canManage && (
                  <IconButton
                    size="small"
                    className={ROW_ACTIONS_CLASS}
                    aria-label={`Изменить осмотр ${date}`}
                    onClick={() => onEdit(exam.record)}
                    sx={rowActionSx}
                  >
                    <EditOutlined fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            </Stack>
          );
        })}
      </Stack>
      <ShowAllButton total={exams.length} limit={LIMIT} expanded={all} onToggle={() => setAll((value) => !value)} />
    </Box>
  );
};
