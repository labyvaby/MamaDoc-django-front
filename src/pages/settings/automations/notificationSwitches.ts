import type {
  BranchSwitch,
  BranchSwitchInput,
  NotificationSwitches,
  NotificationSwitchesInput,
} from "../../../api/notifications";

/**
 * Филиалы, которые пользователь переключил относительно загруженного
 * состояния. В PUT уходят только они: бэк не трогает неперечисленные, и
 * так сохранение не создаёт строк для филиалов, к которым не прикасались
 * (та же строка включает и уведомления о приёмах).
 */
export function changedBranches(
  loaded: BranchSwitch[],
  draft: BranchSwitch[],
): BranchSwitchInput[] {
  const before = new Map(loaded.map((b) => [b.id, b.enabled]));
  return draft
    .filter((b) => before.has(b.id) && before.get(b.id) !== b.enabled)
    .map((b) => ({ id: b.id, enabled: b.enabled }));
}

export function switchesDirty(
  loaded: NotificationSwitches,
  draft: NotificationSwitches,
): boolean {
  return (
    loaded.enabled !== draft.enabled ||
    changedBranches(loaded.branches, draft.branches).length > 0
  );
}

export function toSwitchesInput(
  loaded: NotificationSwitches,
  draft: NotificationSwitches,
  organizationId: number | undefined,
): NotificationSwitchesInput {
  return {
    enabled: draft.enabled,
    branches: changedBranches(loaded.branches, draft.branches),
    organizationId,
  };
}

/**
 * Что показать над списком правил: выключенная платформа, выключенная
 * организация или выключенные филиалы — по убыванию серьёзности, одно за
 * раз. `null` — всё включено, баннер не нужен.
 */
export type SwitchesWarning =
  | { kind: "platform" }
  | { kind: "organization" }
  | { kind: "branches"; names: string[] };

export function switchesWarning(
  switches: NotificationSwitches,
): SwitchesWarning | null {
  if (!switches.platformEnabled) return { kind: "platform" };
  if (!switches.enabled) return { kind: "organization" };
  const off = switches.branches.filter((b) => !b.enabled).map((b) => b.name);
  return off.length ? { kind: "branches", names: off } : null;
}
