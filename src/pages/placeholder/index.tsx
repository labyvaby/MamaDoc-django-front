import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";
import { AppButton } from "../../components/ui";

export const UnderConstruction: React.FC = () => {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={2}
      sx={(theme) => ({ minHeight: theme.appLayout.fullPage.minHeight, p: 3 })}
    >
      <Typography variant="h4" textAlign="center">
        Страница еще в разработке
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        Мы работаем над этой функцией. Пожалуйста, загляните позже.
      </Typography>
      <Box>
        <AppButton component={RouterLink} to="/home" variant="contained">
          Вернуться назад
        </AppButton>
      </Box>
    </Stack>
  );
};
