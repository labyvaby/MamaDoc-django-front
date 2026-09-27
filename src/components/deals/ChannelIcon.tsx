import React from "react";
import { Tooltip } from "@mui/material";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";
import Instagram from "@mui/icons-material/Instagram";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import Telegram from "@mui/icons-material/Telegram";
import WhatsApp from "@mui/icons-material/WhatsApp";

import type { DealChannel } from "../../api/deals";
import { useT } from "../../i18n/VerticalProvider";

/** Иконка и фирменный цвет мессенджера — по `Deal.channel`. */
const CHANNELS: Record<DealChannel, { Icon: React.ComponentType<SvgIconProps>; color: string }> = {
  whatsapp: { Icon: WhatsApp, color: "#25D366" },
  instagram: { Icon: Instagram, color: "#E1306C" },
  telegram: { Icon: Telegram, color: "#229ED9" },
  web: { Icon: LanguageOutlined, color: "#64748B" },
  phone: { Icon: PhoneOutlined, color: "#64748B" },
  other: { Icon: ChatBubbleOutlineOutlined, color: "#94A3B8" },
};

/**
 * Канал, из которого пришёл разговор. На карточке доски стоит перед
 * телефоном, в шапке дровера — рядом с именем. Для `other` не рисуется:
 * у сделок, заведённых руками, канала нет и иконка только шумела бы.
 */
const ChannelIcon: React.FC<{ channel: DealChannel; size?: number; withTooltip?: boolean }> = ({
  channel,
  size = 14,
  withTooltip = true,
}) => {
  const { t } = useT("deals");
  if (channel === "other") return null;
  const { Icon, color } = CHANNELS[channel];
  const icon = <Icon sx={{ fontSize: size, color, flexShrink: 0 }} aria-label={t(`channel.${channel}`)} />;
  return withTooltip ? <Tooltip title={t(`channel.${channel}`)}>{icon}</Tooltip> : icon;
};

export default ChannelIcon;
