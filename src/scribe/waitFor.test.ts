import { describe, expect, it } from "vitest";
import { waitFor } from "./waitFor";

/** Поддельные часы: sleep двигает время, а не ждёт. */
const fakeClock = () => {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
};

describe("waitFor", () => {
  it("условие выполнено сразу — done без ожидания", async () => {
    const clock = fakeClock();
    expect(await waitFor(() => true, { timeoutMs: 1000, ...clock })).toBe("done");
    expect(clock.now()).toBe(0);
  });

  it("выполнилось через несколько шагов", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await waitFor(() => ++calls >= 3, { timeoutMs: 1000, intervalMs: 200, ...clock });
    expect(result).toBe("done");
    expect(calls).toBe(3);
    expect(clock.now()).toBe(400);
  });

  it("не дождались — timeout не позже срока", async () => {
    const clock = fakeClock();
    const result = await waitFor(() => false, { timeoutMs: 20_000, intervalMs: 200, ...clock });
    expect(result).toBe("timeout");
    expect(clock.now()).toBe(20_000);
  });

  it("отмена прерывает ожидание", async () => {
    const clock = fakeClock();
    let cancelled = false;
    let calls = 0;
    const result = await waitFor(
      () => {
        calls += 1;
        if (calls === 2) cancelled = true;
        return false;
      },
      { timeoutMs: 20_000, intervalMs: 200, cancelled: () => cancelled, ...clock },
    );
    expect(result).toBe("cancelled");
    expect(calls).toBe(2);
  });

  it("отменено ещё до начала — шаг не вызывается", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await waitFor(
      () => {
        calls += 1;
        return true;
      },
      { timeoutMs: 1000, cancelled: () => true, ...clock },
    );
    expect(result).toBe("cancelled");
    expect(calls).toBe(0);
  });
});
