import { afterEach, describe, expect, it, vi } from "vitest";

import { createPrintTemplate, listPrintTemplates, updatePrintTemplate } from "./printforms";

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

describe("printforms API", () => {
  it("lists templates of one kind within the organization", async () => {
    const fetchMock = mockJsonFetch([]);

    await listPrintTemplates({ organizationId: 4 }, "blank");

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/v2\/printforms\/templates\/\?organizationId=4&kind=blank$/);
  });

  it("creates a blank with its text and patches it in the scope", async () => {
    const fetchMock = mockJsonFetch({ id: 3 });

    await createPrintTemplate({ organizationId: 4 }, { name: "Расписка", kind: "blank", body: "{child.fullName}" });
    await updatePrintTemplate({ organizationId: 4 }, 3, { isActive: false });

    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(String(createUrl)).toMatch(/\/v2\/printforms\/templates\/\?organizationId=4$/);
    expect(createInit.method).toBe("POST");
    expect(JSON.parse(createInit.body as string)).toEqual({
      name: "Расписка",
      kind: "blank",
      body: "{child.fullName}",
    });
    const [updateUrl, updateInit] = fetchMock.mock.calls[1];
    expect(String(updateUrl)).toMatch(/\/v2\/printforms\/templates\/3\/\?organizationId=4$/);
    expect(updateInit.method).toBe("PATCH");
    expect(JSON.parse(updateInit.body as string)).toEqual({ isActive: false });
  });
});
