import type { RateContext, RateSubmit } from "../../api/reviews";

export interface RateForm {
  rating: number | null;
  doctorRating: number | null;
  registryRating: number | null;
  tags: string[];
  comment: string;
}

export function initialForm(ctx: RateContext): RateForm {
  return {
    rating: ctx.rating,
    doctorRating: ctx.doctorRating,
    registryRating: ctx.registryRating,
    tags: ctx.tags ?? [],
    comment: ctx.comment ?? "",
  };
}

/** Набор тегов зависит от общей оценки: 5 — «понравилось», меньше — «не так». */
export function tagOptions(ctx: RateContext, rating: number | null): string[] {
  if (rating == null) return [];
  return rating === 5 ? ctx.positiveTags : ctx.negativeTags;
}

export function canSubmit(form: RateForm): boolean {
  return form.rating != null && form.rating >= 1 && form.rating <= 5;
}

export function toSubmit(ctx: RateContext, form: RateForm): RateSubmit {
  const allowed = new Set(tagOptions(ctx, form.rating));
  return {
    rating: form.rating ?? 0,
    doctorRating: ctx.hasDoctor ? form.doctorRating : null,
    registryRating: form.registryRating,
    tags: form.tags.filter((t) => allowed.has(t)),
    comment: form.comment.trim(),
  };
}
