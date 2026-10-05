import { expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { createTheme } from "@mui/material/styles";
import { getAppTheme } from "../../theme";
import { BOOKING_PRIMARY, createBookingTheme } from "./theme";

// Node cannot resolve the package's ESM directory imports; use its real CJS export.
vi.mock("@refinedev/mui", () => createRequire(import.meta.url)("@refinedev/mui"));

it("preserves the existing public theme when removing the Refine dependency", () => {
  const previous = createTheme(getAppTheme("light", {
    primaryColor: BOOKING_PRIMARY,
    surface: { default: "#F5F5F5", paper: "#FFFFFF" },
    cardSkin: "bordered", uiScale: "normal",
  }), { palette: { text: { primary: "#312E2E", secondary: "#7A7878" } } });
  expect(JSON.parse(JSON.stringify(createBookingTheme()))).toEqual(JSON.parse(JSON.stringify(previous)));
});
