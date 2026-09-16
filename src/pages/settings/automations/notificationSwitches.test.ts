import { describe, expect, it } from "vitest";

import type { NotificationSwitches } from "../../../api/notifications";
import {
  changedBranches,
  switchesDirty,
  switchesWarning,
  toSwitchesInput,
} from "./notificationSwitches";

const loaded: NotificationSwitches = {
  organizationId: 1,
  enabled: true,
  platformEnabled: true,
  branches: [
    { id: 10, name: "Центр", enabled: true },
    { id: 11, name: "Север", enabled: false },
    { id: 12, name: "Юг", enabled: false },
  ],
};

const withBranch = (id: number, enabled: boolean): NotificationSwitches => ({
  ...loaded,
  branches: loaded.branches.map((b) => (b.id === id ? { ...b, enabled } : b)),
});

describe("changedBranches", () => {
  it("lists only the branches whose switch differs from the loaded state", () => {
    expect(changedBranches(loaded.branches, withBranch(11, true).branches)).toEqual([
      { id: 11, enabled: true },
    ]);
  });

  it("is empty when nothing was touched — an untouched branch never gets a row", () => {
    expect(changedBranches(loaded.branches, loaded.branches)).toEqual([]);
  });

  it("ignores a branch the server did not list", () => {
    const draft = [...loaded.branches, { id: 99, name: "Призрак", enabled: true }];
    expect(changedBranches(loaded.branches, draft)).toEqual([]);
  });
});

describe("switchesDirty / toSwitchesInput", () => {
  it("is clean for an identical draft", () => {
    expect(switchesDirty(loaded, structuredClone(loaded))).toBe(false);
  });

  it("is dirty when the master switch moved, even with no branch changes", () => {
    const draft = { ...loaded, enabled: false };
    expect(switchesDirty(loaded, draft)).toBe(true);
    expect(toSwitchesInput(loaded, draft, 7)).toEqual({
      enabled: false,
      branches: [],
      organizationId: 7,
    });
  });

  it("sends the master switch as is plus the changed branches", () => {
    const draft = withBranch(12, true);
    expect(toSwitchesInput(loaded, draft, undefined)).toEqual({
      enabled: true,
      branches: [{ id: 12, enabled: true }],
      organizationId: undefined,
    });
  });
});

describe("switchesWarning", () => {
  it("puts the platform first, then the organization, then branches", () => {
    expect(switchesWarning({ ...loaded, platformEnabled: false, enabled: false })).toEqual({
      kind: "platform",
    });
    expect(switchesWarning({ ...loaded, enabled: false })).toEqual({ kind: "organization" });
    expect(switchesWarning(loaded)).toEqual({ kind: "branches", names: ["Север", "Юг"] });
  });

  it("is null when everything is on", () => {
    const allOn = {
      ...loaded,
      branches: loaded.branches.map((b) => ({ ...b, enabled: true })),
    };
    expect(switchesWarning(allOn)).toBeNull();
  });
});
