import React from "react";
import { Alert, Box, Skeleton, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import {
  getAchievementDefinitions,
  getMyAchievements,
  topEarnedByCode,
  type AchievementDefinition,
  type AchievementKind,
} from "../../api/achievements";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { AchievementCard } from "./AchievementCard";
import { ACHIEVEMENT_KIND_LABELS } from "./meta";
import { useApiOrgId } from "../../hooks/useApiOrgId";

const KIND_ORDER: AchievementKind[] = ["milestone", "streak", "tenure"];

/**
 * Сетка моих достижений с прогрессом — вкладка «Достижения» в профиле.
 * Нерелевантные метрики (нет ни бейджа, ни прогресса от бэка) скрыты.
 */
export const AchievementsGrid: React.FC = () => {
  const orgId = useApiOrgId();
  const definitionsQuery = useQuery({
    queryKey: djangoQueryKeys.achievements.definitions,
    queryFn: ({ signal }) => getAchievementDefinitions(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const myQuery = useQuery({
    queryKey: djangoQueryKeys.achievements.me,
    queryFn: ({ signal }) => getMyAchievements(orgId, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  if (definitionsQuery.isError || myQuery.isError) {
    return <Alert severity="error">Не удалось загрузить достижения</Alert>;
  }

  if (!definitionsQuery.data || !myQuery.data) {
    return (
      <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={84} sx={{ borderRadius: "10px" }} />
        ))}
      </Box>
    );
  }

  const earnedByCode = topEarnedByCode(myQuery.data.achievements);
  const progressByCode = new Map(myQuery.data.progress.map((p) => [p.code, p]));

  // Только личные и только релевантные: есть полученный уровень или прогресс.
  const visible = definitionsQuery.data.filter(
    (d) => d.scope === "employee" && (earnedByCode.has(d.code) || progressByCode.has(d.code)),
  );

  if (visible.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Достижений пока нет — они появятся по мере работы в системе.
      </Typography>
    );
  }

  const byKind = new Map<AchievementKind, AchievementDefinition[]>();
  for (const d of visible) {
    byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d]);
  }

  return (
    <Stack spacing={2}>
      {KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => (
        <Box key={kind}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ fontWeight: 600, letterSpacing: 0.6 }}
          >
            {ACHIEVEMENT_KIND_LABELS[kind]}
          </Typography>
          <Box
            sx={{
              mt: 0.5,
              display: "grid",
              gap: 1.25,
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            }}
          >
            {byKind.get(kind)!.map((d) => (
              <AchievementCard
                key={d.code}
                definition={d}
                earned={earnedByCode.get(d.code) ?? null}
                progress={progressByCode.get(d.code) ?? null}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  );
};

export default AchievementsGrid;
