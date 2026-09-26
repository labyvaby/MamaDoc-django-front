import { describe, expect, it } from "vitest";
import type { OutboundSettings } from "../../../api/outbound";
import { buildPatch, draftFrom, isPhoneNumberId, isRavenKey } from "./outboundForm";

const saved: OutboundSettings = {
  organizationId: 1,
  ravenKeyConfigured: true,
  smsLogin: "clinic",
  smsSender: "Clinic",
  smsConfigured: true,
  whatsappLogin: "1096771266843447",
  whatsappConfigured: true,
};

describe("outboundForm", () => {
  it("нетронутая форма — пустой patch, секреты не отправляются", () => {
    expect(buildPatch(saved, draftFrom(saved))).toEqual({});
  });

  it("шлёт только изменённое и новые секреты", () => {
    const d = { ...draftFrom(saved), whatsappPassword: " EAA ", smsSender: "New ", ravenApiKey: "nrk_live_x1" };
    expect(buildPatch(saved, d)).toEqual({
      whatsappPassword: "EAA",
      smsSender: "New",
      ravenApiKey: "nrk_live_x1",
    });
  });

  it("проверки полей", () => {
    expect(isPhoneNumberId("1096771266843447")).toBe(true);
    expect(isPhoneNumberId("+996 999")).toBe(false);
    expect(isPhoneNumberId("")).toBe(true);
    expect(isRavenKey("with space")).toBe(false);
    expect(isRavenKey("nrk_live_abcdef")).toBe(true);
  });
});
