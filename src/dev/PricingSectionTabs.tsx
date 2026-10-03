/**
 * «Цены» — один раздел вместо четырёх пунктов меню («Категории и тарифы»,
 * «Тарифные планы», «Ценообразование», «Календарь цен»). Ревьюер: управляющая,
 * которой надо поменять цену на Новый год, открывала все четыре. Теперь в меню
 * один пункт, а сверху каждой из четырёх страниц — эти вкладки; первая —
 * «Цена на дату», то самое «поменять цену на Новый год».
 */
import React from "react";
import { Stack, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router";

import { PAGE_PERMISSIONS } from "../config/accessPermissions";
import { useCanChecker } from "../hooks/useCan";
import { FilterChip } from "./hotelUi";

export const PRICING_SECTIONS = [
  { to: "/price-calendar", label: "Цена на дату", hint: "Праздники, Новый год, события — своя цена на конкретные даты", permission: PAGE_PERMISSIONS.hotelPriceCalendar },
  { to: "/room-categories", label: "Категории и базовые цены", hint: "Номера по категориям и цена без правил", permission: PAGE_PERMISSIONS.hotelRoomCategories },
  { to: "/rate-plans", label: "Тарифы", hint: "Завтрак, невозвратный, корпоративный — как цена меняется от тарифа", permission: PAGE_PERMISSIONS.hotelRatePlans },
  { to: "/pricing-rules", label: "Автоправила", hint: "Выходные, загрузка, ранее бронирование — цена меняется сама", permission: PAGE_PERMISSIONS.hotelPricingRules },
] as const;

export function usePricingSections() {
  const { can } = useCanChecker();
  return PRICING_SECTIONS.filter((s) => can(s.permission));
}

export const PricingSectionTabs: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sections = usePricingSections();
  const current = sections.find((s) => pathname === s.to || pathname.startsWith(`${s.to}/`));
  if (sections.length < 2) return null;
  return (
    <Stack gap={0.75}>
      <Stack direction="row" gap={0.75} flexWrap="wrap" role="tablist" aria-label="Разделы цен">
        {sections.map((s) => (
          <FilterChip key={s.to} label={s.label} active={current?.to === s.to} onClick={() => navigate(s.to)} />
        ))}
      </Stack>
      {current && (
        <Typography variant="caption" color="text.secondary">
          {current.hint}
        </Typography>
      )}
    </Stack>
  );
};

export default PricingSectionTabs;
