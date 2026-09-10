import React from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  CssBaseline,
  GlobalStyles,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";

import { getAppTheme } from "../../theme";
import { formatPhoneDisplay } from "../../utility/phone";
import { PortalCabinet } from "./PortalCabinet";
import { PortalLogin } from "./PortalLogin";
import { usePortalOrgSlug } from "./orgSlug";
import { useClientPortalSession } from "./session";

/**
 * Клиентский кабинет биллинга (`/lk`, `/lk/<org-slug>`).
 *
 * Отдельная публичная страница вне staff-layout и вне `RequireAuth`: сюда
 * заходит клиент организации по ссылке из SMS, у него нет ни аккаунта
 * сотрудника, ни прав, ни выбранного филиала.
 *
 * Контур биллинга самостоятельный и не пересекается с кабинетом пациента на
 * витрине записи (`/book/me`): там записи к врачу и токен `X-Patient-Token`,
 * здесь деньги и Bearer-токен `/api/client-portal/*`.
 */

/**
 * Возврат прокрутки документа: CRM держит `html/body/#root` в
 * `height: 100%; overflow: hidden`, внутри staff-layout скроллится собственный
 * контейнер. Кабинет рендерится вне него — без этого правила всё ниже первого
 * экрана недостижимо. Снимается вместе с размонтированием страницы.
 */
const scrollableDocument = (
  <GlobalStyles
    styles={{
      html: { height: "auto", overflow: "visible" },
      body: { height: "auto", minHeight: "100%", overflow: "visible" },
      "#root": { height: "auto", minHeight: "100%", overflow: "visible" },
    }}
  />
);

/** Спокойная самостоятельная тема ЛК — не зависит от настроек CRM сотрудника. */
function usePortalTheme() {
  return React.useMemo(() => {
    const base = getAppTheme("light", {
      primaryColor: "#176B61",
      surface: { default: "#F7F9F8", paper: "#FFFFFF" },
      cardSkin: "bordered",
      uiScale: "normal",
    });
    return createTheme(base, {
      palette: {
        primary: { main: "#176B61", dark: "#123F3A", light: "#66C7B5" },
        background: { default: "#F7F9F8", paper: "#FFFFFF" },
        text: { primary: "#17211F", secondary: "#66736F" },
      },
      shape: { borderRadius: 14 },
      typography: {
        fontFamily: 'Inter, "Segoe UI", sans-serif',
        button: { textTransform: "none", fontWeight: 750 },
      },
    });
  }, []);
}

const ClientPortalPage: React.FC = () => {
  const theme = usePortalTheme();
  const orgSlug = usePortalOrgSlug();
  const { session, signOut } = useClientPortalSession();

  React.useEffect(() => {
    document.title = "Личный кабинет";
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {scrollableDocument}
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          py: { xs: 1.5, sm: 4 },
        }}
      >
        {/* `md`, а не `sm`: при 600px строка вкладок («К оплате · 2 … Семья · 1»)
            не помещается и на десктопе показывает стрелки прокрутки — на
            телефоне ширину всё равно задаёт экран. */}
        <Container maxWidth="md" disableGutters sx={{ px: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mb: { xs: 2.5, sm: 3 } }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={850}
                noWrap
                letterSpacing="-.02em"
              >
                Мой кабинет
              </Typography>
              {session && (
                <Typography variant="caption" color="text.secondary">
                  {formatPhoneDisplay(session.phone)}
                </Typography>
              )}
            </Box>
            {session && (
              <Button
                size="small"
                color="inherit"
                startIcon={<LogoutOutlined />}
                onClick={signOut}
              >
                Выйти
              </Button>
            )}
          </Stack>

          {!orgSlug ? (
            // Дефолтной организации у биллинга нет: пул клиентов у каждой свой,
            // и подставить «какую-нибудь» — значит показать чужие деньги.
            <Alert severity="warning">
              Ссылка открыта без организации. Откройте кабинет по ссылке,
              которую прислала организация — она выглядит как{" "}
              <code>/lk/название-организации</code>.
            </Alert>
          ) : session ? (
            <PortalCabinet />
          ) : (
            <Paper
              variant="outlined"
              sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}
            >
              <PortalLogin orgSlug={orgSlug} />
            </Paper>
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
};

export default ClientPortalPage;
