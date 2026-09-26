import type { OutboundSettings, OutboundSettingsPatch } from "../../../api/outbound";

/** Черновик формы: секреты всегда пустые — новое значение вводят заново. */
export interface OutboundDraft {
  ravenApiKey: string;
  whatsappLogin: string;
  whatsappPassword: string;
  smsLogin: string;
  smsPassword: string;
  smsSender: string;
}

export const draftFrom = (s: OutboundSettings): OutboundDraft => ({
  ravenApiKey: "",
  whatsappLogin: s.whatsappLogin,
  whatsappPassword: "",
  smsLogin: s.smsLogin,
  smsPassword: "",
  smsSender: s.smsSender,
});

/** Только изменённое: пустой секрет = «не менять», стирание — отдельной кнопкой. */
export function buildPatch(
  saved: OutboundSettings,
  d: OutboundDraft
): OutboundSettingsPatch {
  const patch: OutboundSettingsPatch = {};
  if (d.ravenApiKey.trim()) patch.ravenApiKey = d.ravenApiKey.trim();
  if (d.whatsappLogin.trim() !== saved.whatsappLogin)
    patch.whatsappLogin = d.whatsappLogin.trim();
  if (d.whatsappPassword.trim()) patch.whatsappPassword = d.whatsappPassword.trim();
  if (d.smsLogin.trim() !== saved.smsLogin) patch.smsLogin = d.smsLogin.trim();
  if (d.smsPassword) patch.smsPassword = d.smsPassword;
  if (d.smsSender.trim() !== saved.smsSender) patch.smsSender = d.smsSender.trim();
  return patch;
}

export const isPhoneNumberId = (v: string) => v.trim() === "" || /^\d{5,32}$/.test(v.trim());
export const isRavenKey = (v: string) => v.trim() === "" || /^\S{8,255}$/.test(v.trim());
