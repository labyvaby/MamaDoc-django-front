import React from "react";
import {
  Box,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import RefreshOutlined from "@mui/icons-material/RefreshOutlined";

import { AppButton, PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
  chatwootUnavailableReason,
  fetchChatwootEmbed,
  fetchChatwootSession,
} from "../../api/chatwoot";
import { ChatsUnavailable } from "./ChatsUnavailable";
import { useChatwootLoginFailed } from "./useChatwootSession";

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
 * Ссылку берём РОВНО ОДИН РАЗ на каждое открытие раздела. Токен одноразовый:
 * он гасится при использовании и живёт пять минут, поэтому повторно отправить
 * уже потраченный — значит получить 401 и форму пароля вместо дашборда.
 *
 * (Токены одного пользователя при этом СОСУЩЕСТВУЮТ: ключ в Redis у Chatwoot
 * составной, `user_id` плюс сам токен. Новая выдача предыдущую не гасит — это
 * проверено опытом. Поэтому две вкладки друг другу не мешают, и замка на них
 * нет.)
 *
 * Отсюда запрет на самообновление запросов: `staleTime: Infinity`, без refetch
 * на mount, фокус окна и переподключение. `gcTime: 0` при этом гарантирует, что
 * следующее открытие раздела начнётся с чистого листа и получит свежую ссылку.
 *
 * Порядок описан тремя состояниями — `session → sso → failed`. Флагами это уже
 * пробовали, и вышла ошибка: «сигнал пришёл» и «ссылка получена» становились
 * истинными одновременно, экран повтора закрывал собой попытку войти, и ссылку
 * в iframe никто не подставлял. У кого сессия Чат-центра не была живой, раздел
 * не открывался вовсе.
 *
 * Если вход всё-таки сорвался, Chatwoot сообщает об этом сам
 * (`useChatwootLoginFailed`), и мы показываем повтор вместо чужой формы пароля.
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
      Ссылка для входа действует пять минут и только один раз — если вкладка
      висела открытой, она успевает устареть. Нажмите «Войти заново», и всё
      откроется.
    </Typography>
    <AppButton variant="contained" startIcon={<RefreshOutlined />} onClick={onRetry}>
      Войти заново
    </AppButton>
  </Stack>
);

const FRAME_HEIGHT = { xs: "80vh", md: "calc(100vh - 96px)" } as const;

/**
 * Сколько ждать после `load`, прежде чем показывать саму рамку.
 *
 * `load` приходит на HTML, а рисует себя Chatwoot уже своим скриптом — снять
 * подложку прямо на этом событии значит показать ровно тот кадр, ради которого
 * она и заведена. Полсекунды хватает приложению встать на ноги, и на фоне самой
 * загрузки раздела они не заметны.
 */
const FRAME_REVEAL_DELAY_MS = 500;

/**
 * Рамка Чат-центра с подложкой цвета CRM.
 *
 * Пока Chatwoot не нарисовал себя, рамка светится белым во весь экран, и на
 * тёмной теме это вспышка. Причин у неё две, и обе закрываются одним приёмом:
 * у пустой страницы Chatwoot фон прозрачный — сквозь рамку видно то, что под
 * ней, — а поднявшееся приложение заливает её своим фоном, светлым, если
 * браузер сотрудника просит светлую тему (Chatwoot смотрит на
 * `prefers-color-scheme`, а тема CRM выбирается отдельно, в самой CRM).
 *
 * Поэтому под рамку кладём поверхность CRM (`background.paper`) и ею же
 * накрываем сверху, пока Чат-центр не встал: сначала сотрудник видит обычную
 * пустую карточку CRM, а не чужой белый лист. Дальше подложка не исчезает
 * рывком, а растворяется — так и переход к светлому Chatwoot читается мягче.
 *
 * Внутрь рамки заглянуть нельзя, это чужой origin, поэтому единственный
 * доступный признак готовности — `load` плюс пауза (`FRAME_REVEAL_DELAY_MS`).
 *
 * Компонент монтируется заново на каждую попытку входа (ключ снаружи), так что
 * подложка сама возвращается на место — сбрасывать её руками не нужно.
 */
const ChatsFrame: React.FC<{ src: string }> = ({ src }) => {
  const [revealed, setRevealed] = React.useState(false);
  const timerRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleLoad = React.useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => setRevealed(true),
      FRAME_REVEAL_DELAY_MS,
    );
  }, []);

  return (
    <Box
      sx={{
        position: "relative",
        height: "100%",
        // Прозрачные кадры Chatwoot показывают то, что под рамкой: пусть это
        // будет поверхность CRM, а не страница со своим градиентом.
        bgcolor: "background.paper",
      }}
    >
      <Box
        component="iframe"
        src={src}
        title="Чаты"
        onLoad={handleLoad}
        // Chatwoot грузит вложения и уведомления; sandbox не ставим, иначе
        // ломается его собственная авторизация и WebSocket.
        allow="clipboard-write; microphone; camera; autoplay"
        sx={{
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
          // Прячем прозрачностью, а не `display: none`: рамка нулевого размера
          // мешала бы Chatwoot считать вёрстку, а вход он ведёт сам.
          opacity: revealed ? 1 : 0,
          transition: (theme) =>
            theme.transitions.create("opacity", { duration: 400 }),
        }}
      />
      <Stack
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.paper",
          opacity: revealed ? 0 : 1,
          pointerEvents: "none",
          transition: (theme) =>
            theme.transitions.create("opacity", { duration: 400 }),
        }}
      >
        <CircularProgress size={28} />
      </Stack>
    </Box>
  );
};

export const ChatsPage: React.FC = () => {
  usePageTitle("Чаты");

  // Явные состояния вместо связки флагов: раньше «сигнал пришёл» и «ссылка
  // получена» сходились одновременно, и экран повтора показывался ВМЕСТО
  // попытки войти — ссылку в iframe никто не подставлял. Теперь переход
  // «сессия → вход → не вышло» виден в одном месте и перепутать его нельзя.
  const [phase, setPhase] = React.useState<"session" | "sso" | "failed">(
    "session",
  );
  const [attempt, setAttempt] = React.useState(0);

  const sessionQuery = useQuery({
    queryKey: ["chatwoot", "session", attempt],
    queryFn: fetchChatwootSession,
    enabled: phase === "session",
    // Ссылка на дашборд секретов не содержит, но перезапросы ни к чему:
    // менять `src` живому iframe нельзя, он оборвёт вход.
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Адрес дашборда получить не удалось (выключенная интеграция, старый
  // бэкенд) — идём за ссылкой входа, там разберём причину точнее.
  React.useEffect(() => {
    if (phase === "session" && sessionQuery.isError) setPhase("sso");
  }, [phase, sessionQuery.isError]);

  const embedQuery = useQuery({
    queryKey: ["chatwoot", "embed", attempt],
    queryFn: fetchChatwootEmbed,
    enabled: phase === "sso",
    // Токен одноразовый и живёт пять минут: повторный запрос выписал бы новый,
    // а тот, с которым iframe уже начал вход, оставил бы догорать.
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const iframeUrl =
    phase === "session"
      ? sessionQuery.data?.dashboardUrl ?? null
      : embedQuery.data?.url ?? null;

  // Сигнал от Чат-центра: из «сессии» он означает «войди», из «входа» — что не
  // помогла и ссылка, и вот тогда показываем повтор.
  const onLoginRequired = React.useCallback(() => {
    setPhase((current) => (current === "session" ? "sso" : "failed"));
  }, []);
  useChatwootLoginFailed(iframeUrl, onLoginRequired);

  const retry = React.useCallback(() => {
    setAttempt((n) => n + 1);
    setPhase("sso");
  }, []);

  if (phase === "failed") {
    return (
      <Box sx={{ height: FRAME_HEIGHT }}>
        <ChatsRecovery onRetry={retry} />
      </Box>
    );
  }

  const query = phase === "session" ? sessionQuery : embedQuery;
  if (query.isPending || (!query.isError && !iframeUrl)) {
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
          reason={chatwootUnavailableReason(embedQuery.error)}
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
        <ChatsFrame key={`${phase}-${attempt}`} src={iframeUrl} />
      </Box>
    </Box>
  );
};

export default ChatsPage;
