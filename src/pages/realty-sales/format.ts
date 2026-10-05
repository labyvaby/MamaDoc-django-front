import type { Theme } from "@mui/material/styles";
import dayjs, { type Dayjs } from "dayjs";

/** Температура лида → цвет точки: горячий — красный, тёплый — янтарный, холодный — синий. */
export function tempColor(theme: Theme, temp: string): string {
  if (temp === "hot") return theme.palette.error.main;
  if (temp === "warm") return theme.palette.warning.main;
  return theme.palette.info.main;
}

/** «Сегодня, 09:18» / «Вчера, 09:18» / «03.10, 23:53» (с годом — если не этот год). */
export function callTimeLabel(at: string, t: (key: string, opts?: Record<string, unknown>) => string, now: Dayjs = dayjs()): string {
  if (!at) return "—";
  const moment = dayjs(at);
  const time = moment.format("HH:mm");
  if (moment.isSame(now, "day")) return t("calls.today", { time });
  if (moment.isSame(now.subtract(1, "day"), "day")) return t("calls.yesterday", { time });
  return moment.format(moment.isSame(now, "year") ? "DD.MM, HH:mm" : "DD.MM.YYYY, HH:mm");
}

/** Инициалы для аватарки: «Айжан Исакова» → «АИ». */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
