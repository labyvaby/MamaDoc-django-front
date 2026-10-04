import { ApiError } from "../../../api/client";

/**
 * Код ошибки публичного API: там конверт `{error: "<код>", message, details}`,
 * `error` — строка, а не объект, поэтому `ApiError.code` (новый конверт CRM)
 * для него всегда `null`.
 */
function publicErrorCode(e: ApiError): string | null {
  const payload = e.payload;
  if (!payload || typeof payload !== "object") return null;
  const code = (payload as Record<string, unknown>).error;
  return typeof code === "string" && code ? code : null;
}

/**
 * Ключ локали для ошибки отправки заявки на запись.
 *
 * Тексты бэка адресованы разработчику, поэтому гостю показываем своё
 * объяснение — по статусу и машинному коду, никогда по тексту. До 25.09.2026
 * любой 400 сворачивался в «проверьте данные», и 48 отказов подряд из-за
 * закрытого на сервере времени (`online_booking_closed`) пациенты читали как
 * ошибку в имени или телефоне.
 */
export function submitErrorKey(e: unknown): string {
  if (!(e instanceof ApiError)) return "bookingFailed";
  // 405 — эндпоинта создания нет (было до 03.08.2026). 404 с живым POST
  // значит другое: врач, филиал или услуга не найдены — предлагать
  // «скоро заработает» здесь неуместно.
  if (e.status === 405) return "onlineBookingSoon";
  if (e.status === 404) return "bookingTargetGone";
  if (e.status === 409) return "slotTaken";
  if (e.status === 429) return "tooManyAttempts";
  const code = publicErrorCode(e);
  if (code === "online_booking_closed") return "bookingClosedForTime";
  if (code === "payment_unavailable") return "paymentUnavailable";
  return "bookingFailed";
}
