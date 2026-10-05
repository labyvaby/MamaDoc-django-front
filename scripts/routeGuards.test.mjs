import { describe, expect, it } from "vitest";

import { catalogueCodes, checkRepo, collectRoutes, findViolations } from "./routeGuards.mjs";

const app = (inner) => `
  const App = () => (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        ${inner}
      </Route>
    </Routes>
  );
`;

const check = (inner, { codes = new Set(), catalogue = null, allowlist = {} } = {}) => {
  const { routes } = collectRoutes(app(inner));
  return findViolations({ routes, codes, catalogue, allowlist });
};

describe("проверка «нельзя выложить модуль без ролей»", () => {
  it("текущий App.tsx проходит, исключения не устарели", () => {
    const { problems, stale } = checkRepo({ root: "." });
    expect(problems).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("страница с RequirePermission или RequireModule — защищена", () => {
    expect(check(`<Route path="load" element={<RequirePermission permission="reports.load.view"><Page /></RequirePermission>} />`)).toEqual([]);
    expect(check(`<Route path="docs" element={<RequireModule module="documents"><Page /></RequireModule>} />`)).toEqual([]);
  });

  it("новая страница без права — нарушение", () => {
    const [problem] = check(`<Route path="new-module" element={<Page />} />`);
    expect(problem).toContain("/new-module: нет проверки права");
  });

  it("«только суперадминистратор» — нарушение, если не в исключениях", () => {
    const route = `<Route path="secret" element={<RequireSuperAdmin><Page /></RequireSuperAdmin>} />`;
    expect(check(route)[0]).toContain("только суперадминистратор");
    expect(check(route, { allowlist: { routes: { "/secret": "платформа" } } })).toEqual([]);
  });

  it("переадресация и публичные страницы не проверяются", () => {
    expect(check(`<Route path="old" element={<Navigate to="/new" replace />} />`)).toEqual([]);
    const ok = `<Route path="ok" element={<RequirePermission permission="reports.view"><Page /></RequirePermission>} />`;
    expect(check(ok)).toEqual([]); // login вне RequireAuth не проверяется
  });

  it("код права не из каталога бэкенда — нарушение", () => {
    const catalogue = catalogueCodes(`_PERMISSIONS = (\n    ('reports.view', 'Отчёты', 'reports'),\n    (\n        'reports.load.view',\n        'Нагрузка',\n        'reports',\n    ),\n)`);
    expect(catalogue).toEqual(new Set(["reports.view", "reports.load.view"]));
    const ok = `<Route path="ok" element={<RequirePermission permission="reports.view"><Page /></RequirePermission>} />`;
    const problems = check(ok, { codes: new Set(["reports.load.view", "x.view"]), catalogue });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("«x.view»");
  });
});
