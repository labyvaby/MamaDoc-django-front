import React from "react";
import { Box } from "@mui/material";

/**
 * Связь устанавливается — картинка ожидания.
 *
 * Раздел уже подписан парой реплик: на экране «вас не подключили»
 * (`DisconnectedChats` в ChatsUnavailable) своя реплика сплошная, чужая
 * пунктиром, а связь между ними разорвана. Ожидание рисуем той же парой, только
 * живой: пунктир бежит от CRM к Чат-центру, тот отвечает многоточием. Отвлечённый
 * круг спиннера сказал бы ровно «ждите» — эта же пара говорит, чего именно ждём.
 *
 * Анимации отключаются по `prefers-reduced-motion`; чтобы застывший кадр
 * выглядел осмысленно, прозрачность ожидающей реплики и точек задана атрибутами
 * прямо в разметке — CSS-анимация перебивает их, а без неё они и остаются.
 */
export const ConnectingChats: React.FC = () => (
  <Box
    aria-hidden
    sx={{
      color: "primary.main",
      lineHeight: 0,
      "@keyframes chatsLinkFlow": { to: { strokeDashoffset: -8 } },
      "@keyframes chatsTyping": {
        "0%, 60%, 100%": { opacity: 0.25 },
        "30%": { opacity: 1 },
      },
      "@keyframes chatsAwait": {
        "0%, 100%": { opacity: 0.34 },
        "50%": { opacity: 0.72 },
      },
      "& .link": { animation: "chatsLinkFlow 1.1s linear infinite" },
      "& .await": { animation: "chatsAwait 2.2s ease-in-out infinite" },
      "& .dot": { animation: "chatsTyping 1.4s ease-in-out infinite" },
      "& .dot:nth-of-type(2)": { animationDelay: "0.18s" },
      "& .dot:nth-of-type(3)": { animationDelay: "0.36s" },
      "@media (prefers-reduced-motion: reduce)": {
        "& .link, & .await, & .dot": { animation: "none" },
      },
    }}
  >
    <svg width="176" height="112" viewBox="0 0 132 84" fill="none">
      {/* Реплика CRM — сплошная: сотрудник здесь есть. */}
      <path
        d="M6 14a8 8 0 0 1 8-8h34a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H26l-11 9v-9h-1a8 8 0 0 1-8-8V14Z"
        fill="currentColor"
        fillOpacity="0.13"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M17 19h28M17 27h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* Связь: пунктир бежит слева направо, к Чат-центру. */}
      <path
        className="link"
        d="M55 38c7 6 11 8 17 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="4 4"
        opacity="0.75"
      />

      {/* Реплика Чат-центра — ещё пунктиром: ответа ждём. */}
      <path
        className="await"
        d="M76 42a8 8 0 0 1 8-8h34a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8h-1v9l-11-9H84a8 8 0 0 1-8-8V42Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="5 4"
        opacity="0.38"
      />

      {/* Многоточие: Чат-центр набирает ответ. */}
      <g fill="currentColor">
        <circle className="dot" cx="90" cy="52" r="2.6" opacity="0.45" />
        <circle className="dot" cx="99" cy="52" r="2.6" opacity="0.45" />
        <circle className="dot" cx="108" cy="52" r="2.6" opacity="0.45" />
      </g>
    </svg>
  </Box>
);
