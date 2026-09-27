import { describe, expect, it } from "vitest";

import { userHasPassword } from "./auth";

/**
 * По этому признаку шапка показывает «Установить пароль». Старый бэк поля не
 * отдаёт — тогда кнопки быть не должно, поэтому «неизвестно» ≠ «нет пароля».
 */
describe("userHasPassword — признак пароля из /auth/me/", () => {
  it("бэк прислал false — пароля нет", () => {
    expect(userHasPassword({ hasPassword: false })).toBe(false);
  });

  it("бэк прислал true — пароль есть", () => {
    expect(userHasPassword({ hasPassword: true })).toBe(true);
  });

  it("поля нет (старый бэк) — неизвестно", () => {
    expect(userHasPassword({})).toBeNull();
  });

  it("пользователя нет — неизвестно", () => {
    expect(userHasPassword(null)).toBeNull();
    expect(userHasPassword(undefined)).toBeNull();
  });
});
