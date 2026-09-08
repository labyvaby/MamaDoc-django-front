import React from "react";
import { Chip } from "@mui/material";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";

import { TonedChip } from "../ui";
import type { WaitlistPriority, WaitlistSource, WaitlistStatus } from "../../api/waitlist";
import {
  WAITLIST_PRIORITY_META,
  WAITLIST_SOURCE_META,
  WAITLIST_STATUS_META,
} from "../../pages/waitlist/meta";

export const WaitlistStatusChip: React.FC<{ status: WaitlistStatus }> = ({ status }) => {
  const meta = WAITLIST_STATUS_META[status];
  return meta ? <TonedChip label={meta.label} toneName={meta.color} /> : <>{status}</>;
};

/**
 * Срочность показываем только у срочных: «обычный» — это дефолт, и плашка на
 * каждой строке превратила бы список в шум.
 */
export const WaitlistPriorityChip: React.FC<{ priority: WaitlistPriority }> = ({ priority }) => {
  if (priority !== "urgent") return null;
  const meta = WAITLIST_PRIORITY_META[priority];
  return <TonedChip label={meta.label} toneName={meta.color} />;
};

/**
 * Источник заявки. Помечаем только записи с сайта: регистратору важно видеть,
 * что этого человека ещё никто не слышал живьём.
 */
export const WaitlistSourceChip: React.FC<{ source: WaitlistSource }> = ({ source }) => {
  if (source !== "public") return null;
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<LanguageOutlined sx={{ fontSize: 14 }} />}
      label={WAITLIST_SOURCE_META.public.label}
      sx={{ height: 24, borderRadius: "7px", fontWeight: 500 }}
    />
  );
};
