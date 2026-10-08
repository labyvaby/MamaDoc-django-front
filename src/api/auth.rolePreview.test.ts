import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import { setRolePreview } from "./auth";

vi.mock("./client", () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);

describe("role preview with an HttpOnly CSRF cookie", () => {
  beforeEach(() => request.mockReset());

  it("uses the masked token returned by the API when selecting a role", async () => {
    request.mockResolvedValueOnce({ roles: [], csrfToken: "masked-api-token" });
    request.mockResolvedValueOnce({ rolePreview: { id: 12 } });
    await setRolePreview(12);
    expect(request).toHaveBeenNthCalledWith(1, "/auth/role-preview/");
    expect(request).toHaveBeenNthCalledWith(2, "/auth/role-preview/", {
      method: "POST", body: { roleId: 12 },
      headers: { "X-CSRFToken": "masked-api-token" },
    });
  });

  it("can exit using a token response with no selectable roles", async () => {
    request.mockResolvedValueOnce({ roles: [], csrfToken: "exit-token" });
    request.mockResolvedValueOnce({ rolePreview: null });
    await setRolePreview(null);
    expect(request).toHaveBeenLastCalledWith("/auth/role-preview/", {
      method: "POST", body: { roleId: null },
      headers: { "X-CSRFToken": "exit-token" },
    });
  });
});
