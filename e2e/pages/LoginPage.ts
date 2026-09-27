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
    // По accessible name, а не по <label>: MUI дописывает к обязательному
    // полю « *», и getByLabel("Пароль", { exact: true }) его не находит.
    await this.page.getByRole("textbox", { name: "Email или логин" }).fill(login);
    await this.page.getByRole("textbox", { name: "Пароль", exact: true }).fill(password);
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
    // После входа CRM может показать диалог выбора филиала, поэтому проверяем
    // стабильный элемент шапки, а не landmark бокового меню.
    await expect(this.page.getByText("e2e-admin", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  }
}
