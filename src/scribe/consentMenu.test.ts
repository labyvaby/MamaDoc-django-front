import { describe, expect, it } from "vitest";
import { consentMenu } from "./consentMenu";

describe("consentMenu", () => {
  it("согласие есть — весь приём доступен, вопроса нет", () => {
    expect(consentMenu("yes", false)).toEqual({
      shown: "yes",
      visitEnabled: true,
      askConsent: false,
      dictationConsent: undefined,
    });
  });

  it("не спрашивали — вопрос в меню, весь приём только через «Да»", () => {
    expect(consentMenu("unknown", false)).toEqual({
      shown: "unknown",
      visitEnabled: false,
      askConsent: true,
      dictationConsent: undefined,
    });
  });

  it("«Нет» в меню — как отказ, а диктовка несёт ответ на сервер", () => {
    expect(consentMenu("unknown", true)).toEqual({
      shown: "no",
      visitEnabled: false,
      askConsent: false,
      dictationConsent: "no",
    });
  });

  it("отказ из карточки — ответ уже сохранён, повторно не шлём", () => {
    expect(consentMenu("no", true)).toEqual({
      shown: "no",
      visitEnabled: false,
      askConsent: false,
      dictationConsent: undefined,
    });
  });
});
