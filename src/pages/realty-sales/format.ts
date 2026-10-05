import type { Theme } from "@mui/material/styles";

/** Температура лида → цвет точки: горячий — красный, тёплый — янтарный, холодный — синий. */
export function tempColor(theme: Theme, temp: string): string {
  if (temp === "hot") return theme.palette.error.main;
  if (temp === "warm") return theme.palette.warning.main;
  return theme.palette.info.main;
}
