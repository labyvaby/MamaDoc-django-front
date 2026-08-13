import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProgramEnrollment,
  createProgramModuleRecord,
  createPatientInteraction,
  getPatientInteractions,
  getProgramModuleRecords,
  getPrograms,
} from "./programs";

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

  it("loads and creates module records in the enrollment scope", async () => {
    const fetchMock = mockJsonFetch({ results: [], count: 0 });
    const scope = { organizationId: 4, branchId: 14 };

    await getProgramModuleRecords(scope, 21, 7);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/records\/\?organizationId=4&branchId=14&programModuleId=7&limit=200$/),
      expect.objectContaining({ credentials: "include" }),
    );

    await createProgramModuleRecord(scope, 21, {
      programModuleId: 7,
      occurredAt: "2026-08-13T08:00:00.000Z",
      title: "Контроль роста",
      data: { heightCm: 71, weightKg: 8.4 },
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/records\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          programModuleId: 7,
          occurredAt: "2026-08-13T08:00:00.000Z",
          title: "Контроль роста",
          data: { heightCm: 71, weightKg: 8.4 },
        }),
      }),
    );
  });

  it("loads and creates patient interactions in the enrollment scope", async () => {
    const fetchMock = mockJsonFetch({ results: [], count: 0 });
    const scope = { organizationId: 4, branchId: 14 };

    await getPatientInteractions(scope, 21);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/interactions\/\?organizationId=4&branchId=14&limit=200$/),
      expect.objectContaining({ credentials: "include" }),
    );

    await createPatientInteraction(scope, 21, {
      occurredAt: "2026-08-13T10:00:00.000Z",
      channel: "call",
      outcome: "no_answer",
      subject: "Напоминание о вакцинации",
      notes: "Не взял трубку",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/interactions\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          occurredAt: "2026-08-13T10:00:00.000Z",
          channel: "call",
          outcome: "no_answer",
          subject: "Напоминание о вакцинации",
          notes: "Не взял трубку",
        }),
      }),
    );
  });
});
