import type { PaletteMode, Theme } from "@mui/material/styles";
import { RefineThemes } from "@refinedev/mui";
import { buildAppTheme, type ThemeCustomization } from "./theme/buildAppTheme";

export * from "./theme/buildAppTheme";

/** Staff themes retain the same Refine base; public pages use the pure builder. */
export function getAppTheme(
  mode: PaletteMode | string,
  custom: ThemeCustomization = {},
): Theme {
  return buildAppTheme(
    mode,
    custom,
    mode === "dark" ? RefineThemes.BlueDark : RefineThemes.Blue,
  );
}
