import type { ScribeConsent } from "../api/scribe";

export interface ConsentMenuState {
  /** Что показывать в меню: ответ «Нет» из плашки — как отказ. */
  shown: ScribeConsent;
  /** «Записать весь приём» нажимается только при согласии. */
  visitEnabled: boolean;
  /** Жёлтая плашка «Пациент согласен?» — пока не спрашивали и не ответили. */
  askConsent: boolean;
  /** Что отправить вместе с диктовкой: ответ из меню, чтобы он сохранился. */
  dictationConsent: "no" | undefined;
}

/**
 * Меню кнопки «Запись» по согласию пациента. «Нет» в плашке запись не
 * начинает: он держится в меню и уходит на сервер с диктовкой, если врач
 * её выберет (отдельной отметки согласия у врача может не быть).
 */
export function consentMenu(server: ScribeConsent, refusedInMenu: boolean): ConsentMenuState {
  const refused = server === "unknown" && refusedInMenu;
  const shown: ScribeConsent = refused ? "no" : server;
  return {
    shown,
    visitEnabled: shown === "yes",
    askConsent: shown === "unknown",
    dictationConsent: refused ? "no" : undefined,
  };
}
