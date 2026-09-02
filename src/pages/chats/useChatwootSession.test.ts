import { describe, expect, it } from "vitest";

import {
  CHATWOOT_LOGIN_REQUIRED,
  chatwootOrigin,
  isLoginRequiredMessage,
  reduceLock,
  type LockMessage,
} from "./useChatwootSession";

/**
 * Обе защиты существуют ради одного: Чат-центр держит один токен входа на
 * сотрудника, поэтому вторая вкладка гасит первую.
 */

const ME = "me";
const OTHER = "other";

describe("reduceLock — какая вкладка держит раздел", () => {
  it("вторая вкладка уступает, получив «занято»", () => {
    const next = reduceLock("owner", { type: "busy", id: OTHER }, ME);

    expect(next.role).toBe("standby");
  });

  it("владелец отвечает «занято» на чужую заявку и остаётся владельцем", () => {
    const next = reduceLock("owner", { type: "claim", id: OTHER }, ME);

    expect(next.role).toBe("owner");
    expect(next.reply).toEqual({ type: "busy", id: ME });
  });

  it("ожидающая вкладка на чужую заявку не отвечает — раздел не её", () => {
    const next = reduceLock("standby", { type: "claim", id: OTHER }, ME);

    expect(next).toEqual({ role: "standby" });
  });

  it("уход владельца отдаёт раздел ожидающему", () => {
    const next = reduceLock("standby", { type: "release", id: OTHER }, ME);

    expect(next.role).toBe("owner");
  });

  it("чужой release владельца не трогает", () => {
    const next = reduceLock("owner", { type: "release", id: OTHER }, ME);

    expect(next.role).toBe("owner");
  });

  it("собственное эхо игнорируется — иначе вкладка уступит сама себе", () => {
    const own: LockMessage = { type: "busy", id: ME };

    expect(reduceLock("owner", own, ME)).toEqual({ role: "owner" });
  });
});

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
