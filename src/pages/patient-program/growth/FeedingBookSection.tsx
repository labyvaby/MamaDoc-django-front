import React from "react";
import { Alert, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { getGrowth } from "../../../api/health";
import { DJANGO_DETAIL_STALE_TIME_MS, djangoQueryKeys } from "../../../api/queryKeys";
import { FeedingSection } from "../../../components/health/FeedingSection";
import { isChild } from "../../../components/health/healthMeta";
import { useHealthScope } from "../../../components/health/useHealth";
import { AppCard } from "../../../components/ui";
import { feedingInputs } from "./growthData";

interface FeedingBookSectionProps {
  patientId: number;
  title?: string;
  canManage: boolean;
}

/**
 * Раздел книжки «Вскармливание и прикорм» (тип `feeding`): тот же блок, что
 * был внизу «Роста и развития», на тех же данных `growth/` (общий кэш). Когда
 * раздел есть в программе, «Рост и развитие» блок прикорма не показывает.
 */
export const FeedingBookSection: React.FC<FeedingBookSectionProps> = ({ patientId, title = "Вскармливание и прикорм", canManage }) => {
  const { orgId, scope, ready } = useHealthScope();
  const query = useQuery({
    queryKey: djangoQueryKeys.health.growth(patientId, orgId),
    queryFn: ({ signal }) => getGrowth(scope, patientId, signal),
    enabled: ready,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const inputs = React.useMemo(() => (query.data ? feedingInputs(query.data) : null), [query.data]);

  let content: React.ReactNode;
  if (query.error) {
    content = <Alert severity="error">Не удалось загрузить раздел «{title}».</Alert>;
  } else if (!inputs) {
    content = (
      <Typography variant="body2" color="text.secondary">
        Загрузка…
      </Typography>
    );
  } else if (!isChild(inputs.birthDate)) {
    content = (
      <Alert severity="info">
        «{title}» ведут у детей: пациенту уже 18 лет.
      </Alert>
    );
  } else {
    content = <FeedingSection patientId={patientId} canManage={canManage} title={title} standalone {...inputs} />;
  }
  return <AppCard variant="outlined">{content}</AppCard>;
};
