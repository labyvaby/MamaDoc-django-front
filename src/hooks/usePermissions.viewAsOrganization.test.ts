import { describe, it, expect } from "vitest";

import type { MeResponse } from "../api/auth";
import { buildStateFromMe } from "./usePermissions";

const me = (extra: Partial<MeResponse> = {}): MeResponse => ({
  user: {
    id: 1, username: "su", email: "", firstName: "", lastName: "",
    isStaff: true, isSuperuser: true,
  },
  memberships: [],
  activeMembership: null,
  activeOrganization: null,
  activeBranch: null,
  permissions: [],
  enabledModules: ["appointments", "pos"],
  ...extra,
});

describe("buildStateFromMe — модули клиники", () => {
  it("takes the clinic's modules from /auth/me/", () => {
    expect(buildStateFromMe(me({ organizationModules: ["appointments"] })).organizationModules).toEqual([
      "appointments",
    ]);
  });

  it("marks a missing list (older backend) as unknown", () => {
    expect(buildStateFromMe(me()).organizationModules).toBeNull();
  });

  it("leaves the clinic view alone on a refresh or an organization switch", () => {
    expect("viewAsOrganization" in buildStateFromMe(me())).toBe(false);
  });
});
