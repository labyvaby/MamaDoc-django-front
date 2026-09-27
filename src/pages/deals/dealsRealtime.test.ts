import { describe, expect, it } from "vitest";

import type { ChangeMessage } from "../../hooks/useChangesSocket";
import { reactToDealEvent } from "./dealsRealtime";

function msg(over: Partial<ChangeMessage> = {}): ChangeMessage {
  return {
    entity: "deal",
    action: "created",
    objectId: 10,
    branchId: null,
    organizationId: 1,
    meta: { pipelineId: 1, stageId: 5, fromStageId: null, actorKind: "bot" },
    ...over,
  };
}

describe("reactToDealEvent", () => {
  it("чужая сущность — ничего", () => {
    expect(reactToDealEvent(msg({ entity: "appointment" }), 1, new Set())).toEqual({
      refetch: false,
      celebrate: false,
    });
  });

  it("сделка другой воронки доску не трогает", () => {
    expect(reactToDealEvent(msg({ meta: { pipelineId: 2 } }), 1, new Set())).toEqual({
      refetch: false,
      celebrate: false,
    });
  });

  it("без выбранной воронки реагирует на любую", () => {
    expect(reactToDealEvent(msg({ meta: { pipelineId: 2 } }), null, new Set()).refetch).toBe(true);
  });

  it("новая сделка от бота — перезапрос и праздник", () => {
    expect(reactToDealEvent(msg(), 1, new Set())).toEqual({ refetch: true, celebrate: true });
  });

  it("своя сделка (создана в этой вкладке) не звенит", () => {
    expect(reactToDealEvent(msg({ objectId: 10 }), 1, new Set([10]))).toEqual({
      refetch: true,
      celebrate: false,
    });
  });

  it("перенос и правка — только перезапрос", () => {
    for (const action of ["moved", "updated", "deleted"] as const) {
      expect(reactToDealEvent(msg({ action }), 1, new Set())).toEqual({
        refetch: true,
        celebrate: false,
      });
    }
  });
});
