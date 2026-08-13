import React from "react";

import {
  detectPlatform,
  getInstallPromptVersion,
  hasDeferredPrompt,
  isAppInstalled,
  isStandaloneDisplay,
  promptInstall,
  subscribeInstallPrompt,
  type InstallPlatform,
} from "./installPrompt";

/**
 * Состояние установки приложения для кнопки «Добавить на главный экран».
 *
 * `mode`:
 *  - `hidden` — приложение уже установлено или открыто с домашнего экрана;
 *  - `prompt` — браузер дал приглашение, установка в один клик;
 *  - `manual` — приглашения нет (Safari на iOS, Firefox и т.п.), остаётся
 *    показать инструкцию для конкретной платформы.
 */
export type InstallMode = "hidden" | "prompt" | "manual";

export interface InstallPromptState {
  mode: InstallMode;
  platform: InstallPlatform;
  /**
   * Запустить установку. Возвращает `true`, если системный диалог показан и
   * пользователь согласился; `false` — если диалога нет и нужна инструкция.
   */
  install: () => Promise<boolean>;
}

export function useInstallPrompt(): InstallPromptState {
  const version = React.useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPromptVersion,
    () => 0,
  );

  // Установка «с домашнего экрана» меняется только при перезапуске окна, но
  // display-mode может переключиться и на лету (установка из открытой вкладки).
  const [standalone, setStandalone] = React.useState(isStandaloneDisplay);
  React.useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const onChange = () => setStandalone(isStandaloneDisplay());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const platform = React.useMemo(detectPlatform, []);

  const mode: InstallMode = React.useMemo(() => {
    // version участвует в вычислении: он меняется при получении/сгорании
    // приглашения браузера и при установке приложения.
    void version;
    if (standalone || isAppInstalled()) return "hidden";
    return hasDeferredPrompt() ? "prompt" : "manual";
  }, [version, standalone]);

  return React.useMemo(
    () => ({ mode, platform, install: promptInstall }),
    [mode, platform],
  );
}
