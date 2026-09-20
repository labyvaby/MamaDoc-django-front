import React from "react";
import { Box, CircularProgress, Link, Stack, Typography } from "@mui/material";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import { useQuery } from "@tanstack/react-query";

import { AppButton } from "../ui";
import { chatwootUnavailableReason, fetchChatwootEmbed } from "../../api/chatwoot";
import { useT } from "../../i18n/VerticalProvider";
import { ChatsUnavailable } from "../../pages/chats/ChatsUnavailable";
import { useChatwootLoginFailed } from "../../pages/chats/useChatwootSession";

/**
 * Пауза после `load` у страницы входа: `POST /auth/sign_in` уходит уже после
 * события, и раньше этого момента менять `src` нельзя — вход сорвётся, а
 * одноразовый токен сгорит впустую (см. `pages/chats/index.tsx`).
 */
const SSO_SETTLE_MS = 2500;
/** Пауза после `load` разговора, чтобы Chatwoot успел отрисовать SPA. */
const REVEAL_DELAY_MS = 400;

type Phase =
  /** Карточка открыта, но чат ещё не запрашивали: только кнопка. */
  | "idle"
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
 * Грузится только по кнопке «Открыть чат»: карточку открывают чаще, чем
 * читают переписку, а каждый iframe — это отдельная загрузка SPA Chatwoot и,
 * при отсутствии сессии, одноразовый SSO-токен. Рядом — ссылка на разговор в
 * новой вкладке: она работает и там, где Chatwoot запрещает встраивание
 * (frame-ancestors) — например, со стенда.
 *
 * Дальше — ленивый вход раздела «Чаты», но с другой целью: не дашборд, а
 * конкретный разговор (`Deal.chatUrl`). Порядок: разговор → (нет сессии) →
 * SSO-ссылка → разговор заново → (снова нет сессии) → «Переподключить».
 * Прочитать содержимое iframe нельзя — о срыве сообщает сама страница
 * Chatwoot через `postMessage` (`useChatwootLoginFailed`).
 */
const DealChatPane: React.FC<{ chatUrl: string }> = ({ chatUrl }) => {
  const { t } = useT("deals");
  const [phase, setPhase] = React.useState<Phase>("idle");
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
      : phase === "failed" || phase === "idle"
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

  // Новый разговор (другая сделка в том же дровере) — снова только кнопка.
  React.useEffect(() => {
    setPhase("idle");
  }, [chatUrl]);

  const retry = () => {
    setAttempt((n) => n + 1);
    setPhase("sso");
  };

  if (phase === "idle") {
    return (
      <Stack spacing={1.5} sx={{ height: "100%", alignItems: "center", justifyContent: "center", px: 3 }}>
        <AppButton variant="contained" startIcon={<ForumOutlined />} onClick={() => setPhase("conversation")}>
          {t("detail.chatOpen")}
        </AppButton>
        <Link href={chatUrl} target="_blank" rel="noopener" variant="body2" underline="hover">
          {t("detail.chatOpenExternal")}
        </Link>
      </Stack>
    );
  }

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
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
        <CircularProgress size={22} />
      </Stack>
    );
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
    <Box sx={{ position: "relative", height: "100%", bgcolor: "background.paper" }}>
      <Box
        component="iframe"
        src={src}
        title={title}
        onLoad={handleLoad}
        // Chatwoot грузит вложения и уведомления; sandbox не ставим, иначе
        // ломается его собственная авторизация и WebSocket.
        allow="clipboard-write; microphone; camera; autoplay"
        sx={{
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
          opacity: revealed ? 1 : 0,
          transition: (theme) => theme.transitions.create("opacity", { duration: 300 }),
        }}
      />
      <Stack
        role="status"
        aria-hidden={revealed}
        spacing={1.5}
        sx={{
          position: "absolute",
          inset: 0,
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.paper",
          opacity: revealed ? 0 : 1,
          pointerEvents: "none",
          transition: (theme) => theme.transitions.create("opacity", { duration: 300 }),
        }}
      >
        <CircularProgress size={22} />
        <Typography variant="body2" color="text.secondary">
          {connectingLabel}
        </Typography>
      </Stack>
    </Box>
  );
};

export default DealChatPane;
