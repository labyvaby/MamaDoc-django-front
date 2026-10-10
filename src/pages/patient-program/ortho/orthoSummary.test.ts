import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import { emptyExamForm, emptyFoot, emptyHips, emptyNeck, emptySpine, type OrthoExamBody } from "./orthoData";
import { scheduleRows } from "./orthoSchedule";
import { examStatus, examSummary, hipSide, hipsStatus, postureStatus, spineStatus } from "./orthoSummary";

const exam = (patch: Partial<OrthoExamBody>): OrthoExamBody => ({ ...emptyExamForm(), ...patch });
const texts = (body: OrthoExamBody, months: number | null, weeks: number | null = null) =>
  examSummary(body, { months, weeks }).map((item) => `${item.status}:${item.text}`);

describe("сводка: суставы", () => {
  it("тип по Графу — подсказка или врача, клинические признаки красные", () => {
    const body = exam({
      hips: {
        ...emptyHips(),
        us: { left: { alpha: 63, beta: 50, type: "" }, right: { alpha: 54, beta: 60, type: "" } },
        ortolani: "R",
      },
    });
    expect(texts(body, 0.9, 4)).toEqual([
      "ok:Левый сустав — Ia",
      "warn:Правый сустав — IIa, незрелый",
      "bad:Соскальзывание (Ортолани) справа",
    ]);
    expect(hipsStatus(body.hips, { months: 0.9, weeks: 4 })).toBe("bad");
  });

  it("тип врача важнее подсказки", () => {
    expect(hipSide("R", { alpha: 58, beta: 60, type: "IIb" }, 4)).toMatchObject({ typeLabel: "IIb", confirmed: true, status: "bad" });
  });

  it("без признаков и УЗИ — «Суставы — норма»", () => {
    expect(texts(exam({ hips: { ...emptyHips(), risks: ["girl"] } }), 1)).toEqual(["ok:Суставы — норма"]);
  });
});

describe("сводка: шея, стопы, пятки, ноги", () => {
  it("кривошея со степенью APTA", () => {
    const body = exam({ neck: { ...emptyNeck(), torticollis: "muscular", side: "R", rotationDiff: 20 } });
    expect(texts(body, 2)).toEqual(["warn:Кривошея мышечная справа, степень 2"]);
  });

  it("физиологичное плоскостопие и вальгус пятки справа", () => {
    const body = exam({ foot: { ...emptyFoot(), arch: { left: "flattened", right: "flattened" }, mobility: "mobile", heel: { left: 6, right: 12 } } });
    expect(texts(body, 72)).toEqual(["ok:Стопы — норма для возраста", "warn:Пятка справа: вальгус 12°"]);
  });

  it("пятки в норме — одним чипом", () => {
    const body = exam({ foot: { ...emptyFoot(), heel: { left: 4, right: 6 } } });
    expect(texts(body, 18)).toEqual(["ok:Пятки — норма (4° и 6°)"]);
  });

  it("находка стопы — красная со стороной", () => {
    const body = exam({ foot: { ...emptyFoot(), findings: [{ code: "clubfoot", side: "L" }] } });
    expect(texts(body, 1)).toEqual(["bad:Косолапость слева"]);
  });

  it("физиологичный варус, разница длины и походка", () => {
    const body = exam({ legs: { axis: "varus", distance: 2, symmetric: true, lengthDiff: { side: "L", cm: 1.5 }, gait: ["inToeing"] } });
    expect(texts(body, 14)).toEqual([
      "ok:Ноги — норма для возраста",
      "warn:Левая нога короче на 1,5 см",
      "warn:Походка: носки внутрь",
    ]);
  });
});

describe("сводка: спина и осанка", () => {
  it("ротация, осанка, карта", () => {
    const body = exam({ spine: { ...emptySpine(), posture: "stooped", card: [5], adams: { result: "rib", side: "R", atr: 5 } } });
    expect(texts(body, 72)).toEqual([
      "warn:Спина: ротация 5°, горб справа",
      "warn:Осанка: сутулая",
      "warn:Карта осанки: «да» на 5",
    ]);
    expect(spineStatus(body.spine)).toBe("warn");
    expect(postureStatus(body.spine)).toBe("warn");
  });

  it("угол Кобба от 40° — нужен хирург", () => {
    const body = exam({ spine: { ...emptySpine(), cobb: 42 } });
    expect(texts(body, 160)).toEqual(["bad:Угол Кобба 42° — нужен хирург"]);
  });
});

describe("красные признаки", () => {
  it("идут первыми и красят весь осмотр", () => {
    const body = exam({ redFlags: ["nightPain"], foot: { ...emptyFoot(), heel: { left: 4, right: 4 } } });
    expect(texts(body, 72)[0]).toBe("bad:Боль ночью или в покое");
    expect(examStatus(body, { months: 72, weeks: null })).toBe("bad");
  });
});

describe("сроки 211н", () => {
  it("пройдено, пропущено, сейчас и впереди", () => {
    const rows = scheduleRows(["2025-04-23T10:00:00Z", "2026-03-27T10:00:00Z"], "2025-03-26", dayjs("2026-10-04"));
    expect(rows.slice(0, 4).map((row) => `${row.key}:${row.state}`)).toEqual(["1m:done", "3m:missed", "12m:done", "6y:upcoming"]);
    const due = scheduleRows([], "2025-03-26", dayjs("2025-07-10"));
    expect(due[1].state).toBe("due");
    expect(scheduleRows([], null)[0].state).toBe("upcoming");
    // Ребёнок пришёл в 5 лет: ранние сроки — «нет данных», а не «пропущено».
    const late = scheduleRows(["2026-04-02T10:00:00Z"], "2020-04-12", dayjs("2026-10-04"));
    expect(late.slice(0, 4).map((row) => row.state)).toEqual(["nodata", "nodata", "nodata", "done"]);
  });
});

describe("динамика", () => {
  it("показатели с двумя точками и порядок от старых к новым", async () => {
    const { orthoTrend } = await import("./orthoTrend");
    const { readExam } = await import("./orthoData");
    const rec = (occurredAt: string, data: Record<string, unknown>) =>
      readExam({ id: 1, title: "", occurredAt, status: "completed", notes: "", data } as never);
    const trend = orthoTrend([
      rec("2026-10-02T10:00:00Z", { orthoKind: "exam", spine: { adams: { result: "rib", side: "R", atr: 5 } } }),
      rec("2026-04-02T10:00:00Z", { orthoKind: "exam", spine: { adams: { result: "rib", side: "R", atr: 3 } } }),
      rec("2025-04-23T10:00:00Z", { orthoKind: "exam", hips: { us: { left: { alpha: 63 }, right: { alpha: 54 } } } }),
    ]);
    expect(trend.metrics).toEqual(["atr"]);
    expect(trend.points.map((point) => point.atr)).toEqual([null, 3, 5]);
  });
});
