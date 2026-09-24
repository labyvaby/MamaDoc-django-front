import type {
  PublishConsent,
  RateContext,
  RateSubmit,
} from "../../api/reviews";

export const PUBLIC_NAME_MIN = 2;
export const PUBLIC_NAME_MAX = 40;

export interface RateForm {
  rating: number | null;
  doctorRating: number | null;
  registryRating: number | null;
  tags: string[];
  comment: string;
  publishConsent: PublishConsent;
  publicName: string;
}

export function initialForm(ctx: RateContext): RateForm {
  return {
    rating: ctx.rating,
    doctorRating: ctx.doctorRating,
    registryRating: ctx.registryRating,
    tags: ctx.tags ?? [],
    comment: ctx.comment ?? "",
    publishConsent: ctx.publishConsent ?? "private",
    publicName: ctx.publicName ?? "",
  };
}

/** Набор тегов зависит от общей оценки: 5 — «понравилось», меньше — «не так». */
export function tagOptions(ctx: RateContext, rating: number | null): string[] {
  if (rating == null) return [];
  return rating === 5 ? ctx.positiveTags : ctx.negativeTags;
}

/** Подпись нужна только при публикации «с именем». */
export function publicNameValid(form: RateForm): boolean {
  if (form.publishConsent !== "named") return true;
  const name = form.publicName.trim().replace(/\s+/g, " ");
  return name.length >= PUBLIC_NAME_MIN && name.length <= PUBLIC_NAME_MAX;
}

export function canSubmit(form: RateForm): boolean {
  return (
    form.rating != null &&
    form.rating >= 1 &&
    form.rating <= 5 &&
    publicNameValid(form)
  );
}

/**
 * 5★ отправляется сразу, без вопросов: пациента ведём на карты.
 * Врачу и администратору ставим те же 5 — иначе средние по сотрудникам
 * считались бы только по оценкам ниже пяти. Согласие на публикацию не шлём:
 * остаётся прежним (по умолчанию «не публиковать»).
 */
export function fiveStarSubmit(ctx: RateContext): RateSubmit {
  return {
    rating: 5,
    doctorRating: ctx.hasDoctor ? 5 : null,
    registryRating: 5,
    tags: [],
    comment: "",
  };
}

export function toSubmit(ctx: RateContext, form: RateForm): RateSubmit {
  const allowed = new Set(tagOptions(ctx, form.rating));
  return {
    rating: form.rating ?? 0,
    doctorRating: ctx.hasDoctor ? form.doctorRating : null,
    registryRating: form.registryRating,
    tags: form.tags.filter((t) => allowed.has(t)),
    comment: form.comment.trim(),
    publishConsent: form.publishConsent,
    publicName: form.publishConsent === "named" ? form.publicName.trim() : "",
  };
}
