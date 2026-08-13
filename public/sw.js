/*
 * Service worker: нужен только ради установки приложения на телефон
 * («Добавить на главный экран»). Chrome предлагает установку сайту лишь при
 * наличии зарегистрированного service worker с обработчиком fetch — без этого
 * файла событие `beforeinstallprompt` не приходит и кнопка установки в
 * интерфейсе останется мёртвой (см. src/pwa/installPrompt.ts).
 *
 * ⚠ Здесь намеренно НЕТ кэширования. Закэшированный index.html или бандл —
 * самая частая причина «у меня после деплоя старая версия»: worker живёт у
 * пользователя бессрочно и переживает обновления фронта. Поэтому все запросы
 * идут в сеть как обычно, а офлайн получает понятную заглушку вместо системной
 * ошибки браузера. Если когда-нибудь понадобится офлайн-режим, он делается
 * отдельной задачей вместе со стратегией инвалидации.
 */

const OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Нет подключения</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: Inter, system-ui, sans-serif;
        background: #f1f5f9;
        color: #0f172a;
        text-align: center;
        padding: 24px;
      }
      p { color: #64748b; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div>
      <h1>Нет подключения к интернету</h1>
      <p>Проверьте связь и обновите страницу.</p>
    </div>
  </body>
</html>`;

self.addEventListener("install", () => {
  // Новая версия worker'а не должна ждать закрытия всех вкладок.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Перехватываем только переходы по страницам: статика и запросы к API должны
  // вести себя ровно так же, как без worker'а.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(OFFLINE_PAGE, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    ),
  );
});
