import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router";
import { AppButton } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";

/**
 * Несуществующий адрес. Раньше здесь было «Страница ещё в разработке» под
 * заголовком «Aximo» — для опечатки в адресе это неправда: ничего не
 * разрабатывается, такой страницы просто нет.
 */
export const NotFoundPage: React.FC = () => {
  usePageTitle("Страница не найдена");
  const location = useLocation();
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={(theme) => ({ minHeight: theme.appLayout.fullPage.minHeight, p: 3, textAlign: "center" })}
    >
      <Typography sx={{ fontSize: 64, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em", color: "text.disabled" }}>404</Typography>
      <Typography variant="h5" fontWeight={700}>
        Такой страницы нет
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        Адрес <Box component="code" sx={{ fontFamily: "monospace" }}>{location.pathname}</Box> не существует. Проверьте ссылку или
        вернитесь на главную.
      </Typography>
      <Box sx={{ pt: 1 }}>
        <AppButton component={RouterLink} to="/" variant="contained">
          На главную
        </AppButton>
      </Box>
    </Stack>
  );
};

