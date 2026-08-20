import type { SvgIconComponent } from "@mui/icons-material";
import Facebook from "@mui/icons-material/Facebook";
import Instagram from "@mui/icons-material/Instagram";
import Language from "@mui/icons-material/Language";
import MusicNote from "@mui/icons-material/MusicNote";
import Telegram from "@mui/icons-material/Telegram";
import WhatsApp from "@mui/icons-material/WhatsApp";
import YouTube from "@mui/icons-material/YouTube";

import type { LandingSocial } from "./landingConfig";

/**
 * Иконки и подписи соцсетей — один справочник для подвала лендинга и для
 * конструктора в настройках, чтобы порядок и названия не разъезжались.
 *
 * TikTok в наборе MUI нет; берём нотный знак — ближайшее по смыслу, что не
 * выглядит случайным (сервис — про короткие видео с музыкой).
 */
export const SOCIAL_ICONS: Record<LandingSocial, SvgIconComponent> = {
  instagram: Instagram,
  whatsapp: WhatsApp,
  telegram: Telegram,
  facebook: Facebook,
  tiktok: MusicNote,
  youtube: YouTube,
  website: Language,
};

/** Подписи полей конструктора и `aria-label` иконок. */
export const SOCIAL_LABELS: Record<LandingSocial, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  website: "Сайт",
};

/** Подсказка в поле: что именно вводить. */
export const SOCIAL_PLACEHOLDERS: Record<LandingSocial, string> = {
  instagram: "@mamadoc или ссылка",
  whatsapp: "+996 700 123 456",
  telegram: "@mamadoc или ссылка",
  facebook: "имя страницы или ссылка",
  tiktok: "@mamadoc или ссылка",
  youtube: "@mamadoc или ссылка",
  website: "mamadoc.kg",
};
