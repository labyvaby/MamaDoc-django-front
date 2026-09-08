import { describe, expect, it } from "vitest";

import { isStaleBuildError } from "./staleBuildRecovery";

describe("isStaleBuildError", () => {
  it.each([
    "Failed to fetch dynamically imported module",
    "Error loading dynamically imported module: /assets/index-old.js",
    "Importing a module script failed.",
    "Loading chunk 42 failed.",
  ])("recognises a stale Vite build error: %s", (message) => {
    expect(isStaleBuildError(new Error(message))).toBe(true);
  });

  it("does not reload for an unrelated application error", () => {
    expect(isStaleBuildError(new Error("Patient is required"))).toBe(false);
  });
});
