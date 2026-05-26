import { createClient } from "@supabase/supabase-js";
import { IS_DJANGO_BACKEND } from "../config/backend";

// Получение переменных окружения
const url = import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "django-backend-placeholder-key";

// Строгая проверка наличия ключей
if (!IS_DJANGO_BACKEND && (!url || !key)) {
  throw new Error("Missing Supabase environment variables: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(url, key);

// Глобальный слушатель событий авторизации (как советовал пользователь)
supabase.auth.onAuthStateChange(async (event) => {
  if (IS_DJANGO_BACKEND) return;

  if (event === "PASSWORD_RECOVERY") {
    console.log("Supabase Client: PASSWORD_RECOVERY event detected, force redirecting...");
    const recoveryUrl = window.location.origin + "/update-password" + window.location.hash;
    if (!window.location.pathname.includes("update-password")) {
      window.location.href = recoveryUrl;
    }
  }
});
