import React from "react";
import { Box, Skeleton } from "@mui/material";

import { SpecialtyTile } from "../../public-booking/SpecialtiesPage";
import { useSpecialties } from "../../public-booking/useSpecialties";
import { useBookingNav } from "../../public-booking/orgSlug";
import { useT } from "../../../i18n/VerticalProvider";
import { SiteSection } from "../shell";
import { EmptyNote } from "./EmptyNote";

/**
 * Направления работы: плитки специализаций, ведущие в воронку записи с уже
 * подставленным фильтром.
 *
 * Плитку берём ту же, что на первом экране витрины (`SpecialtyTile`): гость
 * переходит с сайта на запись и должен узнать те же элементы. Справочник —
 * `useSpecialties`, то есть специализации, у которых реально есть специалисты
 * (см. комментарий в самом хуке).
 */
export const Directions: React.FC<{ id: string; tinted?: boolean }> = ({ id, tinted }) => {
  const { t } = useT("landing");
  const { go } = useBookingNav();
  const { specialties, loading } = useSpecialties();

  return (
    <SiteSection id={id} title={t("directions.title")} subtitle={t("directions.subtitle")} tinted={tinted}>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
        }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={64} />
            ))
          : specialties.map((group) => (
              <SpecialtyTile
                key={group.key}
                group={group}
                onClick={() => go(`/book/doctors?specialty=${encodeURIComponent(group.key)}`)}
              />
            ))}
      </Box>
      {!loading && specialties.length === 0 && <EmptyNote text={t("directions.empty")} />}
    </SiteSection>
  );
};
