import { expect, test } from "@playwright/test";
import { seed, uniquePhoneLocal } from "../fixtures/seed";
import { EmployeesPage } from "../pages/EmployeesPage";

test.describe("Сотрудники", () => {
  test("создать сотрудника → он в списке и находится поиском после перезагрузки", async ({ page }) => {
    const employees = new EmployeesPage(page);
    const fullName = `Тестов Сотрудник ${Date.now()}`;

    await employees.goto();
    await employees.openCreateDrawer();
    await employees.fillFullName(fullName);
    await employees.fillPhoneLocal(uniquePhoneLocal());
    await employees.selectRole(seed.roles.doctor);
    await employees.ensureBranch(seed.branch.name);
    await employees.submit();

    // Дровер закрылся без ошибки в футере.
    await expect(employees.drawer()).toBeHidden({ timeout: 20_000 });
    // Уведомление об успехе содержит ФИО (капитализация бэком не меняет его).
    await expect(page.getByText(new RegExp(`Сотрудник ${fullName} создан`))).toBeVisible();
    await expect(employees.employeeRow(fullName)).toBeVisible();

    // Персистентность: не оптимистичное состояние, а ответ бэка.
    await page.reload();
    await employees.search(fullName);
    await expect(employees.employeeRow(fullName)).toBeVisible();
  });

  test("без ФИО и роли дровер не отправляет форму и называет пропуски", async ({ page }) => {
    const employees = new EmployeesPage(page);

    await employees.goto();
    await employees.openCreateDrawer();
    await employees.submit();

    await expect(employees.submitError()).toContainText("Заполните:");
    await expect(employees.submitError()).toContainText("ФИО");
    await expect(employees.submitError()).toContainText("роль");
    await expect(employees.drawer()).toBeVisible();
  });
});
