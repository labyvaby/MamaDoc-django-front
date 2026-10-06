// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";

import { useRealtimeRefetch } from "./useRealtimeRefetch";
import type { ChangeMessage } from "./useChangesSocket";

const mock = vi.hoisted(() => ({
  socket: null as null | { organizationId?: number; enabled?: boolean; onMessage: (message: ChangeMessage) => void },
}));
vi.mock("./useChangesSocket", () => ({
  useChangesSocket: (options: NonNullable<typeof mock.socket>) => { mock.socket = options; return true; },
}));
vi.mock("./usePermissions", () => ({
  usePermissions: () => ({ activeBranch: { id: 21 }, activeOrganization: { id: 7 } }),
}));
let root: Root;
let hidden: boolean;
let changed: Mock<() => void>;
function Screen({ enabled = true }: { enabled?: boolean }) {
  useRealtimeRefetch({ entities: ["appointment", "expense", "sale"], onEvent: changed, enabled });
  return null;
}
const hint = (entity: string) => mock.socket!.onMessage({ entity, action: "updated", objectId: 2, branchId: 21 });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  root = createRoot(document.createElement("div"));
  hidden = false;
  changed = vi.fn<() => void>();
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("updates the cashbox once for a burst of matching events and preserves hidden events", async () => {
  await act(async () => { root.render(<Screen />); });
  hint("product");
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(changed).not.toHaveBeenCalled();
  hint("appointment"); hint("expense");
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(changed).toHaveBeenCalledTimes(1);
  hidden = true;
  hint("sale");
  hidden = false;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(mock.socket!.organizationId).toBe(7);
});
it("gates the subscription until the cashbox context and permissions are ready", async () => {
  await act(async () => { root.render(<Screen enabled={false} />); });
  expect(mock.socket!.enabled).toBe(false);
  await act(async () => { root.render(<Screen />); });
  expect(mock.socket!.enabled).toBe(true);
});
