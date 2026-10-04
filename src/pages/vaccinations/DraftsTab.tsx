import React from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { AppButton } from "../../components/ui";
import AdministerVaccinationDrawer from "../../components/vaccinations/AdministerVaccinationDrawer";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { getRecords, type VaccinationRecord } from "../../api/vaccinations";
import { MISSING_FIELD_LABELS } from "./meta";
import { RECORDS_PAGE_SIZE } from "./recordsFeed";

type Mode = "drafts" | "missingInn";

type Props = {
  branchId: number | null;
  orgId: number | undefined;
  canRecord: boolean;
  canUpdatePatient: boolean;
  /** Открыть правку пациента (тот же карандаш, что в «Кому пора»). */
  onEditPatient: (patientId: number) => void;
};

/** Колонки строки: дата · пациент · вакцина · чего не хватает · кнопка. */
const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr auto",
    md: "130px minmax(180px, 1fr) minmax(200px, 1.2fr) minmax(220px, 1.2fr) 130px",
  },
  columnGap: 1.5,
  alignItems: "center",
} as const;

/**
 * «Не оформлено»: вакцины, проданные в приёмах, по которым медсестра ещё не
 * внесла партию, дозу и т. п. — без этого они не попадают в отчёты. Второй
 * режим — «Дополнить ИНН»: проведённые прививки пациентов без ИНН (их не
 * отправить в госсистему). Список листается сплошь, без страниц: порции
 * догружаются при прокрутке.
 */
const DraftsTab: React.FC<Props> = ({ branchId, orgId, canRecord, canUpdatePatient, onEditPatient }) => {
  const [mode, setMode] = React.useState<Mode>("drafts");
  const [recordId, setRecordId] = React.useState<number | null>(null);

  const filters = React.useMemo(
    () => ({
      branchId: branchId ?? undefined,
      organizationId: orgId,
      ...(mode === "drafts" ? { status: "draft" as const } : { missingInn: true }),
    }),
    [branchId, orgId, mode],
  );

  const query = useInfiniteQuery({
    queryKey: djangoQueryKeys.vaccinations.records({ feed: true, mode, ...filters }),
    queryFn: ({ pageParam, signal }) =>
      getRecords({ ...filters, offset: pageParam, limit: RECORDS_PAGE_SIZE }, signal),
    initialPageParam: 0,
    getNextPageParam: (last, all) =>
      last.length < RECORDS_PAGE_SIZE ? undefined : all.reduce((n, p) => n + p.length, 0),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
  const records = React.useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, records.length]);

  const action = (row: VaccinationRecord) =>
    mode === "drafts"
      ? canRecord && (
          <AppButton size="small" variant="contained" onClick={() => setRecordId(row.id)}>
            Оформить
          </AppButton>
        )
      : canUpdatePatient && (
          <AppButton size="small" variant="outlined" onClick={() => onEditPatient(row.patientId)}>
            Указать ИНН
          </AppButton>
        );

  const headers = [
    mode === "drafts" ? "Приём" : "Дата",
    "Пациент",
    "Вакцина",
    mode === "drafts" ? "Не хватает" : "ИНН",
    "",
  ];

  return (
    <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={mode}
        onChange={(_, v) => v && setMode(v)}
        sx={{ alignSelf: "flex-start" }}
      >
        <ToggleButton value="drafts" sx={{ textTransform: "none", px: 1.5 }}>
          Не оформлено
        </ToggleButton>
        <ToggleButton value="missingInn" sx={{ textTransform: "none", px: 1.5 }}>
          Дополнить ИНН
        </ToggleButton>
      </ToggleButtonGroup>
      {query.error ? (
        <Alert severity="error">
          {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
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
              zIndex: 1,
              bgcolor: th.palette.background.paper,
              borderBottom: 1,
              borderColor: "divider",
            })}
          >
            {headers.map((h, i) => (
              <Typography key={i} variant="caption" color="text.secondary" fontWeight={600}>
                {h}
              </Typography>
            ))}
          </Box>

          {query.isLoading ? (
            <Stack spacing={1} sx={{ p: 2 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" height={44} />
              ))}
            </Stack>
          ) : records.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography color="text.secondary">
                {mode === "drafts" ? "Все проданные вакцины оформлены" : "У всех привитых указан ИНН"}
              </Typography>
            </Box>
          ) : (
            records.map((row) => {
              const when = dayjs(row.administeredAt).format("DD.MM.YYYY HH:mm");
              return (
                <Box
                  key={row.id}
                  sx={{
                    ...ROW_GRID,
                    px: 2,
                    py: 0.75,
                    minHeight: 44,
                    borderTop: 1,
                    borderColor: "divider",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }}>
                    {when}
                  </Typography>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {row.patient?.fullName ?? `#${row.patientId}`}
                    </Typography>
                    {/* На узком экране дата и вакцина — второй строкой. */}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      sx={{ display: { xs: "block", md: "none" } }}
                    >
                      {when} · {row.vaccineName}
                    </Typography>
                  </Box>
                  <Typography variant="body2" noWrap sx={{ display: { xs: "none", md: "block" } }}>
                    {row.vaccineName}
                  </Typography>
                  <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}>
                    {mode === "drafts" ? (
                      <Stack direction="row" gap={0.5} flexWrap="wrap">
                        {(row.missing ?? []).map((k) => (
                          <Chip key={k} size="small" variant="outlined" label={MISSING_FIELD_LABELS[k] ?? k} />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {row.patient?.innAbsentReason ? "нет — указана причина" : "не указан"}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ justifySelf: "end" }}>{action(row)}</Box>
                </Box>
              );
            })
          )}

          <Box ref={sentinelRef} sx={{ py: 2, display: "flex", justifyContent: "center" }}>
            {isFetchingNextPage && <CircularProgress size={22} />}
            {!hasNextPage && records.length > 0 && (
              <Typography variant="caption" color="text.disabled">
                Показаны все: {records.length}
              </Typography>
            )}
          </Box>
        </Box>
      )}
      <AdministerVaccinationDrawer
        open={recordId != null}
        recordId={recordId}
        onClose={() => setRecordId(null)}
      />
    </Stack>
  );
};

export default DraftsTab;
