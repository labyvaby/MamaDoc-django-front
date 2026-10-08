import { describe, expect, it } from "vitest";
import type { MeResponse } from "../api/auth";
import { buildStateFromMe } from "./usePermissions";

const selected = { id: 22, code: "custom-auditor", name: "Аудитор" };
const me: MeResponse = {
  user: { id: 1, username: "super", email: "", firstName: "", lastName: "", isStaff: false, isSuperuser: false },
  memberships: [], activeOrganization: null, activeBranch: null,
  activeMembership: {
    id: 7, organization: { id: 2, name: "Клиника", slug: "clinic", status: "active" },
    role: selected, isOwner: false, isActive: true, branches: [], permissions: ["organization.view"],
  },
  permissions: ["organization.view"], enabledModules: ["organization"],
  canPreviewRoles: true, rolePreview: selected,
};

describe("effective role preview context", () => {
  it("supports custom organization roles and removes the platform bypass", () => {
    const state = buildStateFromMe(me);
    expect(state.role?.name).toBe("custom-auditor");
    expect(state.isPlatformAdmin).toBe(false);
    expect(state.canPreviewRoles).toBe(true);
    expect(state.rolePreview).toEqual(selected);
    expect(state.permissions?.map((p) => p.name)).toEqual(["organization.view"]);
  });

  it("keeps the exit control when the preview role has no permissions", () => {
    const state = buildStateFromMe({ ...me, permissions: [] });
    expect(state.permissions).toEqual([]);
    expect(state.canPreviewRoles).toBe(true);
    expect(state.rolePreview?.name).toBe("Аудитор");
  });

  it("clears preview state when the backend restores admin rights", () => {
    const state = buildStateFromMe({ ...me, user: { ...me.user, isSuperuser: true }, rolePreview: null });
    expect(state.role?.name).toBe("superadmin");
    expect(state.rolePreview).toBeNull();
    expect(state.isPlatformAdmin).toBe(true);
  });

  it("does not expose the control with an older backend", () => {
    const state = buildStateFromMe({ ...me, rolePreview: undefined, canPreviewRoles: undefined });
    expect(state.rolePreview).toBeNull();
    expect(state.canPreviewRoles).toBe(false);
  });

  it("does not turn a deleted preview role into the fallback registrator", () => {
    const state = buildStateFromMe({ ...me, activeMembership: null, permissions: [], rolePreview: { id: 22, code: "", name: "Недоступная роль" } });
    expect(state.role?.name).toBe("preview");
    expect(state.rolePreview).not.toBeNull();
  });
});
