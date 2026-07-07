import React from "react";
import type { Theme } from "@mui/material/styles";

import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import CelebrationOutlined from "@mui/icons-material/CelebrationOutlined";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import PeopleAltOutlined from "@mui/icons-material/PeopleAltOutlined";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import TimerOutlined from "@mui/icons-material/TimerOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import VolunteerActivismOutlined from "@mui/icons-material/VolunteerActivismOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";

import type { AchievementKind } from "../../api/achievements";

/** Иконка достижения по коду каталога (fallback — кубок). */
const CODE_ICONS: Record<string, React.ElementType> = {
  appointments: MedicalServicesOutlined,
  procedures: VaccinesOutlined,
  patients: GroupsOutlined,
  tasks_done: TaskAltOutlined,
  thanks: VolunteerActivismOutlined,
  sales: ShoppingBagOutlined,
  on_time: TimerOutlined,
  active_months: CalendarMonthOutlined,
  tenure: WorkspacePremiumOutlined,
  org_appointments: LocalHospitalOutlined,
  org_patients: PeopleAltOutlined,
  org_anniversary: CelebrationOutlined,
};

export const achievementIcon = (code: string): React.ElementType =>
  CODE_ICONS[code] ?? EmojiEventsOutlined;

export const ACHIEVEMENT_KIND_LABELS: Record<AchievementKind, string> = {
  milestone: "Вехи",
  streak: "Серии",
  tenure: "Стаж",
};

/** Тон уровня: стартовый → бронза → серебро → золото → платина. */
export type TierTone = "start" | "bronze" | "silver" | "gold" | "platinum";

const TONE_LADDER: TierTone[] = ["start", "bronze", "silver", "gold", "platinum"];

/**
 * Тон для уровня достижения. У 5-уровневых первый уровень — «стартовый»
 * (первый приём и т.п.), у остальных лестница начинается с бронзы.
 */
export function tierTone(level: number, tiersCount: number): TierTone {
  const ladder = tiersCount >= 5 ? TONE_LADDER : TONE_LADDER.slice(1);
  return ladder[Math.min(Math.max(level, 1), ladder.length) - 1];
}

/**
 * Цвета тона из токенов темы (без хардкод-значений, см. ui-style-guide):
 * main — для заливок/рамок через alpha, fg — читаемый цвет текста/иконки.
 */
export function tierColors(t: Theme, tone: TierTone): { main: string; fg: string } {
  const dark = t.palette.mode === "dark";
  switch (tone) {
    case "start":
      return {
        main: t.palette.primary.main,
        fg: dark ? t.palette.primary.light : t.palette.primary.dark,
      };
    case "bronze":
      return {
        main: t.palette.warning.dark,
        fg: dark ? t.palette.warning.main : t.palette.warning.dark,
      };
    case "silver":
      return {
        main: t.palette.grey[500],
        fg: dark ? t.palette.grey[400] : t.palette.grey[600],
      };
    case "gold":
      return {
        main: t.palette.warning.main,
        fg: dark ? t.palette.warning.light : t.palette.warning.dark,
      };
    case "platinum":
      return {
        main: t.palette.info.main,
        fg: dark ? t.palette.info.light : t.palette.info.dark,
      };
  }
}
