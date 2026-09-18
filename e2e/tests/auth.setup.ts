import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { test as setup } from "@playwright/test";
import { ADMIN_STORAGE_STATE, creds } from "../fixtures/seed";
import { LoginPage } from "../pages/LoginPage";

setup("login as e2e-admin", async ({ page }) => {
  if (!creds.admin.password) {
    throw new Error("E2E_ADMIN_PASSWORD is not set — see e2e/README.md");
  }
  mkdirSync(dirname(ADMIN_STORAGE_STATE), { recursive: true });
  const login = new LoginPage(page);
  await login.goto();
  await login.loginWithPassword(creds.admin.username, creds.admin.password);
  await login.expectLoggedIn();
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
