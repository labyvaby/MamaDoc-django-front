import React from "react";
import { Box, LinearProgress, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";

import { AppButton, PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
  chatwootUnavailableReason,
  fetchChatwootEmbed,
  fetchChatwootSession,
} from "../../api/chatwoot";
import { ChatsUnavailable } from "./ChatsUnavailable";
import {
  useChatwootLoginFailed,
  useChatwootTabLock,
} from "./useChatwootSession";

/**
 * Раздел «Чаты» — дашборд Чат-центра внутри CRM.
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
 * дашборда появляется форма пароля.
 *
 * Отсюда два предохранителя, и убирать их нельзя:
 *
 * 1. запрос не обновляется сам — `staleTime: Infinity`, без refetch на mount и
 *    на фокус окна; `gcTime: 0` при этом гарантирует, что следующее открытие
 *    раздела начнётся с чистого листа и получит свежую ссылку;
 * 2. первый успешный `url` замораживается в состоянии, поэтому никакой
 *    повторный рендер уже не подменит `src` у живого iframe.
 *
 * Ту же гонку умеют устраивать две вкладки CRM, и там предохранители не
 * помогают — токен один на пользователя, а вкладки друг о друге не знают. За
 * это отвечает `useChatwootTabLock`: раздел живёт ровно в одной вкладке,
 * остальные предлагают перехватить. Если вход всё-таки сорвался, Chatwoot
 * сообщает об этом сам (`useChatwootLoginFailed`), и мы показываем повтор
 * вместо чужой формы пароля.
 *
 * ВХОД ЛЕНИВЫЙ. Сессия Чат-центра живёт в браузере сама, поэтому сначала ведём
 * iframe прямо на дашборд (`/chatwoot/session/` — ссылка без секретов). Токен
 * выписывается только если Чат-центр сообщил, что сессии нет. Так он реже
 * оказывается в адресной строке, истории браузера и логах, а живёт он всего
 * пять минут.
 *
 * Если `/session/` недоступен — например, бэкенд с ним ещё не выкачен — молча
 * откатываемся к прежнему порядку и просим ссылку сразу.
 */

/** Показать заново: новая ссылка и новый iframe вместо мёртвой сессии. */
const ChatsRecovery: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <Stack
    spacing={2}
    sx={{ height: "100%", alignItems: "center", justifyContent: "center", px: 2 }}
  >
    <Typography variant="h6" sx={{ fontWeight: 700, textAlign: "center" }}>
      Вход в Чат-центр не завершился
    </Typography>
    <Typography
      sx={{ color: "text.secondary", textAlign: "center", maxWidth: 460 }}
    >
      Так бывает, если раздел открывали в другой вкладке или на другом
      устройстве — Чат-центр разрешает только один вход за раз. Нажмите
      «Войти заново», и всё откроется.
    </Typography>
    <AppButton variant="contained" startIcon={<RefreshOutlined />} onClick={onRetry}>
      Войти заново
    </AppButton>
  </Stack>
);

/** Раздел уже занят другой вкладкой — предлагаем перенести его сюда. */
const ChatsInAnotherTab: React.FC<{ onTakeOver: () => void }> = ({
  onTakeOver,
}) => (
  <Stack
    spacing={2}
    sx={{ height: "100%", alignItems: "center", justifyContent: "center", px: 2 }}
  >
    <Typography variant="h6" sx={{ fontWeight: 700, textAlign: "center" }}>
      Чаты открыты в другой вкладке
    </Typography>
    <Typography
      sx={{ color: "text.secondary", textAlign: "center", maxWidth: 460 }}
    >
      Чат-центр держит один вход на сотрудника, поэтому две вкладки мешали бы
      друг другу. Продолжите там — или перенесите чаты сюда.
    </Typography>
    <AppButton
      variant="outlined"
      startIcon={<OpenInNewOutlined />}
      onClick={onTakeOver}
    >
      Открыть здесь
    </AppButton>
  </Stack>
);

const FRAME_HEIGHT = { xs: "80vh", md: "calc(100vh - 96px)" } as const;

export const ChatsPage: React.FC = () => {
  usePageTitle("Чаты");

  const { role, takeOver } = useChatwootTabLock();
  const isOwner = role === "owner";

  // `attempt` меняется только при осознанном повторе: он и сбрасывает
  // замороженную ссылку, и пересоздаёт iframe (через key), чтобы Chatwoot начал
  // вход с чистого листа, а не досматривал мёртвую сессию.
  const [attempt, setAttempt] = React.useState(0);
  const [loginFailed, setLoginFailed] = React.useState(false);

  const sessionQuery = useQuery({
    queryKey: ["chatwoot", "session", attempt],
    queryFn: fetchChatwootSession,
    enabled: isOwner,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Ссылка входа нужна в двух случаях: Чат-центр сказал, что сессии нет, или
  // адрес дашборда получить не удалось (старый бэкенд, выключенная интеграция).
  const needsLogin = loginFailed || sessionQuery.isError;

  const { data, isPending, error } = useQuery({
    queryKey: ["chatwoot", "embed", attempt],
    queryFn: fetchChatwootEmbed,
    enabled: isOwner && needsLogin,
    // См. предохранитель №1 в шапке файла.
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Предохранитель №2: адрес, с которым iframe начал вход, больше не меняется.
  // Ссылка входа перекрывает дашборд — но только один раз за попытку.
  const [frozenUrl, setFrozenUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (data?.url) setFrozenUrl(data.url);
  }, [data?.url]);

  const retry = React.useCallback(() => {
    setLoginFailed(false);
    setFrozenUrl(null);
    setAttempt((n) => n + 1);
  }, []);

  // Пока вход не понадобился — показываем дашборд; дальше его сменит ссылка.
  const iframeUrl = frozenUrl ?? sessionQuery.data?.dashboardUrl ?? null;

  useChatwootLoginFailed(iframeUrl, () => setLoginFailed(true));

  if (!isOwner) {
    return (
      <Box sx={{ height: FRAME_HEIGHT }}>
        <ChatsInAnotherTab onTakeOver={takeOver} />
      </Box>
    );
  }

  // Экран повтора нужен, только когда и ссылка входа не спасла: сам по себе
  // сорвавшийся вход мы сначала пробуем починить, выписав её.
  if (loginFailed && frozenUrl) {
    return (
      <Box sx={{ height: FRAME_HEIGHT }}>
        <ChatsRecovery onRetry={retry} />
      </Box>
    );
  }

  const waiting = needsLogin ? isPending : sessionQuery.isPending;
  if (waiting || (!error && !iframeUrl)) {
    return (
      <Stack spacing={2}>
        <PageHeader title="Чаты" />
        <LinearProgress />
      </Stack>
    );
  }

  if (!iframeUrl) {
    return (
      <Box sx={{ height: FRAME_HEIGHT }}>
        <ChatsUnavailable
          reason={chatwootUnavailableReason(error ?? sessionQuery.error)}
          onRetry={retry}
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
          height: FRAME_HEIGHT,
          borderRadius: 2,
          overflow: "hidden",
          border: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          key={attempt}
          component="iframe"
          src={iframeUrl}
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
