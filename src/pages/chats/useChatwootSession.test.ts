import { describe, expect, it } from "vitest";

import {
  CHATWOOT_LOGIN_REQUIRED,
  chatwootOrigin,
  isLoginRequiredMessage,
} from "./useChatwootSession";

/**
 * Сорвавшийся вход виден только по сообщению от самого Чат-центра: содержимое
 * чужого iframe браузер читать не даёт.
 */

describe("isLoginRequiredMessage — сорвавшийся вход", () => {
  const CHAT = "https://chat.operator.kg";

  it("сообщение Чат-центра распознаётся", () => {
    const ok = isLoginRequiredMessage(
      CHAT,
      { type: CHATWOOT_LOGIN_REQUIRED },
      CHAT,
    );

    expect(ok).toBe(true);
  });

  it("та же строка без обёртки тоже принимается", () => {
    expect(isLoginRequiredMessage(CHAT, CHATWOOT_LOGIN_REQUIRED, CHAT)).toBe(true);
  });

  it("чужой origin отбрасывается, даже если текст совпал", () => {
    const ok = isLoginRequiredMessage(
      "https://evil.example",
      { type: CHATWOOT_LOGIN_REQUIRED },
      CHAT,
    );

    expect(ok).toBe(false);
  });

  it("постороннее сообщение своего origin отказом не считается", () => {
    expect(isLoginRequiredMessage(CHAT, { type: "resize" }, CHAT)).toBe(false);
  });

  it("мусор вместо данных не роняет разбор", () => {
    expect(isLoginRequiredMessage(CHAT, null, CHAT)).toBe(false);
    expect(isLoginRequiredMessage(CHAT, 42, CHAT)).toBe(false);
  });
});

describe("chatwootOrigin", () => {
  it("берёт origin из ссылки входа", () => {
    const origin = chatwootOrigin(
      "https://chat.operator.kg/app/login?email=a%40b.kg&sso_auth_token=xyz",
    );

    expect(origin).toBe("https://chat.operator.kg");
  });

  it("без ссылки слушать нечего", () => {
    expect(chatwootOrigin(null)).toBeNull();
  });

  it("битая ссылка не роняет страницу", () => {
    expect(chatwootOrigin("не-адрес")).toBeNull();
  });
});
