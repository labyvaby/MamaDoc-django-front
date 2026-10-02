import React from "react";
import { createRoot } from "react-dom/client";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/ru";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Bishkek");
// Русская локаль — один раз на всё приложение. Раньше её включали отдельные
// страницы побочным эффектом импорта; экран, который таких страниц не грузил
// (отель), показывал «We» и «September».
dayjs.locale("ru");

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initInstallPrompt, registerServiceWorker } from "./pwa";
import { installStaleBuildRecovery } from "./pwa/staleBuildRecovery";
import { installMockDemoData } from "./dev/mockDemoData";
import { installRecorder } from "./support/diagnosticsRecorder";

// A tab that survived a frontend deploy can briefly request an obsolete Vite
// chunk. Reload once to obtain the current index.html and its asset manifest.
installStaleBuildRecovery();

// Демо-данные приёмов/расписания на пустой тестовой базе — см. файл. No-op,
// если VITE_MOCK_DEMO_DATA не выставлен в .env.local.
installMockDemoData();
// «Чёрный ящик» для обращений в поддержку: запускаем до рендера, чтобы
// поймать и сбои самой загрузки приложения (см. src/support).
installRecorder();

import { BrowserRouter } from "react-router";

// Установка приложения на телефон. Приглашение браузера приходит раньше, чем
// отрисуется React, поэтому перехватываем его до рендера (см. src/pwa).
initInstallPrompt();
registerServiceWorker();

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
);
