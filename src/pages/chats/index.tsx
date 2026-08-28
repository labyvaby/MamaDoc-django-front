import React from "react";
import { Alert, AlertTitle, Box, LinearProgress, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
  chatwootUnavailableReason,
  fetchChatwootEmbed,
  type ChatwootUnavailableReason,
} from "../../api/chatwoot";

/**
 * Раздел «Чаты» — дашборд Chatwoot внутри CRM.
 *
 * Сотрудник уже авторизован в CRM, поэтому второй вход не нужен: бэкенд отдаёт
 * одноразовую ссылку, iframe открывает её, Chatwoot ставит свою сессию и сам
 * переходит на дашборд аккаунта.
 *
 * Навигацию внутри iframe мы намеренно **не перехватываем**. Ссылка входа —
 * это SPA: событие `load` срабатывает на приходе HTML, а сам `POST /auth/sign_in`
 * уходит уже после него. Если в этот момент сменить `src`, вход не успевает
 * завершиться, одноразовый токен сгорает впустую и Chatwoot показывает форму
 * пароля (проверено на стенде 28.08.2026).
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
          src={data.url}
          title="Чаты"
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
