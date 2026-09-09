import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn().mockResolvedValue(undefined);

vi.mock("./client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { billingApi } = await import("./billing");

describe("billing client contacts", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue(undefined));

  it("loads contacts in the selected organization", async () => {
    await billingApi.clientContacts(17, { organizationId: 4 });
    expect(apiRequest).toHaveBeenCalledWith("/clients/17/contacts/?organizationId=4");
  });

  it("creates and updates a contact with camelCase payload", async () => {
    const body = { fullName: "Айгуль Садыкова", phone: "+996700000000", isPrimary: true };

    await billingApi.addClientContact(17, body, { organizationId: 4 });
    await billingApi.updateClientContact(17, 9, body, { organizationId: 4 });

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/clients/17/contacts/?organizationId=4", { method: "POST", body });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/clients/17/contacts/9/?organizationId=4", { method: "PATCH", body });
  });

  it("deletes only the selected contact", async () => {
    await billingApi.deleteClientContact(17, 9, { organizationId: 4 });
    expect(apiRequest).toHaveBeenCalledWith("/clients/17/contacts/9/?organizationId=4", { method: "DELETE" });
  });
});

