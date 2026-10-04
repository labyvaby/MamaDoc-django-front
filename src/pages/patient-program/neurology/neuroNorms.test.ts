import { describe, expect, it } from "vitest";

import {
  ALL_REFLEXES,
  FADING_REFLEXES,
  REACTIONS,
  ageText,
  ageWords,
  babinskiLevel,
  centileCrossings,
  clonusLevel,
  fontanelleLevel,
  headCircumferenceLevel,
  headZLevel,
  neuroAge,
  nextOrderCheck,
  nprGroupLevel,
  orderAgeText,
  rangeText,
  reflexLevel,
  seizuresLevel,
  sinceDate,
  sleepLevel,
  spheresLevel,
  tendonLevel,
  toneLevel,
  untilText,
  worst,
  zhurbaLevel,
} from "./neuroNorms";

describe("возраст", () => {
  const term = { birthDate: "2025-01-01", gestation: null };
  const preterm = { birthDate: "2025-01-01", gestation: { weeks: 32, days: 0 } };

  it("дни / 30,4375, как в «Росте»", () => {
    // 2025-01-01 + 100 дней = 2025-04-11.
    const age = neuroAge(term, "2025-04-11");
    expect(age.months).toBeCloseTo(100 / 30.4375, 6);
    expect(age.passport).toBeCloseTo(100 / 30.4375, 6);
    expect(age.corrected).toBe(false);
  });

  it("32 недели: до 2 лет — минус 56 недоношенных дней, после — без поправки", () => {
    const young = neuroAge(preterm, "2025-04-11");
    expect(young.corrected).toBe(true);
    expect(young.months).toBeCloseTo(44 / 30.4375, 6);
    expect(young.passport).toBeCloseTo(100 / 30.4375, 6);
    const older = neuroAge(preterm, "2027-01-02");
    expect(older.corrected).toBe(false);
    expect(older.months).toBeCloseTo(731 / 30.4375, 6);
  });

  it("до срока доношенности оценок нет", () => {
    const age = neuroAge(preterm, "2025-01-31");
    expect(age.months).toBeNull();
    expect(age.passport).toBeCloseTo(30 / 30.4375, 6);
  });

  it("без даты рождения — null", () => {
    expect(neuroAge({ birthDate: null, gestation: null }, "2025-01-31").months).toBeNull();
  });

  it("возраст словами", () => {
    expect(ageWords(15.01)).toBe("1 год 3 мес");
    expect(ageWords(17.2)).toBe("1 год 5 мес");
    expect(ageWords(7.3)).toBe("7 мес");
    expect(ageWords(24)).toBe("2 года");
    expect(ageWords(60.4)).toBe("5 лет");
    expect(ageWords(0.5)).toBe("2 нед");
    expect(ageText(18.3)).toBe("1 год 6 мес.");
  });

  it("сроки словами", () => {
    expect(untilText(18)).toBe("к 18 мес");
    expect(untilText(36)).toBe("к 3 годам");
    expect(untilText(42)).toBe("к 42 мес");
    expect(rangeText([9, 12])).toBe("9–12 мес");
    expect(rangeText([0, 1])).toBe("до 1 мес");
    expect(rangeText([15, 15])).toBe("15 мес");
    expect(rangeText([48, 60])).toBe("4–5 лет");
    expect(rangeText([36, 36])).toBe("3 года");
    expect(rangeText([30, 36])).toBe("30–36 мес");
  });

  it("«с N мес» — дата рождения + N календарных месяцев, полмесяца — ещё 15 дней", () => {
    expect(sinceDate("2025-03-26", 15)).toBe("2026-06-26");
    expect(sinceDate("2025-03-26", 4.5)).toBe("2025-08-10");
    expect(sinceDate("2025-03-26", 0)).toBe("2025-03-26");
  });
});

describe("уровни", () => {
  it("худший; «нет оценки» уступает любой оценке", () => {
    expect(worst("unknown", "ok")).toBe("ok");
    expect(worst("warn", "bad", "ok")).toBe("bad");
    expect(worst("bad", "urgent")).toBe("urgent");
    expect(worst(null, undefined)).toBe("unknown");
  });
});

describe("рефлексы первого года", () => {
  const present = { state: "present", side: null } as const;
  const absent = { state: "absent", side: null } as const;

  it("Моро: есть — норма до 4, пограничное до 6, дальше тревожно", () => {
    expect(reflexLevel("moro", present, 4)).toBe("ok");
    expect(reflexLevel("moro", present, 4.5)).toBe("warn");
    expect(reflexLevel("moro", present, 6)).toBe("warn");
    expect(reflexLevel("moro", present, 6.1)).toBe("bad");
  });

  it("нет в первый месяц — тревожно; до начала угасания — пограничное; дальше — угас, норма", () => {
    expect(reflexLevel("moro", absent, 0.5)).toBe("bad");
    expect(reflexLevel("moro", absent, 2)).toBe("warn");
    expect(reflexLevel("moro", absent, 4)).toBe("ok");
    expect(reflexLevel("stepping", absent, 1.5)).toBe("warn");
    expect(reflexLevel("stepping", absent, 2)).toBe("ok");
  });

  it("каждая строка таблицы: норма до, пограничное между, тревожно после", () => {
    for (const def of FADING_REFLEXES) {
      expect(reflexLevel(def.code, present, def.normUntil)).toBe("ok");
      if (def.alarmAfter > def.normUntil) expect(reflexLevel(def.code, present, (def.normUntil + def.alarmAfter) / 2)).toBe("warn");
      expect(reflexLevel(def.code, present, def.alarmAfter + 0.1)).toBe("bad");
      expect(reflexLevel(def.code, absent, Math.max(def.fade[0], 1))).toBe("ok");
    }
  });

  it("у хоботкового порог «тревожно» — после года", () => {
    expect(reflexLevel("proboscis", present, 11)).toBe("warn");
    expect(reflexLevel("proboscis", present, 12.5)).toBe("bad");
  });

  it("асимметрия и облигатный АШТР — тревожно в любом возрасте", () => {
    expect(reflexLevel("moro", { state: "asym", side: "S" }, 1)).toBe("bad");
    expect(reflexLevel("atnr", { state: "obligatory", side: null }, 2)).toBe("bad");
    expect(reflexLevel("parachute", { state: "asym", side: "D" }, 10)).toBe("bad");
  });

  it("реакции: нет до срока — ожидается, после — пограничное, через 3 мес после срока — тревожно", () => {
    for (const def of REACTIONS) {
      expect(reflexLevel(def.code, absent, def.due)).toBe("unknown");
      expect(reflexLevel(def.code, absent, def.due + 0.1)).toBe("warn");
      expect(reflexLevel(def.code, absent, def.due + 3)).toBe("warn");
      expect(def.alarmAfter).toBe(def.due + 3);
      expect(reflexLevel(def.code, absent, def.alarmAfter + 0.1)).toBe("bad");
      expect(reflexLevel(def.code, present, def.due - 1)).toBe("ok");
    }
  });

  it("без возраста — без оценки; асимметрия — всё равно тревожно", () => {
    expect(reflexLevel("moro", present, null)).toBe("unknown");
    expect(reflexLevel("moro", { state: "asym", side: null }, null)).toBe("bad");
  });

  it("в таблице «норма до» не больше «тревожно после»", () => {
    for (const def of ALL_REFLEXES) {
      if (def.kind === "fading") expect(def.normUntil).toBeLessThanOrEqual(def.alarmAfter);
      else expect(def.due).toBeLessThan(def.alarmAfter);
    }
  });
});

describe("сухожильные и патологические", () => {
  it("асимметрия — тревожно, «живые, D = S» — норма, остальное — без цвета", () => {
    expect(tendonLevel("normal", "equal")).toBe("ok");
    expect(tendonLevel("brisk", "equal")).toBe("unknown");
    expect(tendonLevel("high", "equal")).toBe("unknown");
    expect(tendonLevel("normal", "d_gt_s")).toBe("bad");
  });

  it("клонус: неистощаемый — тревожно", () => {
    expect(clonusLevel("sustained")).toBe("bad");
    expect(clonusLevel("exhaustible")).toBe("unknown");
    expect(clonusLevel("none")).toBe("ok");
  });

  it("Бабинский: до 2 лет без оценки, после 2 лет или с одной стороны — тревожно", () => {
    expect(babinskiLevel({ right: true, left: true }, 12)).toBe("unknown");
    expect(babinskiLevel({ right: true, left: true }, 25)).toBe("bad");
    expect(babinskiLevel({ right: true, left: false }, 6)).toBe("bad");
  });
});

describe("тонус", () => {
  const tone = (patch: Partial<Parameters<typeof toneLevel>[0] & object>) => ({ state: null, symmetry: null, score: null, ...patch });

  it("баллы Журбы–Мастюковой: 3 — норма, 2 — пограничное, 1 и 0 — тревожно", () => {
    expect(toneLevel(tone({ score: 3 }), 2)).toBe("ok");
    expect(toneLevel(tone({ score: 2 }), 2)).toBe("warn");
    expect(toneLevel(tone({ score: 1 }), 2)).toBe("bad");
    expect(toneLevel(tone({ score: 0 }), 2)).toBe("bad");
  });

  it("без баллов: норма; повышен, снижен, дистония — пограничное; спастичность, ригидность — тревожно", () => {
    expect(toneLevel(tone({ state: "normal" }), 6)).toBe("ok");
    expect(toneLevel(tone({ state: "high" }), 6)).toBe("warn");
    expect(toneLevel(tone({ state: "low" }), 6)).toBe("warn");
    expect(toneLevel(tone({ state: "dystonia" }), 6)).toBe("warn");
    expect(toneLevel(tone({ state: "spastic" }), 6)).toBe("bad");
    expect(toneLevel(tone({ state: "rigid" }), 6)).toBe("bad");
  });

  it("физиологический гипертонус — норма до 4 мес", () => {
    expect(toneLevel(tone({ state: "physiological" }), 3)).toBe("ok");
    expect(toneLevel(tone({ state: "physiological" }), 5)).toBe("warn");
  });

  it("асимметрия — тревожно; цвет — худший", () => {
    expect(toneLevel(tone({ state: "normal", symmetry: "d_gt_s" }), 6)).toBe("bad");
    expect(toneLevel(tone({ state: "dystonia", symmetry: "equal", score: 2 }), 1.3)).toBe("warn");
  });
});

describe("родничок", () => {
  const f = (patch: Partial<NonNullable<Parameters<typeof fontanelleLevel>[0]>>) => ({ a: null, b: null, state: null, closedOn: null, ...patch });

  it("напряжён или выбухает — срочно", () => {
    expect(fontanelleLevel(f({ state: "tense" }), 5)).toBe("urgent");
    expect(fontanelleLevel(f({ state: "bulging" }), 30)).toBe("urgent");
  });

  it("закрыт раньше 3 мес: пограничное; тревожно при окружности головы ниже −2 SD или изменённой форме", () => {
    expect(fontanelleLevel(f({ state: "closed" }), 4, { closedAge: 2.5, headZ: -1 })).toBe("warn");
    expect(fontanelleLevel(f({ state: "closed" }), 4, { closedAge: 2.5, headZ: -2.4 })).toBe("bad");
    expect(fontanelleLevel(f({ state: "closed" }), 4, { closedAge: 2.5, shapeChanged: true })).toBe("bad");
    expect(fontanelleLevel(f({ state: "closed" }), 14, { closedAge: 13 })).toBe("ok");
  });

  it("открыт: в 18–24 мес — пограничное, после 24 — тревожно", () => {
    expect(fontanelleLevel(f({ a: 1, b: 1, state: "normal" }), 17)).toBe("ok");
    expect(fontanelleLevel(f({ a: 1, b: 1, state: "normal" }), 18)).toBe("warn");
    expect(fontanelleLevel(f({ a: 1, b: 1, state: "normal" }), 24)).toBe("warn");
    expect(fontanelleLevel(f({ a: 1, b: 1, state: "normal" }), 24.5)).toBe("bad");
  });
});

describe("окружность головы", () => {
  it("до 2 SD — норма, 2–3 SD — пограничное, больше 3 SD — тревожно", () => {
    expect(headZLevel(1.9)).toBe("ok");
    expect(headZLevel(2)).toBe("ok");
    expect(headZLevel(2.5)).toBe("warn");
    expect(headZLevel(-2.5)).toBe("warn");
    expect(headZLevel(3.1)).toBe("bad");
    expect(headZLevel(-3.2)).toBe("bad");
  });

  it("пересечение двух линий центилей — тревожно", () => {
    expect(centileCrossings(-0.5, 1.2)).toBe(2);
    expect(centileCrossings(1.2, -0.5)).toBe(2);
    expect(centileCrossings(-0.5, 0.5)).toBe(1);
    expect(headCircumferenceLevel(1.2, -0.5)).toBe("bad");
    expect(headCircumferenceLevel(0.5, -0.5)).toBe("ok");
    expect(headCircumferenceLevel(0.5, null)).toBe("ok");
  });
});

describe("сон по нормам ВОЗ", () => {
  it("по возрастам; с 5 лет — без оценки", () => {
    expect(sleepLevel(16, 2)).toBe("ok");
    expect(sleepLevel(13, 2)).toBe("warn");
    expect(sleepLevel(12, 6)).toBe("ok");
    expect(sleepLevel(17, 6)).toBe("warn");
    expect(sleepLevel(11, 18)).toBe("ok");
    expect(sleepLevel(10, 30)).toBe("warn");
    expect(sleepLevel(10, 40)).toBe("ok");
    expect(sleepLevel(9, 70)).toBe("unknown");
  });
});

describe("приступы и шкалы", () => {
  it("фебрильные, аффективно-респираторные, обмороки — пограничное; афебрильные и неясные — тревожно", () => {
    expect(seizuresLevel(["febrile"])).toBe("warn");
    expect(seizuresLevel(["breath_holding", "syncope"])).toBe("warn");
    expect(seizuresLevel(["febrile", "afebrile"])).toBe("bad");
    expect(seizuresLevel(["unclear"])).toBe("bad");
    expect(seizuresLevel([])).toBe("unknown");
  });

  it("Журба–Мастюкова: 27–30 норма, 23–26 пограничное, 22 и меньше — тревожно", () => {
    expect(zhurbaLevel(30)).toBe("ok");
    expect(zhurbaLevel(27)).toBe("ok");
    expect(zhurbaLevel(26)).toBe("warn");
    expect(zhurbaLevel(23)).toBe("warn");
    expect(zhurbaLevel(22)).toBe("bad");
  });

  it("группа НПР: I — норма, II — пограничное, III–IV — тревожно; пять сфер", () => {
    expect(nprGroupLevel(1)).toBe("ok");
    expect(nprGroupLevel(2)).toBe("warn");
    expect(nprGroupLevel(3)).toBe("bad");
    expect(nprGroupLevel(4)).toBe("bad");
    expect(spheresLevel({ thinkingSpeech: "deviation", motor: "norm" })).toBe("warn");
    expect(spheresLevel({ thinkingSpeech: "norm", motor: "norm" })).toBe("ok");
    expect(spheresLevel({})).toBe("unknown");
  });
});

describe("сроки по 211н", () => {
  it("ближайший осмотр невролога после даты", () => {
    expect(nextOrderCheck("2025-03-26", "2026-10-04", { gapDays: 14 })).toEqual({ months: 36, date: "2028-03-26" });
    expect(nextOrderCheck("2025-03-26", "2025-05-05", { gapDays: 14 })).toEqual({ months: 3, date: "2025-06-26" });
  });

  it("осмотр за две недели до срока — это и есть срок: следующий — за ним", () => {
    expect(nextOrderCheck("2025-03-26", "2025-06-20", { gapDays: 14 })).toEqual({ months: 12, date: "2026-03-26" });
  });

  it("1 г 6 мес — только при положительной анкете", () => {
    expect(nextOrderCheck("2025-03-26", "2026-04-12")).toEqual({ months: 36, date: "2028-03-26" });
    expect(nextOrderCheck("2025-03-26", "2026-04-12", { questionnairePositive: true })).toEqual({ months: 18, date: "2026-09-26" });
  });

  it("после 17 лет сроков нет; без даты рождения — тоже", () => {
    expect(nextOrderCheck("2005-01-01", "2023-01-02")).toBeNull();
    expect(nextOrderCheck(null, "2023-01-02")).toBeNull();
  });

  it("возраст осмотра словами", () => {
    expect(orderAgeText(36)).toBe("в 3 года");
    expect(orderAgeText(18)).toBe("в 1 год 6 мес");
    expect(orderAgeText(3)).toBe("в 3 мес");
    expect(orderAgeText(120)).toBe("в 10 лет");
  });
});
