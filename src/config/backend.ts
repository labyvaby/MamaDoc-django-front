export const BACKEND_MODE =
  import.meta.env.VITE_BACKEND_MODE === "django" ? "django" : "supabase";

export const IS_DJANGO_BACKEND = BACKEND_MODE === "django";
