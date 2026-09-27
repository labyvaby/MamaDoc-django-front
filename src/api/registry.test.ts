import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelEnrollment,
  createTerm,
  getBlankTemplates,
  getNextCardNumber,
  getPriceQuote,
  getRegistry,
  intakeEnrollment,
  recordTermPayment,
  setOnboardingCompleted,
  termDue,
  uploadEnrollmentDocument,
  voidTermPayment,
} from "./registry";

function mockJsonFetch(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registry API", () => {
  it("requests a registry tab with the scope, filters and paging", async () => {
    const fetchMock = mockJsonFetch({ results: [], count: 0, counts: {} });

    await getRegistry(
      { organizationId: 4 },
      { tab: "expiring", employeeId: 7, branchId: 14, q: "Иван", mine: true, offset: 50 },
    );

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/\/program-enrollments\/registry\/\?/);
    expect(url).toContain("organizationId=4");
    expect(url).toContain("tab=expiring");
    expect(url).toContain("employeeId=7");
    expect(url).toContain("branchId=14");
    expect(url).toContain(`q=${encodeURIComponent("Иван")}`);
    expect(url).toContain("mine=1");
    expect(url).toContain("limit=50");
    expect(url).toContain("offset=50");
  });

  it("posts the intake with the organization and a first payment", async () => {
    const fetchMock = mockJsonFetch({
      enrollment: { id: 1 },
      patientId: 2,
      term: { id: 4 },
      paymentId: 5,
    });

    const result = await intakeEnrollment(
      { organizationId: 4 },
      {
        patient: { new: { fullName: "Иванов Али", birthDate: "2026-05-10", gender: "male" } },
        representatives: [
          { relation: "mother", new: { fullName: "Мама", phone: "+996700000012" }, isPrimaryContact: true },
        ],
        packageId: 3,
        branchId: 14,
        responsibleEmployeeId: 7,
        termMonths: 12,
        payment: { cashAmount: "5000" },
      },
    );

    expect(result.paymentId).toBe(5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/program-enrollments\/intake\/$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.organizationId).toBe(4);
    expect(body.payment).toEqual({ cashAmount: "5000" });
  });

  it("cancels with a reason, renews and marks the first examination", async () => {
    const fetchMock = mockJsonFetch({});

    await cancelEnrollment({ organizationId: 4 }, 9, { reason: "moved", comment: "" });
    await createTerm({}, 9, { months: 12 });
    await setOnboardingCompleted({}, 9, true);

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/program-enrollments\/9\/cancel\/\?organizationId=4$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ reason: "moved", comment: "" });
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/program-enrollments\/9\/terms\/$/);
    expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({ onboardingCompleted: true });
  });

  it("takes and voids a term payment", async () => {
    const fetchMock = mockJsonFetch({});

    await recordTermPayment({}, 9, 3, { cashAmount: "1000", cardAmount: "4000" });
    await voidTermPayment({}, 9, 3, 11, "Вернули деньги");

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/program-enrollments\/9\/terms\/3\/payments\/$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/terms\/3\/payments\/11\/void\/$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ reason: "Вернули деньги" });
  });

  it("asks for the next card number inside the organization", async () => {
    const fetchMock = mockJsonFetch({ cardNumber: "МД-2" });

    const result = await getNextCardNumber({ organizationId: 4 }, "МД-");

    expect(result.cardNumber).toBe("МД-2");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/\/patients\/next-card-number\/\?/);
    expect(url).toContain("organizationId=4");
    expect(url).toContain(`prefix=${encodeURIComponent("МД-")}`);
  });

  it("uploads a document as multipart and lists only blank templates", async () => {
    const fetchMock = mockJsonFetch({ id: 1 });

    await uploadEnrollmentDocument({}, 9, {
      kind: "contract",
      title: "Договор",
      file: new File(["x"], "contract.pdf"),
      signedById: 12,
    });
    await getBlankTemplates({ organizationId: 4 });

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("kind")).toBe("contract");
    expect((init.body as FormData).get("signedById")).toBe("12");
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/v2\/printforms\/templates\/\?organizationId=4&kind=blank$/);
  });

  it("asks the server for a term price with the family", async () => {
    const fetchMock = mockJsonFetch({ packageId: 3, priceAmount: "3750.00" });

    await getPriceQuote({ organizationId: 4 }, { packageId: 3, patientId: 15, representativeIds: [4, 7] });

    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/program-enrollments\/price-quote\/\?organizationId=4&packageId=3&patientId=15&representativeIds=4%2C7$/,
    );
  });

  it("computes the unpaid rest of a term", () => {
    expect(termDue({ priceAmount: "5000.00", paidAmount: "2000.00" })).toBe(3000);
    expect(termDue({ priceAmount: "5000.00", paidAmount: "5000.00" })).toBe(0);
    expect(termDue({ priceAmount: "0.00", paidAmount: "0.00" })).toBe(0);
  });
});
