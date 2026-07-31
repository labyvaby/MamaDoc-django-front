import { afterEach, describe, expect, it, vi } from "vitest";

import { createShift, getOfficeIp, setOfficeIp, updateShift } from "./attendance";

const officeIpResponse = {
  officeIp: "",
  updatedAt: null,
  branches: [],
};

function mockSuccessfulFetch() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(officeIpResponse), {
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

describe("attendance office IP organization scope", () => {
  it("loads settings for the explicitly selected organization", async () => {
    const fetchMock = mockSuccessfulFetch();

    await getOfficeIp({ organizationId: 4 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/attendance\/office-ip\/\?organizationId=4$/),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("saves a branch IP inside the explicitly selected organization", async () => {
    const fetchMock = mockSuccessfulFetch();

    await setOfficeIp("212.112.119.113", {
      organizationId: 4,
      branchId: 14,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/attendance\/office-ip\/\?organizationId=4$/),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          officeIp: "212.112.119.113",
          branchId: 14,
        }),
      }),
    );
  });
});

describe("shift write payload carries the branch", () => {
  // Часы смены попадают в филиальный срез отчёта ЗП только по WorkShift.branch.
  // Раньше форма не присылала branchId вообще, поэтому ручные смены оседали с
  // branch=null и в филиальном срезе давали 0 часов.
  const shiftResponse = {
    id: 1,
    employeeId: 7,
    employeeName: "Баялиева Айгерим",
    branchId: 3,
    branchName: "Филиал 1",
    clockIn: "2026-07-21T09:00:00+06:00",
    clockOut: "2026-07-21T17:00:00+06:00",
    isNightShift: false,
    hasLunch: false,
    lunchMinutes: 0,
    lunchStart: null,
    durationSeconds: 28800,
    dayHours: "8.00",
    nightHours: "0.00",
    isAnomalous: false,
    createdAt: "2026-07-21T09:00:00+06:00",
  };

  function mockShiftFetch() {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(shiftResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends branchId when creating a shift manually", async () => {
    const fetchMock = mockShiftFetch();

    await createShift({
      employeeId: 7,
      branchId: 3,
      clockIn: "2026-07-21T09:00:00+06:00",
      clockOut: "2026-07-21T17:00:00+06:00",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/attendance\/shifts\/$/),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"branchId":3'),
      }),
    );
  });

  it("sends an explicit null branchId to clear the branch on edit", async () => {
    const fetchMock = mockShiftFetch();

    await updateShift(1, {
      branchId: null,
      clockIn: "2026-07-21T09:00:00+06:00",
      clockOut: "2026-07-21T17:00:00+06:00",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/attendance\/shifts\/1\/$/),
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"branchId":null'),
      }),
    );
  });
});
