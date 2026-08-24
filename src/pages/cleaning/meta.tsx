import React from "react";
import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";

import type { CleaningRecordStatus } from "../../api/cleaning";

export const STATUS_META: Record<
  CleaningRecordStatus,
  { label: string; color: "warning" | "success" | "error" }
> = {
  pending: { label: "Ждёт подтверждения", color: "warning" },
  approved: { label: "Подтверждена", color: "success" },
  rejected: { label: "Отклонена", color: "error" },
};

/** Статус-чип по гайду §5.5: точка + текст на статус-тинте, радиус 7px. */
export const StatusChip: React.FC<{ status: CleaningRecordStatus }> = ({ status }) => {
  const meta = STATUS_META[status];
  return (
    <Box
      sx={(t) => {
        const c = t.palette[meta.color];
        return {
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          height: 24,
          px: 1,
          borderRadius: "7px",
          fontSize: "0.75rem",
          fontWeight: 500,
          whiteSpace: "nowrap",
          bgcolor: alpha(c.main, t.palette.mode === "dark" ? 0.2 : 0.14),
          color: t.palette.mode === "dark" ? c.light : c.dark,
        };
      }}
    >
      <Box
        sx={(t) => ({
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: t.palette[meta.color].main,
          flexShrink: 0,
        })}
      />
      {meta.label}
    </Box>
  );
};
