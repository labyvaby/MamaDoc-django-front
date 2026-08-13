import { afterEach, describe, expect, it, vi } from "vitest";

import { createProgramEnrollment, getPrograms } from "./programs";

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

describe("program API scope", () => {
  it("loads the program catalog inside the active organization and branch", async () => {
    const fetchMock = mockJsonFetch({ results: [], count: 0 });

    await getPrograms({ organizationId: 4, branchId: 14 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/programs\/\?organizationId=4&branchId=14&limit=200$/),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("creates an active enrollment with explicit patient and branch scope", async () => {
    const fetchMock = mockJsonFetch({ id: 91 });

    await createProgramEnrollment(
      { organizationId: 4, branchId: 14 },
      {
        patientId: 15398,
        programId: 7,
        branchId: 14,
        organizationId: 4,
        status: "active",
        startsAt: "2026-08-13T00:00:00.000Z",
        expiresAt: "2027-08-13T23:59:59.999Z",
        source: "manual-ui",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/program-enrollments\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          patientId: 15398,
          programId: 7,
          branchId: 14,
          organizationId: 4,
          status: "active",
          startsAt: "2026-08-13T00:00:00.000Z",
          expiresAt: "2027-08-13T23:59:59.999Z",
          source: "manual-ui",
        }),
      }),
    );
  });
});
