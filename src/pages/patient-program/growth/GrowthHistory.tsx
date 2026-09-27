import React from "react";
import { Box, Divider, IconButton, Stack, Typography, alpha, useTheme } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";

import type { ProgramModuleRecord } from "../../../api/programs";
import { ageLabel } from "../vision/visionNorms";
import { assessMeasurement, type MeasureKey, type Measurement } from "./growthData";
import type { GrowthSex, GrowthStatus } from "./growthNorms";
import { formatNumber, growthColor } from "./growthUi";

const Pill: React.FC<{ text: string; status: GrowthStatus }> = ({ text, status }) => {
  const theme = useTheme();
  const color = growthColor(theme, status);
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
      {text}
    </Box>
  );
};

const PILLS: ReadonlyArray<{ key: MeasureKey; label: string; unit: string }> = [
  { key: "heightCm", label: "", unit: "см" },
  { key: "weightKg", label: "", unit: "кг" },
  { key: "bmi", label: "ИМТ ", unit: "" },
  { key: "headCm", label: "голова ", unit: "см" },
];

interface GrowthHistoryProps {
  list: Measurement[];
  sex: GrowthSex | null;
  canManage: boolean;
  onEdit: (record: ProgramModuleRecord) => void;
}

/** Все замеры от новых к старым с цветом центиля. */
export const GrowthHistory: React.FC<GrowthHistoryProps> = ({ list, sex, canManage, onEdit }) => (
  <Box>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>
      История замеров
    </Typography>
    <Stack divider={<Divider flexItem />} sx={{ border: 1, borderColor: "divider", borderRadius: "12px", overflow: "hidden" }}>
      {list.map((item) => {
        const date = dayjs(item.at).format("DD.MM.YYYY");
        const age = item.months == null ? "" : ageLabel(Math.floor(item.months));
        return (
          <Stack
            key={item.record.id}
            direction={{ xs: "column", md: "row" }}
            gap={1}
            alignItems={{ md: "center" }}
            sx={{ px: 1.5, py: 1.25 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600}>
                {[date, age].filter(Boolean).join(" · ")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.record.createdByName ?? ""}
              </Typography>
            </Box>
            <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
              {PILLS.filter((pill) => item[pill.key] != null).map((pill) => (
                <Pill
                  key={pill.key}
                  text={`${pill.label}${formatNumber(item[pill.key] as number, 1)}${pill.unit ? ` ${pill.unit}` : ""}`}
                  status={assessMeasurement(item, pill.key, sex)?.status ?? "unknown"}
                />
              ))}
              {canManage && (
                <IconButton size="small" aria-label={`Изменить замер ${date}`} onClick={() => onEdit(item.record)}>
                  <EditOutlined fontSize="small" />
                </IconButton>
              )}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  </Box>
);
