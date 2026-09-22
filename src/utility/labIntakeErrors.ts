/**
 * Разбор ответа `POST /api/lab/orders/` на неудаче.
 *
 * Самое важное в задаче дровера (lab-frontend-design.md, раздел «Отказы»):
 * 422 и 502 не должны выглядеть одинаково. Спутав их, регистратор пересоберёт
 * корзину и создаст **второй оплаченный заказ** — 422 значит «в БД ничего не
 * создано, правь и отправляй заново», а 502 значит «деньги уже приняты,
 * заказ существует, отправлять повторно нельзя — только кнопкой повтора».
 *
 * Различаем через `ApiError.status` (не `code`) — как явно требует план
 * задачи: код провода нестабилен между окружениями (see
 * `docs/backend-error-contract.md` про конверт, который выложен не везде), а
 * `status` есть всегда, даже когда тело ответа не распарсилось.
 */

import { ApiError, getErrorMessage } from "../api/client";

export type LabIntakeOutcome =
  | { kind: "validation"; message: string }
  | { kind: "lisUnavailable"; message: string; orderId: number }
  | { kind: "other"; message: string };

export function describeLabIntakeOrderError(err: unknown): LabIntakeOutcome {
  if (err instanceof ApiError) {
    if (err.status === 422) {
      return { kind: "validation", message: err.message };
    }
    if (err.status === 502) {
      const rawOrderId = err.details?.orderId;
      // Контракт (`LabError.details.orderId`, docs/lab-intake-design.md
      // §«Обработка ошибок», фаза 2) обещает номер заказа в теле всегда.
      // Без него это не опознанный сбой ЛИС, а что-то ещё — например, сырой
      // 502 от прокси, до которого запрос вообще не дошёл до бэкенда приёма
      // (тело тогда не JSON, и `details` окажется `null`). Ложно утверждать
      // «оплачено, не отправлено» без доказательства опаснее, чем показать
      // общую ошибку: реального заказа может не быть вовсе.
      if (typeof rawOrderId === "number") {
        return { kind: "lisUnavailable", message: err.message, orderId: rawOrderId };
      }
    }
  }
  return { kind: "other", message: getErrorMessage(err) };
}
