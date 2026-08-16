import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProgramEnrollment,
  createProgramModuleRecord,
  createPatientInteraction,
  createProgramConfigurationVersion,
  createProgramFromTemplate,
  createProgramNotification,
  getPatientInteractions,
  getProgramNotifications,
  getProgramModuleRecords,
  getProgramConfigurationVersions,
  getProgramTemplates,
  getPrograms,
  getUpcomingProgramRecords,
  publishProgramConfigurationVersion,
  retryProgramNotification,
  transitionProgramEnrollment,
  updateProgramConfigurationVersion,
  updateProgramModuleRecord,
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

  it("loads templates and creates a program from a starter template", async () => {
    const fetchMock = mockJsonFetch({ results: [], count: 0 });
    const scope = { organizationId: 4, branchId: 14 };

    await getProgramTemplates(scope);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/programs\/templates\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({ credentials: "include" }),
    );

    await createProgramFromTemplate(scope, {
      templateCode: "newborn-medical-book",
      code: "newborn-2026",
      name: "Медицинская книжка новорождённого",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/programs\/from-template\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          templateCode: "newborn-medical-book",
          code: "newborn-2026",
          name: "Медицинская книжка новорождённого",
        }),
      }),
    );
  });

  it("creates and publishes an immutable configuration version", async () => {
    const fetchMock = mockJsonFetch({ results: [], count: 0 });
    const scope = { organizationId: 4, branchId: 14 };
    const schema = {
      program: { name: "Абонемент", businessDomain: "fitness" },
      modules: [{
        code: "measurements",
        name: "Замеры",
        moduleType: "measurements",
        settings: { fields: [{ key: "weight", label: "Вес", type: "number" as const }] },
      }],
    };

    await getProgramConfigurationVersions(scope, 7);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/programs\/7\/versions\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({ credentials: "include" }),
    );

    await createProgramConfigurationVersion(scope, 7, schema);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/programs\/7\/versions\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ schema }) }),
    );

    await updateProgramConfigurationVersion(scope, 7, 12, schema);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/programs\/7\/versions\/12\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ schema }) }),
    );

    await publishProgramConfigurationVersion(scope, 7, 12);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/programs\/7\/versions\/12\/publish\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({ method: "POST" }),
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

  it("loads upcoming events and schedules a client notification", async () => {
    const fetchMock = mockJsonFetch({ results: [], count: 0 });
    const scope = { organizationId: 4, branchId: 14 };

    await getUpcomingProgramRecords(scope, 21);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/upcoming\/\?organizationId=4&branchId=14&limit=200$/),
      expect.objectContaining({ credentials: "include" }),
    );

    await getProgramNotifications(scope, 21);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/notifications\/\?organizationId=4&branchId=14&limit=200$/),
      expect.objectContaining({ credentials: "include" }),
    );

    await createProgramNotification(scope, 21, {
      moduleRecordId: 8,
      channel: "sms",
      body: "Напоминание о визите",
      scheduledFor: "2026-08-19T04:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/notifications\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          moduleRecordId: 8,
          channel: "sms",
          body: "Напоминание о визите",
          scheduledFor: "2026-08-19T04:00:00.000Z",
        }),
      }),
    );
  });

  it("updates a record and transitions an enrollment", async () => {
    const fetchMock = mockJsonFetch({ id: 8 });
    const scope = { organizationId: 4, branchId: 14 };

    await updateProgramModuleRecord(scope, 21, 8, {
      title: "Обновлённая запись",
      status: "completed",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/records\/8\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({ method: "PATCH" }),
    );

    await transitionProgramEnrollment(scope, 21, "pause");
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/pause\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("retries a failed notification in the enrollment scope", async () => {
    const fetchMock = mockJsonFetch({ id: 15, status: "pending" });

    await retryProgramNotification({ organizationId: 4, branchId: 14 }, 21, 15);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/program-enrollments\/21\/notifications\/15\/retry\/\?organizationId=4&branchId=14$/),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
