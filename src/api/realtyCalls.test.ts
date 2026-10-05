import { describe, expect, it } from "vitest";

import { buildCallBody, callsNeedingAttention, formatCallDuration, parseCallDuration, type Call } from "./realtyCalls";

const call = (patch: Partial<Call>): Call => ({
  id: 1,
  number: "CALL-1",
  leadId: null,
  client: "Клиент",
  phone: "",
  managerId: null,
  manager: null,
  direction: "incoming",
  status: "answered",
  statusLabel: "",
  seconds: 0,
  result: "",
  recording: false,
  recordingUrl: "",
  sentiment: "",
  quality: null,
  summary: "",
  nextAction: "",
  transcript: [],
  deal: "",
  projectId: null,
  project: null,
  at: "2026-10-05T10:00:00+06:00",
  day: "today",
  ...patch,
});

describe("formatCallDuration", () => {
  it("секунды → мм:сс, как в макете", () => {
    expect(formatCallDuration(247)).toBe("04:07");
    expect(formatCallDuration(0)).toBe("00:00");
    expect(formatCallDuration(3601)).toBe("60:01");
  });
});

describe("parseCallDuration", () => {
  it("понимает мм:сс и голые секунды", () => {
    expect(parseCallDuration("4:07")).toBe(247);
    expect(parseCallDuration("04:07")).toBe(247);
    expect(parseCallDuration("90")).toBe(90);
    expect(parseCallDuration(" ")).toBe(0);
  });
  it("мусор и секунды больше 59 — ошибка, а не молчаливый ноль", () => {
    expect(parseCallDuration("4:75")).toBeNull();
    expect(parseCallDuration("abc")).toBeNull();
    expect(parseCallDuration("1:2:3")).toBeNull();
  });
});

describe("buildCallBody", () => {
  it("не шлёт пустые поля — менеджера, время и лида ставит бэк", () => {
    expect(buildCallBody({ client: " Айжан ", direction: "incoming", status: "missed", leadId: null, phone: undefined, seconds: 0 })).toEqual({
      client: "Айжан",
      direction: "incoming",
      status: "missed",
      seconds: 0,
    });
  });
});

describe("callsNeedingAttention", () => {
  it("пропущенные и недозвоны — первыми, затем звонки со следующим шагом; без шага не попадают", () => {
    const list = [
      call({ id: 1, nextAction: "Показ завтра", at: "2026-10-05T12:00:00+06:00" }),
      call({ id: 2, status: "missed", at: "2026-10-05T09:00:00+06:00" }),
      call({ id: 3, nextAction: "" }),
      call({ id: 4, status: "no-answer", direction: "outgoing", at: "2026-10-05T11:00:00+06:00" }),
      call({ id: 5, nextAction: "Отправить КП", at: "2026-10-05T13:00:00+06:00" }),
    ];
    expect(callsNeedingAttention(list).map((c) => c.id)).toEqual([4, 2, 5, 1]);
    expect(callsNeedingAttention(list, 2).map((c) => c.id)).toEqual([4, 2]);
  });
});
