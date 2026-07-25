import React from "react";
import { Box, Container, Stack, Typography } from "@mui/material";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";

/**
 * Обёртка публичных страниц записи (`/book/*`). Рендерится вне staff-layout и
 * RequireAuth, но внутри общего ThemeProvider — поэтому опирается только на
 * токены темы (стиль-гайд: плоско, без теней/градиентов). Свою шапку клиники
 * держим тут, чтобы страницы не дублировали хедер.
 */
export const PublicBookingShell: React.FC<
  React.PropsWithChildren<{ maxWidth?: "sm" | "md" | "lg" }>
> = ({ children, maxWidth = "lg" }) => (
  <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
    <Box
      component="header"
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Container maxWidth={maxWidth} sx={{ py: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <LocalHospitalOutlined color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Онлайн-запись
          </Typography>
        </Stack>
      </Container>
    </Box>
    <Container maxWidth={maxWidth} sx={{ py: { xs: 2, sm: 3 } }}>
      {children}
    </Container>
  </Box>
);
