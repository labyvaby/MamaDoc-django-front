import React from "react";
import { Box, Typography } from "@mui/material";
import { alpha, darken, lighten, useTheme } from "@mui/material/styles";
import type { SvgIconComponent } from "@mui/icons-material";
import ChatOutlined from "@mui/icons-material/ChatOutlined";
import FilterAltOutlined from "@mui/icons-material/FilterAltOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import StarBorderOutlined from "@mui/icons-material/StarBorderOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import FingerprintOutlined from "@mui/icons-material/FingerprintOutlined";
import ChecklistOutlined from "@mui/icons-material/ChecklistOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import PointOfSaleOutlined from "@mui/icons-material/PointOfSaleOutlined";
import LocalShippingOutlined from "@mui/icons-material/LocalShippingOutlined";
import LoyaltyOutlined from "@mui/icons-material/LoyaltyOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import TrackChangesOutlined from "@mui/icons-material/TrackChangesOutlined";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import CheckroomOutlined from "@mui/icons-material/CheckroomOutlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import ExtensionOutlined from "@mui/icons-material/ExtensionOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import EventNoteOutlined from "@mui/icons-material/EventNoteOutlined";
import PeopleAltOutlined from "@mui/icons-material/PeopleAltOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import ListAltOutlined from "@mui/icons-material/ListAltOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import AssessmentOutlined from "@mui/icons-material/AssessmentOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import MonitorHeartOutlined from "@mui/icons-material/MonitorHeartOutlined";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";

import type { StorefrontIconName, StorefrontTone } from "../../../config/moduleStorefront";

const ICONS: Record<StorefrontIconName, SvgIconComponent> = {
  chats: ChatOutlined,
  funnel: FilterAltOutlined,
  hourglass: HourglassEmptyOutlined,
  star: StarBorderOutlined,
  vaccine: VaccinesOutlined,
  payments: PaymentsOutlined,
  fingerprint: FingerprintOutlined,
  checklist: ChecklistOutlined,
  cleaning: CleaningServicesOutlined,
  book: MenuBookOutlined,
  register: PointOfSaleOutlined,
  truck: LocalShippingOutlined,
  loyalty: LoyaltyOutlined,
  offer: LocalOfferOutlined,
  target: TrackChangesOutlined,
  store: StorefrontOutlined,
  hanger: CheckroomOutlined,
  telegram: TelegramIcon,
  puzzle: ExtensionOutlined,
  booking: EventAvailableOutlined,
  site: LanguageOutlined,
  insurance: HealthAndSafetyOutlined,
  bell: NotificationsActiveOutlined,
  odoctor: LocalHospitalOutlined,
  lab: ScienceOutlined,
  ai: AutoAwesomeOutlined,
  insights: InsightsOutlined,
  bolt: BoltOutlined,
  note: EditNoteOutlined,
  event: EventNoteOutlined,
  people: PeopleAltOutlined,
  calendar: CalendarMonthOutlined,
  list: ListAltOutlined,
  wallet: AccountBalanceWalletOutlined,
  chart: AssessmentOutlined,
  badge: BadgeOutlined,
  campaign: CampaignOutlined,
  folder: FolderOutlined,
  print: PrintOutlined,
  monitor: MonitorHeartOutlined,
  trophy: EmojiEventsOutlined,
};

/** Цвета категорий — из марки ErkinAI; от акцента CRM не зависят, в тёмной теме светлее. */
const TONES: Record<StorefrontTone, string> = {
  violet: "#6718FE",
  teal: "#00A884",
  amber: "#D98A00",
  pink: "#D4537E",
  blue: "#0075FB",
};

export function useToneColors(tone: StorefrontTone): { bg: string; fg: string } {
  const theme = useTheme();
  const base = TONES[tone];
  const dark = theme.palette.mode === "dark";
  return { bg: alpha(base, dark ? 0.22 : 0.1), fg: dark ? lighten(base, 0.4) : darken(base, 0.15) };
}

export const StorefrontTile: React.FC<{ icon: StorefrontIconName; tone: StorefrontTone; size?: number }> = ({
  icon,
  tone,
  size = 40,
}) => {
  const { bg, fg } = useToneColors(tone);
  const Icon = ICONS[icon] ?? ExtensionOutlined;
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: `${Math.round(size * 0.28)}px`,
        display: "grid",
        placeItems: "center",
        bgcolor: bg,
        color: fg,
      }}
    >
      <Icon sx={{ fontSize: Math.round(size * 0.55) }} />
    </Box>
  );
};

/** Части товара одной строкой через точку; найденные поиском — выделены. */
export const PartsLine: React.FC<{ parts?: string[]; highlight?: string[] }> = ({ parts, highlight = [] }) => {
  if (!parts || parts.length === 0) return null;
  return (
    <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.5 }}>
      {parts.map((part, index) => (
        <React.Fragment key={part}>
          {index > 0 && " · "}
          <Box
            component="span"
            sx={highlight.includes(part) ? { color: "primary.main", fontWeight: 700 } : undefined}
          >
            {part}
          </Box>
        </React.Fragment>
      ))}
    </Typography>
  );
};
