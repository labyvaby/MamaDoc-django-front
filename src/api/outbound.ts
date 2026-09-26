import { apiRequest } from "./client";

/**
 * «Исходящие сообщения (Raven)» — чем клиника пишет пациентам.
 * Секреты (ключ Raven, пароль SMS, токен WhatsApp) только на запись:
 * ответ говорит лишь, задан ли секрет.
 */
export interface OutboundSettings {
  organizationId: number;
  ravenKeyConfigured: boolean;
  smsLogin: string;
  smsSender: string;
  smsConfigured: boolean;
  whatsappLogin: string;
  whatsappConfigured: boolean;
}

/** PATCH: не переданное поле не меняется; *Clear стирает сохранённый секрет. */
export interface OutboundSettingsPatch {
  organizationId?: number;
  ravenApiKey?: string;
  ravenApiKeyClear?: boolean;
  smsLogin?: string;
  smsPassword?: string;
  smsPasswordClear?: boolean;
  smsSender?: string;
  whatsappLogin?: string;
  whatsappPassword?: string;
  whatsappPasswordClear?: boolean;
}

export interface OutboundCheckResult {
  ok: boolean;
  detail: string;
}

export interface OutboundCheck {
  raven: OutboundCheckResult;
  /** null — у клиники нет своего номера WhatsApp. */
  whatsapp: OutboundCheckResult | null;
}

export function getOutboundSettings(
  organizationId?: number,
  signal?: AbortSignal
): Promise<OutboundSettings> {
  const qs =
    organizationId != null ? `?organizationId=${organizationId}` : "";
  return apiRequest<OutboundSettings>(`/outbound/settings/${qs}`, { signal });
}

export function updateOutboundSettings(
  patch: OutboundSettingsPatch
): Promise<OutboundSettings> {
  return apiRequest<OutboundSettings>("/outbound/settings/", {
    method: "PATCH",
    body: patch,
  });
}

export function checkOutbound(organizationId?: number): Promise<OutboundCheck> {
  return apiRequest<OutboundCheck>("/outbound/check/", {
    method: "POST",
    body: organizationId != null ? { organizationId } : {},
  });
}
