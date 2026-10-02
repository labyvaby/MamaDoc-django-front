import type { Theme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

import type { TicketCategory, TicketImpact, TicketStatus } from "../api/support";

/**
 * Словарь подписей и цветовых тонов обращений. Тон — это ключ палитры темы,
 * поэтому плашки читаются и в светлой, и в тёмной теме без хексов в коде.
 */
export type SupportTone = "primary" | "info" | "warning" | "success" | "error" | "purple" | "neutral";

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  bug: "Ошибка",
  idea: "Пожелание",
  question: "Вопрос",
};

export const CATEGORY_HINT: Record<TicketCategory, string> = {
  bug: "Что-то сломалось или работает не так",
  idea: "Как сделать систему удобнее",
  question: "Не понимаю, как это работает",
};

export const CATEGORY_TONE: Record<TicketCategory, SupportTone> = {
  bug: "error",
  idea: "purple",
  question: "info",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  needs_info: "Нужны уточнения",
  planned: "Запланирована",
  resolved: "Решена",
  rejected: "Отклонена",
  voided: "Аннулирована",
};

export const STATUS_TONE: Record<TicketStatus, SupportTone> = {
  new: "info",
  in_progress: "primary",
  needs_info: "warning",
  planned: "purple",
  resolved: "success",
  rejected: "error",
  voided: "neutral",
};

/** Что статус значит для автора — одной фразой под заголовком. */
export const STATUS_HINT: Record<TicketStatus, string> = {
  new: "Мы получили обращение и скоро посмотрим.",
  in_progress: "Разработчики уже занимаются этим.",
  needs_info: "Нам нужен ваш ответ — загляните в переписку.",
  planned: "Идея принята и стоит в планах.",
  resolved: "Исправлено. Если не помогло — нажмите «Не помогло».",
  rejected: "Мы не будем это делать. Причина — в переписке.",
  voided: "Обращение аннулировано и осталось в истории.",
};

export const IMPACT_LABEL: Record<TicketImpact, string> = {
  blocked: "Не могу работать",
  degraded: "Работаю, но мешает",
  minor: "Мелочь",
};

export const IMPACT_TONE: Record<TicketImpact, SupportTone> = {
  blocked: "error",
  degraded: "warning",
  minor: "info",
};

export const OPEN_STATUSES: TicketStatus[] = ["new", "in_progress", "needs_info", "planned"];
export const FINAL_STATUSES: TicketStatus[] = ["resolved", "rejected", "voided"];

/** Порядок кнопок смены статуса у разработчика. */
export const STAFF_STATUS_FLOW: TicketStatus[] = [
  "new",
  "in_progress",
  "needs_info",
  "planned",
  "resolved",
  "rejected",
];

/** Эти статусы бэкенд принимает только вместе с текстом ответа. */
export const STATUS_NEEDS_COMMENT: TicketStatus[] = ["needs_info", "rejected"];

export interface ToneColors {
  main: string;
  /** Контрастный на поверхности цвет для текста и иконок. */
  text: string;
  soft: string;
  softer: string;
  border: string;
}

/** Цвета тона из палитры темы — единый источник для плашек, иконок и теней. */
export function toneColors(theme: Theme, tone: SupportTone): ToneColors {
  const dark = theme.palette.mode === "dark";
  const palette =
    tone === "neutral"
      ? null
      : tone === "purple"
        ? theme.palette.purple
        : theme.palette[tone];
  if (!palette) {
    const main = theme.palette.text.secondary;
    return {
      main,
      text: theme.palette.text.secondary,
      soft: alpha(main, dark ? 0.2 : 0.12),
      softer: alpha(main, dark ? 0.1 : 0.06),
      border: alpha(main, 0.28),
    };
  }
  return {
    main: palette.main,
    text: dark ? palette.light : palette.dark,
    soft: alpha(palette.main, dark ? 0.22 : 0.13),
    softer: alpha(palette.main, dark ? 0.12 : 0.07),
    border: alpha(palette.main, 0.34),
  };
}

// ── Время ──────────────────────────────────────────────────────────────────

const RTF = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

/** «только что», «5 минут назад», «вчера», а дальше — дата. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diffSec = Math.round((ts - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return "только что";
  if (abs < 3600) return RTF.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return RTF.format(Math.round(diffSec / 3600), "hour");
  if (abs < 7 * 86_400) return RTF.format(Math.round(diffSec / 86_400), "day");
  return new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
