import { afterEach, describe, expect, it, vi } from "vitest";

import { getAllDjangoEmployees } from "./staff";

function employee(id: number) {
  return {
    id,
    organizationId: 1,
    branch: null,
    authUserId: null,
    fullName: `Сотрудник ${id}`,
    phone: "",
    email: "",
    nickname: "",
    status: "active",
    clinicalRole: "doctor",
    photoUrl: null,
    role: null,
    specializations: [],
    operationalBranches: [],
  };
}

/** Отдаёт страницы по порядку вызовов; последняя — с `nextPage: null`. */
function mockPages(pages: Array<{ count: number; nextPage: number | null; ids: number[] }>) {
  const fetchMock = vi.fn();
  for (const page of pages) {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          count: page.count,
          nextPage: page.nextPage,
          results: page.ids.map(employee),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAllDjangoEmployees", () => {
  it("идёт по всем страницам и склеивает результат", async () => {
    const fetchMock = mockPages([
      { count: 3, nextPage: 2, ids: [1, 2] },
      { count: 3, nextPage: null, ids: [3] },
    ]);

    const all = await getAllDjangoEmployees({ status: "active" });

    expect(all.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toMatch(/[?&]page=1(&|$)/);
    expect(fetchMock.mock.calls[1][0]).toMatch(/[?&]page=2(&|$)/);
  });

  it("запрашивает максимальный pageSize, чтобы не дробить справочник", async () => {
    const fetchMock = mockPages([{ count: 1, nextPage: null, ids: [1] }]);

    await getAllDjangoEmployees({ status: "active", organizationId: 4 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/[?&]pageSize=200(&|$)/);
    expect(url).toMatch(/[?&]status=active(&|$)/);
    expect(url).toMatch(/[?&]organizationId=4(&|$)/);
  });

  it("не шлёт search — фильтрация ввода локальная, список нужен целиком", async () => {
    const fetchMock = mockPages([{ count: 1, nextPage: null, ids: [1] }]);

    await getAllDjangoEmployees({ status: "active" });

    expect(fetchMock.mock.calls[0][0]).not.toMatch(/[?&]search=/);
  });

  it("останавливается на пустой странице без nextPage", async () => {
    const fetchMock = mockPages([{ count: 0, nextPage: null, ids: [] }]);

    const all = await getAllDjangoEmployees();

    expect(all).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
