import React from "react";
import { Box, Link, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { AppButton } from "../ui";
import { chatwootUnavailableReason, fetchChatwootEmbed } from "../../api/chatwoot";
import { useT } from "../../i18n/VerticalProvider";
import { ChatsUnavailable } from "../../pages/chats/ChatsUnavailable";
import { ConnectingChats } from "../../pages/chats/ConnectingChats";
import { useChatwootLoginFailed } from "../../pages/chats/useChatwootSession";

/**
 * Пауза после `load` у страницы входа: `POST /auth/sign_in` уходит уже после
 * события, и раньше этого момента менять `src` нельзя — вход сорвётся, а
 * одноразовый токен сгорит впустую (см. `pages/chats/index.tsx`).
 */
const SSO_SETTLE_MS = 2500;
/** Пауза после `load` разговора, чтобы Chatwoot успел отрисовать SPA. */
const REVEAL_DELAY_MS = 400;
/**
 * Масштаб содержимого iframe. Панель узкая (~400px), а интерфейс Chatwoot
 * рассчитан на телефон в 100%: ужимаем через transform, чтобы в ту же ширину
 * влезало больше переписки. `zoom` на iframe браузеры трактуют по-разному,
 * transform — одинаково везде.
 */
const CHAT_SCALE = 0.75;

type Phase =
  /** Ведём iframe на разговор: сессия Чат-центра обычно уже есть. */
  | "conversation"
  /** Сессии нет — грузим ссылку входа, Chatwoot ставит cookie. */
  | "sso"
  /** Cookie есть — возвращаемся на разговор новым iframe. */
  | "return"
  /** И после входа не пустило: предлагаем повторить. */
  | "failed";

/**
 * Разговор Chatwoot внутри карточки сделки.
 *
 * Панель монтируется только по кнопке «Открыть чат» в карточке (см.
 * `DealDetailDrawer`): карточку открывают чаще, чем читают переписку, а каждый
 * iframe — это отдельная загрузка SPA Chatwoot и, при отсутствии сессии,
 * одноразовый SSO-токен. Поэтому здесь нет «пустого» состояния — с первого
 * рендера ведём на разговор. Ссылка на разговор в новой вкладке остаётся в
 * состоянии «не пустило»: она работает и там, где Chatwoot запрещает
 * встраивание (frame-ancestors) — например, со стенда.
 *
 * Дальше — ленивый вход раздела «Чаты», но с другой целью: не дашборд, а
 * конкретный разговор (`Deal.chatUrl`). Порядок: разговор → (нет сессии) →
 * SSO-ссылка → разговор заново → (снова нет сессии) → «Переподключить».
 * Прочитать содержимое iframe нельзя — о срыве сообщает сама страница
 * Chatwoot через `postMessage` (`useChatwootLoginFailed`).
 */
const DealChatPane: React.FC<{ chatUrl: string }> = ({ chatUrl }) => {
  const { t } = useT("deals");
  const [phase, setPhase] = React.useState<Phase>("conversation");
  const [attempt, setAttempt] = React.useState(0);

  const embedQuery = useQuery({
    queryKey: ["chatwoot", "embed", "deal", attempt],
    queryFn: fetchChatwootEmbed,
    enabled: phase === "sso",
    // Токен одноразовый: повторный запрос выписал бы новый, а тот, с которым
    // iframe уже начал вход, оставил бы догорать.
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const src =
    phase === "sso"
      ? (embedQuery.data?.url ?? null)
      : phase === "failed"
        ? null
        : chatUrl;

  const onLoginRequired = React.useCallback(() => {
    setPhase((current) => {
      if (current === "conversation") return "sso";
      if (current === "return") return "failed";
      return current;
    });
  }, []);
  useChatwootLoginFailed(src, onLoginRequired);

  // Новый разговор (другая сделка в том же дровере) — начинаем заново.
  React.useEffect(() => {
    setPhase("conversation");
  }, [chatUrl]);

  const retry = () => {
    setAttempt((n) => n + 1);
    setPhase("sso");
  };

  if (phase === "failed") {
    return (
      <Stack spacing={1.5} sx={{ height: "100%", alignItems: "center", justifyContent: "center", px: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} textAlign="center">
          {t("detail.chatFailedTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {t("detail.chatFailedHint")}
        </Typography>
        <AppButton onClick={retry}>{t("detail.chatReconnect")}</AppButton>
        {/* Фрейм не пустил — как раз случай для ссылки в новой вкладке. */}
        <Link href={chatUrl} target="_blank" rel="noopener" variant="body2" underline="hover">
          {t("detail.chatOpenExternal")}
        </Link>
      </Stack>
    );
  }

  if (phase === "sso" && embedQuery.isError) {
    return (
      <Box sx={{ height: "100%" }}>
        <ChatsUnavailable reason={chatwootUnavailableReason(embedQuery.error)} onRetry={retry} />
      </Box>
    );
  }

  if (!src) {
    return <ChatLoader label={t("detail.chatConnecting")} />;
  }

  return (
    <ChatFrame
      key={`${phase}-${attempt}`}
      src={src}
      title={t("detail.chat")}
      connectingLabel={t("detail.chatConnecting")}
      // На странице входа `load` — не готовность: ждём, пока уйдёт sign_in,
      // и только потом возвращаемся на разговор новым iframe.
      settleMs={phase === "sso" ? SSO_SETTLE_MS : REVEAL_DELAY_MS}
      onSettled={phase === "sso" ? () => setPhase("return") : undefined}
    />
  );
};

/** iframe с подложкой до первого кадра; монтируется заново на каждую попытку. */
const ChatFrame: React.FC<{
  src: string;
  title: string;
  connectingLabel: string;
  settleMs: number;
  onSettled?: () => void;
}> = ({ src, title, connectingLabel, settleMs, onSettled }) => {
  const [revealed, setRevealed] = React.useState(false);
  const timerRef = React.useRef<number | undefined>(undefined);
  const settledRef = React.useRef(onSettled);
  settledRef.current = onSettled;

  React.useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleLoad = React.useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setRevealed(true);
      settledRef.current?.();
    }, settleMs);
  }, [settleMs]);

  return (
    <Box sx={{ position: "relative", height: "100%", overflow: "hidden", bgcolor: "background.paper" }}>
      <Box
        component="iframe"
        src={src}
        title={title}
        onLoad={handleLoad}
        // Chatwoot грузит вложения и уведомления; sandbox не ставим, иначе
        // ломается его собственная авторизация и WebSocket.
        allow="clipboard-write; microphone; camera; autoplay"
        sx={{
          // Рисуем фрейм крупнее и ужимаем: 100/0.75 ≈ 133% в обе стороны.
          width: `${100 / CHAT_SCALE}%`,
          height: `${100 / CHAT_SCALE}%`,
          transform: `scale(${CHAT_SCALE})`,
          transformOrigin: "0 0",
          border: 0,
          display: "block",
          opacity: revealed ? 1 : 0,
          transition: (theme) => theme.transitions.create("opacity", { duration: 300 }),
        }}
      />
      <Box
        role="status"
        aria-hidden={revealed}
        sx={{
          position: "absolute",
          inset: 0,
          opacity: revealed ? 0 : 1,
          pointerEvents: "none",
          transition: (theme) => theme.transitions.create("opacity", { duration: 300 }),
        }}
      >
        <ChatLoader label={connectingLabel} />
      </Box>
    </Box>
  );
};

/**
 * Та же картинка ожидания, что в разделе «Чаты» (`ConnectingChats`): пара
 * реплик, пунктир бежит от CRM к Чат-центру. Панель узкая — картинка та же,
 * подпись ниже.
 */
const ChatLoader: React.FC<{ label: string }> = ({ label }) => (
  <Stack
    spacing={1.75}
    sx={{ height: "100%", alignItems: "center", justifyContent: "center", px: 3, bgcolor: "background.paper" }}
  >
    <ConnectingChats />
    <Typography variant="body2" color="text.secondary" textAlign="center">
      {label}
    </Typography>
  </Stack>
);

export default DealChatPane;
