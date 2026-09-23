import { afterEach, describe, expect, it, vi } from "vitest";

import { restoreEmployee } from "./staff";

function employeeResponse() {
  return {
    id: 739,
    organizationId: 7,
    branch: null,
    authUserId: 749,
    fullName: "Максатбеков Нурзат",
    phone: "+996503777363",
    email: "",
    nickname: "",
    status: "active",
    clinicalRole: "other",
    photoUrl: null,
    role: null,
    specializations: [],
    operationalBranches: [],
    employment: {
      firedAt: "2026-09-22T07:09:31Z",
      firedBy: "Бахтибаева Нуржан",
      restoredAt: "2026-09-24T05:00:00Z",
      restoredBy: "Абакирова Эрке",
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restoreEmployee — возврат уволенного в штат", () => {
  it("POST на свою ручку с подтверждением, а не PATCH статуса", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        employee: employeeResponse(),
        alreadyActive: false,
        fromJournal: true,
        accessRestored: true,
        servicesRestored: 2,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const updated = await restoreEmployee(739);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/staff/employees/739/restore/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ confirm: true });
    expect(updated.employee.status).toBe("active");
    expect(updated.employee.employment?.firedBy).toBe("Бахтибаева Нуржан");
    expect(updated.fromJournal).toBe(true);
  });

  it("отказ бэка пробрасывается — «восстановлено» без восстановления не бывает", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Employee not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(restoreEmployee(739)).rejects.toBeDefined();
  });
});
