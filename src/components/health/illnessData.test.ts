import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import type {
  ChildhoodInfection,
  Hospitalization,
  IllnessEpisode,
  IllnessHistory,
  IllnessSummary,
  IllnessVisit,
  InfectionSummary,
} from "../../api/health";
import {
  ariCounterText,
  attachmentsCaption,
  chronicStatText,
  diagnosisGroup,
  duplicateWarning,
  episodeAge,
  episodeTitleText,
  episodeWhen,
  episodesByMonth,
  findNearbyEpisode,
  formatPrecisionDate,
  frequentIllText,
  groupRibbonByYear,
  illnessTabCounts,
  infectionConflictText,
  infectionForm,
  infectionPayload,
  infectionRibbonText,
  infectionStatusText,
  infectionVaccineHint,
  limitRibbon,
  lowerFirst,
  medicationCaption,
  medicationsCaption,
  normalizeIcdCode,
  normalizePrecisionDate,
  notHadQuickPayload,
  precisionAge,
  precisionDateError,
  ribbonItems,
  sourcesLine,
  stayDocsCaption,
  stayPeriod,
  summaryTitle,
  vaccinationInfectionsLine,
  visitsCaption,
  yearCaption,
} from "./illnessData";

const TODAY = dayjs("2026-10-04");

const visit = (on: string, overrides: Partial<IllnessVisit> = {}): IllnessVisit => ({
  on,
  appointmentId: 1,
  conclusionId: 10,
  legacyConclusionId: null,
  doctor: { id: 7, fullName: "Аббасова Айгерим" },
  doctorName: "",
  specialty: "Педиатр",
  serviceName: "Приём педиатра",
  branch: { id: 1, name: "Центр" },
  diagnoses: [],
  ...overrides,
});

const episode = (overrides: Partial<IllnessEpisode> = {}): IllnessEpisode => ({
  key: "v1-ari",
  source: "visit",
  counter: "ari",
  startedOn: "2025-12-12",
  endedOn: "2025-12-12",
  datePrecision: "day",
  diagnoses: [{ code: "J06.9", title: "ОРВИ" }],
  diagnosisId: null,
  visitsCount: 1,
  visits: [visit("2025-12-12")],
  conditionId: null,
  isChronic: false,
  place: "",
  notes: "",
  medications: [],
  ...overrides,
});

const stay = (overrides: Partial<Hospitalization> = {}): Hospitalization => ({
  id: 3,
  facility: "Городская детская больница",
  admittedOn: "2025-11-14",
  dischargedOn: "2025-11-15",
  conditionId: null,
  conditionTitle: null,
  diagnosisTitle: "Паховая грыжа",
  attachments: [],
  notes: "",
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

const record = (overrides: Partial<ChildhoodInfection> = {}): ChildhoodInfection => ({
  id: 4,
  infection: "roseola",
  status: "had",
  occurredOn: "2026-01-01",
  datePrecision: "month",
  evidence: "parent",
  sourceConclusionId: null,
  notes: "",
  createdAt: "",
  updatedAt: "",
  createdBy: null,
  updatedBy: null,
  ...overrides,
});

const infection = (overrides: Partial<InfectionSummary> = {}): InfectionSummary => ({
  infection: "varicella",
  name: "Ветряная оспа",
  codes: ["B01"],
  status: "unknown",
  derived: false,
  conflict: false,
  record: null,
  mentions: [],
  ...overrides,
});

const summary = (overrides: Partial<IllnessSummary> = {}): IllnessSummary => ({
  windowFrom: "2025-10-04",
  windowTo: "2026-10-04",
  ageYears: 1,
  ageBand: "1-3",
  counts: { ari: 1, otitis: 0, intestinal: 0, episodes: 3, hospitalizations: 0 },
  frequentIll: { threshold: 6, isFrequent: false },
  sources: { visits: 4, archive: 0, manual: 3 },
  ...overrides,
});

describe("даты с точностью", () => {
  it("formats day, month and year precision", () => {
    expect(formatPrecisionDate("2025-03-12", "day")).toBe("12.03.2025");
    expect(formatPrecisionDate("2025-03-01", "month")).toBe("03.2025");
    expect(formatPrecisionDate("2025-01-01", "year")).toBe("2025");
    expect(formatPrecisionDate(null, "day")).toBe("");
  });

  it("normalizes the date to the first day of the month or year", () => {
    expect(normalizePrecisionDate("2025-04-17", "month")).toBe("2025-04-01");
    expect(normalizePrecisionDate("2025-04-17", "year")).toBe("2025-01-01");
    expect(normalizePrecisionDate("2025-04-17", "day")).toBe("2025-04-17");
    expect(normalizePrecisionDate(null, "year")).toBeNull();
  });

  it("checks birth and future with the same precision", () => {
    // Родилась 26.03.2025: «03.2025» — не раньше рождения, «25.03.2025» — раньше.
    expect(precisionDateError("2025-03-01", "month", "2025-03-26", TODAY)).toBeNull();
    expect(precisionDateError("2025-03-25", "day", "2025-03-26", TODAY)).toBe("Дата раньше рождения");
    expect(precisionDateError("2024-01-01", "year", "2025-03-26", TODAY)).toBe("Дата раньше рождения");
    expect(precisionDateError("2026-10-01", "month", "2025-03-26", TODAY)).toBeNull();
    expect(precisionDateError("2026-10-05", "day", null, TODAY)).toBe("Дата ещё не наступила");
    expect(precisionDateError("2027-01-01", "year", null, TODAY)).toBe("Дата ещё не наступила");
  });
});

describe("лента по годам", () => {
  const history: Pick<IllnessHistory, "episodes" | "hospitalizations" | "infections"> = {
    episodes: [
      episode({ key: "v1", startedOn: "2026-06-10", endedOn: "2026-06-10", counter: null, diagnoses: [{ code: "H52.0", title: "Гиперметропия" }] }),
      episode({ key: "m9", source: "manual", startedOn: "2026-01-01", endedOn: "2026-01-01", datePrecision: "year", visits: [], visitsCount: 0 }),
      episode({ key: "v2", startedOn: "2026-03-17", endedOn: "2026-03-17", counter: null, diagnoses: [{ code: "D50.9", title: "Анемия" }] }),
      episode({ key: "v3", startedOn: "2025-12-12", endedOn: "2025-12-12" }),
      episode({ key: "m1", source: "manual", startedOn: "2025-04-01", endedOn: "2025-04-01", datePrecision: "month", visits: [], visitsCount: 0 }),
    ],
    hospitalizations: [stay()],
    infections: [
      infection({ infection: "roseola", name: "Внезапная экзантема (розеола)", status: "had", record: record() }),
      // Видна в приёмах — отдельной строкой не дублируется.
      infection({ status: "had", record: record({ infection: "varicella" }), mentions: [{ on: "2025-06-01", code: "B01", title: "Ветряная оспа", conclusionId: 5, legacyConclusionId: null }] }),
      infection({ infection: "measles", name: "Корь", status: "not_had", record: record({ infection: "measles", status: "not_had", occurredOn: null }) }),
    ],
  };

  it("puts newest first and year-only records at the end of their year", () => {
    const groups = groupRibbonByYear(ribbonItems(history, "all"));
    expect(groups.map((group) => group.year)).toEqual([2026, 2025]);
    expect(groups[0].items.map((item) => item.key)).toEqual(["e-v1", "e-v2", "i-roseola", "e-m9"]);
    expect(groups[1].items.map((item) => item.key)).toEqual(["e-v3", "h-3", "e-m1"]);
    expect(yearCaption(groups[1])).toBe("2 случая · стационар 1");
  });

  it("shows only episodes on the «Перенесённые» tab and undated marks at the very end", () => {
    expect(ribbonItems(history, "episodes").every((item) => item.kind === "episode")).toBe(true);
    const undated = groupRibbonByYear(
      ribbonItems({ ...history, infections: [infection({ infection: "mumps", status: "had", record: record({ infection: "mumps", occurredOn: null }) })] }),
    );
    expect(undated[undated.length - 1]).toMatchObject({ year: null, cases: 1 });
  });

  it("shows the first rows of a long ribbon and keeps year totals", () => {
    const groups = groupRibbonByYear(ribbonItems(history, "all"));
    const page = limitRibbon(groups, 5);
    expect(page.groups.map((group) => group.items.length)).toEqual([4, 1]);
    expect(page.hidden).toBe(2);
    expect(yearCaption(page.groups[1])).toBe("2 случая · стационар 1");
    expect(limitRibbon(groups, 4)).toMatchObject({ hidden: 3 });
    expect(limitRibbon(groups, 4).groups).toHaveLength(1);
    expect(limitRibbon(groups, 100).hidden).toBe(0);
  });

  it("counts tabs: current chronic, all episodes, stays, «болела»", () => {
    const chronic = [{ status: "active" }, { status: "remission" }, { status: "resolved" }] as IllnessHistory["chronic"];
    expect(illnessTabCounts({ ...history, chronic })).toEqual({ chronic: 2, past: 5, hospitalizations: 1, infections: 2 });
  });
});

describe("за 12 месяцев и «часто болеющий»", () => {
  it("writes the counter with the threshold and without it", () => {
    expect(ariCounterText(summary())).toBe("ОРЗ 1 из 6");
    expect(ariCounterText(summary({ frequentIll: null, ageBand: null }))).toBe("ОРЗ 1");
    expect(summaryTitle(summary())).toBe("За 12 месяцев · возраст 1–3 года");
    expect(summaryTitle(summary({ ageBand: null }))).toBe("За 12 месяцев");
  });

  it("shows the hint only when the threshold is reached", () => {
    expect(frequentIllText(summary())).toBeNull();
    expect(frequentIllText(summary({ counts: { ari: 6, otitis: 0, intestinal: 0, episodes: 6, hospitalizations: 0 }, frequentIll: { threshold: 6, isFrequent: true } }))).toBe(
      "Похоже на часто болеющего ребёнка: 6 ОРЗ за 12 месяцев, порог для 1–3 лет — 6. Решает врач.",
    );
    expect(
      frequentIllText(summary({ ageBand: "0", counts: { ari: 4, otitis: 0, intestinal: 0, episodes: 4, hospitalizations: 0 }, frequentIll: { threshold: 4, isFrequent: true } })),
    ).toContain("порог для детей до 1 года — 4");
    expect(frequentIllText(summary({ ageBand: null, frequentIll: null }))).toBeNull();
  });

  it("names the sources of the history", () => {
    expect(sourcesLine({ visits: 4, archive: 0, manual: 3 })).toBe("Из 4 приёмов и 3 записей вручную");
    expect(sourcesLine({ visits: 4, archive: 2, manual: 3 })).toBe("Из 4 приёмов, 2 архивных заключений и 3 записей вручную");
    expect(sourcesLine({ visits: 21, archive: 1, manual: 0 })).toBe("Из 21 приёма и 1 архивного заключения");
    expect(sourcesLine({ visits: 0, archive: 0, manual: 1 })).toBe("Из 1 записи вручную");
  });

  it("buckets episodes by start month; year-only ones are not counted", () => {
    const months = episodesByMonth(
      [
        episode({ startedOn: "2026-10-01" }),
        episode({ startedOn: "2026-10-03", counter: "otitis" }),
        episode({ startedOn: "2026-03-01", datePrecision: "month", counter: null }),
        episode({ startedOn: "2026-01-01", datePrecision: "year" }),
        episode({ startedOn: "2025-10-20" }),
      ],
      TODAY,
    );
    expect(months).toHaveLength(12);
    expect(months[0].key).toBe("2025-11");
    expect(months[11]).toMatchObject({ key: "2026-10", total: 2, counts: { ari: 1, otitis: 1, intestinal: 0, other: 0 } });
    expect(months.find((month) => month.key === "2026-03")?.counts.other).toBe(1);
    expect(months.reduce((sum, month) => sum + month.total, 0)).toBe(3);
  });
});

describe("подписи случая", () => {
  it("writes the date of a single visit, a range and rough dates", () => {
    expect(episodeWhen(episode({ startedOn: "2026-09-12", endedOn: "2026-09-12" }))).toBe("12.09");
    expect(episodeWhen(episode({ startedOn: "2026-02-04", endedOn: "2026-02-09" }))).toBe("04.02–09.02");
    expect(episodeWhen(episode({ startedOn: "2026-02-04", endedOn: "2026-02-09" }), true)).toBe("04.02–09.02.2026");
    expect(episodeWhen(episode({ startedOn: "2025-12-28", endedOn: "2026-01-05" }))).toBe("28.12.2025–05.01.2026");
    expect(episodeWhen(episode({ startedOn: "2025-04-01", datePrecision: "month" }))).toBe("04.2025");
    expect(episodeWhen(episode({ startedOn: "2025-01-01", datePrecision: "year" }))).toBe("2025");
  });

  it("writes the child's age at the start, not for year-only dates", () => {
    expect(episodeAge(episode({ startedOn: "2026-06-26" }), "2025-03-26")).toBe("1 год 3 мес.");
    expect(episodeAge(episode({ startedOn: "2025-01-01", datePrecision: "year" }), "2024-03-26")).toBe("");
    // «04.2025» у родившейся 26.03.2025 — и 6 дней, и 5 недель: возраст не угадываем.
    expect(episodeAge(episode({ startedOn: "2025-04-01", datePrecision: "month" }), "2025-03-26")).toBe("");
    expect(precisionAge("2025-11-01", "month", "2025-03-26")).toBe("7 мес.");
    expect(precisionAge("2025-11-14", "day", null)).toBe("");
  });

  it("joins diagnoses with an arrow and lowercases the following ones", () => {
    const chain = episode({
      diagnoses: [
        { code: "J06.9", title: "ОРВИ" },
        { code: "J20.9", title: "Острый бронхит" },
      ],
    });
    expect(episodeTitleText(chain)).toBe("ОРВИ J06.9 → острый бронхит J20.9");
    expect(lowerFirst("ЛОР")).toBe("ЛОР");
    expect(lowerFirst("ЦСМ по месту жительства")).toBe("ЦСМ по месту жительства");
    expect(lowerFirst("Педиатр")).toBe("педиатр");
    expect(lowerFirst("В роддоме")).toBe("в роддоме");
  });

  it("counts visits with specialties, falling back to doctors", () => {
    expect(visitsCaption(episode({ visitsCount: 2, visits: [visit("2026-02-04"), visit("2026-02-09", { specialty: "Педиатр, ЛОР" })] }))).toBe(
      "2 приёма · педиатр, ЛОР",
    );
    expect(visitsCaption(episode({ visits: [visit("2026-02-04", { specialty: "" })] }))).toBe("1 приём · Аббасова Айгерим");
    expect(
      visitsCaption(episode({ source: "archive", visitsCount: 1, visits: [visit("2026-02-04", { specialty: "", doctor: null, doctorName: "Иванова" })] })),
    ).toBe("1 запись архива · Иванова");
    expect(visitsCaption(episode({ source: "manual", visits: [] }))).toBe("");
  });

  it("writes medication courses", () => {
    expect(medicationCaption({ drug: "Амоксициллин", days: 7 })).toBe("амоксициллин 7 дн.");
    expect(medicationCaption({ drug: "Азитромицин", days: null })).toBe("азитромицин");
    expect(medicationsCaption([{ drug: "Амоксициллин", days: 7 }])).toBe("амоксициллин 7 дн. — в «Препаратах»");
    expect(medicationsCaption([])).toBe("");
  });

  it("writes hospital stays and documents", () => {
    expect(stayPeriod(stay())).toBe("14–15.11.2025");
    expect(stayPeriod(stay(), false)).toBe("14–15.11");
    expect(stayPeriod(stay({ admittedOn: "2025-10-28", dischargedOn: "2025-11-02" }))).toBe("28.10–02.11.2025");
    expect(stayPeriod(stay({ dischargedOn: null }))).toBe("с 14.11.2025, не выписан");
    expect(attachmentsCaption([{ kind: "discharge" }, { kind: "image" }, { kind: "image" }])).toBe("выписка, снимки (3)");
    expect(attachmentsCaption([{ kind: "image" }, { kind: "discharge" }])).toBe("выписка, снимок (2)");
    expect(attachmentsCaption([{ kind: "discharge" }])).toBe("выписка");
    expect(stayDocsCaption([{ kind: "discharge" }])).toBe("выписка приложена");
    expect(stayDocsCaption([{ kind: "other" }, { kind: "other" }])).toBe("документы (2)");
    expect(chronicStatText({ conditionId: 1, visitsLast12Months: 2, lastVisitOn: "2026-03-17" })).toBe(
      "приёмов за 12 мес.: 2, последний — 17.03.2026",
    );
  });
});

describe("детские инфекции", () => {
  const roseola = infection({ infection: "roseola", name: "Внезапная экзантема (розеола)", status: "had", record: record() });
  const varicellaNo = infection({ status: "not_had", record: record({ infection: "varicella", status: "not_had", occurredOn: null }) });
  const mention = { on: "2025-03-12", code: "B01", title: "Ветряная оспа", conclusionId: 5, legacyConclusionId: null };

  it("writes the result by the child's sex", () => {
    expect(infectionStatusText(roseola, "female")).toBe("болела 01.2026, со слов родителей");
    expect(infectionStatusText(varicellaNo, "male")).toBe("не болел, со слов родителей");
    expect(infectionStatusText(infection({ status: "had", derived: true, mentions: [mention] }), "unknown")).toBe("болел(а) — из приёма 12.03.2025");
    expect(infectionStatusText(infection())).toBe("нет сведений");
    expect(infectionRibbonText(roseola)).toBe("Розеола, 01.2026, со слов родителей");
  });

  it("gives vaccination hints only where the table has them", () => {
    expect(infectionVaccineHint({ infection: "varicella", status: "had" })).toBe("Прививка от ветряной оспы, скорее всего, не нужна. Решает врач.");
    expect(infectionVaccineHint({ infection: "varicella", status: "not_had" }, "female")).toBe(
      "Не болела — от ветряной оспы защищает только прививка. Обсудите с родителями.",
    );
    expect(infectionVaccineHint({ infection: "rubella", status: "had" })).toContain("КПК");
    expect(infectionVaccineHint({ infection: "rubella", status: "not_had" })).toBeNull();
    expect(infectionVaccineHint({ infection: "roseola", status: "had" })).toBeNull();
  });

  it("warns when «не болела» contradicts a diagnosis in visits", () => {
    expect(infectionConflictText({ ...varicellaNo, conflict: true, mentions: [mention] }, "female")).toBe(
      "В приёме 12.03.2025 диагноз «Ветряная оспа», а отмечено «не болела» — проверьте.",
    );
    expect(infectionConflictText(varicellaNo)).toBeNull();
  });

  it("builds the line above the vaccination calendar", () => {
    const line = vaccinationInfectionsLine([varicellaNo, roseola, infection({ infection: "measles", name: "Корь" })], "female");
    expect(line).toBe("Переболела: розеола (01.2026). Не болела: ветряная оспа.");
    expect(vaccinationInfectionsLine([roseola], "unknown")).toBe("Переболел(а): розеола (01.2026).");
    expect(vaccinationInfectionsLine([infection()], "male")).toBeNull();
  });

  it("prefills the mark from a visit and saves «не болела» in one tap", () => {
    const derived = infection({ status: "had", derived: true, mentions: [{ ...mention, on: "2025-06-01" }, mention] });
    expect(infectionForm(derived, "confirm")).toMatchObject({
      status: "had",
      occurredOn: "2025-03-12",
      datePrecision: "day",
      evidence: "doctor",
      sourceConclusionId: 5,
    });
    expect(notHadQuickPayload(infection())).toEqual({
      infection: "varicella",
      status: "not_had",
      datePrecision: "day",
      notes: "",
      evidence: "parent",
    });
    expect(notHadQuickPayload(roseola)).toMatchObject({ status: "not_had", occurredOn: null, evidence: "parent", sourceConclusionId: null });
    // Дата — только у «болела»; «нет сведений» без «откуда известно».
    expect(infectionPayload({ ...infectionForm(roseola, "edit"), status: "unknown" }, "update")).toMatchObject({ occurredOn: null, evidence: null });
  });
});

describe("ручной ввод: коды и «не вносите ли дважды?»", () => {
  it("reads ICD codes like the server", () => {
    expect(normalizeIcdCode(" j06,9 ")).toBe("J06.9");
    expect(normalizeIcdCode("В01.9*")).toBe("B01.9");
    expect(normalizeIcdCode("Н66")).toBe("H66");
    expect(normalizeIcdCode("ОРВИ")).toBe("");
  });

  it("groups ARI, otitis and intestinal infections", () => {
    expect(diagnosisGroup("J06.9", "")).toBe("ari");
    expect(diagnosisGroup("J20.9", "")).toBe("ari");
    expect(diagnosisGroup("J30.1", "")).toBe("J30");
    expect(diagnosisGroup("H66.9", "")).toBe("otitis");
    expect(diagnosisGroup("A09", "")).toBe("intestinal");
    expect(diagnosisGroup("", "Здоров.")).toBe("title:здоров");
  });

  it("finds a visit of the same group within 21 days", () => {
    const visitEpisode = episode({ visits: [visit("2025-12-12")] });
    const near = findNearbyEpisode([visitEpisode], { code: "J20.9", title: "Бронхит", date: "2025-12-30", precision: "day" });
    expect(near).toBe(visitEpisode);
    expect(duplicateWarning(visitEpisode, "2025-12-30")).toBe("В приёме 12.12.2025 уже есть ОРВИ — не вносите ли дважды?");
    expect(findNearbyEpisode([visitEpisode], { code: "J06.9", title: "", date: "2026-01-03", precision: "day" })).toBeNull();
    expect(findNearbyEpisode([visitEpisode], { code: "J06.9", title: "", date: "2025-12-01", precision: "month" })).toBe(visitEpisode);
    expect(findNearbyEpisode([visitEpisode], { code: "J06.9", title: "", date: "2025-01-01", precision: "year" })).toBeNull();
    expect(findNearbyEpisode([visitEpisode], { code: "H66.9", title: "", date: "2025-12-12", precision: "day" })).toBeNull();
  });
});
