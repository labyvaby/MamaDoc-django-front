import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANDING_CONFIG,
  parseLandingConfig,
  serializeLandingConfig,
  socialHref,
} from "./landingConfig";

/**
 * Оформление лендинга приходит из пользовательского ввода (настройки CRM), а
 * рендерится на публичной странице, которую открывают по ссылке из мессенджера.
 * Здесь зафиксировано то, что нельзя сломать: мусор не роняет страницу, а
 * ссылки в подвале остаются http(s).
 */
describe("parseLandingConfig", () => {
  it("отсутствующее значение — рабочий конфиг со всеми блоками", () => {
    expect(parseLandingConfig(undefined)).toEqual(DEFAULT_LANDING_CONFIG);
    expect(parseLandingConfig(null)).toEqual(DEFAULT_LANDING_CONFIG);
    expect(parseLandingConfig("landing")).toEqual(DEFAULT_LANDING_CONFIG);
  });

  it("незнакомые поля отбрасываются, знакомые — читаются", () => {
    const config = parseLandingConfig({
      tagline: "  Без очередей  ",
      about: "Мы работаем с 2010 года",
      junk: { nested: true },
      socials: { instagram: "@clinic", junk: "x" },
    });
    expect(config.tagline).toBe("Без очередей");
    expect(config.about).toBe("Мы работаем с 2010 года");
    expect(config.socials.instagram).toBe("@clinic");
    expect(config).not.toHaveProperty("junk");
  });

  it("блок выключается только явным false", () => {
    const config = parseLandingConfig({ blocks: { reviews: false, services: "нет", junk: false } });
    expect(config.blocks.reviews).toBe(false);
    // Строка — не «выключено»: неизвестное значение оставляет блок как был.
    expect(config.blocks.services).toBe(true);
  });

  it("цвет принимается только как hex", () => {
    expect(parseLandingConfig({ accentColor: "#0EA5A5" }).accentColor).toBe("#0EA5A5");
    expect(parseLandingConfig({ accentColor: "#fff" }).accentColor).toBe("#fff");
    // Это ушло бы в CSS — принимать нельзя.
    expect(parseLandingConfig({ accentColor: "red; background: url(x)" }).accentColor).toBeNull();
    expect(parseLandingConfig({ accentColor: 123 }).accentColor).toBeNull();
  });

  it("длинные строки режутся, а не отбрасываются", () => {
    const config = parseLandingConfig({ tagline: "я".repeat(500) });
    expect(config.tagline.length).toBe(160);
  });
});

describe("serializeLandingConfig", () => {
  it("пустые значения и включённые блоки не сохраняются", () => {
    expect(serializeLandingConfig(DEFAULT_LANDING_CONFIG)).toEqual({});
  });

  it("сохранённое читается обратно без потерь", () => {
    const config = parseLandingConfig({
      tagline: "Без очередей",
      workHours: "Пн–Сб 09:00–19:00",
      accentColor: "#7C3AED",
      socials: { whatsapp: "+996 700 123 456" },
      blocks: { reviews: false },
    });
    expect(parseLandingConfig(serializeLandingConfig(config))).toEqual(config);
  });
});

describe("socialHref", () => {
  it("логин превращается в адрес сервиса", () => {
    expect(socialHref("instagram", "@clinic")).toBe("https://instagram.com/clinic");
    expect(socialHref("telegram", "clinic")).toBe("https://t.me/clinic");
  });

  it("телефон WhatsApp — в wa.me без разделителей", () => {
    expect(socialHref("whatsapp", "+996 700 123 456")).toBe("https://wa.me/996700123456");
    expect(socialHref("whatsapp", "12345")).toBeNull();
  });

  it("домен без схемы получает https, схема сохраняется", () => {
    expect(socialHref("website", "mamadoc.kg")).toBe("https://mamadoc.kg");
    expect(socialHref("website", "https://mamadoc.kg/about")).toBe("https://mamadoc.kg/about");
  });

  it("не-http схемы и мусор отбрасываются", () => {
    expect(socialHref("website", "javascript:alert(1)")).toBeNull();
    expect(socialHref("instagram", "javascript:alert(1)")).toBeNull();
    expect(socialHref("instagram", "")).toBeNull();
  });
});
