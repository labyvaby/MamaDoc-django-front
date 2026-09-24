import { describe, expect, it } from "vitest";
import {
  canSubmit,
  fiveStarSubmit,
  initialForm,
  tagOptions,
  toSubmit,
} from "./rateForm";
import type { RateContext } from "../../api/reviews";

const ctx: RateContext = {
  token: "t",
  status: "sent",
  patientName: "П",
  doctorName: "Д",
  hasDoctor: true,
  clinicName: "К",
  answered: false,
  rating: null,
  doctorRating: null,
  registryRating: null,
  tags: [],
  comment: "",
  publishConsent: "private",
  publicName: "",
  publicationStatus: null,
  positiveTags: ["Быстро"],
  negativeTags: ["Долго"],
  canEdit: true,
  maps: [],
};

describe("rateForm", () => {
  it("предлагает теги по оценке", () => {
    expect(tagOptions(ctx, 5)).toEqual(["Быстро"]);
    expect(tagOptions(ctx, 3)).toEqual(["Долго"]);
    expect(tagOptions(ctx, null)).toEqual([]);
  });

  it("без общей оценки отправить нельзя", () => {
    expect(canSubmit(initialForm(ctx))).toBe(false);
    expect(canSubmit({ ...initialForm(ctx), rating: 4 })).toBe(true);
  });

  it("при смене оценки выбрасывает теги чужого набора", () => {
    const form = { ...initialForm(ctx), rating: 3, tags: ["Долго", "Быстро"] };
    expect(toSubmit(ctx, form).tags).toEqual(["Долго"]);
  });

  it("без врача не шлёт оценку врача", () => {
    const noDoc = { ...ctx, hasDoctor: false };
    const body = toSubmit(noDoc, {
      ...initialForm(noDoc),
      rating: 5,
      doctorRating: 5,
    });
    expect(body.doctorRating).toBeNull();
  });

  it("по умолчанию не публикуем, «с именем» требует подпись", () => {
    const form = { ...initialForm(ctx), rating: 5 };
    expect(toSubmit(ctx, form)).toMatchObject({
      publishConsent: "private",
      publicName: "",
    });
    const named = {
      ...form,
      publishConsent: "named" as const,
      publicName: " ",
    };
    expect(canSubmit(named)).toBe(false);
    expect(canSubmit({ ...named, publicName: "Айгуль" })).toBe(true);
  });

  it("анонимно не отправляет подпись", () => {
    const form = {
      ...initialForm(ctx),
      rating: 4,
      publishConsent: "anonymous" as const,
      publicName: "Айгуль",
    };
    expect(toSubmit(ctx, form)).toMatchObject({
      publishConsent: "anonymous",
      publicName: "",
    });
  });

  it("правка стартует с прежнего ответа", () => {
    const answered = {
      ...ctx,
      answered: true,
      rating: 4,
      tags: ["Долго"],
      comment: "x",
    };
    expect(initialForm(answered)).toMatchObject({
      rating: 4,
      tags: ["Долго"],
      comment: "x",
    });
  });
});

describe("fiveStarSubmit", () => {
  it("5★ уходит без вопросов, врачу и администратору — те же 5", () => {
    expect(fiveStarSubmit(ctx)).toEqual({
      rating: 5,
      doctorRating: 5,
      registryRating: 5,
      tags: [],
      comment: "",
    });
    expect(
      fiveStarSubmit({ ...ctx, hasDoctor: false }).doctorRating
    ).toBeNull();
    expect(fiveStarSubmit(ctx)).not.toHaveProperty("publishConsent");
  });
});
