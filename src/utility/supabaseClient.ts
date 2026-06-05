import { createClient } from "@supabase/supabase-js";
import { IS_DJANGO_BACKEND } from "../config/backend";

// Получение переменных окружения
const disabledSupabaseUrl =
  typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin;
const url = IS_DJANGO_BACKEND
  ? disabledSupabaseUrl
  : import.meta.env.VITE_SUPABASE_URL;
const key = IS_DJANGO_BACKEND
  ? "disabled-in-django-mode"
  : import.meta.env.VITE_SUPABASE_ANON_KEY;

// Строгая проверка наличия ключей
if (!IS_DJANGO_BACKEND && (!url || !key)) {
  throw new Error("Missing Supabase environment variables: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(url, key, {
  // В Django-mode полностью отключаем Realtime WebSocket соединение
  realtime: IS_DJANGO_BACKEND ? { params: { eventsPerSecond: 0 } } : undefined,
});

// Глобальный слушатель событий авторизации — только в Supabase-mode
if (!IS_DJANGO_BACKEND) {
  supabase.auth.onAuthStateChange(async (event) => {
    if (event === "PASSWORD_RECOVERY") {
      console.log("Supabase Client: PASSWORD_RECOVERY event detected, force redirecting...");
      const recoveryUrl = window.location.origin + "/update-password" + window.location.hash;
      if (!window.location.pathname.includes("update-password")) {
        window.location.href = recoveryUrl;
      }
    }
  });
}
