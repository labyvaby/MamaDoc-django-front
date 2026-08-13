import { describe, expect, it } from "vitest";

import { getModuleCodeForPermission } from "./moduleMapping";

describe("permission module mapping", () => {
  it("gates program and enrollment permissions with the programs module", () => {
    expect(getModuleCodeForPermission("programs.view")).toBe("programs");
    expect(getModuleCodeForPermission("enrollments.view")).toBe("programs");
    expect(getModuleCodeForPermission("enrollments.manage")).toBe("programs");
    expect(getModuleCodeForPermission("notifications.manage")).toBe("notifications");
  });
});
