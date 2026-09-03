import { isAppointmentCancelReason } from "../api/appointments";
import { tt } from "../i18n/t";

/**
 * Подпись причины отмены приёма.
 *
 * Известный код («доктор не выйдет», «пациент отказался»...) переводится из
 * словаря; исторический свободный текст (записи до 03.09.2026, когда бэк ещё
 * не валидировал поле) показываем как есть — переводить нечего, это чужие слова.
 */
export function cancelReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (isAppointmentCancelReason(reason)) return tt(`appointments:cancelReason.${reason}`);
  return reason;
}

export default cancelReasonLabel;
