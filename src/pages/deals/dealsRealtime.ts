import type { ChangeMessage } from "../../hooks/useChangesSocket";

/** Что доска делает на входящее WS-событие. */
export interface DealEventReaction {
  /** Перезапросить доску и сводку. */
  refetch: boolean;
  /** Новая сделка от кого-то другого: подсветить и (если включено) озвучить. */
  celebrate: boolean;
}

const NONE: DealEventReaction = { refetch: false, celebrate: false };

/**
 * Чистое правило реакции на событие `entity: "deal"`.
 *
 * Бэк шлёт подсказки в группу организации целиком, поэтому фильтр по воронке —
 * здесь: событие чужой воронки доску не трогает. «Своя» сделка (созданная из
 * этой вкладки, id в `ownIds`) не празднуется — иначе каждый регистратор
 * слышал бы звук на собственное действие.
 */
export function reactToDealEvent(
  msg: ChangeMessage,
  pipelineId: number | null | undefined,
  ownIds: ReadonlySet<number>,
): DealEventReaction {
  if (msg.entity !== "deal") return NONE;
  const eventPipeline = msg.meta?.pipelineId;
  if (
    pipelineId != null &&
    typeof eventPipeline === "number" &&
    eventPipeline !== pipelineId
  ) {
    return NONE;
  }
  const isForeignCreate =
    msg.action === "created" && (msg.objectId == null || !ownIds.has(msg.objectId));
  return { refetch: true, celebrate: isForeignCreate };
}
