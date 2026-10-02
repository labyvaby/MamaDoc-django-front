import type { TicketCategory } from "../api/support";
import type { AutoDescription } from "./autoDescription";
import type { Problem } from "./diagnosticsRecorder";
import type { Screenshot } from "./screenshot";

/**
 * Всё, что собрано к моменту открытия формы: снимок экрана, технический
 * снимок, недавний сбой и заготовка описания. Собирается ДО открытия панели,
 * чтобы на снимок не попала сама панель.
 */
export interface ReportSession {
  /** Растёт при каждом открытии — по нему форма сбрасывается. */
  id: number;
  category: TicketCategory;
  /** Недавний сбой (до 10 минут), если был. */
  problem: Problem | null;
  screenshot: Screenshot | null;
  auto: AutoDescription;
  /** Скрыт от пользователя: уходит на сервер только внутри обращения-ошибки. */
  diagnostics: Record<string, unknown>;
  /** Страница, где возникла проблема (не «Поддержка», если человек пришёл оттуда). */
  route: string;
}

export interface OpenReportOptions {
  category?: TicketCategory;
}
