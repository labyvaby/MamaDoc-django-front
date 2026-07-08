import React from "react";
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import dayjs from "dayjs";

import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";

import { AppButton, AppCard, PageHeader, UserAvatar } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { formatDateRu } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import {
  getAchievementDefinitions,
  getAchievementsFeed,
  getMyAchievements,
  getOrganizationAchievements,
  topEarnedByCode,
  type AchievementDefinition,
  type AchievementFeedItem,
  type AchievementProgress,
  type EarnedAchievement,
} from "../../api/achievements";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { AchievementBadge } from "../../components/achievements/AchievementBadge";
import { AchievementRing } from "../../components/achievements/AchievementRing";
import { tierColors, tierTone } from "../../components/achievements/meta";

const FEED_PAGE_SIZE = 20;

const MotionBox = motion(Box);

/** Каскадное появление блоков при загрузке (см. ui-style-guide §6). */
const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.03 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
};

const formatNumber = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};

// ── Лента: группировка по датам ────────────────────────────────────────────────

const FEED_BUCKETS = ["Сегодня", "Вчера", "На этой неделе", "В этом месяце", "Ранее"] as const;

function feedBucket(iso: string): (typeof FEED_BUCKETS)[number] {
  const d = dayjs(iso);
  const now = dayjs();
  if (d.isSame(now, "day")) return "Сегодня";
  if (d.isSame(now.subtract(1, "day"), "day")) return "Вчера";
  if (d.isAfter(now.subtract(7, "day"))) return "На этой неделе";
  if (d.isAfter(now.subtract(30, "day"))) return "В этом месяце";
  return "Ранее";
}

/** Запись ленты: кто, какое достижение, когда. Командные — от имени клиники. */
const FeedRow: React.FC<{ item: AchievementFeedItem; tiersCount: number }> = ({
  item,
  tiersCount,
}) => {
  const isOrg = item.employeeId == null;
  const tone = tierTone(item.level, tiersCount);
  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={(t) => ({
        py: 1.25,
        px: 1,
        mx: -1,
        minWidth: 0,
        borderRadius: "10px",
        transition: "background-color .15s ease",
        "&:hover": { bgcolor: subtleBg(t, true) },
      })}
    >
      {isOrg ? (
        <Box
          sx={(t) => ({
            width: 40,
            height: 40,
            borderRadius: "12px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "primary.onSurface",
            bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
            "& .MuiSvgIcon-root": { fontSize: 20 },
          })}
        >
          <ApartmentOutlined />
        </Box>
      ) : (
        <UserAvatar name={item.employeeName ?? ""} size={40} sx={{ borderRadius: "12px" }} />
      )}

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {isOrg ? "Наша клиника" : item.employeeName}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {item.title} · {formatDateRu(item.achievedAt)}
        </Typography>
      </Box>

      <Chip
        size="small"
        label={item.tierName}
        sx={(t) => {
          const colors = tierColors(t, tone);
          return {
            height: 22,
            borderRadius: "7px",
            fontSize: "0.72rem",
            fontWeight: 600,
            color: colors.fg,
            bgcolor: alpha(colors.main, t.palette.mode === "dark" ? 0.18 : 0.1),
            display: { xs: "none", sm: "inline-flex" },
          };
        }}
      />
      <AchievementBadge code={item.code} tone={tone} size={36} />
    </Stack>
  );
};

// ── Хиро «Мои успехи» ─────────────────────────────────────────────────────────

/** Плитка-стат в духе профиля (гайд §5.2). */
const StatTile: React.FC<{
  plaque: React.ReactNode;
  label: string;
  children: React.ReactNode;
}> = ({ plaque, label, children }) => (
  <Box
    sx={(t) => ({
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      p: 1.75,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
      minWidth: 0,
      transition: "background-color .15s ease, border-color .15s ease",
      "&:hover": {
        bgcolor: subtleBg(t, true),
        borderColor: alpha(t.palette.primary.main, 0.28),
      },
    })}
  >
    {plaque}
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ fontSize: "0.75rem" }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  </Box>
);

const IconPlaque: React.FC<{ icon: React.ReactNode }> = ({ icon }) => (
  <Box
    sx={(t) => ({
      width: 40,
      height: 40,
      borderRadius: "10px",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "primary.onSurface",
      bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
      "& .MuiSvgIcon-root": { fontSize: 20 },
    })}
  >
    {icon}
  </Box>
);

interface NearestGoal {
  definition: AchievementDefinition;
  tierName: string;
  tone: ReturnType<typeof tierTone>;
  progress: AchievementProgress;
  pct: number;
}

const MyHighlights: React.FC<{
  definitions: AchievementDefinition[];
  achievements: EarnedAchievement[];
  progress: AchievementProgress[];
}> = ({ definitions, achievements, progress }) => {
  const defByCode = React.useMemo(
    () => new Map(definitions.map((d) => [d.code, d])),
    [definitions],
  );

  // Последний полученный уровень — свежая радость.
  const latest = React.useMemo(
    () =>
      achievements.length
        ? [...achievements].sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))[0]
        : null,
    [achievements],
  );

  // Ближайшая цель — метрика с максимальной долей до следующего порога.
  const nearest = React.useMemo<NearestGoal | null>(() => {
    let best: NearestGoal | null = null;
    for (const p of progress) {
      if (p.nextLevel == null || p.nextThreshold == null || p.nextThreshold <= 0) continue;
      const def = defByCode.get(p.code);
      if (!def) continue;
      const tier = def.tiers.find((t) => t.level === p.nextLevel);
      if (!tier) continue;
      const pct = Math.min(100, Math.round((p.currentValue / p.nextThreshold) * 100));
      if (!best || pct > best.pct) {
        best = {
          definition: def,
          tierName: tier.name,
          tone: tierTone(tier.level, def.tiers.length),
          progress: p,
          pct,
        };
      }
    }
    return best;
  }, [progress, defByCode]);

  // Полка бейджей: высший уровень по каждому коду, свежие — первыми.
  const shelf = React.useMemo(() => {
    const top = [...topEarnedByCode(achievements).values()];
    return top.sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
  }, [achievements]);

  const latestDef = latest ? defByCode.get(latest.code) : null;

  if (achievements.length === 0 && progress.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Достижений пока нет — они появятся по мере работы в системе.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: "grid",
          gap: 1.25,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1fr 1.1fr 1.3fr" },
        }}
      >
        <StatTile plaque={<IconPlaque icon={<EmojiEventsOutlined />} />} label="Получено бейджей">
          <Typography variant="body2" fontWeight={600} noWrap>
            {achievements.length}{" "}
            {pluralRu(achievements.length, "бейдж", "бейджа", "бейджей")}
          </Typography>
        </StatTile>

        <StatTile
          plaque={
            latest && latestDef ? (
              <AchievementBadge
                code={latest.code}
                tone={tierTone(latest.level, latestDef.tiers.length)}
                size={40}
              />
            ) : (
              <IconPlaque icon={<EmojiEventsOutlined />} />
            )
          }
          label="Последнее достижение"
        >
          <Typography variant="body2" fontWeight={600} noWrap>
            {latest ? `«${latest.tierName}» · ${formatDateRu(latest.achievedAt)}` : "—"}
          </Typography>
        </StatTile>

        <StatTile plaque={<IconPlaque icon={<FlagOutlined />} />} label="Ближайшая цель">
          {nearest ? (
            <>
              <Typography variant="body2" fontWeight={600} noWrap>
                {nearest.definition.title} · {nearest.tierName}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={nearest.pct}
                sx={(t) => {
                  const colors = tierColors(t, nearest.tone);
                  return {
                    mt: 0.6,
                    height: 5,
                    borderRadius: 3,
                    bgcolor: subtleBg(t, true),
                    "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: colors.main },
                  };
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {formatNumber(nearest.progress.currentValue)} из{" "}
                {formatNumber(nearest.progress.nextThreshold ?? 0)}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" fontWeight={600} noWrap>
              Все уровни собраны
            </Typography>
          )}
        </StatTile>
      </Box>

      {shelf.length > 0 && (
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ fontWeight: 600, letterSpacing: 0.6 }}
          >
            Мои бейджи
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
            {shelf.map((e) => {
              const def = defByCode.get(e.code);
              if (!def) return null;
              return (
                <Tooltip
                  key={e.code}
                  title={`${def.title} — ${e.tierName} · ${formatDateRu(e.achievedAt)}`}
                >
                  <Box sx={{ display: "inline-flex" }}>
                    <AchievementBadge
                      code={e.code}
                      tone={tierTone(e.level, def.tiers.length)}
                      size={44}
                    />
                  </Box>
                </Tooltip>
              );
            })}
          </Stack>
        </Box>
      )}
    </Stack>
  );
};

// ── Командные достижения ──────────────────────────────────────────────────────

/** Строка командного достижения: бейдж в кольце прогресса + цифры. */
const OrgAchievementRow: React.FC<{
  definition: AchievementDefinition;
  earned: EarnedAchievement | null;
  progress: AchievementProgress | null;
}> = ({ definition, earned, progress }) => {
  const tiersCount = definition.tiers.length;
  const earnedTone = earned ? tierTone(earned.level, tiersCount) : null;

  const nextTier =
    progress?.nextLevel != null
      ? definition.tiers.find((t) => t.level === progress.nextLevel) ?? null
      : null;
  const nextTone = nextTier ? tierTone(nextTier.level, tiersCount) : null;
  const maxed = progress != null && progress.nextLevel == null;

  const pct =
    nextTier && progress
      ? Math.min(100, Math.round((progress.currentValue / nextTier.threshold) * 100))
      : null;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={(t) => ({
        px: 1.5,
        py: 1.5,
        borderRadius: "10px",
        border: 1,
        borderColor: "divider",
        bgcolor: subtleBg(t),
        minWidth: 0,
        transition: "background-color .15s ease, border-color .15s ease",
        "&:hover": {
          bgcolor: subtleBg(t, true),
          borderColor: alpha(t.palette.primary.main, 0.28),
        },
      })}
    >
      <AchievementRing
        code={definition.code}
        badgeTone={earnedTone}
        ringTone={nextTone}
        pct={pct}
        size={48}
      />

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {definition.title}
          </Typography>
          {earned && earnedTone && (
            <Chip
              size="small"
              label={earned.tierName}
              sx={(t) => {
                const colors = tierColors(t, earnedTone);
                return {
                  height: 20,
                  borderRadius: "6px",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: colors.fg,
                  bgcolor: alpha(colors.main, t.palette.mode === "dark" ? 0.18 : 0.1),
                };
              }}
            />
          )}
        </Stack>

        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {definition.description}
        </Typography>

        {nextTier && progress && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
            <Box component="span" fontWeight={600} color="text.primary">
              {formatNumber(progress.currentValue)}
            </Box>{" "}
            из {formatNumber(nextTier.threshold)} · след. {nextTier.name}
          </Typography>
        )}

        {maxed && (
          <Typography
            variant="caption"
            component="div"
            sx={(t) => ({
              mt: 0.25,
              fontWeight: 600,
              color: t.palette.mode === "dark" ? t.palette.success.light : t.palette.success.dark,
            })}
          >
            Максимальный уровень
            {earned && ` · ${formatDateRu(earned.achievedAt)}`}
          </Typography>
        )}
      </Box>
    </Stack>
  );
};

// ── Страница ──────────────────────────────────────────────────────────────────

/**
 * Страница «Достижения»: мои успехи (бейджи + ближайшая цель), лента последних
 * достижений коллег (только факты получения — никаких рейтингов) и командные
 * достижения клиники с кольцами прогресса.
 */
const AchievementsPage: React.FC = () => {
  usePageTitle("Достижения");
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

  const feedQuery = useInfiniteQuery({
    queryKey: djangoQueryKeys.achievements.feed({ pageSize: FEED_PAGE_SIZE }),
    queryFn: ({ pageParam, signal }) =>
      getAchievementsFeed({ page: pageParam, pageSize: FEED_PAGE_SIZE, organizationId: orgId }, signal),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const orgQuery = useQuery({
    queryKey: djangoQueryKeys.achievements.organization,
    queryFn: ({ signal }) => getOrganizationAchievements(orgId, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const definitions = definitionsQuery.data;
  const tiersCountByCode = React.useMemo(
    () => new Map((definitions ?? []).map((d) => [d.code, d.tiers.length])),
    [definitions],
  );

  const feedItems = React.useMemo(
    () => feedQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [feedQuery.data],
  );

  // Лента сгруппирована по «давности»; порядок внутри групп — как отдаёт бэк.
  const feedGroups = React.useMemo(() => {
    const map = new Map<string, AchievementFeedItem[]>();
    for (const item of feedItems) {
      const bucket = feedBucket(item.achievedAt);
      map.set(bucket, [...(map.get(bucket) ?? []), item]);
    }
    return FEED_BUCKETS.filter((b) => map.has(b)).map((b) => ({
      label: b,
      items: map.get(b)!,
    }));
  }, [feedItems]);

  const orgDefinitions = (definitions ?? []).filter((d) => d.scope === "organization");
  const orgEarnedByCode = orgQuery.data ? topEarnedByCode(orgQuery.data.achievements) : null;
  const orgProgressByCode = orgQuery.data
    ? new Map(orgQuery.data.progress.map((p) => [p.code, p]))
    : null;

  const loading = !definitions || !myQuery.data || !feedQuery.data || !orgQuery.data;
  const error =
    definitionsQuery.isError || myQuery.isError || feedQuery.isError || orgQuery.isError;

  return (
    <Box
      sx={(t) => ({
        height: {
          xs: `calc(100dvh - ${t.appLayout.header.height.mobile}px)`,
          md: `calc(100dvh - ${t.appLayout.header.height.desktop}px)`,
        },
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      })}
    >
      <PageHeader title="Достижения" />

      <Box
        sx={(t) => ({
          px: t.appLayout.page.paddingX,
          pt: 0.5,
          pb: t.appLayout.page.paddingY,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
        })}
      >
        {error ? (
          <Alert severity="error">Не удалось загрузить достижения</Alert>
        ) : loading ? (
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={160} sx={{ borderRadius: "14px" }} />
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 420px)" },
              }}
            >
              <Skeleton variant="rounded" height={360} sx={{ borderRadius: "14px" }} />
              <Skeleton variant="rounded" height={300} sx={{ borderRadius: "14px" }} />
            </Box>
          </Stack>
        ) : (
          <MotionBox
            variants={containerVariants}
            initial="hidden"
            animate="show"
            sx={{
              display: "grid",
              gap: 2,
              alignItems: "start",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 420px)" },
            }}
          >
            {/* ───── Мои успехи: статы + полка бейджей ───── */}
            <MotionBox variants={itemVariants} sx={{ gridColumn: "1 / -1", minWidth: 0 }}>
              <AppCard variant="outlined" title="Мои успехи">
                <MyHighlights
                  definitions={definitions!}
                  achievements={myQuery.data!.achievements}
                  progress={myQuery.data!.progress}
                />
              </AppCard>
            </MotionBox>

            {/* ───── Лента достижений коллег ───── */}
            <MotionBox variants={itemVariants} sx={{ minWidth: 0 }}>
              <AppCard variant="outlined" title="Лента">
                {feedItems.length === 0 ? (
                  <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
                    <Box
                      sx={(t) => ({
                        width: 48,
                        height: 48,
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "text.disabled",
                        bgcolor: subtleBg(t),
                        border: 1,
                        borderColor: "divider",
                      })}
                    >
                      <EmojiEventsOutlined />
                    </Box>
                    <Typography variant="body2" color="text.secondary" align="center">
                      Пока пусто — здесь будут появляться достижения коллег.
                    </Typography>
                  </Stack>
                ) : (
                  <>
                    <Stack spacing={1}>
                      {feedGroups.map((group) => (
                        <Box key={group.label}>
                          <Typography
                            variant="overline"
                            color="text.secondary"
                            sx={{ fontWeight: 600, letterSpacing: 0.6 }}
                          >
                            {group.label}
                          </Typography>
                          <Stack
                            divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}
                          >
                            {group.items.map((item) => (
                              <FeedRow
                                key={item.id}
                                item={item}
                                tiersCount={tiersCountByCode.get(item.code) ?? 4}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                    {feedQuery.hasNextPage && (
                      <AppButton
                        variant="outlined"
                        fullWidth
                        sx={{ mt: 1 }}
                        disabled={feedQuery.isFetchingNextPage}
                        onClick={() => feedQuery.fetchNextPage()}
                      >
                        {feedQuery.isFetchingNextPage ? "Загрузка..." : "Показать ещё"}
                      </AppButton>
                    )}
                  </>
                )}
              </AppCard>
            </MotionBox>

            {/* ───── Командные достижения клиники ───── */}
            <MotionBox variants={itemVariants} sx={{ minWidth: 0 }}>
              <AppCard variant="outlined" title="Достижения клиники">
                <Stack spacing={1.25}>
                  {orgDefinitions.map((d) => (
                    <OrgAchievementRow
                      key={d.code}
                      definition={d}
                      earned={orgEarnedByCode?.get(d.code) ?? null}
                      progress={orgProgressByCode?.get(d.code) ?? null}
                    />
                  ))}
                </Stack>
              </AppCard>
            </MotionBox>
          </MotionBox>
        )}
      </Box>
    </Box>
  );
};

export default AchievementsPage;
