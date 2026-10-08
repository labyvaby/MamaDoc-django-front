import { useQuery } from "@tanstack/react-query";

import { listCardAttachments, type AttachmentOwner, type CardAttachment } from "../../api/attachments";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";

export function cardAttachmentsKey(owner: AttachmentOwner) {
  return djangoQueryKeys.attachments.list(owner.kind, owner.id);
}

/**
 * Файлы карточки. Тот же ключ берут панель и счётчик на вкладке — запрос
 * уходит один раз, а загрузка и удаление правят общий кэш.
 */
export function useCardAttachments(owner: AttachmentOwner | null) {
  return useQuery<CardAttachment[]>({
    queryKey: owner ? cardAttachmentsKey(owner) : [...djangoQueryKeys.attachments.all, "none"],
    queryFn: ({ signal }) => listCardAttachments(owner as AttachmentOwner, signal),
    enabled: owner !== null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
}
