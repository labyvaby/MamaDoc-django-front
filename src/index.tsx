import React from "react";
import { createRoot } from "react-dom/client";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Bishkek");

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initInstallPrompt, registerServiceWorker } from "./pwa";
import { installStaleBuildRecovery } from "./pwa/staleBuildRecovery";

// A tab that survived a frontend deploy can briefly request an obsolete Vite
// chunk. Reload once to obtain the current index.html and its asset manifest.
installStaleBuildRecovery();

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
