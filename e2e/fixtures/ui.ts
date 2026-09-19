import type { Page } from "@playwright/test";

/**
 * Плашка «Настройте профиль до конца» (ProfileCompletionBanner) висит поверх
 * шапки страницы и перекрывает поиск и «Добавить», пока пользователь не
 * закроет её крестиком. Решение продукта — оставить как есть; тест делает то,
 * что делает живой пользователь: закрывает. Закрытие запоминается в
 * localStorage, но каждый тест стартует в свежем контексте — поэтому
 * проверяем на каждом заходе на страницу.
 */
export async function dismissProfileBanner(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: "Закрыть напоминание" }).first();
  // Плашка появляется с анимацией после /auth/me — даём ей пару секунд.
  const shown = await close
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (shown) {
    await close.click();
    await close.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
  }
}
