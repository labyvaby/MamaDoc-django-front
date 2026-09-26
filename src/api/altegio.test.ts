import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectAltegio,
  disconnectAltegio,
  getAltegioJournal,
  getAltegioSettings,
  getAltegioStaff,
  linkAltegioLocation,
  linkAltegioStaff,
  suggestByName,
  updateAltegioSettings,
  type AltegioSettings,
} from "./altegio";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function settings(over: Partial<AltegioSettings> = {}): AltegioSettings {
  return {
    organizationId: 7,
    isEnabled: false,
    isConnected: true,
    login: "bot@clinic.kg",
    fallbackServiceId: null,
    syncFrom: null,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: "",
    waitingStaffCount: 0,
    divergedCount: 0,
    ...over,
  };
}

const sentUrl = () => String(fetchMock.mock.calls[0][0]);
const sentInit = () => fetchMock.mock.calls[0][1] as RequestInit;
const sentBody = () => JSON.parse(String(sentInit().body)) as Record<string, unknown>;

describe("вызовы API Altegio", () => {
  it("настройки спрашиваются в скоупе организации", async () => {
    fetchMock.mockResolvedValue(jsonResponse(settings()));
    await getAltegioSettings(undefined, { organizationId: 7 });
    expect(sentUrl()).toContain("/altegio/settings/?organizationId=7");
  });

  it("без организации параметр не уходит", async () => {
    fetchMock.mockResolvedValue(jsonResponse(settings()));
    await getAltegioSettings();
    expect(sentUrl()).toMatch(/\/altegio\/settings\/$/);
  });

  it("правка настроек — PATCH с телом", async () => {
    fetchMock.mockResolvedValue(jsonResponse(settings({ isEnabled: true })));
    await updateAltegioSettings({ organizationId: 7, isEnabled: true });
    expect(sentInit()).toMatchObject({ method: "PATCH" });
    expect(sentBody()).toEqual({ organizationId: 7, isEnabled: true });
  });

  it("подключение шлёт ключ, логин и пароль один раз", async () => {
    fetchMock.mockResolvedValue(jsonResponse(settings()));
    await connectAltegio({ organizationId: 7, partnerToken: "p", login: "l", password: "s" });
    expect(sentUrl()).toContain("/altegio/connect/");
    expect(sentInit()).toMatchObject({ method: "POST" });
    expect(sentBody()).toEqual({ organizationId: 7, partnerToken: "p", login: "l", password: "s" });
  });

  it("отключение — POST с организацией или null", async () => {
    fetchMock.mockResolvedValue(jsonResponse(settings({ isConnected: false })));
    await disconnectAltegio();
    expect(sentUrl()).toContain("/altegio/disconnect/");
    expect(sentBody()).toEqual({ organizationId: null });
  });

  it("специалисты — по филиалу Altegio", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ organizationId: 7, items: [] }));
    await getAltegioStaff(1271630, undefined, { organizationId: 7 });
    expect(sentUrl()).toContain("/altegio/staff/?altegioLocationId=1271630&organizationId=7");
  });

  it("журнал фильтруется по состоянию", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ organizationId: 7, items: [] }));
    await getAltegioJournal(undefined, { organizationId: 7, state: "diverged" });
    expect(sentUrl()).toContain("/altegio/journal/?organizationId=7&state=diverged");
  });

  it("связка филиала и специалиста — POST с телом", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ altegioLocationId: 1, title: "Бакаева", branchId: 3 }));
    await linkAltegioLocation({ organizationId: 7, altegioLocationId: 1, title: "Бакаева", branchId: 3 });
    expect(sentUrl()).toContain("/altegio/locations/");
    expect(sentBody()).toEqual({ organizationId: 7, altegioLocationId: 1, title: "Бакаева", branchId: 3 });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({}));
    await linkAltegioStaff({ organizationId: 7, altegioStaffId: 2, name: "Врач", employeeId: null, defaultServiceId: null });
    expect(sentUrl()).toContain("/altegio/staff/");
    expect(sentBody()).toEqual({ organizationId: 7, altegioStaffId: 2, name: "Врач", employeeId: null, defaultServiceId: null });
  });
});

describe("suggestByName", () => {
  const people = [
    { id: 1, fullName: "Назарова Динара Насирдиновна" },
    { id: 2, fullName: "Семёнова Анна" },
    { id: 3, fullName: "Суюмбаев Эрбол" },
  ];
  const nameOf = (person: { fullName: string }) => person.fullName;

  it("берёт кандидата с наибольшим числом общих слов", () => {
    expect(suggestByName("Динара Назарова", people, nameOf)?.id).toBe(1);
  });

  it("не различает регистр и ё/е", () => {
    expect(suggestByName("СЕМЕНОВА", people, nameOf)?.id).toBe(2);
  });

  it("без общих слов подсказки нет, однобуквенные не считаются", () => {
    expect(suggestByName("Иванов И", people, nameOf)).toBeNull();
    expect(suggestByName("", people, nameOf)).toBeNull();
  });
});
