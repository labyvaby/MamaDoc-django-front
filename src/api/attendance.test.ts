import { afterEach, describe, expect, it, vi } from "vitest";

import { getOfficeIp, setOfficeIp } from "./attendance";

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
