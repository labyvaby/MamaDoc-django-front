import React from "react";
import { Chip, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";

import { TonedChip } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
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
/**
 * Препарат, которого ждёт человек. Зелёный — вакцина есть на складе
 * активного филиала, то есть можно звонить прямо сейчас; серый — нет
 * в наличии или остаток ещё не загружен. Точная цифра — в подсказке.
 */
export const WaitlistVaccineChip: React.FC<{ name: string; stock: number | null }> = ({ name, stock }) => {
  const { t } = useT("waitlist");
  const inStock = stock != null && stock > 0;
  const hint =
    stock == null
      ? t("vaccineDemand.stockUnknown")
      : inStock
        ? t("form.vaccineStock", { count: stock })
        : t("form.vaccineOutOfStock");
  return (
    <Tooltip title={hint}>
      <Chip
        size="small"
        icon={<VaccinesOutlined sx={{ fontSize: 14 }} />}
        label={name}
        sx={(th) => {
          const p = th.palette.success;
          return {
            height: 22,
            maxWidth: "100%",
            borderRadius: "7px",
            fontWeight: 500,
            "& .MuiChip-icon": { color: "inherit", ml: 0.75, mr: -0.25 },
            color: inStock ? (th.palette.mode === "dark" ? p.light : p.dark) : "text.secondary",
            bgcolor: inStock ? alpha(p.main, th.palette.mode === "dark" ? 0.2 : 0.14) : subtleBg(th, true),
          };
        }}
      />
    </Tooltip>
  );
};

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
