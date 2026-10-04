import React from "react";
import { Box, Button, Collapse, Stack, Typography, alpha, useTheme } from "@mui/material";
import ChecklistOutlined from "@mui/icons-material/ChecklistOutlined";
import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import dayjs from "dayjs";

import { signalText, signalTitle, type Banner, type Signal } from "./neuroSignals";
import { LevelDot } from "./NeuroControls";
import { levelColor, levelTextColor } from "./neuroUi";

const SignalLine: React.FC<{ signal: Signal; canManage: boolean; onMarkMilestones: () => void; dot?: boolean }> = ({
  signal,
  canManage,
  onMarkMilestones,
  dot = false,
}) => {
  const date = signal.date ? dayjs(signal.date).format("DD.MM.YYYY") : "";
  return (
    <Stack direction="row" gap={1} alignItems="flex-start" sx={{ minWidth: 0 }}>
      {dot && (
        <Box sx={{ pt: "6px" }}>
          <LevelDot level={signal.level} />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700}>
          {signalTitle(signal)}
        </Typography>
        <Typography variant="body2">{signalText(signal)}</Typography>
        {(date || (signal.milestone && canManage)) && (
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.25 }}>
            {date && (
              <Typography variant="caption" color="text.secondary">
                {signal.milestone ? `отмечено ${date}` : `осмотр ${date}`}
              </Typography>
            )}
            {signal.milestone && canManage && (
              <Button size="small" startIcon={<ChecklistOutlined />} onClick={onMarkMilestones} sx={{ textTransform: "none", py: 0, minHeight: 0 }}>
                Отметить вехи
              </Button>
            )}
          </Stack>
        )}
      </Box>
    </Stack>
  );
};

/**
 * Баннер тревожных признаков (ТЗ §3.8): над вкладками, виден с любой. Уровень
 * — самый высокий из сигналов, до трёх строк этого уровня; «ещё N» раскрывает
 * все сигналы всех уровней.
 */
export const NeuroBanner: React.FC<{ banner: Banner; canManage: boolean; onMarkMilestones: () => void }> = ({ banner, canManage, onMarkMilestones }) => {
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const color = levelColor(theme, banner.level);
  const Icon = banner.level === "warn" ? ReportProblemOutlined : ErrorOutlineOutlined;
  return (
    <Box
      role="alert"
      sx={{
        borderRadius: "12px",
        px: { xs: 1.5, md: 2 },
        py: 1.25,
        bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.16 : banner.level === "warn" ? 0.16 : 0.1),
        border: banner.level === "urgent" ? `1.5px solid ${alpha(color, 0.7)}` : `1px solid ${alpha(color, 0.25)}`,
      }}
    >
      <Stack direction="row" gap={1.25} alignItems="flex-start">
        <Icon sx={{ color: levelTextColor(theme, banner.level), mt: "1px", flexShrink: 0 }} fontSize="small" />
        <Stack gap={1.25} sx={{ flex: 1, minWidth: 0 }}>
          {banner.level === "urgent" && (
            <Typography variant="caption" fontWeight={800} sx={{ color: levelTextColor(theme, "urgent"), letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>
              Срочно
            </Typography>
          )}
          {banner.top.map((signal) => (
            <SignalLine key={signal.key} signal={signal} canManage={canManage} onMarkMilestones={onMarkMilestones} />
          ))}
          {banner.rest.length > 0 && (
            <>
              <Collapse in={open} unmountOnExit>
                <Stack gap={1.25}>
                  {banner.rest.map((signal) => (
                    <SignalLine key={signal.key} signal={signal} canManage={canManage} onMarkMilestones={onMarkMilestones} dot />
                  ))}
                </Stack>
              </Collapse>
              <Button size="small" onClick={() => setOpen((value) => !value)} sx={{ alignSelf: "flex-start", textTransform: "none", px: 0, py: 0, minHeight: 0 }}>
                {open ? "Свернуть" : `ещё ${banner.rest.length}`}
              </Button>
            </>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};
