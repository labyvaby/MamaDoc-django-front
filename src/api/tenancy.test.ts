import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("./client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import { getModulesCatalog, setOrganizationModule } from "./tenancy";

describe("modules catalog API", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue([]));

  it("asks for the catalog of the organization the page shows, not the session's", async () => {
    // Сессия одна на все вкладки: без явной организации соседняя вкладка
    // могла подсунуть каталог другой клиники под ключ этой.
    await getModulesCatalog(8);

    expect(apiRequest).toHaveBeenCalledWith("/tenancy/catalog/?organizationId=8");
  });

  it("falls back to the session organization when there is none", async () => {
    await getModulesCatalog(null);

    expect(apiRequest).toHaveBeenCalledWith("/tenancy/catalog/");
  });

  it("switches one module of the given organization", async () => {
    await setOrganizationModule(8, "cleaning", false);

    expect(apiRequest).toHaveBeenCalledWith("/tenancy/organizations/8/modules/cleaning/", {
      method: "PATCH",
      body: { isEnabled: false },
    });
  });
});
