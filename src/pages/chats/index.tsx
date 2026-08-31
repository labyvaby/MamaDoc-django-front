import React from "react";
import { Box, LinearProgress, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { chatwootUnavailableReason, fetchChatwootEmbed } from "../../api/chatwoot";
import { ChatsUnavailable } from "./ChatsUnavailable";

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
 * Ссылку берём РОВНО ОДИН РАЗ на каждое открытие раздела. Chatwoot хранит
 * `sso_auth_token` по одному на пользователя, и каждая новая выдача затирает
 * предыдущую: если запросить ссылку второй раз, пока iframe грузится с первой,
 * та превращается в тыкву — `POST /auth/sign_in` отвечает 401, и вместо
 * дашборда появляется форма пароля (наблюдалось на стенде 29.08.2026).
 *
 * Отсюда два предохранителя, и убирать их нельзя:
 *
 * 1. запрос не обновляется сам — `staleTime: Infinity`, без refetch на mount и
 *    на фокус окна; `gcTime: 0` при этом гарантирует, что следующее открытие
 *    раздела начнётся с чистого листа и получит свежую ссылку;
 * 2. первый успешный `url` замораживается в состоянии, поэтому никакой
 *    повторный рендер уже не подменит `src` у живого iframe.
 */

export const ChatsPage: React.FC = () => {
  usePageTitle("Чаты");

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["chatwoot", "embed"],
    queryFn: fetchChatwootEmbed,
    // См. предохранитель №1 в шапке файла.
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Предохранитель №2: адрес, с которым iframe начал вход, больше не меняется.
  const [frozenUrl, setFrozenUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    setFrozenUrl((current) => current ?? data?.url ?? null);
  }, [data?.url]);

  if (isPending || (!error && !frozenUrl)) {
    return (
      <Stack spacing={2}>
        <PageHeader title="Чаты" />
        <LinearProgress />
      </Stack>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ height: { xs: "auto", md: "calc(100vh - 96px)" } }}>
        <ChatsUnavailable
          reason={chatwootUnavailableReason(error)}
          onRetry={() => void refetch()}
        />
      </Box>
    );
  }

  // Заголовка здесь намеренно нет: Chatwoot рисует свою шапку, а раздел в CRM
  // и так подписан в сайдбаре и во вкладке браузера (usePageTitle). Лишняя
  // строка только отъедала бы высоту у списка диалогов.
  return (
    <Box sx={{ height: "100%" }}>
      <Box
        sx={{
          height: { xs: "80vh", md: "calc(100vh - 96px)" },
          borderRadius: 2,
          overflow: "hidden",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          component="iframe"
          src={frozenUrl ?? undefined}
          title="Чаты"
          // Chatwoot грузит вложения и уведомления; sandbox не ставим, иначе
          // ломается его собственная авторизация и WebSocket.
          allow="clipboard-write; microphone; camera; autoplay"
          sx={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      </Box>
    </Box>
  );
};

export default ChatsPage;
