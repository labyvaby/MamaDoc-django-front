import { describe, expect, it } from "vitest";

import type { Condition, Hospitalization, IllnessEpisode, IllnessHistory, Surgery } from "../../../api/health";
import { illnessEntries, surgeriesInput } from "./anamnesisSources";

function episode(part: Partial<IllnessEpisode> & Pick<IllnessEpisode, "startedOn" | "diagnoses">): IllnessEpisode {
  return {
    key: `v-${part.startedOn}`,
    source: "visit",
    counter: null,
    endedOn: part.startedOn,
    datePrecision: "day",
    diagnosisId: null,
    visitsCount: 1,
    visits: [],
    conditionId: null,
    isChronic: false,
    place: "",
    notes: "",
    medications: [],
    ...part,
  };
}

function history(part: Partial<IllnessHistory>): IllnessHistory {
  return {
    patientId: 7233,
    birthDate: "2025-03-26",
    today: "2026-10-04",
    chronic: [],
    chronicStats: [],
    episodes: [],
    hospitalizations: [],
    infections: [],
    summary: {} as IllnessHistory["summary"],
    ...part,
  };
}

const stay = (part: Partial<Hospitalization>): Hospitalization =>
  ({ id: 1, facility: "ГДКБ", admittedOn: "2025-11-14", dischargedOn: null, conditionId: null, ...part }) as Hospitalization;

describe("illnessEntries", () => {
  it("один случай — одна болезнь на рубрику, с датой начала случая", () => {
    const { conditions } = illnessEntries(
      history({
        episodes: [
          episode({
            startedOn: "2025-12-03",
            endedOn: "2025-12-12",
            diagnoses: [
              { code: "J06.9", title: "ОРВИ" },
              { code: "J06.8", title: "Другие ОРВИ" },
              { code: "J20.9", title: "Острый бронхит" },
            ],
          }),
        ],
      }),
    );
    expect(conditions.map((row) => [row.diagnosisCode, row.diagnosedOn])).toEqual([
      ["J06.9", "2025-12-03"],
      ["J20.9", "2025-12-03"],
    ]);
    expect(conditions.every((row) => row.id < 0)).toBe(true);
  });

  it("внесённое вручную сохраняет номер своей строки — к нему привязана госпитализация", () => {
    const { conditions, hospitalizations } = illnessEntries(
      history({
        episodes: [episode({ source: "manual", conditionId: 57, startedOn: "2025-04-01", diagnoses: [{ code: "P59.9", title: "Неонатальная желтуха" }] })],
        hospitalizations: [stay({ conditionId: 57, admittedOn: "2025-04-02" })],
      }),
    );
    expect(conditions[0].id).toBe(57);
    expect(hospitalizations).toEqual([{ conditionId: 57, admittedOn: "2025-04-02" }]);
  });

  it("госпитализация без диагноза — к случаю, в дни которого началась; вне случаев — без связи", () => {
    const { conditions, hospitalizations } = illnessEntries(
      history({
        episodes: [episode({ startedOn: "2025-12-03", endedOn: "2025-12-12", diagnoses: [{ code: "J20.9", title: "Острый бронхит" }] })],
        hospitalizations: [stay({ admittedOn: "2025-12-05" }), stay({ id: 2, admittedOn: "2025-11-14" })],
      }),
    );
    expect(hospitalizations).toEqual([
      { conditionId: conditions[0].id, admittedOn: "2025-12-05" },
      { conditionId: null, admittedOn: "2025-11-14" },
    ]);
  });

  it("хроническое со случаями из приёмов не повторяется, без случаев — по дате установления", () => {
    const anemia = { id: 9, status: "active", diagnosisCode: "D50.9", title: "Железодефицитная анемия", diagnosedOn: "2026-03-10" } as Condition;
    const asthma = { id: 10, status: "active", diagnosisCode: "J45.0", title: "Бронхиальная астма", diagnosedOn: "2026-05-02" } as Condition;
    const wrong = { id: 11, status: "refuted", diagnosisCode: "E10", title: "Ошибка", diagnosedOn: "2026-05-02" } as Condition;
    const { conditions } = illnessEntries(
      history({
        chronic: [anemia, asthma, wrong],
        episodes: [episode({ startedOn: "2026-03-10", conditionId: 9, isChronic: true, diagnoses: [{ code: "D50.9", title: "Железодефицитная анемия" }] })],
      }),
    );
    expect(conditions.map((row) => row.diagnosisCode)).toEqual(["D50.9", "J45.0"]);
    expect(conditions.find((row) => row.diagnosisCode === "J45.0")?.id).toBe(10);
  });

  it("диагноз без кода — по названию без регистра", () => {
    const { conditions } = illnessEntries(
      history({
        episodes: [
          episode({
            startedOn: "2026-01-10",
            diagnoses: [
              { code: "", title: "Ветряная оспа" },
              { code: "", title: "ветряная оспа" },
            ],
          }),
        ],
      }),
    );
    expect(conditions).toHaveLength(1);
  });
});

describe("surgeriesInput", () => {
  it("отметки «не было» из «Семьи и быта»: только false, не отмечено — без отрицания", () => {
    const input = surgeriesInput([], { hadOperations: false, hadInjuries: null, hadTransfusions: true });
    expect([input.noneOperations, input.noneInjuries, input.noneTransfusions]).toEqual([true, false, false]);
  });

  it("записи как есть, без отметок «не было»", () => {
    const rows = [
      { id: 1, kind: "operation", status: "recorded", performedOn: "2025-11-14", title: "Грыжесечение", transfusionProduct: "" },
      { id: 2, kind: "transfusion", status: "refuted", performedOn: "2025-03-28", title: "Заменное переливание крови", transfusionProduct: "exchange" },
    ] as Surgery[];
    expect(surgeriesInput(rows)).toEqual({
      items: [
        { kind: "operation", performedOn: "2025-11-14", title: "Грыжесечение", transfusionProduct: undefined, status: "recorded" },
        { kind: "transfusion", performedOn: "2025-03-28", title: "Заменное переливание крови", transfusionProduct: "exchange", status: "refuted" },
      ],
      noneOperations: false,
      noneInjuries: false,
      noneTransfusions: false,
    });
  });
});
