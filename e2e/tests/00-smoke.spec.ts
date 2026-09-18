import { expect, test, type Page } from "@playwright/test";

/**
 * Обход разделов: каждый роут открывается под e2e-admin, и мы проверяем
 * три вещи — API не отвечает 5xx, приложение не упало в ErrorBoundary,
 * на экране либо каркас CRM (боковое меню), либо честный «нет доступа».
 * Ловит сломанный роут, упавший компонент и 500 от бэка — самые частые
 * жалобы «не открывается».
 *
 * Разделы «Настройки» и «Продажи» (сделки, заявки, задачи, отзывы) не
 * покрываем — так решено в спеке.
 */
const ROUTES = [
  "/dashboard",
  "/appointments",
  "/all-appointments",
  "/all-procedures",
  "/doctor",
  "/nurse",
  "/patients",
  "/patient-search",
  "/employees",
  "/schedule",
  "/work-shifts",
  "/services",
  "/products",
  "/warehouses",
  "/storage",
  "/inventory",
  "/pos",
  "/cashbox",
  "/expenses",
  "/salary-reports",
  "/reports",
  "/achievements",
  "/documents",
  "/knowledge",
  "/cleaning",
  "/vaccinations",
  "/waitlist",
  "/chats",
  "/clients",
  "/profile",
] as const;

async function expectPageAlive(page: Page): Promise<void> {
  // ErrorBoundary — единственное место с этим текстом.
  await expect(page.getByText("Что-то пошло не так")).toHaveCount(0);
  // Либо каркас CRM, либо страница «нет доступа» (модуль/право выключены).
  const shell = page.getByRole("navigation").first();
  const denied = page.getByText(/нет прав|нет доступа|доступ запрещ/i).first();
  // .first() — на странице могут быть и меню, и «нет прав» одновременно.
  await expect(shell.or(denied).first()).toBeVisible({ timeout: 15_000 });
}

test.describe("Smoke: разделы открываются", () => {
  for (const route of ROUTES) {
    test(`${route} @prod-smoke`, async ({ page }) => {
      const serverErrors: string[] = [];
      page.on("response", (response) => {
        if (response.status() >= 500 && response.url().includes("/api/")) {
          serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
        }
      });

      await page.goto(route);
      // Дать данным долететь; networkidle не обязателен (realtime-сокет).
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);

      await expectPageAlive(page);
      expect(serverErrors, "API ответил 5xx при открытии раздела").toEqual([]);
    });
  }
});
