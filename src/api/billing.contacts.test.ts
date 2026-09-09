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

describe("complete billing API flows", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue(undefined));

  it("loads every cursor page instead of silently truncating the register", async () => {
    apiRequest
      .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: "next page" })
      .mockResolvedValueOnce({ items: [{ id: 2 }], nextCursor: null });

    const result = await billingApi.allPayments({ organizationId: 4, q: "Иван" });

    expect(result.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/v2/billing/payments/?organizationId=4&q=%D0%98%D0%B2%D0%B0%D0%BD&pageSize=200");
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/v2/billing/payments/?organizationId=4&q=%D0%98%D0%B2%D0%B0%D0%BD&cursor=next+page&pageSize=200");
  });

  it("requests a named billing report for the selected period", async () => {
    await billingApi.report("refunds", { organizationId: 4, dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    expect(apiRequest).toHaveBeenCalledWith("/v2/billing/reports/refunds/?organizationId=4&dateFrom=2026-09-01&dateTo=2026-09-30");
  });

  it("resolves the rental deposit independently from ending the contract", async () => {
    await billingApi.resolveContractDeposit(31, "returned", { organizationId: 4 });
    expect(apiRequest).toHaveBeenCalledWith("/v2/billing/contracts/31/deposit/?organizationId=4", {
      method: "POST",
      body: { state: "returned" },
    });
  });
});
