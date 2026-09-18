import { expect, test } from "@playwright/test";
import { creds } from "../fixtures/seed";
import { LoginPage } from "../pages/LoginPage";

// Эти сценарии проверяют сам логин — стартуем без сохранённой сессии.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Авторизация", () => {
  test("логин по паролю ведёт на главную @prod-smoke", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginWithPassword(creds.admin.username, creds.admin.password);
    await login.expectLoggedIn();
  });

  test("неверный пароль — понятная ошибка, не белый экран @prod-smoke", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginWithPassword(creds.admin.username, "definitely-wrong-password");
    await expect(login.errorAlert()).toContainText("Неверный логин или пароль");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Войти" })).toBeEnabled();
  });
});
