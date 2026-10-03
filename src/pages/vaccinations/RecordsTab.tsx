import React from "react";
import { Alert, Box, CircularProgress, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { DateRangeField, DEFAULT_RANGE_PRESETS, UserAvatar, type DateRange, type DateRangePreset } from "../../components/ui";
import { RecordStatusChip } from "../../components/vaccinations/VaccinationChips";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { getRecords, type VaccinationRecord } from "../../api/vaccinations";
import { injectionSiteLabel } from "./meta";
import { ageAt, groupRecordsByDay, RECORDS_PAGE_SIZE } from "./recordsFeed";

type Props = {
  branchId: number | null;
  orgId?: number;
};

/** Пресеты периода + «За всё время» — с лентой можно листать всю историю. */
const RANGE_PRESETS: DateRangePreset[] = [
  ...DEFAULT_RANGE_PRESETS,
  { key: "year", label: "Этот год", range: () => [dayjs().startOf("year"), dayjs().endOf("day")] },
  { key: "all", label: "За всё время", range: () => [dayjs("2000-01-01"), dayjs().endOf("day")] },
];

/** Колонки строки ленты: время · пациент · вакцина · кто вводил · статус. */
const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: { xs: "56px 1fr auto", md: "64px minmax(180px, 1.1fr) minmax(200px, 1.4fr) 200px 130px" },
  columnGap: 2,
  alignItems: "center",
} as const;

const RecordRow: React.FC<{ r: VaccinationRecord }> = ({ r }) => {
  const age = ageAt(r.patient?.birthDate, r.administeredAt);
  return (
    <Box sx={{ ...ROW_GRID, px: 2, py: 1.25, borderTop: 1, borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}>
      <Typography variant="body2" color="text.secondary">
        {dayjs(r.administeredAt).format("HH:mm")}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {r.patient?.fullName ?? `Пациент #${r.patientId}`}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {age ?? "возраст не указан"}
          {/* На узком экране вакцина — под пациентом. */}
          <Box component="span" sx={{ display: { xs: "inline", md: "none" } }}>
            {` · ${r.vaccineName}, доза ${r.doseNumber}`}
          </Box>
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0, display: { xs: "none", md: "block" } }}>
        <Typography variant="body2" fontWeight={500} noWrap>
          {r.vaccineName} · доза {r.doseNumber}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {r.isExternal ? "Сделана в другом месте" : "Со склада"}
          {r.injectionSite ? ` · ${injectionSiteLabel(r.injectionSite)}` : ""}
        </Typography>
      </Box>
      <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0, display: { xs: "none", md: "flex" } }}>
        {r.administeredBy ? (
          <>
            <UserAvatar name={r.administeredBy.fullName} size={28} sx={{ borderRadius: "8px", flexShrink: 0 }} />
            <Typography variant="body2" noWrap>
              {r.administeredBy.fullName}
            </Typography>
          </>
        ) : (
          <Typography variant="body2" color="text.disabled">
            —
          </Typography>
        )}
      </Stack>
      <Box sx={{ justifySelf: "end" }}>
        <RecordStatusChip status={r.status} />
      </Box>
    </Box>
  );
};

/**
 * «Записи» — все сделанные прививки лентой по дням: фильтр периода сверху,
 * догрузка порциями при прокрутке до конца.
 */
const RecordsTab: React.FC<Props> = ({ branchId, orgId }) => {
  const [range, setRange] = React.useState<DateRange>({
    from: dayjs().subtract(29, "day").startOf("day"),
    to: dayjs().endOf("day"),
  });
  const dateFrom = range.from.format("YYYY-MM-DD");
  const dateTo = range.to.format("YYYY-MM-DD");

  const query = useInfiniteQuery({
    queryKey: djangoQueryKeys.vaccinations.records({ feed: true, branchId, orgId, dateFrom, dateTo }),
    queryFn: ({ pageParam, signal }) =>
      getRecords(
        {
          branchId: branchId ?? undefined,
          dateFrom,
          dateTo,
          organizationId: orgId,
          offset: pageParam,
          limit: RECORDS_PAGE_SIZE,
        },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, all) =>
      last.length < RECORDS_PAGE_SIZE ? undefined : all.reduce((n, p) => n + p.length, 0),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const records = React.useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const days = React.useMemo(() => groupRecordsByDay(records), [records]);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scrollRef.current, rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, days.length]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap" sx={{ mb: 1.5, flexShrink: 0 }}>
        <DateRangeField value={range} onChange={setRange} presets={RANGE_PRESETS} minWidth={240} />
        <Typography variant="body2" color="text.secondary">
          {query.isLoading
            ? "Загрузка…"
            : records.length === 0
              ? "Нет прививок за период"
              : `Показано ${records.length}${hasNextPage ? " — листайте вниз, догрузятся ещё" : ""}`}
        </Typography>
      </Stack>

      {query.error ? (
        <Alert severity="error">
          {query.error instanceof Error ? query.error.message : "Не удалось загрузить записи"}
        </Alert>
      ) : (
        <Box
          ref={scrollRef}
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", border: 1, borderColor: "divider", borderRadius: "12px" }}
        >
          {/* Шапка колонок — только на широком экране. */}
          <Box
            sx={(th) => ({
              ...ROW_GRID,
              display: { xs: "none", md: "grid" },
              px: 2,
              py: 1,
              position: "sticky",
              top: 0,
              zIndex: 2,
              bgcolor: th.palette.background.paper,
              borderBottom: 1,
              borderColor: "divider",
            })}
          >
            {["Время", "Пациент", "Вакцина", "Кто вводил", "Статус"].map((h, i) => (
              <Typography
                key={h}
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={i === 4 ? { justifySelf: "end" } : undefined}
              >
                {h}
              </Typography>
            ))}
          </Box>

          {query.isLoading ? (
            <Stack spacing={1} sx={{ p: 2 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" height={48} />
              ))}
            </Stack>
          ) : records.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography color="text.secondary">Нет прививок за выбранный период</Typography>
            </Box>
          ) : (
            days.map((d) => (
              <Box key={d.day}>
                <Stack
                  direction="row"
                  alignItems="baseline"
                  gap={1}
                  sx={(th) => ({
                    px: 2,
                    py: 0.75,
                    position: "sticky",
                    top: { xs: 0, md: 37 },
                    zIndex: 1,
                    bgcolor: alpha(th.palette.primary.main, 0.06),
                    backdropFilter: "blur(6px)",
                  })}
                >
                  <Typography variant="subtitle2">{d.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {d.countText}
                  </Typography>
                </Stack>
                {d.items.map((r) => (
                  <RecordRow key={r.id} r={r} />
                ))}
              </Box>
            ))
          )}

          <Box ref={sentinelRef} sx={{ py: 2, display: "flex", justifyContent: "center" }}>
            {isFetchingNextPage && <CircularProgress size={22} />}
            {!hasNextPage && records.length > 0 && (
              <Typography variant="caption" color="text.disabled">
                Это все прививки за период
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default RecordsTab;
