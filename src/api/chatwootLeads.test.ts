import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getChatwootLeadSettings,
  rotateChatwootLeadSecret,
  saveChatwootLeadSettings,
  suggestInboxRule,
  testChatwootLeadConnection,
} from "./chatwootLeads";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chatwootLeads api", () => {
  it("GET читает настройки, organizationId уходит в query", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      respond({
        enabled: false,
        accountId: 3,
        webhookUrl: "",
        apiTokenConfigured: false,
        pipelineCode: "",
        reopenStageCode: "",
        defaultAssigneeId: null,
        inboxMap: {},
        inboxWhitelist: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const settings = await getChatwootLeadSettings(undefined, { organizationId: 7 });

    expect(settings.accountId).toBe(3);
    expect(settings.inboxMap).toEqual({});
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/chatwoot/lead-integration/?organizationId=7");
  });

  it("PUT отправляет карту инбоксов как есть и пустой токен как «не менять»", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      respond({
        enabled: true,
        accountId: 3,
        webhookUrl: "https://crm/api/chatwoot/webhook/?token=s",
        apiTokenConfigured: true,
        pipelineCode: "sales",
        reopenStageCode: "",
        defaultAssigneeId: null,
        inboxMap: { "61": { source: "WhatsApp", identity: "phone", channel: "whatsapp" } },
        inboxWhitelist: [61],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveChatwootLeadSettings({
      enabled: true,
      chatwootApiToken: "",
      chatwootApiTokenClear: false,
      pipelineCode: "sales",
      reopenStageCode: "",
      defaultAssigneeId: null,
      inboxMap: { "61": { source: "WhatsApp", identity: "phone", channel: "whatsapp" } },
      inboxWhitelist: [61],
    });

    expect(saved.webhookUrl).toContain("?token=");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string);
    expect(body.inboxMap["61"].identity).toBe("phone");
    expect(body.chatwootApiToken).toBe("");
    expect(body.inboxWhitelist).toEqual([61]);
  });

  it("rotate-secret — POST, возвращает новый URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        respond({ webhookUrl: "https://crm/api/chatwoot/webhook/?token=new" }, 201),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await rotateChatwootLeadSecret();

    expect(result.webhookUrl).toContain("token=new");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("test — POST с токеном, отдаёт инбоксы", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      respond(
        {
          ok: true,
          error: null,
          inboxes: [{ id: 61, name: "WA", channelType: "Channel::Api", phoneNumber: null }],
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testChatwootLeadConnection({ chatwootApiToken: "tok" });

    expect(result.ok).toBe(true);
    expect(result.inboxes[0].channelType).toBe("Channel::Api");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.chatwootApiToken).toBe("tok");
  });
});

describe("suggestInboxRule", () => {
  it("WA через Evolution (Channel::Api) — телефон, как и официальный WhatsApp", () => {
    const api = suggestInboxRule({ id: 61, name: "WA_Plus", channelType: "Channel::Api", phoneNumber: null });
    const waba = suggestInboxRule({ id: 38, name: "WABA", channelType: "Channel::Whatsapp", phoneNumber: "+996" });
    expect(api).toEqual({ source: "WhatsApp", identity: "phone", channel: "whatsapp" });
    expect(waba).toEqual(api);
  });

  it("Instagram — ник, канал instagram", () => {
    expect(
      suggestInboxRule({ id: 33, name: "ig", channelType: "Channel::Instagram", phoneNumber: null }),
    ).toEqual({ source: "Instagram", identity: "username", channel: "instagram" });
  });
});
