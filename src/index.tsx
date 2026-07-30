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

/**
 * Windows display scaling reduces window.innerWidth even when the browser
 * reports 100% zoom. For desktop workstations, compensate at the application
 * root so every page keeps the same desktop composition.
 *
 * We restore at most 1536 CSS pixels and never invent more layout space than
 * the monitor has physical horizontal pixels. Touch-first devices keep the
 * regular responsive UI.
 */
function applyDesktopDisplayScale(): void {
  const body = document.body;
  const isTouchFirst = window.matchMedia("(pointer: coarse)").matches;
  const isDesktopViewport = window.innerWidth >= 900 && !isTouchFirst;

  if (!isDesktopViewport) {
    body.style.removeProperty("zoom");
    body.style.removeProperty("width");
    body.style.removeProperty("height");
    return;
  }

  const physicalScreenWidth = window.screen.width * window.devicePixelRatio;
  const targetLayoutWidth = Math.min(1536, physicalScreenWidth);
  const scale = Math.min(1, window.innerWidth / targetLayoutWidth);

  if (scale >= 0.98) {
    body.style.removeProperty("zoom");
    body.style.removeProperty("width");
    body.style.removeProperty("height");
    return;
  }

  const inverseScalePercent = `${100 / scale}%`;
  body.style.zoom = String(scale);
  body.style.width = inverseScalePercent;
  body.style.height = inverseScalePercent;
}

applyDesktopDisplayScale();

let displayScaleFrame: number | null = null;
const scheduleDesktopDisplayScale = () => {
  if (displayScaleFrame !== null) {
    window.cancelAnimationFrame(displayScaleFrame);
  }
  displayScaleFrame = window.requestAnimationFrame(() => {
    displayScaleFrame = null;
    applyDesktopDisplayScale();
  });
};

window.addEventListener("resize", scheduleDesktopDisplayScale);
window.visualViewport?.addEventListener("resize", scheduleDesktopDisplayScale);

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
