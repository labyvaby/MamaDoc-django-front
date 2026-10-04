export type WaitResult = "done" | "timeout" | "cancelled";

export interface WaitOptions {
  /** Сколько ждать максимум. */
  timeoutMs: number;
  /** Пауза между проверками. */
  intervalMs?: number;
  /** Ожидание больше не нужно (окно закрыли, компонент размонтирован). */
  cancelled?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Опрашивать `step`, пока он не вернёт true, — но не дольше `timeoutMs` и
 * не после отмены. `step` может и действовать (например, нажать «Стоп»), и
 * проверять. Часы и сон подменяются в тестах.
 */
export async function waitFor(step: () => boolean, options: WaitOptions): Promise<WaitResult> {
  const { timeoutMs, intervalMs = 200, cancelled = () => false, now = Date.now, sleep = realSleep } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    if (cancelled()) return "cancelled";
    if (step()) return "done";
    const left = deadline - now();
    if (left <= 0) return "timeout";
    await sleep(Math.min(intervalMs, left));
  }
}
