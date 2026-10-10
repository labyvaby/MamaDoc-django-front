import React from "react";
import { Box, Divider, IconButton, Stack, Typography, alpha, useTheme } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";

import { ROW_ACTIONS_CLASS, ShowAllButton, rowActionSx, rowActionsHostSx } from "../../../components/ui";
import { ageLabel } from "../vision/visionNorms";
import { assessMeasurement, type MeasureKey, type Measurement } from "./growthData";
import type { GrowthSex, GrowthStatus } from "./growthNorms";
import { formatNumber, growthColor } from "./growthUi";

/** Норма — нейтральная плашка с зелёной точкой, без оценки — серая без точки; цветом залиты только отклонения. */
const Pill: React.FC<{ text: string; status: GrowthStatus }> = ({ text, status }) => {
  const theme = useTheme();
  const color = growthColor(theme, status);
  const ok = status === "ok";
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: "8px",
        bgcolor: ok ? alpha(theme.palette.text.primary, 0.06) : alpha(color, 0.14),
        color: ok ? "text.primary" : status === "unknown" ? "text.secondary" : color,
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {ok && <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />}
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
  onEdit: (item: Measurement) => void;
}

/** Сколько последних замеров видно до «Показать все». */
const PAGE = 6;

/** Замеры от новых к старым: последние 6, остальные по «Показать все». Править — только ручные. */
export const GrowthHistory: React.FC<GrowthHistoryProps> = ({ list, sex, canManage, onEdit }) => {
  const [all, setAll] = React.useState(false);
  const shown = all ? list : list.slice(0, PAGE);
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        История замеров
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
          {list.length}
        </Typography>
      </Typography>
      <Stack divider={<Divider flexItem />} sx={{ border: 1, borderColor: "divider", borderRadius: "12px", overflow: "hidden" }}>
        {shown.map((item) => {
          const date = dayjs(item.at).format("DD.MM.YYYY");
          const age = item.months == null ? "" : ageLabel(Math.floor(item.months));
          return (
            <Stack
              key={item.key}
              direction={{ xs: "column", md: "row" }}
              gap={1}
              alignItems={{ md: "center" }}
              sx={{ px: 1.5, py: 1.25, ...rowActionsHostSx }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>
                  {[date, age].filter(Boolean).join(" · ")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {[item.sourceLabel, item.author].filter(Boolean).join(" · ")}
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
                {canManage && item.editable && (
                  <IconButton
                    size="small"
                    className={ROW_ACTIONS_CLASS}
                    aria-label={`Изменить замер ${date}`}
                    onClick={() => onEdit(item)}
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
      <ShowAllButton total={list.length} limit={PAGE} expanded={all} onToggle={() => setAll((value) => !value)} />
    </Box>
  );
};
