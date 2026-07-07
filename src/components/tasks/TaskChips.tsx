import React from "react";
import { Box, Chip } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";

import type { TaskPriority, TaskStatus } from "../../api/tasks";
import { TASK_PRIORITY_META, TASK_STATUS_META, type ToneName } from "../../pages/tasks/meta";
import { subtleBg } from "../../theme/uiHelpers";

function tone(t: Theme, name: ToneName) {
  switch (name) {
    case "warning":
      return t.palette.warning;
    case "info":
      return t.palette.info;
    case "success":
      return t.palette.success;
    case "error":
      return t.palette.error;
    default:
      return null;
  }
}

/** Тонированный чип с точкой-индикатором — единый стиль статусов проекта. */
const TonedChip: React.FC<{ label: string; toneName: ToneName }> = ({ label, toneName }) => (
  <Chip
    size="small"
    label={label}
    icon={
      <Box
        component="span"
        sx={(t) => {
          const p = tone(t, toneName);
          return {
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: p ? p.main : t.palette.grey[500],
            ml: 0.75,
          };
        }}
      />
    }
    sx={(t) => {
      const p = tone(t, toneName);
      return {
        fontWeight: 500,
        height: 24,
        borderRadius: "7px",
        "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
        color: p ? (t.palette.mode === "dark" ? p.light : p.dark) : "text.secondary",
        bgcolor: p
          ? alpha(p.main, t.palette.mode === "dark" ? 0.2 : 0.14)
          : subtleBg(t, true),
      };
    }}
  />
);

export const TaskStatusChip: React.FC<{ status: TaskStatus }> = ({ status }) => {
  const m = TASK_STATUS_META[status];
  return m ? <TonedChip label={m.label} toneName={m.color} /> : <>{status}</>;
};

export const TaskPriorityChip: React.FC<{ priority: TaskPriority }> = ({ priority }) => {
  const m = TASK_PRIORITY_META[priority];
  return m ? <TonedChip label={m.label} toneName={m.color} /> : <>{priority}</>;
};
