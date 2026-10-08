import React from "react";
import { Divider, Stack, Typography } from "@mui/material";

/**
 * Заголовок секции внутри формы-дровера: мелкая капитель с линией до края.
 * Делит форму на смысловые группы, почти не добавляя высоты.
 */
export default function FormSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" gap={1.25} sx={{ pt: 0.5 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}
      >
        {children}
      </Typography>
      <Divider sx={{ flex: 1 }} />
    </Stack>
  );
}
