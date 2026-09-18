import { expect, type Locator, type Page } from "@playwright/test";

/** Страница /employees и дровер «Создать сотрудника». */
export class EmployeesPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/employees");
    await expect(this.addButton()).toBeVisible();
  }

  /** В шапке две кнопки (компактная и обычная) — видна одна по брейкпоинту;
   *  getByRole по умолчанию не считает скрытые. */
  addButton(): Locator {
    return this.page.getByRole("button", { name: /^Добавить/ });
  }

  drawer(): Locator {
    return this.page.getByTestId("employee-onboard-drawer");
  }

  async openCreateDrawer(): Promise<void> {
    await this.addButton().click();
    await expect(this.drawer()).toBeVisible();
    await expect(this.drawer().getByText("Создать сотрудника")).toBeVisible();
  }

  async fillFullName(fullName: string): Promise<void> {
    await this.drawer().getByTestId("employee-fullname-input").fill(fullName);
  }

  /** 9 цифр KG-номера без кода страны; поле само форматирует пробелами. */
  async fillPhoneLocal(digits: string): Promise<void> {
    const input = this.drawer().getByTestId("employee-phone-input");
    await input.click();
    await input.pressSequentially(digits);
  }

  async selectRole(roleName: string): Promise<void> {
    const input = this.drawer().getByTestId("employee-role-input");
    await input.click();
    await input.fill(roleName);
    await this.page.getByRole("option", { name: roleName, exact: true }).click();
    await expect(input).toHaveValue(roleName);
  }

  /** multiple-Autocomplete: клик по уже выбранной опции снимает её —
   *  выбираем только если ещё не выбрана. */
  async ensureBranch(branchName: string): Promise<void> {
    const input = this.drawer().getByTestId("employee-branches-input");
    await input.click();
    const option = this.page.getByRole("option", { name: branchName, exact: true });
    await expect(option).toBeVisible();
    if ((await option.getAttribute("aria-selected")) !== "true") {
      await option.click();
    }
    await this.page.keyboard.press("Escape");
    await expect(this.drawer().getByText(branchName, { exact: true })).toBeVisible();
  }

  async submit(): Promise<void> {
    await this.drawer().getByTestId("drawer-submit").click();
  }

  /** Alert об ошибке в футере дровера (виден, пока дровер открыт). */
  submitError(): Locator {
    return this.drawer().getByRole("alert");
  }

  async search(query: string): Promise<void> {
    const input = this.page.getByTestId("page-search-input");
    await input.fill(query);
  }

  employeeRow(fullName: string): Locator {
    return this.page.getByText(fullName, { exact: true });
  }
}
