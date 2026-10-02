/**
 * Тихий «чёрный ящик» для обращений в поддержку.
 *
 * Пока человек работает, здесь копится короткая память последних ~минуты:
 * на какие кнопки он нажимал, какие страницы открывал, какие запросы к
 * серверу падали, что писала консоль. Когда случается сбой, окно вокруг него
 * замораживается («frozen»), и если человек нажмёт на жука через минуту,
 * к обращению всё равно приложится контекст ошибки, а не пустая страница.
 *
 * ЧТО СОБИРАЕМ:  метод и путь запроса, статус, время, trace_id, текст ошибки
 *                консоли, подпись нажатой кнопки, путь страницы, размер окна.
 * ЧТО НЕ СОБИРАЕМ: тела запросов и ответов, значения полей, параметры
 *                запроса (только их имена), текст из строк списков и таблиц
 *                (там ФИО и телефоны), содержимое localStorage и cookie.
 *
 * Ничего не отправляется само: данные уходят на сервер только внутри
 * обращения, которое человек создал сам.
 */

declare const __APP_FRONTEND_COMMIT_COUNT__: number | undefined;

export type ProblemKind = "api" | "network" | "script" | "rejection" | "react";

export interface RecordedEvent {
  at: number;
  type: "click" | "route";
  label: string;
}

export interface RecordedRequest {
  at: number;
  method: string;
  path: string;
  status: number;
  ms: number;
  traceId: string | null;
  code: string | null;
}

export interface RecordedConsole {
  at: number;
  level: "error" | "warn";
  message: string;
}

export interface RecordedError {
  at: number;
  kind: ProblemKind;
  message: string;
  stack?: string;
}

/** Сбой, из-за которого пользователю стоит предложить «жука». */
export interface Problem {
  kind: ProblemKind;
  at: number;
  status: number | null;
  code: string | null;
  method: string | null;
  endpoint: string | null;
  traceId: string | null;
  message: string;
}

interface FrozenWindow {
  events: RecordedEvent[];
  network: RecordedRequest[];
  console: RecordedConsole[];
  errors: RecordedError[];
}

interface Frozen {
  problem: Problem;
  window: FrozenWindow;
}

/** Сколько живёт память: старше минуты записи вытесняются. */
const BUFFER_MS = 60_000;
/** Окно по умолчанию, которое уходит в обращение. */
export const DEFAULT_WINDOW_MS = 25_000;
/** Сколько после сбоя ещё дописываем в замороженное окно. */
const FROZEN_TAIL_MS = 3_000;
/** Как долго замороженный сбой считается «недавним». */
export const FROZEN_TTL_MS = 10 * 60_000;
const MAX_ITEMS = 200;
const MAX_MESSAGE = 300;

const events: RecordedEvent[] = [];
const network: RecordedRequest[] = [];
const consoleLog: RecordedConsole[] = [];
const errors: RecordedError[] = [];

let frozen: Frozen | null = null;
let installed = false;
let currentRoute = "";
let previousRoute = "";
const startedAt = Date.now();
const listeners = new Set<(problem: Problem) => void>();

// ── Memory ─────────────────────────────────────────────────────────────────

function push<T extends { at: number }>(list: T[], item: T): void {
  list.push(item);
  const cutoff = item.at - BUFFER_MS;
  while (list.length > MAX_ITEMS || (list.length > 0 && list[0].at < cutoff)) {
    list.shift();
  }
}

const clip = (value: string, max = MAX_MESSAGE): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** Путь без значений параметров: `/a/?date=2026-10-01&q=Иван` → `/a/?date&q`. */
export function sanitizePath(rawPath: string): string {
  const [path, query] = rawPath.split("?");
  if (!query) return path;
  const keys = query
    .split("&")
    .map((pair) => pair.split("=")[0])
    .filter(Boolean);
  return keys.length ? `${path}?${keys.join("&")}` : path;
}

/** Три и больше цифр подряд — телефон, карта, номер документа: прячем. */
const maskDigits = (text: string): string => text.replace(/\d{3,}/g, "#");

// ── Clicks ─────────────────────────────────────────────────────────────────

const INTERACTIVE =
  'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], input, select, textarea, summary';
const ROW_LIKE = 'li, tr, td, [role="row"], [role="gridcell"], [role="listitem"], [role="option"]';

/**
 * Подпись нажатого элемента. Текст берём только у самой кнопки и только если
 * она не в строке списка или таблицы: там лежат ФИО, телефоны и суммы.
 */
export function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "?";
  // Сама кнопка «Сообщить о проблеме» в журнал действий не попадает: иначе
  // автоописание заканчивалось бы словами «…нажал «Сообщить о проблеме»».
  if (target.closest("[data-support-ignore], [data-support-trigger]")) return "";
  const el = target.closest(INTERACTIVE) ?? target;
  const tag = el.tagName.toLowerCase();
  const aria = el.getAttribute("aria-label");
  if (aria) return clip(`${tag}[${maskDigits(aria)}]`, 60);
  const testId = el.getAttribute("data-testid");
  if (testId) return `${tag}[#${testId}]`;
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const field = el.getAttribute("name") || el.id || el.getAttribute("type") || "field";
    return `${tag}[${clip(field, 30)}]`; // значение поля не читаем никогда
  }
  if (el.closest(ROW_LIKE)) return `${tag}(в списке)`;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text && text.length <= 30) return `${tag}[${maskDigits(text)}]`;
  return text ? `${tag}(${el.className?.toString().split(" ")[0] ?? ""})` : tag;
}

function onClick(event: MouseEvent): void {
  const label = describeTarget(event.target);
  if (label) push(events, { at: Date.now(), type: "click", label });
}

// ── Routes ─────────────────────────────────────────────────────────────────

function trackRoute(): void {
  const next = window.location.pathname;
  if (next === currentRoute) return;
  previousRoute = currentRoute;
  currentRoute = next;
  push(events, { at: Date.now(), type: "route", label: next });
}

function patchHistory(): void {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function patched(this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      queueMicrotask(trackRoute);
      return result;
    } as History["pushState"];
  }
  window.addEventListener("popstate", trackRoute);
}

// ── Console + errors ───────────────────────────────────────────────────────

function stringify(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === "object") return "[object]";
  return String(arg);
}

function patchConsole(): void {
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        const message = clip(maskDigits(args.map(stringify).join(" ")));
        const last = consoleLog[consoleLog.length - 1];
        if (!(last && last.message === message && Date.now() - last.at < 500)) {
          push(consoleLog, { at: Date.now(), level, message });
        }
      } catch {
        /* запись в «чёрный ящик» никогда не ломает консоль */
      }
      original(...args);
    };
  }
}

/** Шум браузера и расширений: не повод показывать жука. */
const IGNORED_MESSAGES = ["ResizeObserver loop", "Script error", "Non-Error promise rejection"];

function onWindowError(event: ErrorEvent): void {
  // Ошибка загрузки картинки/скрипта приходит с target ≠ window — это не сбой кода.
  if (event.target && event.target !== window) return;
  const message = event.message || "Ошибка скрипта";
  if (IGNORED_MESSAGES.some((noise) => message.includes(noise))) return;
  signal({
    kind: "script",
    message,
    stack: event.error instanceof Error ? event.error.stack : undefined,
  });
}

function onRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason as unknown;
  const name = reason instanceof Error ? reason.name : "";
  // Прерванный запрос и ошибки API уже учтены: первое — не сбой, второе
  // пришло через recordRequest со статусом и trace_id.
  if (name === "AbortError" || name === "ApiError") return;
  const message = stringify(reason);
  if (IGNORED_MESSAGES.some((noise) => message.includes(noise))) return;
  signal({
    kind: "rejection",
    message,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
}

// ── Problems ───────────────────────────────────────────────────────────────

interface SignalInput {
  kind: ProblemKind;
  message: string;
  stack?: string;
  status?: number;
  code?: string | null;
  method?: string;
  endpoint?: string;
  traceId?: string | null;
}

function windowSlice(from: number, to: number): FrozenWindow {
  const within = <T extends { at: number }>(list: T[]) =>
    list.filter((item) => item.at >= from && item.at <= to);
  return {
    events: within(events),
    network: within(network),
    console: within(consoleLog),
    errors: within(errors),
  };
}

function signal(input: SignalInput): void {
  const at = Date.now();
  push(errors, {
    at,
    kind: input.kind,
    message: clip(maskDigits(input.message)),
    stack: input.stack ? input.stack.split("\n").slice(0, 6).join("\n") : undefined,
  });
  const problem: Problem = {
    kind: input.kind,
    at,
    status: input.status ?? null,
    code: input.code ?? null,
    method: input.method ?? null,
    endpoint: input.endpoint ?? null,
    traceId: input.traceId ?? null,
    message: clip(maskDigits(input.message)),
  };
  frozen = { problem, window: windowSlice(at - DEFAULT_WINDOW_MS, at) };
  // Хвост: сразу после сбоя обычно сыплются связанные запросы и ошибки.
  window.setTimeout(() => {
    if (frozen && frozen.problem.at === at) {
      frozen.window = windowSlice(at - DEFAULT_WINDOW_MS, at + FROZEN_TAIL_MS);
    }
  }, FROZEN_TAIL_MS);
  listeners.forEach((listener) => listener(problem));
}

/** Подписка на сбои — по ней показывается кнопка-жук. */
export function onProblem(listener: (problem: Problem) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Замороженный недавний сбой (не старше FROZEN_TTL_MS) или null. */
export function getRecentProblem(): Problem | null {
  if (!frozen) return null;
  return Date.now() - frozen.problem.at <= FROZEN_TTL_MS ? frozen.problem : null;
}

export function clearProblem(): void {
  frozen = null;
}

/** Вызывается из apiRequest для каждого ответа сервера (в т.ч. упавшего). */
export function recordRequest(info: {
  method: string;
  path: string;
  status: number;
  ms: number;
  traceId?: string | null;
  code?: string | null;
  message?: string;
}): void {
  try {
    const method = (info.method || "GET").toUpperCase();
    const path = sanitizePath(info.path);
    push(network, {
      at: Date.now(),
      method,
      path,
      status: info.status,
      ms: Math.round(info.ms),
      traceId: info.traceId ?? null,
      code: info.code ?? null,
    });
    // Жук нужен при падении сервера и обрыве связи. Ошибки ввода (400/409),
    // «нет прав» (403) и «не найдено» (404) — это не сбой, а ответ системы.
    // Сам канал связи с поддержкой жука не вызывает: если он не работает,
    // сообщить через него всё равно нельзя.
    const isSupportCall = path.startsWith("/api/support/");
    if (!isSupportCall && (info.status >= 500 || info.status === 0)) {
      signal({
        kind: info.status === 0 ? "network" : "api",
        message: info.message || `Запрос завершился ошибкой ${info.status}`,
        status: info.status,
        code: info.code ?? null,
        method,
        endpoint: path,
        traceId: info.traceId ?? null,
      });
    }
  } catch {
    /* см. выше */
  }
}

/** Вызывается из ErrorBoundary: React-компонент упал при рендере. */
export function recordReactError(error: Error, componentStack?: string): void {
  try {
    signal({
      kind: "react",
      message: `${error.name}: ${error.message}`,
      stack: componentStack ?? error.stack,
    });
  } catch {
    /* см. выше */
  }
}

// ── Snapshot ───────────────────────────────────────────────────────────────

const iso = (ts: number) => new Date(ts).toISOString();
const ago = (now: number, ts: number) => Math.round(((now - ts) / 1000) * 10) / 10;

function mapWindow(now: number, win: FrozenWindow) {
  return {
    events: win.events.map((e) => ({ at: iso(e.at), ago: ago(now, e.at), type: e.type, label: e.label })),
    network: win.network.map((r) => ({
      at: iso(r.at),
      ago: ago(now, r.at),
      method: r.method,
      path: r.path,
      status: r.status,
      ms: r.ms,
      traceId: r.traceId,
      code: r.code,
    })),
    console: win.console.map((c) => ({ at: iso(c.at), ago: ago(now, c.at), level: c.level, message: c.message })),
    errors: win.errors.map((e) => ({ at: iso(e.at), ago: ago(now, e.at), kind: e.kind, message: e.message, stack: e.stack })),
  };
}

export function getFrontendBuild(): string {
  return typeof __APP_FRONTEND_COMMIT_COUNT__ === "number"
    ? `fe${__APP_FRONTEND_COMMIT_COUNT__}`
    : "dev";
}

interface ConnectionLike {
  effectiveType?: string;
  downlink?: number;
}

/**
 * Снимок для обращения: живое окно (последние секунды до нажатия) и, если
 * недавно был сбой, замороженное окно вокруг него. Ключи первого уровня
 * совпадают с белым списком бэкенда (`events`, `network`, `console`,
 * `errors`, `frozen`, `context`) — всё остальное сервер отбрасывает.
 */
export function collectDiagnostics(
  extraContext: Record<string, unknown> = {},
  windowMs: number = DEFAULT_WINDOW_MS,
): Record<string, unknown> {
  const now = Date.now();
  const live = mapWindow(now, windowSlice(now - windowMs, now));
  const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  const problem = getRecentProblem();

  const frozenPart =
    problem && frozen
      ? {
          kind: problem.kind,
          status: problem.status,
          code: problem.code,
          method: problem.method,
          endpoint: problem.endpoint,
          traceId: problem.traceId,
          message: problem.message,
          at: iso(problem.at),
          ageSec: ago(now, problem.at),
          window: mapWindow(now, frozen.window),
        }
      : null;

  return {
    context: {
      route: currentRoute || window.location.pathname,
      previousRoute,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio || 1,
      online: navigator.onLine,
      visibility: document.visibilityState,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      network: connection?.effectiveType ?? null,
      uptimeSec: Math.round((now - startedAt) / 1000),
      build: getFrontendBuild(),
      collectedAt: iso(now),
      windowSec: Math.round(windowMs / 1000),
      ...extraContext,
    },
    ...live,
    ...(frozenPart ? { frozen: frozenPart } : {}),
  };
}

/**
 * Последние действия для автоописания: если недавно был сбой — окно вокруг
 * него (человек уже мог уйти на другую страницу), иначе живое окно.
 */
export function getActionsForDescription(): { type: "click" | "route"; label: string }[] {
  const now = Date.now();
  const source =
    getRecentProblem() && frozen
      ? frozen.window.events
      : events.filter((e) => e.at >= now - DEFAULT_WINDOW_MS);
  return source.map((e) => ({ type: e.type, label: e.label }));
}

/** Страница, на которой человек был перед нынешней (для обращения со страницы поддержки). */
export function getPreviousRoute(): string {
  return previousRoute;
}

/** Размер экрана для поля `screen` обращения. */
export const screenLabel = (): string => `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`;

// ── Install ────────────────────────────────────────────────────────────────

/** Подключает слушатели один раз. Безопасно вызывать повторно (HMR, тесты). */
export function installRecorder(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  currentRoute = window.location.pathname;
  document.addEventListener("click", onClick, true);
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onRejection);
  patchConsole();
  patchHistory();
}

/** Только для тестов: сбросить всё состояние. */
export function __resetRecorderForTests(): void {
  events.length = 0;
  network.length = 0;
  consoleLog.length = 0;
  errors.length = 0;
  frozen = null;
  listeners.clear();
  currentRoute = "";
  previousRoute = "";
}
