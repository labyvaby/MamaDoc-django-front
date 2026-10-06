// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { useAppointmentsAutoSync } from "./useAppointmentsAutoSync";
import type { ChangeMessage } from "./useChangesSocket";

const mock = vi.hoisted(() => ({
  latest: vi.fn(),
  connected: false,
  sockets: new Set<React.MutableRefObject<{ enabled?: boolean; onMessage: (message: ChangeMessage) => void }>>(),
}));
vi.mock("../api/appointments", () => ({ getAppointmentsLastUpdate: mock.latest }));
vi.mock("./useChangesSocket", async () => {
  const { useEffect, useRef } = await import("react");
  return {
    useChangesSocket: (options: { enabled?: boolean; onMessage: (message: ChangeMessage) => void }) => {
      const ref = useRef(options);
      ref.current = options;
      useEffect(() => {
        mock.sockets.add(ref);
        return () => { mock.sockets.delete(ref); };
      }, []);
      return mock.connected;
    },
  };
});

type Options = Parameters<typeof useAppointmentsAutoSync>[0];
let roots: Root[];
let hidden: boolean;
let changed: Mock<() => void>;
const options = (extra: Partial<Options> = {}): Options => ({
  branchId: 21, organizationId: 7, onChange: changed, ...extra,
});
function Screen(props: Options) { useAppointmentsAutoSync(props); return null; }
const mount = async (props = options()) => {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(<Screen {...props} />); });
  return root;
};
const update = async (root: Root, props: Options) => {
  await act(async () => { root.render(<Screen {...props} />); });
};
const advance = async (ms: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};
const hint = (entity = "appointment") => {
  for (const ref of mock.sockets) {
    if (ref.current.enabled !== false) ref.current.onMessage({ entity, action: "updated", objectId: 2, branchId: 21 });
  }
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  mock.latest.mockReset().mockResolvedValue("same:5");
  mock.connected = false;
  roots = [];
  hidden = false;
  changed = vi.fn<() => void>();
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
});
afterEach(async () => {
  await act(async () => { roots.forEach((root) => root.unmount()); });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("appointment synchronization", () => {
  it("delivers a branch hint to both branch and all-branches reception", async () => {
    const allBranchesChanged = vi.fn<() => void>();
    await mount();
    await mount(options({ branchId: undefined, onChange: allBranchesChanged }));
    hint();
    await advance(200);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(allBranchesChanged).toHaveBeenCalledTimes(1);
  });
  it("detects a colleague's change without refreshing the initial baseline", async () => {
    await mount();
    expect(changed).not.toHaveBeenCalled();
    mock.latest.mockResolvedValue("new:6");
    await advance(10_000);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("detects the first appointment after an empty baseline", async () => {
    mock.latest.mockResolvedValueOnce(null).mockResolvedValue("first:1");
    await mount();
    await advance(10_000);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("refreshes after recovering from a failed initial heartbeat", async () => {
    mock.latest.mockRejectedValueOnce(new Error("connection down"));
    await mount();
    await advance(20_000);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("coalesces hints even when MAX and COUNT are unchanged", async () => {
    await mount();
    hint(); hint(); hint("conclusion");
    await advance(200);
    expect(changed).toHaveBeenCalledTimes(1);
    await advance(10_000);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("updates two employees' screens while preserving open form input", async () => {
    function Reception() {
      const [revision, setRevision] = React.useState(0);
      useAppointmentsAutoSync(options({ onChange: () => setRevision((value) => value + 1) }));
      return <><output>{revision}</output><input defaultValue="Черновик приёма" /></>;
    }
    const containers = [document.createElement("div"), document.createElement("div")];
    for (const container of containers) {
      const root = createRoot(container);
      roots.push(root);
      await act(async () => { root.render(<Reception />); });
    }
    containers[0].querySelector("input")!.value = "Незавершённый ввод";
    hint();
    await advance(200);
    for (const container of containers) expect(container.querySelector("output")!.textContent).toBe("1");
    expect(containers[0].querySelector("input")!.value).toBe("Незавершённый ввод");
    expect(containers[1].querySelector("input")!.value).toBe("Черновик приёма");
  });
  it("replays hidden-tab hints on focus even without a changed heartbeat", async () => {
    await mount();
    hidden = true;
    hint("conclusion");
    await advance(1_000);
    expect(changed).not.toHaveBeenCalled();
    hidden = false;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("bounds a stalled request and resumes polling without overlapping requests", async () => {
    await mount();
    mock.latest.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue("new:6");
    await advance(10_000);
    const signal = mock.latest.mock.calls[1][1] as AbortSignal;
    await act(async () => { for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("focus")); });
    expect(mock.latest).toHaveBeenCalledTimes(2);
    await advance(15_000);
    expect(signal.aborted).toBe(true);
    await advance(20_000);
    expect(mock.latest).toHaveBeenCalledTimes(3);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("refreshes immediately for every new hint while the heartbeat is stalled", async () => {
    await mount();
    mock.latest.mockImplementation(() => new Promise(() => {}));
    await advance(10_000);
    hint();
    await advance(200);
    expect(changed).toHaveBeenCalledTimes(1);
    hint();
    await advance(200);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(mock.latest).toHaveBeenCalledTimes(2);
  });
  it("refreshes for a hint when last-update fails", async () => {
    await mount();
    mock.latest.mockRejectedValue(new Error("endpoint down"));
    hint();
    await advance(200);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("resets pending events on an organization change and explicitly sends the scope", async () => {
    const root = await mount();
    hidden = true;
    hint();
    hidden = false;
    await update(root, options({ organizationId: 8 }));
    expect(mock.latest.mock.lastCall?.[2]).toBe(8);
    expect(changed).not.toHaveBeenCalled();
  });
  it("waits for context readiness before polling or connecting", async () => {
    const root = await mount(options({ enabled: false }));
    expect(mock.latest).not.toHaveBeenCalled();
    expect([...mock.sockets][0].current.enabled).toBe(false);
    await update(root, options({ enabled: true }));
    expect(mock.latest).toHaveBeenCalledTimes(1);
  });
});
