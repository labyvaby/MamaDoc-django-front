import { describe, expect, it } from "vitest";

import {
  MILESTONES,
  WHO_MILESTONES,
  buildPicture,
  evaluateMilestones,
  inWindow,
  lateMilestones,
  lateText,
  milestoneDef,
  monthChoices,
  normAchievedLevel,
  normHint,
  normPendingLevel,
  readMarks,
  speechFlags,
  stateText,
  stoodBeforeSat,
  whoAchievedLevel,
  whoPendingLevel,
  type MarkSource,
  type MilestoneMark,
  type NormMilestone,
  type WhoMilestone,
} from "./neuroMilestones";
import { sinceDate } from "./neuroNorms";

const BIRTH = "2025-03-26";
const ages = { birthDate: BIRTH, gestation: null };
const walks = milestoneDef("walks_alone") as WhoMilestone;
const words = milestoneDef("first_words") as NormMilestone;

let nextId = 1;
const yes = (months: number | null, reported = true): MilestoneMark => ({
  state: "yes",
  since: months == null ? null : sinceDate(BIRTH, months),
  reported,
});
const no: MilestoneMark = { state: "no", since: null, reported: true };
const source = (at: string, marks: Record<string, MilestoneMark>, createdAt = at): MarkSource => ({ recordId: nextId++, at, createdAt, marks });

describe("вехи ВОЗ", () => {
  it("освоена — по возрасту на дату освоения, границы включительно", () => {
    expect(whoAchievedLevel(walks, 14.4)).toMatchObject({ level: "ok", late: false });
    expect(whoAchievedLevel(walks, 14.5)).toMatchObject({ level: "warn", late: true, note: "позже, чем у 90 % детей" });
    expect(whoAchievedLevel(walks, 17.6)).toMatchObject({ level: "warn", late: true });
    expect(whoAchievedLevel(walks, 17.7)).toMatchObject({ level: "bad", late: true, note: "позже, чем у 99 % детей" });
    expect(whoAchievedLevel(walks, 8)).toMatchObject({ level: "ok", note: "раньше 99 % детей — проверьте дату" });
  });

  it("не освоена — по сегодняшнему возрасту", () => {
    expect(whoPendingLevel(walks, 14.4)).toBe("unknown");
    expect(whoPendingLevel(walks, 14.5)).toBe("warn");
    expect(whoPendingLevel(walks, 17.6)).toBe("warn");
    expect(whoPendingLevel(walks, 17.7)).toBe("bad");
  });

  it("кнопка «с 15 мес» у девочки 2025-03-26 — жёлтая точка, без сигнала", () => {
    const views = evaluateMilestones(buildPicture([source("2026-07-01T04:00:00Z", { walks_alone: yes(15) })]), ages, "2026-10-04");
    const view = views.get("walks_alone");
    expect(view).toMatchObject({ state: "yes", level: "warn", late: true, signal: false });
    expect(stateText(view!, BIRTH, "female")).toBe("с 15 мес");
    expect(lateText(view!, BIRTH, "female")).toBe("Ходит сама — с 15 мес: позже, чем 90 % детей (окно ВОЗ — до 17,6 мес)");
    expect(lateMilestones(views).map((item) => item.def.code)).toEqual(["walks_alone"]);
  });

  it("«не помню»: освоена не позже даты записи — норма, если тогда возраст не больше Ц90", () => {
    const early = evaluateMilestones(buildPicture([source("2026-04-12", { walks_alone: yes(null) })]), ages, "2026-10-04");
    expect(early.get("walks_alone")).toMatchObject({ state: "yes", level: "ok" });
    const late = evaluateMilestones(buildPicture([source("2026-07-01", { walks_alone: yes(null) })]), ages, "2026-10-04");
    expect(late.get("walks_alone")).toMatchObject({ state: "yes", level: "unknown", note: "уточните, с какого возраста" });
    expect(stateText(late.get("walks_alone")!, BIRTH, "female")).toBe("не позже 15 мес");
  });

  it("ползание: не ползает, но ходит — вариант нормы, без сигнала", () => {
    const views = evaluateMilestones(
      buildPicture([source("2026-07-01", { crawls: no, walks_support: yes(10), walks_alone: yes(13) })]),
      ages,
      "2026-10-04",
    );
    expect(views.get("crawls")).toMatchObject({ state: "variant", level: "unknown", signal: false });
    expect(stateText(views.get("crawls")!, BIRTH, "female")).toBe("не ползала, сразу начала ходить — вариант нормы");
  });

  it("«не ползал, сразу пошёл» отмечено кнопкой — вариант нормы", () => {
    const views = evaluateMilestones(buildPicture([source("2026-07-01", { crawls: { state: "skipped", since: null, reported: true } })]), ages, "2026-10-04");
    expect(views.get("crawls")).toMatchObject({ state: "variant", level: "unknown", signal: false });
  });

  it("«встал раньше, чем сел»", () => {
    const views = evaluateMilestones(buildPicture([source("2025-12-01", { sits: yes(7), stands_support: yes(6.5) })]), ages, "2025-12-01");
    expect(stoodBeforeSat(views)).toMatchObject({ sitAge: expect.any(Number), standAge: expect.any(Number) });
    const normal = evaluateMilestones(buildPicture([source("2025-12-01", { sits: yes(6), stands_support: yes(7.5) })]), ages, "2025-12-01");
    expect(stoodBeforeSat(normal)).toBeNull();
    const notYet = evaluateMilestones(buildPicture([source("2025-12-01", { sits: no, stands_support: yes(7.5) })]), ages, "2025-12-01");
    expect(stoodBeforeSat(notYet)).toMatchObject({ sitAge: null });
  });
});

describe("остальные вехи", () => {
  it("«жёлтый с» и «красный с» — для неосвоенной", () => {
    expect(normPendingLevel(words, 14.9)).toBe("unknown");
    expect(normPendingLevel(words, 15)).toBe("warn");
    expect(normPendingLevel(words, 16)).toBe("bad");
    const stairs = milestoneDef("stairs") as NormMilestone;
    expect(normPendingLevel(stairs, 48)).toBe("warn");
    expect(normPendingLevel(stairs, 70)).toBe("warn");
  });

  it("освоена позже «жёлтого» — жёлтая точка, позже «красного» — красная", () => {
    expect(normAchievedLevel(words, 15)).toMatchObject({ level: "ok", late: false });
    expect(normAchievedLevel(words, 15.5)).toMatchObject({ level: "warn", late: true });
    expect(normAchievedLevel(words, 16.5)).toMatchObject({ level: "bad", late: true });
  });

  it("подсказка нормы", () => {
    expect(normHint(walks)).toBe("ВОЗ: половина детей — к 12,0 мес, 90 % — к 14,4, 99 % — к 17,6");
    expect(normHint(words)).toContain("обычно 10–12 мес");
  });
});

describe("картина вех", () => {
  it("решает последняя отметка, при равной дате — более поздняя по созданию", () => {
    const picture = buildPicture([
      source("2026-07-01", { walks_alone: yes(15) }),
      source("2026-04-12", { walks_alone: no }),
      source("2026-08-01T10:00:00Z", { first_words: no }, "2026-08-01T10:00:00Z"),
      source("2026-08-01T10:00:00Z", { first_words: yes(12) }, "2026-08-01T10:05:00Z"),
    ]);
    expect(picture.get("walks_alone")?.mark.state).toBe("yes");
    expect(picture.get("first_words")?.mark.state).toBe("yes");
  });

  it("«ошибка в отметке» — снова «ещё нет», цвет по сегодняшнему возрасту", () => {
    const views = evaluateMilestones(
      buildPicture([source("2026-04-12", { understands: yes(12) }), source("2026-10-01", { understands: no })]),
      ages,
      "2026-10-04",
    );
    expect(views.get("understands")).toMatchObject({ state: "no", level: "warn", signal: true });
  });

  it("«утрачен» — регресс, срочно, пока снова не отметят «есть»", () => {
    const lost: MilestoneMark = { state: "lost", since: null, reported: false };
    const views = evaluateMilestones(buildPicture([source("2026-04-12", { first_words: yes(12) }), source("2026-10-01", { first_words: lost })]), ages, "2026-10-04");
    expect(views.get("first_words")).toMatchObject({ state: "lost", level: "urgent", signal: true });
    expect(buildPicture([source("2026-04-12", { first_words: yes(12) }), source("2026-10-01", { first_words: lost })]).get("first_words")?.lastYes?.since).toBe(
      sinceDate(BIRTH, 12),
    );
    const back = evaluateMilestones(
      buildPicture([source("2026-04-12", { first_words: yes(12) }), source("2026-09-01", { first_words: lost }), source("2026-10-01", { first_words: yes(12) })]),
      ages,
      "2026-10-04",
    );
    expect(back.get("first_words")).toMatchObject({ state: "yes", signal: false });
  });

  it("веха без отметки — серая, без сигнала", () => {
    const views = evaluateMilestones(buildPicture([]), ages, "2026-10-04");
    expect(views.get("walks_alone")).toMatchObject({ state: "none", level: "unknown", signal: false, note: "нет отметки" });
    expect(views.size).toBe(MILESTONES.length);
  });

  it("без даты рождения цвета нет, но регресс — всё равно срочно", () => {
    const noBirth = { birthDate: null, gestation: null };
    const views = evaluateMilestones(
      buildPicture([source("2026-07-01", { walks_alone: { state: "yes", since: null, reported: true }, first_words: { state: "lost", since: null, reported: true } })]),
      noBirth,
      "2026-10-04",
    );
    expect(views.get("walks_alone")?.level).toBe("unknown");
    expect(views.get("first_words")?.level).toBe("urgent");
  });

  it("отметки из data: мусор пропускается, дата только у «есть»", () => {
    expect(
      readMarks({
        sits: { state: "yes", since: "2025-09-26", reported: true },
        crawls: { state: "no", since: "2025-09-26" },
        junk: { state: "maybe" },
        broken: "yes",
      }),
    ).toEqual({
      sits: { state: "yes", since: "2025-09-26", reported: true },
      crawls: { state: "no", since: null, reported: false },
    });
  });
});

describe("окно вехи и кнопки месяцев", () => {
  it("окно: от Ц1 до Ц99 + 6 мес; от «обычно» − 2 до «красного» + 6", () => {
    expect(inWindow(walks, 8)).toBe(false);
    expect(inWindow(walks, 8.2)).toBe(true);
    expect(inWindow(walks, 23.6)).toBe(true);
    expect(inWindow(walks, 23.7)).toBe(false);
    expect(inWindow(words, 8)).toBe(true);
    expect(inWindow(words, 22)).toBe(true);
    expect(inWindow(words, 22.1)).toBe(false);
  });

  it("до года — полмесяца, дальше — месяц", () => {
    expect(monthChoices(walks, 15)).toEqual([8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14, 15]);
  });

  it("после 3 лет — шаг три месяца", () => {
    const hops = milestoneDef("hops")!;
    expect(monthChoices(hops, 66)).toEqual([60, 63, 66]);
  });

  it("недоношенному граница сдвигается на разницу возрастов", () => {
    expect(monthChoices(walks, 15, 2)[0]).toBe(10.5);
  });
});

describe("каталог вех", () => {
  it("44 вехи, коды уникальны", () => {
    expect(MILESTONES).toHaveLength(44);
    expect(new Set(MILESTONES.map((item) => item.code)).size).toBe(MILESTONES.length);
  });

  it("у каждой вехи ВОЗ Ц1 < Ц50 < Ц90 < Ц99", () => {
    expect(WHO_MILESTONES).toHaveLength(6);
    for (const def of WHO_MILESTONES) {
      expect(def.p1).toBeLessThan(def.p50);
      expect(def.p50).toBeLessThan(def.p90);
      expect(def.p90).toBeLessThan(def.p99);
    }
  });

  it("«жёлтый» не позже «красного», «обычно» не позже «жёлтого»", () => {
    for (const def of MILESTONES) {
      if (def.kind !== "norm") continue;
      if (def.red != null) expect(def.yellow).toBeLessThanOrEqual(def.red);
      expect(def.typical[0]).toBeLessThanOrEqual(def.typical[1]);
      expect(def.typical[0]).toBeLessThanOrEqual(def.yellow);
    }
  });
});

describe("речевые сроки на ленте", () => {
  it("освоено, ждём, срок прошёл, нет отметки", () => {
    const views = evaluateMilestones(
      buildPicture([source("2026-07-01", { babbles: yes(7), gestures: yes(11), first_words: yes(12), phrase2: no })]),
      ages,
      "2026-10-04",
    );
    expect(speechFlags(views, 18.3, BIRTH, "female").map((flag) => [flag.state, flag.note])).toEqual([
      ["done", "лепет с 7 мес"],
      ["done", "слова с 12 мес"],
      ["waiting", "ждём до 24 мес"],
    ]);
    expect(speechFlags(views, 25, BIRTH, "female")[2]).toMatchObject({ state: "late", note: "срок прошёл" });
    const empty = evaluateMilestones(buildPicture([]), ages, "2026-10-04");
    expect(speechFlags(empty, 25, BIRTH, "female")[2]).toMatchObject({ state: "none", note: "нет отметки" });
  });
});
