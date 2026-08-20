import dayjs from "dayjs";

import { isCleaningBackdated, type CleaningRecord } from "../../api/cleaning";

/**
 * Подписи дат записи об уборке. Их две, и они разные:
 *   • дата уборки (`performedAt`) — за какой день отмечена уборка; время внутри
 *     дня бэк ставит полднем, показывать его бессмысленно;
 *   • `createdAt` — когда запись реально создали (аудит).
 * Пока бэк с `performedAt` не выложен (см. CLEANING_BACKDATE_ENABLED), дата
 * уборки = момент создания, и время в ней осмысленно — поэтому формат ветвится.
 */
export function formatCleaningDate(record: CleaningRecord): string {
  return record.performedAt
    ? dayjs(record.performedAt).format("DD.MM.YYYY")
    : dayjs(record.createdAt).format("DD.MM.YYYY HH:mm");
}

/** Служебная подпись «когда завели запись» — для тултипа и заголовков диалогов. */
export function formatCleaningCreatedAt(record: CleaningRecord): string {
  return dayjs(record.createdAt).format("DD.MM.YYYY HH:mm");
}

/** Тултип к дате: у записи задним числом поясняем расхождение с созданием. */
export function cleaningDateTooltip(record: CleaningRecord): string {
  return isCleaningBackdated(record)
    ? `Отмечено задним числом. Запись создана ${formatCleaningCreatedAt(record)}`
    : `Запись создана ${formatCleaningCreatedAt(record)}`;
}
