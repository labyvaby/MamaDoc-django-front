import React from "react";
import { Alert, AlertTitle, Box, LinearProgress, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
  chatwootDashboardUrl,
  chatwootUnavailableReason,
  fetchChatwootEmbed,
  type ChatwootUnavailableReason,
} from "../../api/chatwoot";

/**
 * Раздел «Чаты» — дашборд Chatwoot внутри CRM.
 *
 * Сотрудник уже авторизован в CRM, поэтому второй вход не нужен: бэкенд отдаёт
 * одноразовую ссылку, iframe открывает её, Chatwoot ставит свою сессию.
 *
 * Ссылка сгорает при первом переходе, поэтому запрос не кэшируется
 * (`staleTime: 0`, `gcTime: 0`) — иначе возврат на вкладку подставил бы
 * потраченный токен и пользователь увидел бы форму логина Chatwoot.
 */

const UNAVAILABLE_COPY: Record<
  ChatwootUnavailableReason,
  { title: string; body: string; severity: "info" | "warning" | "error" }
> = {
  no_account: {
    title: "Доступ к чатам не настроен",
    body:
      "Вашей учётной записи ещё не сопоставлен аккаунт в системе чатов. " +
      "Запросите доступ у администратора — после этого раздел откроется сам.",
    severity: "info",
  },
  disabled: {
    title: "Чаты недоступны",
    body: "Для вашей организации раздел чатов не подключён.",
    severity: "info",
  },
  unavailable: {
    title: "Сервис чатов временно недоступен",
    body: "Не удалось связаться с системой чатов. Попробуйте обновить страницу позже.",
    severity: "error",
  },
};

export const ChatsPage: React.FC = () => {
  usePageTitle("Чаты");

  const { data, isPending, error } = useQuery({
    queryKey: ["chatwoot", "embed"],
    queryFn: fetchChatwootEmbed,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [loggedIn, setLoggedIn] = React.useState(false);

  // Первая загрузка iframe — это SSO-вход; после неё ведём на дашборд нужного
  // аккаунта. Без этого шага пользователь, состоящий в нескольких аккаунтах
  // Chatwoot, попадёт в тот, который открывал последним.
  const handleLoaded = React.useCallback(() => {
    setLoggedIn(true);
  }, []);

  if (isPending) {
    return (
      <Stack spacing={2}>
        <PageHeader title="Чаты" />
        <LinearProgress />
      </Stack>
    );
  }

  if (error || !data) {
    const copy = UNAVAILABLE_COPY[chatwootUnavailableReason(error)];
    return (
      <Stack spacing={2}>
        <PageHeader title="Чаты" />
        <Alert severity={copy.severity}>
          <AlertTitle>{copy.title}</AlertTitle>
          {copy.body}
        </Alert>
      </Stack>
    );
  }

  const src = loggedIn
    ? chatwootDashboardUrl(data.url, data.accountId)
    : data.url;

  return (
    <Stack spacing={2} sx={{ height: "100%" }}>
      <PageHeader title="Чаты" />
      <Box
        sx={{
          flex: 1,
          minHeight: { xs: "70vh", md: "calc(100vh - 180px)" },
          borderRadius: 2,
          overflow: "hidden",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          component="iframe"
          src={src}
          title="Чаты"
          onLoad={handleLoaded}
          // Chatwoot грузит вложения и уведомления; sandbox не ставим, иначе
          // ломается его собственная авторизация и WebSocket.
          allow="clipboard-write; microphone; camera; autoplay"
          sx={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      </Box>
    </Stack>
  );
};

export default ChatsPage;
