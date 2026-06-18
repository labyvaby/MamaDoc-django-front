import React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Link as RouterLink } from "react-router";
import ConstructionOutlined from "@mui/icons-material/ConstructionOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import { AppButton } from "../ui";

type Props = {
  /** Заголовок, например «Кабинет врача в разработке» */
  title: string;
  /** Необязательное пояснение под заголовком */
  description?: string;
  /** Куда вести кнопку «Назад». По умолчанию — Регистратура. */
  backTo?: string;
};

/**
 * Заглушка для разделов, которые в Django-режиме ещё не мигрированы с Supabase.
 * Не дёргает Supabase / Refine dataProvider — это чистый presentational-компонент,
 * поэтому раздел остаётся в меню и открывается без ErrorBoundary и без websocket.
 */
export const DjangoUnderConstructionPage: React.FC<Props> = ({
  title,
  description = "Раздел переносится на новый backend. Мы уже работаем над ним — он появится здесь в ближайшее время.",
  backTo = "/appointments",
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={(t) => ({
        minHeight: t.appLayout.fullPage.minHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 3 },
      })}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 520,
          textAlign: "center",
          px: { xs: 3, sm: 5 },
          py: { xs: 4, sm: 6 },
          borderRadius: 4,
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: "background.paper",
        }}
      >
        <Stack spacing={2.5} alignItems="center">
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
              color: "primary.onSurface",
            }}
          >
            <ConstructionOutlined sx={{ fontSize: 38 }} />
          </Box>

          <Typography variant="h5" fontWeight={700}>
            {title}
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380 }}>
            {description}
          </Typography>

          <AppButton
            component={RouterLink}
            to={backTo}
            variant="contained"
            startIcon={<ArrowBackOutlined />}
            sx={{ mt: 1 }}
          >
            Вернуться в Регистратуру
          </AppButton>
        </Stack>
      </Paper>
    </Box>
  );
};

export default DjangoUnderConstructionPage;
