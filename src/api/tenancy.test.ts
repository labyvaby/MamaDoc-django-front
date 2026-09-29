import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("./client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import { createModuleRequest, getModuleRequests, getModulesCatalog, setOrganizationModule } from "./tenancy";

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

describe("module requests API", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue([]));

  it("reads the organization's open requests", async () => {
    await getModuleRequests(8);

    expect(apiRequest).toHaveBeenCalledWith("/tenancy/module-requests/?organizationId=8");
  });

  it("sends a request to connect a product", async () => {
    const body = {
      productId: "chats", productTitle: "Чаты", moduleCodes: ["chatwoot"],
      contactName: "Айгуль", contactPhone: "+996700000001", comment: "",
    };

    await createModuleRequest(8, body);

    expect(apiRequest).toHaveBeenCalledWith("/tenancy/module-requests/?organizationId=8", {
      method: "POST",
      body,
    });
  });
});
