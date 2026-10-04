import { describe, expect, it } from "vitest";
import { staleGuard } from "./staleGuard";

describe("staleGuard", () => {
  it("пока поколение то же и провайдер жив — старт актуален", () => {
    const epoch = { current: 3 };
    const alive = { current: true };
    const stale = staleGuard(epoch, alive);
    expect(stale()).toBe(false);
  });

  it("запись сбросили (отмена, «выйти без досылки») — старт устарел", () => {
    const epoch = { current: 3 };
    const alive = { current: true };
    const stale = staleGuard(epoch, alive);
    epoch.current += 1;
    expect(stale()).toBe(true);
  });

  it("провайдер размонтирован — старт устарел", () => {
    const epoch = { current: 3 };
    const alive = { current: true };
    const stale = staleGuard(epoch, alive);
    alive.current = false;
    expect(stale()).toBe(true);
  });

  it("поколение запоминается в момент создания проверки", () => {
    const epoch = { current: 3 };
    const alive = { current: true };
    epoch.current = 5;
    expect(staleGuard(epoch, alive)()).toBe(false);
  });
});
