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

// Dev-only: перехват fetch, чтобы отследить источники частых запросов к Employes
if (import.meta.env.DEV && typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const originalFetch: typeof window.fetch = window.fetch.bind(window);
  const seen = new Map<string, number>();
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (typeof url === 'string' && url.includes('/rest/v1/Employees')) {
        const key = url;
        const count = (seen.get(key) ?? 0) + 1;
        seen.set(key, count);
        // Короткий стек, чтобы увидеть инициатор
        const stack = new Error('stack').stack?.split('\n').slice(2, 8).join('\n');
        console.debug(`[MD FETCH][Employees] #${count} ->`, url, `\nstack:`, stack);
      }
    } catch {/* no-op */ }
    return originalFetch(input, init);
  };
}

import { BrowserRouter } from "react-router";

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
);
