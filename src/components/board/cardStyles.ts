import { alpha } from "@mui/material/styles";

import type { subtleBg } from "../../theme/uiHelpers";

/** Общее оформление карточки — его же рисует DragOverlay, без интерактива. */
export const cardSx = (
  t: Parameters<typeof subtleBg>[0],
  alert?: boolean,
  highlight?: boolean
) => ({
  position: "relative" as const,
  overflow: "hidden",
  p: 1.25,
  pl: 1.75,
  borderRadius: "12px",
  border: 1,
  borderColor: alert ? alpha(t.palette.error.main, 0.35) : "divider",
  boxShadow: highlight
    ? `0 0 0 2px ${alpha(t.palette.primary.main, 0.6)}`
    : "none",
  bgcolor: "background.paper",
});
