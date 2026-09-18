import { expect, type Locator, type Page } from "@playwright/test";

/** Страница /login, вкладка «Логин» (вход по паролю). */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/login");
    await expect(this.page.getByRole("tab", { name: "Логин" })).toBeVisible();
  }

  async loginWithPassword(login: string, password: string): Promise<void> {
    await this.page.getByRole("tab", { name: "Логин" }).click();
    await this.page.getByLabel("Email или логин").fill(login);
    // exact — иначе подходит и кнопка aria-label="Показать пароль".
    await this.page.getByLabel("Пароль", { exact: true }).fill(password);
    await this.page.getByRole("button", { name: "Войти" }).click();
  }

  /** Alert с текстом ошибки над формой. */
  errorAlert(): Locator {
    return this.page.getByRole("alert");
  }

  /** Дождаться, что нас увели с /login (успешный вход). */
  async expectLoggedIn(): Promise<void> {
    await this.page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 20_000,
    });
    await expect(this.page.getByRole("button", { name: "Открыть меню" })).toBeVisible();
  }
}
