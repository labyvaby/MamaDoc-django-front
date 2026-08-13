/**
 * Установка приложения на телефон («Добавить на главный экран»).
 *
 * Браузер решает сам, показывать ли установку: Chrome/Edge присылают событие
 * `beforeinstallprompt`, мы его перехватываем и показываем системный диалог по
 * кнопке в интерфейсе. Safari на iOS такого события не знает — там установка
 * возможна только руками через меню «Поделиться», поэтому для него (и для
 * прочих браузеров без события) остаётся режим с инструкцией.
 *
 * Событие прилетает один раз и очень рано — раньше, чем смонтируется любая
 * страница, — поэтому ловим его на уровне модуля из `src/index.tsx`, а не в
 * компоненте: иначе кнопка «Установить» появлялась бы через раз.
 */

/** Событие Chrome; в стандартных типах DOM его нет. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialized = false;

/** Версия состояния: снимок для `useSyncExternalStore` должен быть стабильным. */
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallPromptVersion(): number {
  return version;
}

/** Приложение уже открыто как установленное — предлагать установку незачем. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  // `navigator.standalone` — способ iOS, `display-mode` — все остальные.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    Boolean(iosStandalone) ||
    ["standalone", "minimal-ui", "fullscreen"].some(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    )
  );
}

export type InstallPlatform = "ios" | "android" | "desktop";

export function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS 13+ представляется Macintosh — отличаем по тач-экрану.
  const isIpad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || isIpad) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/**
 * Встроенный браузер приложения, из которого открыли ссылку (Instagram,
 * Facebook, TikTok и т.п.), — или `null`, если это обычный браузер.
 *
 * Для витрины это не мелочь: ссылку на запись присылают в мессенджере, и на
 * iPhone она открывается во встроенном браузере, где пункта «На экран „Домой“»
 * нет вообще. Без шага «откройте в Safari» инструкция по установке заводит
 * пациента в тупик.
 *
 * ⚠ Ловим только браузеры со своей меткой в user-agent. WhatsApp и Telegram на
 * iOS открывают ссылки через системный `SFSafariViewController` — он
 * представляется обычным Safari, и отличить его надёжно нельзя. Поэтому в
 * инструкции для iPhone предупреждение про Safari показываем всегда.
 */
export function detectInAppBrowser(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/TikTok|BytedanceWebview|musical_ly/i.test(ua)) return "TikTok";
  if (/MicroMessenger/i.test(ua)) return "WeChat";
  if (/\bVKAndroidApp|VKClient/i.test(ua)) return "VK";
  if (/\bLine\//i.test(ua)) return "LINE";
  return null;
}

/**
 * Перехват события установки. Вызывается один раз при старте приложения — до
 * того, как отрисуется React.
 */
export function initInstallPrompt(): void {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    // Без preventDefault Chrome покажет собственную мини-плашку и события у
    // нас не останется — кнопка в интерфейсе работать не будет.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    installed = false;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

/** Есть ли перехваченное приглашение браузера. */
export function hasDeferredPrompt(): boolean {
  return deferredPrompt !== null;
}

export function isAppInstalled(): boolean {
  return installed;
}

/**
 * Показать системный диалог установки.
 * Возвращает `true`, если пользователь согласился.
 *
 * Приглашение одноразовое: после показа событие сгорает независимо от ответа,
 * повторное придёт от браузера само (обычно на следующем визите).
 */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  emit();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === "accepted";
  } catch {
    return false;
  }
}

/**
 * Регистрация service worker'а — без него Chrome не считает сайт устанавливаемым
 * (см. `public/sw.js`).
 *
 * В разработке worker не нужен и мешает: он переживает перезапуск dev-сервера и
 * может отдавать заглушку офлайна вместо страницы. Поэтому в dev-режиме, наоборот,
 * снимаем регистрацию, если она осталась от прода на том же домене.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  if (import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((r) => r.unregister()))
      .catch(() => {
        /* не критично */
      });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Регистрация не удалась (например, http без TLS) — сайт продолжает
      // работать, просто без предложения установки.
    });
  });
}
