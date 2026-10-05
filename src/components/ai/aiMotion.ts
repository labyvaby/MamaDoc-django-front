import { keyframes } from "@mui/material/styles";

/**
 * Общий «язык движения» AI-экранов: распознавание накладной (ReceiptFormDialog)
 * и разбор заключения AI-помощником (AiThinkingStrip). Один набор кадров —
 * чтобы ожидание AI выглядело одинаково по всему приложению.
 */

/** Линия сканирования сверху вниз. */
export const aiScanLine = keyframes`
  0% { top: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
`;

/** Блик, проходящий наискосок слева направо. */
export const aiShimmer = keyframes`
  0% { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
  20% { opacity: .8; }
  80% { opacity: .8; }
  100% { transform: translateX(420%) skewX(-18deg); opacity: 0; }
`;

/** «Дыхание» значка AI. */
export const aiPulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
`;

/** Появление карточки: выезжает слева направо — к своему полю. */
export const aiCardIn = keyframes`
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
`;

/** «AI читает это поле»: рамка поля мерцает, пока ждём ответ. */
export const aiFieldGlow = keyframes`
  0%, 100% { opacity: .35; }
  50% { opacity: 1; }
`;

/** Отключить анимацию тем, кто попросил систему о меньшем движении. */
export const reducedMotion = {
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
} as const;

/**
 * Процент по прошедшему времени: быстро в начале и всё медленнее к концу —
 * при tau = 28 с: 30 с ≈ 65%, 60 с ≈ 88%, дальше подползает к потолку, но не
 * достигает его. Сервер прогресс не сообщает, поэтому точным процент не
 * бывает — зато не стоит на месте и не показывает «готово» раньше ответа.
 */
export const aiProgressPercentAt = (seconds: number, cap: number, tau = 28): number =>
  Math.min(cap, Math.floor(cap * (1 - Math.exp(-seconds / tau))));

/** Этап по прошедшему времени: последний, чей порог (`from`, с) пройден. */
export const aiStageAt = (stages: ReadonlyArray<{ from: number }>, seconds: number): number =>
  stages.reduce((stage, item, index) => (seconds >= item.from ? index : stage), 0);
