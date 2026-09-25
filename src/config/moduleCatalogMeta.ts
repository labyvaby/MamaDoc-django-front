import React from "react";
import ExtensionOutlined from "@mui/icons-material/ExtensionOutlined";
import FilterAltOutlined from "@mui/icons-material/FilterAltOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import PointOfSaleOutlined from "@mui/icons-material/PointOfSaleOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";
import LoyaltyOutlined from "@mui/icons-material/LoyaltyOutlined";
import StarBorderOutlined from "@mui/icons-material/StarBorderOutlined";
import ChatOutlined from "@mui/icons-material/ChatOutlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import ChecklistOutlined from "@mui/icons-material/ChecklistOutlined";

/** Иконка модуля по коду; дефолт — «пазл». */
const ICONS: Record<string, React.ComponentType<{ fontSize?: "small" | "inherit" | "large" | "medium" }>> = {
  deals: FilterAltOutlined,
  cleaning: CleaningServicesOutlined,
  pos: PointOfSaleOutlined,
  attendance: MeetingRoomOutlined,
  announcements: CampaignOutlined,
  loyalty: LoyaltyOutlined,
  reviews: StarBorderOutlined,
  chatwoot: ChatOutlined,
  telegram_bot: TelegramIcon,
  ecommerce: StorefrontOutlined,
  tasks: ChecklistOutlined,
};

export function moduleIcon(code: string): React.ReactElement {
  const Cmp = ICONS[code] ?? ExtensionOutlined;
  return React.createElement(Cmp, { fontSize: "small" });
}

/**
 * Маршрут настроек модуля для кнопки «Настроить» у подключённых модулей.
 * Только те коды, у которых есть свой экран настроек. Остальным кнопку не рисуем.
 */
export const MODULE_SETTINGS_ROUTE: Record<string, string> = {
  deals: "/settings/deals",
  cleaning: "/settings/cleaning",
  pos: "/settings/store",
  announcements: "/settings/announcements",
  promotions: "/settings/promotions",
  ecommerce: "/settings/odoctor",
};
