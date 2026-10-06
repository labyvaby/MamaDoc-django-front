// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Refine } from "@refinedev/core";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_QUERY_CLIENT_CONFIG } from "./queryClientConfig";
import { djangoQueryKeys } from "./queryKeys";
import { ApiError } from "./client";

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let version: number;
const load = vi.fn(async () => version);

function Reception({ formOpen }: { formOpen: boolean }) {
  client = useQueryClient();
  const result = useQuery({
    queryKey: djangoQueryKeys.appointments.home({ date: "2026-10-06", branchId: 21 }),
    queryFn: load,
  });
  return <div><output>{result.data}</output>{formOpen && <input defaultValue="Draft" />}</div>;
}

function Application({ formOpen }: { formOpen: boolean }) {
  return <Refine options={{ disableTelemetry: true, reactQuery: { clientConfig: APP_QUERY_CLIENT_CONFIG } }}>
    <Reception formOpen={formOpen} />
  </Refine>;
}

async function render(formOpen = false) {
  await act(async () => {
    root.render(<Application formOpen={formOpen} />);
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  version = 1;
  load.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});

describe("application query cache", () => {
  it("keeps mounted reception queries reachable after parent renders and opening a form", async () => {
    await render();
    const originalClient = client;
    expect(container.querySelector("output")?.textContent).toBe("1");
    await render(true);
    await render(true);
    expect(client).toBe(originalClient);
    expect(load).toHaveBeenCalledTimes(1);

    version = 2;
    await act(async () => {
      await client.invalidateQueries({ queryKey: djangoQueryKeys.appointments.all });
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(container.querySelector("output")?.textContent).toBe("2");
    expect(container.querySelector("input")?.value).toBe("Draft");
  });

  it("keeps the existing retry policy for transient failures and rate limits", () => {
    const retry = APP_QUERY_CLIENT_CONFIG.defaultOptions?.queries?.retry;
    expect(typeof retry).toBe("function");
    if (typeof retry !== "function") throw new Error("Expected retry function");
    expect(retry(0, new Error("Temporary failure"))).toBe(true);
    expect(retry(1, new Error("Temporary failure"))).toBe(false);
    expect(retry(0, new ApiError("Rate limited", 429, null))).toBe(false);
  });
});
