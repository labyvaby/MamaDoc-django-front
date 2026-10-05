import { describe, expect, it } from "vitest";

import {
  CLOCK_SKEW_THRESHOLD_MS,
  describeClockProblem,
  detectClockProblem,
  dismissKey,
  formatShift,
  formatUtcOffset,
  resolveClinicTimeZone,
  zoneOffsetMinutes,
} from "./deviceClock";

const AT = new Date("2026-10-05T04:46:00Z");
const HOUR = 60 * 60_000;

describe("zoneOffsetMinutes", () => {
  it("знает пояса региона", () => {
    expect(zoneOffsetMinutes("Asia/Bishkek", AT)).toBe(360);
    expect(zoneOffsetMinutes("Europe/Moscow", AT)).toBe(180);
    expect(zoneOffsetMinutes("Asia/Tashkent", AT)).toBe(300);
    expect(zoneOffsetMinutes("UTC", AT)).toBe(0);
  });

  it("учитывает перевод часов в поясе с летним временем", () => {
    expect(zoneOffsetMinutes("Europe/Berlin", new Date("2026-07-01T12:00:00Z"))).toBe(120);
    expect(zoneOffsetMinutes("Europe/Berlin", new Date("2026-12-01T12:00:00Z"))).toBe(60);
  });

  it("возвращает null для неизвестного пояса", () => {
    expect(zoneOffsetMinutes("Mars/Olympus", AT)).toBeNull();
    expect(zoneOffsetMinutes("", AT)).toBeNull();
  });
});

describe("resolveClinicTimeZone", () => {
  it("берёт пояс активного филиала", () => {
    expect(resolveClinicTimeZone("Asia/Tashkent", [{ timezone: "Asia/Bishkek" }], AT)).toBe("Asia/Tashkent");
  });

  it("без активного филиала — пояс первого филиала организации", () => {
    expect(resolveClinicTimeZone(null, [{ timezone: "" }, { timezone: "Asia/Almaty" }], AT)).toBe("Asia/Almaty");
  });

  it("пустой или неизвестный пояс заменяет на Бишкек", () => {
    expect(resolveClinicTimeZone("Mars/Olympus", [], AT)).toBe("Asia/Bishkek");
    expect(resolveClinicTimeZone(undefined, undefined, AT)).toBe("Asia/Bishkek");
  });
});

describe("detectClockProblem", () => {
  it("пояс компьютера совпал, часы точные — проблем нет", () => {
    expect(detectClockProblem({ deviceOffset: 360, clinicOffset: 360, skewMs: 2_000 })).toBeNull();
  });

  it("часы ещё не сверены с сервером — смотрим только пояс", () => {
    expect(detectClockProblem({ deviceOffset: 360, clinicOffset: 360, skewMs: null })).toBeNull();
  });

  it("случай 2026-10-05: пояс Москвы и часы, подведённые вручную", () => {
    // На экране 10:46 по Бишкеку, пояс UTC+3 — компьютер думает, что в мире
    // на 3 часа позже, чем на самом деле: сервер «отстаёт» на 3 часа.
    expect(detectClockProblem({ deviceOffset: 180, clinicOffset: 360, skewMs: -3 * HOUR })).toEqual({
      kind: "timezone",
      deviceOffset: 180,
      clinicOffset: 360,
      skewMs: -3 * HOUR,
    });
  });

  it("пояс верный, часы убежали больше порога", () => {
    expect(detectClockProblem({ deviceOffset: 360, clinicOffset: 360, skewMs: -CLOCK_SKEW_THRESHOLD_MS })).toEqual({
      kind: "clock",
      skewMs: -CLOCK_SKEW_THRESHOLD_MS,
    });
  });

  it("небольшое расхождение часов не тревожит", () => {
    expect(detectClockProblem({ deviceOffset: 360, clinicOffset: 360, skewMs: CLOCK_SKEW_THRESHOLD_MS - 1 })).toBeNull();
  });

  it("пояс клиники неизвестен — по поясу не тревожим", () => {
    expect(detectClockProblem({ deviceOffset: 180, clinicOffset: null, skewMs: 0 })).toBeNull();
  });
});

describe("форматирование", () => {
  it("смещение пояса — как в списке Windows", () => {
    expect(formatUtcOffset(360)).toBe("UTC+06:00");
    expect(formatUtcOffset(180)).toBe("UTC+03:00");
    expect(formatUtcOffset(0)).toBe("UTC+00:00");
    expect(formatUtcOffset(-210)).toBe("UTC-03:30");
    expect(formatUtcOffset(345)).toBe("UTC+05:45");
  });

  it("сдвиг — часы и минуты без знака", () => {
    expect(formatShift(180)).toBe("3 ч");
    expect(formatShift(-60)).toBe("1 ч");
    expect(formatShift(90)).toBe("1 ч 30 мин");
    expect(formatShift(12)).toBe("12 мин");
    expect(formatShift(0.4)).toBe("1 мин");
  });
});

describe("describeClockProblem", () => {
  it("неверный пояс на Windows: на сколько сдвинуто и какой пояс выбрать", () => {
    const text = describeClockProblem(
      { kind: "timezone", deviceOffset: 180, clinicOffset: 360, skewMs: null },
      { clinicTimeZone: "Asia/Bishkek", isWindows: true },
    );
    expect(text.severity).toBe("error");
    expect(text.title).toBe("На этом компьютере неверный часовой пояс");
    expect(text.body).toBe(
      "Пояс компьютера — UTC+03:00, а CRM работает по UTC+06:00 (Бишкек). " +
        "Поэтому время записей здесь показано на 3 ч раньше, чем на самом деле, " +
        "а записи, созданные или перенесённые с этого компьютера, сохранятся не на то время.",
    );
    expect(text.howTo).toContain("Часовой пояс «(UTC+06:00) Бишкек»");
    expect(text.howTo).toContain("«Астана» не подходит");
    expect(text.howTo).toContain("«Синхронизировать»");
    expect(text.howTo).not.toContain("вручную");
  });

  it("часы подведены вручную — предупреждаем, что после смены пояса они убегут", () => {
    const text = describeClockProblem(
      { kind: "timezone", deviceOffset: 180, clinicOffset: 360, skewMs: -3 * HOUR },
      { clinicTimeZone: "Asia/Bishkek", isWindows: true },
    );
    expect(text.howTo).toContain("Часы здесь переведены вручную");
  });

  it("пояс компьютера восточнее клиники — время показано позже", () => {
    const text = describeClockProblem(
      { kind: "timezone", deviceOffset: 480, clinicOffset: 360, skewMs: null },
      { clinicTimeZone: "Asia/Bishkek", isWindows: false },
    );
    expect(text.title).toBe("На этом устройстве неверный часовой пояс");
    expect(text.body).toContain("Пояс устройства — UTC+08:00");
    expect(text.body).toContain("на 2 ч позже, чем на самом деле");
    expect(text.body).toContain("с этого устройства");
    expect(text.howTo).toContain("в настройках даты и времени устройства");
    expect(text.howTo).not.toContain("Параметры");
  });

  it("пояс клиники не Бишкек — без подсказки про Астану", () => {
    const text = describeClockProblem(
      { kind: "timezone", deviceOffset: 360, clinicOffset: 300, skewMs: null },
      { clinicTimeZone: "Asia/Tashkent", isWindows: true },
    );
    expect(text.body).toContain("UTC+05:00 (Ташкент)");
    expect(text.howTo).toContain("пояс с «(UTC+05:00)»");
    expect(text.howTo).not.toContain("Астана");
  });

  it("спешащие часы", () => {
    const text = describeClockProblem(
      { kind: "clock", skewMs: -12 * 60_000 },
      { clinicTimeZone: "Asia/Bishkek", isWindows: true },
    );
    expect(text.severity).toBe("warning");
    expect(text.title).toBe("Часы этого компьютера спешат на 12 мин");
    expect(text.howTo).toContain("«Установить время автоматически»");
  });

  it("отстающие часы", () => {
    const text = describeClockProblem(
      { kind: "clock", skewMs: 2 * HOUR },
      { clinicTimeZone: "Asia/Bishkek", isWindows: false },
    );
    expect(text.title).toBe("Часы этого устройства отстают на 2 ч");
  });
});

describe("dismissKey", () => {
  it("закрытая плашка не возвращается, пока проблема та же", () => {
    expect(dismissKey({ kind: "timezone", deviceOffset: 180, clinicOffset: 360, skewMs: -3 * HOUR })).toBe(
      dismissKey({ kind: "timezone", deviceOffset: 180, clinicOffset: 360, skewMs: null }),
    );
    expect(dismissKey({ kind: "clock", skewMs: -12 * 60_000 })).toBe(dismissKey({ kind: "clock", skewMs: -13 * 60_000 }));
  });

  it("другая проблема — показываем снова", () => {
    expect(dismissKey({ kind: "timezone", deviceOffset: 180, clinicOffset: 360, skewMs: null })).not.toBe(
      dismissKey({ kind: "timezone", deviceOffset: 300, clinicOffset: 360, skewMs: null }),
    );
    expect(dismissKey({ kind: "clock", skewMs: -12 * 60_000 })).not.toBe(dismissKey({ kind: "clock", skewMs: -3 * HOUR }));
  });
});
