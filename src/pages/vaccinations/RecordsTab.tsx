import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  ButtonBase,
  CircularProgress,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { DateRangeField, DEFAULT_RANGE_PRESETS, UserAvatar, type DateRange, type DateRangePreset } from "../../components/ui";
import { RecordStatusChip } from "../../components/vaccinations/VaccinationChips";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { getRecords, getRecordsSummary, getVaccines, type VaccinationRecord } from "../../api/vaccinations";
import { TotalTile } from "./TotalTile";
import { formatCount, formatMoney } from "./totalsFormat";
import PeriodStepper from "../../components/vaccinations/PeriodStepper";
import { periodBounds } from "../../components/vaccinations/periodStep";
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

/** Колонки строки ленты: время · пациент · вакцина · назначил · ввёл · статус. */
const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: {
    xs: "44px 1fr auto",
    md: "48px minmax(180px, 1fr) minmax(220px, 1.4fr) minmax(130px, 170px) minmax(150px, 190px) 112px",
  },
  columnGap: 1.5,
  alignItems: "center",
} as const;

/** Одна запись — одна строка: главное обычным цветом, пояснения серым рядом. */
const RecordRow: React.FC<{ r: VaccinationRecord }> = ({ r }) => {
  const age = ageAt(r.patient?.birthDate, r.administeredAt);
  const where = [r.isExternal ? "в другом месте" : "со склада", r.injectionSite ? injectionSiteLabel(r.injectionSite).toLowerCase() : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Box sx={{ ...ROW_GRID, px: 2, py: 0.5, minHeight: 36, borderTop: 1, borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {dayjs(r.administeredAt).format("HH:mm")}
      </Typography>
      <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
        <Box component="span" sx={{ fontWeight: 600 }}>
          {r.patient?.fullName ?? `Пациент #${r.patientId}`}
        </Box>
        <Box component="span" sx={{ color: "text.secondary" }}>
          {age ? ` · ${age}` : ""}
        </Box>
        {/* На узком экране вакцина — в той же строке. */}
        <Box component="span" sx={{ color: "text.secondary", display: { xs: "inline", md: "none" } }}>
          {` · ${r.vaccineName}, доза ${r.doseNumber}`}
        </Box>
      </Typography>
      <Typography variant="body2" noWrap sx={{ minWidth: 0, display: { xs: "none", md: "block" } }}>
        {r.vaccineName} · доза {r.doseNumber}
        <Box component="span" sx={{ color: "text.secondary" }}>
          {` · ${where}`}
        </Box>
      </Typography>
      <Typography
        variant="body2"
        noWrap
        color={r.prescribedBy ? "text.primary" : "text.disabled"}
        sx={{ minWidth: 0, display: { xs: "none", md: "block" } }}
        title={r.prescribedBy ? `Врач приёма: ${r.prescribedBy.fullName}` : "Без приёма врача"}
      >
        {r.prescribedBy?.fullName ?? "—"}
      </Typography>
      <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0, display: { xs: "none", md: "flex" } }}>
        {r.isExternal ? (
          // Сделана не у нас: наш сотрудник её не вводил, а только внёс запись.
          <Typography
            variant="body2"
            noWrap
            color="text.secondary"
            title={r.recordedBy ? `Запись внёс: ${r.recordedBy.fullName}` : undefined}
          >
            в другом месте
            {r.recordedBy && (
              <Box component="span" sx={{ color: "text.disabled", fontSize: 12 }}>
                {` · внёс ${r.recordedBy.fullName}`}
              </Box>
            )}
          </Typography>
        ) : r.administeredBy ? (
          <>
            <UserAvatar name={r.administeredBy.fullName} size={22} sx={{ borderRadius: "6px", flexShrink: 0, fontSize: 10 }} />
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
      <Box sx={{ justifySelf: "end", transform: "scale(0.9)", transformOrigin: "right center" }}>
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
  // Период: месяц/год стрелками (по умолчанию — текущий месяц) или свой.
  const [mode, setMode] = React.useState<"month" | "year" | "custom">("month");
  const [month, setMonth] = React.useState(() => dayjs().format("YYYY-MM"));
  const [range, setRange] = React.useState<DateRange>({
    from: dayjs().subtract(29, "day").startOf("day"),
    to: dayjs().endOf("day"),
  });
  const bounds =
    mode === "custom"
      ? { from: range.from.format("YYYY-MM-DD"), to: range.to.format("YYYY-MM-DD") }
      : periodBounds(month, mode);
  const dateFrom = bounds.from;
  const dateTo = bounds.to;
  const [vaccineId, setVaccineId] = React.useState<number | null>(null);

  const filters = {
    branchId: branchId ?? undefined,
    dateFrom,
    dateTo,
    vaccineId: vaccineId ?? undefined,
    organizationId: orgId,
  };

  const vaccinesQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.vaccines({ orgId, picker: "records-filter" }),
    queryFn: ({ signal }) => getVaccines({ includeInactive: true, organizationId: orgId }, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const vaccines = vaccinesQuery.data ?? [];
  const selectedVaccine = vaccines.find((v) => v.id === vaccineId) ?? null;

  // Итоги считает сервер: лента грузится порциями, по ней сумму не сложить.
  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.recordsSummary(filters),
    queryFn: ({ signal }) => getRecordsSummary(filters, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
  const summary = summaryQuery.data;

  const query = useInfiniteQuery({
    queryKey: djangoQueryKeys.vaccinations.records({ feed: true, ...filters }),
    queryFn: ({ pageParam, signal }) =>
      getRecords({ ...filters, offset: pageParam, limit: RECORDS_PAGE_SIZE }, signal),
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
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)}>
          <ToggleButton value="month" sx={{ textTransform: "none", px: 1.5 }}>
            Месяц
          </ToggleButton>
          <ToggleButton value="year" sx={{ textTransform: "none", px: 1.5 }}>
            Год
          </ToggleButton>
          <ToggleButton value="custom" sx={{ textTransform: "none", px: 1.5 }}>
            Период
          </ToggleButton>
        </ToggleButtonGroup>
        {mode === "custom" ? (
          <DateRangeField value={range} onChange={setRange} presets={RANGE_PRESETS} minWidth={240} />
        ) : (
          <PeriodStepper value={month} onChange={setMonth} mode={mode} />
        )}
        <Autocomplete
          size="small"
          options={vaccines}
          value={selectedVaccine}
          onChange={(_, v) => setVaccineId(v?.id ?? null)}
          getOptionLabel={(v) => v.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          noOptionsText="Ничего не найдено"
          sx={{ width: 260 }}
          renderInput={(params) => <TextField {...params} placeholder="Все вакцины" />}
        />
      </Stack>

      {/* Итоги за период с учётом фильтра. */}
      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="stretch" sx={{ mb: 1, flexShrink: 0 }}>
        <TotalTile
          label="Прививок"
          value={summary ? formatCount(summary.count) : "…"}
          hint={summary ? `у нас ${summary.ours} · в другом месте ${summary.external}` : undefined}
        />
        <TotalTile
          label="Детей"
          value={summary ? formatCount(summary.patients) : "…"}
          hint={summary && summary.patients ? `разных детей за период` : undefined}
        />
        <TotalTile
          label="Сумма"
          value={summary ? (Number(summary.amount) > 0 ? formatMoney(summary.amount) : "—") : "…"}
          hint={
            summary && Number(summary.amount) === 0
              ? "платных прививок нет — госвакцины бесплатны"
              : "платные прививки у нас, со скидкой"
          }
          accent={summary != null && Number(summary.amount) > 0}
        />
      </Stack>

      {/* Разбивка по вакцинам — отдельно от итогов; метка = быстрый фильтр. */}
      {summary && summary.byVaccine.length > 0 && !vaccineId && (
        <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center" sx={{ mb: 1.5, flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.25 }}>
            По вакцинам:
          </Typography>
          {summary.byVaccine.map((v) => (
            <ButtonBase
              key={v.vaccineId}
              onClick={() => setVaccineId(v.vaccineId)}
              title={
                Number(v.amount) > 0
                  ? `${v.vaccineName}: ${formatMoney(v.amount)} — показать только её`
                  : `Показать только ${v.vaccineName}`
              }
              sx={(th) => ({
                px: 1,
                height: 26,
                borderRadius: "13px",
                border: 1,
                borderColor: "divider",
                gap: 0.5,
                fontSize: 13,
                "&:hover": { borderColor: "primary.main", bgcolor: alpha(th.palette.primary.main, 0.06) },
              })}
            >
              <Box component="span">{v.vaccineName}</Box>
              <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {formatCount(v.count)}
              </Box>
            </ButtonBase>
          ))}
        </Stack>
      )}
      {vaccineId && <Box sx={{ mb: 0.5 }} />}

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
              py: 0.75,
              position: "sticky",
              top: 0,
              zIndex: 2,
              bgcolor: th.palette.background.paper,
              borderBottom: 1,
              borderColor: "divider",
            })}
          >
            {["Время", "Пациент", "Вакцина", "Назначил", "Кто вводил", "Статус"].map((h, i) => (
              <Typography
                key={h}
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={i === 5 ? { justifySelf: "end" } : undefined}
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
                    py: 0.4,
                    position: "sticky",
                    top: { xs: 0, md: 33 },
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
