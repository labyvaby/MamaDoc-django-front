import React from "react";
import Box from "@mui/material/Box";

import { RECEIPT_COLUMN_SPECS } from "./layout";

/** Одна колонка сетки чека: фиксированная ширина, содержимое по центру. */
export const PosColumn: React.FC<{
  spec: (typeof RECEIPT_COLUMN_SPECS)[number];
  children?: React.ReactNode;
  align?: "center" | "flex-start" | "flex-end";
}> = ({ spec, children, align = "center" }) => (
  <Box
    sx={{
      width: spec.width,
      ml: `${spec.gapBefore}px`,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: align,
    }}
  >
    {children}
  </Box>
);
