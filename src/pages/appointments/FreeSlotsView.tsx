import React from "react";
import { Alert, Box, Button, Card, Chip, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import KeyboardArrowLeftOutlined from "@mui/icons-material/KeyboardArrowLeftOutlined";
import KeyboardArrowRightOutlined from "@mui/icons-material/KeyboardArrowRightOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { getSpecializations, type DjangoSpecialization } from "../../api/staff";
import {
  getAvailability,
  getAvailabilitySummary,
  type EmployeeAvailability,
  type AvailabilityDay,
  type AvailabilitySlot,
} from "../../api/scheduling";
import { parseBackendError } from "../../api/appointments";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../api/queryKeys";
import { subtleBg } from "../../theme/uiHelpers";

const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_NOMINATIVE = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const MONTHS_SHORT = [
  "янв.", "фев.", "мар.", "апр.", "мая", "июн.",
  "июл.", "авг.", "сен.", "окт.", "ноя.", "дек.",
];

/** На сколько дней вперёд регистратор ищет окна (влезает в лимит бэка 62). */
const HORIZON_DAYS = 14;

/** Индекс дня недели с понедельника (Пн=0 … Вс=6), без плагина isoWeek. */
function mondayIndex(d: Dayjs): number {
  return (d.day() + 6) % 7;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
}

/** Стабильный цвет аватара по имени (аналог stringToColor из оригинала). */
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 52% 46%)`;
}

type DocStatus = "free" | "later" | "none";

interface DocSummary {
  todayFree: number;
  nearest: { date: string; start: string } | null;
  status: DocStatus;
  /** Подпись под именем врача. */
  label: string;
  /** true, если у врача нет ни одного рабочего дня в горизонте. */
  noSchedule: boolean;
}

function summarize(emp: EmployeeAvailability, todayIso: string): DocSummary {
  const today = emp.days.find((d) => d.date === todayIso);
  const todayFree = today?.freeCount ?? 0;
  const nearest = emp.nearestFree;
  // «График не задан» — только если в горизонте нет ни рабочего дня, ни
  // выходного/отпуска по исключению (иначе график есть, просто нет окон).
  const noSchedule = !emp.days.some((d) => d.scheduled || d.dayOff);

  if (nearest && nearest.date === todayIso) {
    return { todayFree, nearest, status: "free", label: `Сегодня, ближайшее ${nearest.start}`, noSchedule };
  }
  if (nearest) {
    const d = dayjs(nearest.date);
    const isTomorrow = nearest.date === dayjs().add(1, "day").format("YYYY-MM-DD");
    const rel = isTomorrow ? "завтра" : `${WEEKDAY_SHORT[mondayIndex(d)]} ${d.date()}`;
    return { todayFree, nearest, status: "later", label: `Ближайшее ${rel}, ${nearest.start}`, noSchedule };
  }
  return {
    todayFree,
    nearest: null,
    status: "none",
    label: noSchedule ? "График не задан" : "Свободных окон нет",
    noSchedule,
  };
}

const STATUS_DOT: Record<DocStatus, "success.main" | "warning.main" | "text.disabled"> = {
  free: "success.main",
  later: "warning.main",
  none: "text.disabled",
};

export interface FreeSlotsViewProps {
  branchId?: number;
  organizationId?: number;
  headerActions?: React.ReactNode;
  /** Открыть создание приёма с предзаполнением врача и времени (услуга — в форме). */
  onBook: (employeeId: number, isoDateTime: string) => void;
}

const FreeSlotsView: React.FC<FreeSlotsViewProps> = ({ branchId, organizationId, headerActions, onBook }) => {
  const theme = useTheme();

  const todayIso = React.useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const dateFrom = todayIso;
  const dateTo = React.useMemo(
    () => dayjs().add(HORIZON_DAYS - 1, "day").format("YYYY-MM-DD"),
    [],
  );

  const [specId, setSpecId] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState("");
  const [selDocId, setSelDocId] = React.useState<number | null>(null);
  const [selDay, setSelDay] = React.useState<string | null>(null);
  const stripRef = React.useRef<HTMLDivElement>(null);

  // Справочник специализаций — левый рельс.
  const specsQuery = useQuery({
    queryKey: ["django", "scheduling", "specs", organizationId ?? null],
    queryFn: ({ signal }) => getSpecializations(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const specs: DjangoSpecialization[] = React.useMemo(
    () => (specsQuery.data ?? []).filter((s) => s.isActive),
    [specsQuery.data],
  );

  // По умолчанию открываем вид «Все специалисты» (specId === null), а не
  // какую-то конкретную специальность.

  // Бейджи всех специальностей приходят одной агрегированной сводкой, без N запросов.
  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.availabilitySummary({
      date: todayIso,
      branchId: branchId ?? null,
      organizationId: organizationId ?? null,
    }),
    queryFn: ({ signal }) =>
      getAvailabilitySummary({ date: todayIso, branchId, organizationId }, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const badgeBySpec = React.useMemo(() => {
    const map = new Map<number, { free: number; total: number }>();
    summaryQuery.data?.specializations.forEach((specialization) => {
      map.set(specialization.specializationId, {
        free: specialization.freeEmployeeCount,
        total: specialization.employeeCount,
      });
    });
    return map;
  }, [summaryQuery.data]);

  // Полный диапазон окон выбранной специализации, либо всех сотрудников
  // (specId === null — вид «Все специалисты»).
  const availQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.availability({
      specializationId: specId,
      dateFrom,
      dateTo,
      branchId: branchId ?? null,
      organizationId: organizationId ?? null,
    }),
    queryFn: ({ signal }) =>
      getAvailability(
        { specializationId: specId ?? undefined, dateFrom, dateTo, branchId, organizationId },
        signal,
      ),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  // Врачи специальности + сводка, отсортированные «лучшие сверху».
  const docs = React.useMemo(() => {
    const list = (availQuery.data?.employees ?? [])
      .filter((emp) => emp.days.some((d) => d.scheduled))
      .map((emp) => ({
        emp,
        sum: summarize(emp, todayIso),
      }));
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((x) => x.emp.fullName.toLowerCase().includes(q)) : list;
    return filtered.sort((a, b) => {
      const byToday = Number(b.sum.todayFree > 0) - Number(a.sum.todayFree > 0);
      if (byToday) return byToday;
      const an = a.sum.nearest ? dayjs(a.sum.nearest.date).valueOf() : Infinity;
      const bn = b.sum.nearest ? dayjs(b.sum.nearest.date).valueOf() : Infinity;
      if (an !== bn) return an - bn;
      return a.emp.fullName.localeCompare(b.emp.fullName);
    });
  }, [availQuery.data, search, todayIso]);

  // Сбрасываем выбор врача только если выбранного врача больше нет в отфильтрованном списке.
  React.useEffect(() => {
    if (selDocId !== null && !docs.some((x) => x.emp.employeeId === selDocId)) {
      setSelDocId(null);
    }
  }, [docs, selDocId]);

  const selectedDoc = docs.find((x) => x.emp.employeeId === selDocId) ?? null;
  // В навбаре оставляем только реальные смены. Выходные, отпуск и дни без
  // расписания не должны выглядеть как даты, на которые можно записать пациента.
  const selectableDays = React.useMemo(() => {
    if (selectedDoc) {
      return selectedDoc.emp.days.filter((day) => day.scheduled);
    }
    const map = new Map<string, AvailabilityDay>();
    for (const { emp } of docs) {
      for (const d of emp.days) {
        if (d.scheduled) {
          const existing = map.get(d.date);
          if (!existing) {
            map.set(d.date, { ...d });
          } else {
            existing.freeCount += d.freeCount;
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedDoc, docs]);

  // День по умолчанию — ближайший с окнами.
  React.useEffect(() => {
    if (!selectableDays.length) return;
    if (selDay && selectableDays.some((day) => day.date === selDay)) return;
    const firstFree = selectableDays.find((day) => day.freeCount > 0);
    setSelDay(firstFree?.date ?? selectableDays[0].date ?? todayIso);
  }, [selectableDays, selDay, todayIso]);

  const selectedDay = selectableDays.find((day) => day.date === selDay) ?? null;
  const selectedMonth = dayjs(selectedDay?.date ?? selectableDays[0]?.date ?? todayIso);
  const selectedMonthLabel = `${MONTHS_NOMINATIVE[selectedMonth.month()]} ${selectedMonth.year()}`;

  const scrollStrip = (dir: -1 | 1) => {
    stripRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* ── Верхний навбар дат и кнопка переключения режимов ── */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 1, flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ flexShrink: 0, mr: 1, whiteSpace: "nowrap" }}>
            {selectedMonthLabel}
          </Typography>
          {selectableDays.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              В расписании врачей нет смен
            </Typography>
          ) : (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
              <Box
                onClick={() => scrollStrip(-1)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "8px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "text.secondary",
                  "&:hover": { bgcolor: subtleBg(theme, true), color: "text.primary" },
                }}
              >
                <KeyboardArrowLeftOutlined sx={{ fontSize: 18 }} />
              </Box>
              <Stack
                ref={stripRef}
                direction="row"
                spacing={0.75}
                sx={{ overflowX: "auto", py: 0.25, px: 0.5, flex: 1, "&::-webkit-scrollbar": { height: 4 } }}
              >
                {selectableDays.map((d) => {
                  const dj = dayjs(d.date);
                  const active = d.date === selDay;
                  const isToday = d.date === todayIso;
                  return (
                    <Box
                      key={d.date}
                      onClick={() => setSelDay(d.date)}
                      sx={{
                        flex: "0 0 auto",
                        minWidth: 60,
                        textAlign: "center",
                        borderRadius: "9px",
                        border: "1px solid",
                        borderColor: active ? "primary.main" : "divider",
                        bgcolor: active
                          ? alpha(theme.palette.primary.main, 0.1)
                          : "background.paper",
                        px: 0.75,
                        py: 0.5,
                        cursor: "pointer",
                        transition: "border-color .13s ease, background-color .13s ease",
                        "&:hover": { borderColor: active ? "primary.main" : alpha(theme.palette.primary.main, 0.28) },
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.625rem" }}>
                        {WEEKDAY_SHORT[mondayIndex(dj)]}
                      </Typography>
                      <Typography
                        variant="subtitle2"
                        fontWeight={600}
                        sx={{ fontSize: "0.775rem", color: isToday ? "primary.onSurface" : "text.primary", whiteSpace: "nowrap" }}
                      >
                        {dj.date()} {MONTHS_SHORT[dj.month()]}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          fontSize: "0.625rem",
                          color: d.freeCount > 0 ? "success.main" : "text.disabled",
                          fontWeight: d.freeCount > 0 ? 600 : 400,
                        }}
                      >
                        {d.freeCount > 0 ? String(d.freeCount) : "нет"}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
              <Box
                onClick={() => scrollStrip(1)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "8px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "text.secondary",
                  "&:hover": { bgcolor: subtleBg(theme, true), color: "text.primary" },
                }}
              >
                <KeyboardArrowRightOutlined sx={{ fontSize: 18 }} />
              </Box>
            </Stack>
          )}
        </Stack>
        {headerActions}
      </Stack>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "204px 1fr" },
          gridAutoRows: { xs: "minmax(0, auto)", md: "100%" },
        }}
      >
        {/* ── Рельс специальностей ── */}
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "background.paper",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, px: 2, pt: 1.5, pb: 1 }}
          >
            Специальности
          </Typography>
          {specsQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={20} />
            </Stack>
          ) : (
            <>
              {(() => {
                const active = specId === null;
                const overall = summaryQuery.data
                  ? { free: summaryQuery.data.overallFreeEmployeeCount, total: summaryQuery.data.overallEmployeeCount }
                  : undefined;
                return (
                  <React.Fragment>
                    <Box
                      onClick={() => {
                        if (specId !== null) {
                          setSpecId(null);
                          setSelDocId(null);
                          setSelDay(null);
                        } else if (selDocId !== null) {
                          setSelDocId(null);
                        }
                      }}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        px: 1.75,
                        py: 1.25,
                        cursor: "pointer",
                        borderLeft: "3px solid",
                        borderColor: active ? "primary.main" : "transparent",
                        bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                        transition: "background-color .13s ease",
                        "&:hover": { bgcolor: active ? undefined : subtleBg(theme) },
                      }}
                    >
                      <Typography
                        variant="body2"
                        fontWeight={active ? 600 : 500}
                        sx={{ flex: 1, minWidth: 0 }}
                        noWrap
                      >
                        Все специалисты
                      </Typography>
                      {overall && (
                        <Box
                          sx={(t) => ({
                            fontSize: "0.6875rem",
                            fontWeight: 600,
                            lineHeight: 1,
                            px: 0.75,
                            py: 0.5,
                            borderRadius: "7px",
                            color: overall.free ? "success.dark" : "text.disabled",
                            bgcolor: overall.free
                              ? alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                              : subtleBg(t, true),
                            ...(t.palette.mode === "dark" && overall.free ? { color: t.palette.success.light } : {}),
                          })}
                          title="Свободны сегодня"
                        >
                          {overall.free}/{overall.total}
                        </Box>
                      )}
                    </Box>

                    {active && docs.length > 0 && (
                      <Stack spacing={0.25} sx={{ py: 0.5, px: 1, bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                        {docs.map(({ emp, sum }) => {
                          const isDocActive = selDocId === emp.employeeId;
                          return (
                            <Stack
                              key={emp.employeeId}
                              direction="row"
                              alignItems="center"
                              spacing={1}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelDocId(isDocActive ? null : emp.employeeId);
                              }}
                              sx={(t) => ({
                                py: 0.75,
                                px: 1.25,
                                borderRadius: "8px",
                                cursor: "pointer",
                                bgcolor: isDocActive ? "primary.main" : "transparent",
                                color: isDocActive ? "primary.contrastText" : "text.primary",
                                transition: "all .13s ease",
                                "&:hover": {
                                  bgcolor: isDocActive ? "primary.main" : alpha(t.palette.primary.main, 0.08),
                                },
                              })}
                            >
                              <Box
                                sx={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  bgcolor: isDocActive ? "primary.contrastText" : STATUS_DOT[sum.status],
                                  flexShrink: 0,
                                }}
                              />
                              <Typography
                                variant="caption"
                                fontWeight={isDocActive ? 700 : 500}
                                noWrap
                                sx={{ flex: 1, minWidth: 0, fontSize: "0.775rem" }}
                              >
                                {emp.fullName}
                              </Typography>
                            </Stack>
                          );
                        })}
                      </Stack>
                    )}
                  </React.Fragment>
                );
              })()}
              {specs.length === 0 ? (
                <Typography variant="body2" color="text.disabled" sx={{ px: 2, py: 2 }}>
                  Нет специальностей
                </Typography>
              ) : (
                specs.map((s) => {
                  const active = s.id === specId;
                  const badge = badgeBySpec.get(s.id);
                  return (
                    <React.Fragment key={s.id}>
                      <Box
                        onClick={() => {
                          if (specId !== s.id) {
                            setSpecId(s.id);
                            setSelDocId(null);
                            setSelDay(null);
                          } else if (selDocId !== null) {
                            setSelDocId(null);
                          }
                        }}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.25,
                          px: 1.75,
                          py: 1.25,
                          cursor: "pointer",
                          borderLeft: "3px solid",
                          borderColor: active ? "primary.main" : "transparent",
                          bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                          transition: "background-color .13s ease",
                          "&:hover": { bgcolor: active ? undefined : subtleBg(theme) },
                        }}
                      >
                        <Typography
                          variant="body2"
                          fontWeight={active ? 600 : 500}
                          sx={{ flex: 1, minWidth: 0 }}
                          noWrap
                        >
                          {s.name}
                        </Typography>
                        {badge && (
                          <Box
                            sx={(t) => ({
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              lineHeight: 1,
                              px: 0.75,
                              py: 0.5,
                              borderRadius: "7px",
                              color: badge.free ? "success.dark" : "text.disabled",
                              bgcolor: badge.free
                                ? alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                                : subtleBg(t, true),
                              ...(t.palette.mode === "dark" && badge.free ? { color: t.palette.success.light } : {}),
                            })}
                            title="Свободны сегодня"
                          >
                            {badge.free}/{badge.total}
                          </Box>
                        )}
                      </Box>

                      {/* Список сотрудников выбранной специальности */}
                      {active && docs.length > 0 && (
                        <Stack spacing={0.25} sx={{ py: 0.5, px: 1, bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                          {docs.map(({ emp, sum }) => {
                            const isDocActive = selDocId === emp.employeeId;
                            return (
                              <Stack
                                key={emp.employeeId}
                                direction="row"
                                alignItems="center"
                                spacing={1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelDocId(isDocActive ? null : emp.employeeId);
                                }}
                                sx={(t) => ({
                                  py: 0.75,
                                  px: 1.25,
                                  borderRadius: "8px",
                                  cursor: "pointer",
                                  bgcolor: isDocActive ? "primary.main" : "transparent",
                                  color: isDocActive ? "primary.contrastText" : "text.primary",
                                  transition: "all .13s ease",
                                  "&:hover": {
                                    bgcolor: isDocActive ? "primary.main" : alpha(t.palette.primary.main, 0.08),
                                  },
                                })}
                              >
                                <Box
                                  sx={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    bgcolor: isDocActive ? "primary.contrastText" : STATUS_DOT[sum.status],
                                    flexShrink: 0,
                                  }}
                                />
                                <Typography
                                  variant="caption"
                                  fontWeight={isDocActive ? 700 : 500}
                                  noWrap
                                  sx={{ flex: 1, minWidth: 0, fontSize: "0.775rem" }}
                                >
                                  {emp.fullName}
                                </Typography>
                              </Stack>
                            );
                          })}
                        </Stack>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </>
          )}
        </Box>

        {/* ── Правая колонка: сетка врачей / окна выбранного врача ── */}
        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            p: 0,
          }}
        >
          {!selectedDoc ? (
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{
                  px: 2,
                  py: 1.25,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  flexShrink: 0,
                  bgcolor: "background.paper",
                }}
              >
                <TextField
                  size="small"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск врача…"
                  sx={{ width: { xs: 200, sm: 260 } }}
                  InputProps={{
                    startAdornment: (
                      <SearchOutlined sx={{ fontSize: 18, color: "text.disabled", mr: 0.75 }} />
                    ),
                  }}
                />
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Сетка врачей {specId ? `(${specs.find((s) => s.id === specId)?.name})` : "(Все специалисты)"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Найдено врачей: {docs.length}
                  </Typography>
                </Box>
              </Stack>

              {(() => {
                const activeDayDate = selectedDay?.date ?? selDay ?? todayIso;
                const activeDocsOnDay = docs.filter(({ emp }) => {
                  const d = emp.days.find((x) => x.date === activeDayDate);
                  return d && d.scheduled && !d.dayOff;
                });

                if (docs.length === 0) {
                  return (
                    <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 8, flex: 1 }}>
                      <PersonSearchOutlined sx={{ fontSize: 36, color: "text.disabled" }} />
                      <Typography variant="body2" color="text.disabled">
                        {search ? "Врачи по вашему запросу не найдены" : "Врачи не найдены"}
                      </Typography>
                    </Stack>
                  );
                }

                if (activeDocsOnDay.length === 0) {
                  return (
                    <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 8, flex: 1 }}>
                      <PersonSearchOutlined sx={{ fontSize: 36, color: "text.disabled" }} />
                      <Typography variant="body2" color="text.disabled">
                        На эту дату у врачей нет рабочих смен
                      </Typography>
                    </Stack>
                  );
                }

                return (
                  <Box
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "row",
                      overflowX: "auto",
                      "&::-webkit-scrollbar": { height: 6 },
                    }}
                  >
                    {activeDocsOnDay.map(({ emp, sum }) => {
                      const docDay = emp.days.find((d) => d.date === activeDayDate)!;
                      const specName = specId ? specs.find((s) => s.id === specId)?.name : null;

                    return (
                      <Box
                        key={emp.employeeId}
                        sx={{
                          flex: "0 0 360px",
                          minWidth: 320,
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          borderRight: "1px solid",
                          borderColor: "divider",
                          "&:last-of-type": {
                            borderRight: "none",
                          },
                        }}
                      >
                        {/* Шапка врача в колонке */}
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          spacing={1.5}
                          onClick={() => setSelDocId(emp.employeeId)}
                          sx={(t) => ({
                            px: 2,
                            py: 1.5,
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            bgcolor: subtleBg(t),
                            cursor: "pointer",
                            transition: "background-color .13s ease",
                            "&:hover": { bgcolor: alpha(t.palette.primary.main, 0.06) },
                          })}
                        >
                          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                            <Box sx={{ position: "relative", flexShrink: 0 }}>
                              <Box
                                sx={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: "11px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#fff",
                                  fontSize: "0.8125rem",
                                  fontWeight: 600,
                                  bgcolor: avatarColor(emp.fullName),
                                }}
                              >
                                {initials(emp.fullName)}
                              </Box>
                              <Box
                                sx={{
                                  position: "absolute",
                                  right: -2,
                                  bottom: -2,
                                  width: 12,
                                  height: 12,
                                  borderRadius: "50%",
                                  border: "2px solid",
                                  borderColor: "background.paper",
                                  bgcolor: STATUS_DOT[sum.status],
                                }}
                              />
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={600} noWrap>
                                {emp.fullName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                {specName ?? "Специалист"}
                              </Typography>
                            </Box>
                          </Stack>
                          {docDay && docDay.scheduled && (
                            <Chip
                              label={docDay.freeCount > 0 ? `${docDay.freeCount} окон` : "нет окон"}
                              size="small"
                              color={docDay.freeCount > 0 ? "success" : "default"}
                              variant={docDay.freeCount > 0 ? "outlined" : "filled"}
                              sx={{ height: 22, fontSize: "0.6875rem", fontWeight: 600, flexShrink: 0 }}
                            />
                          )}
                        </Stack>

                        {/* Таймлайн окон за день */}
                        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 2 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, fontWeight: 500 }}>
                            {WEEKDAY_SHORT[mondayIndex(dayjs(activeDayDate))]},{" "}
                            {dayjs(activeDayDate).date()} {MONTHS_GEN[dayjs(activeDayDate).month()]}
                          </Typography>

                          {!docDay || !docDay.scheduled ? (
                            <Alert severity="info" icon={false}>Нет рабочего графика на этот день</Alert>
                          ) : docDay.dayOff ? (
                            <Alert severity="info" icon={false}>Выходной день</Alert>
                          ) : docDay.slots.length === 0 ? (
                            <Alert severity="info" icon={false}>Нет доступных окон</Alert>
                          ) : (
                            <Stack spacing={0.75}>
                              {docDay.slots.map((slot: AvailabilitySlot) => {
                                const busy = !slot.free && slot.appointmentId != null;
                                const past = !slot.free && slot.appointmentId == null;
                                return (
                                  <Stack
                                    key={slot.start}
                                    direction="row"
                                    alignItems="center"
                                    spacing={1.25}
                                    onClick={
                                      slot.free
                                        ? () => onBook(emp.employeeId, `${docDay.date}T${slot.start}`)
                                        : undefined
                                    }
                                    sx={{
                                      px: 1.5,
                                      py: 1,
                                      borderRadius: "10px",
                                      border: "1px solid",
                                      borderStyle: past ? "dashed" : "solid",
                                      borderColor: slot.free ? alpha(theme.palette.success.main, 0.32) : "divider",
                                      bgcolor: slot.free
                                        ? alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.14 : 0.08)
                                        : busy
                                          ? subtleBg(theme)
                                          : "transparent",
                                      cursor: slot.free ? "pointer" : "default",
                                      transition: "filter .13s ease",
                                      "&:hover": slot.free ? { filter: "brightness(1.04)" } : undefined,
                                    }}
                                  >
                                    <Typography
                                      sx={{
                                        fontFamily: "monospace",
                                        fontWeight: 600,
                                        fontSize: "0.85rem",
                                        width: 48,
                                        color: slot.free ? "success.main" : "text.disabled",
                                      }}
                                    >
                                      {slot.start}
                                    </Typography>
                                    {slot.free ? (
                                      <>
                                        <Typography variant="caption" color="success.main" sx={{ flex: 1, fontWeight: 500 }}>
                                          Свободно
                                        </Typography>
                                        <Stack
                                          direction="row"
                                          alignItems="center"
                                          spacing={0.5}
                                          sx={(t) => ({
                                            px: 1.25,
                                            height: 28,
                                            borderRadius: "8px",
                                            border: "1px solid",
                                            borderColor: alpha(t.palette.success.main, 0.32),
                                            color: "success.dark",
                                            fontWeight: 600,
                                            fontSize: "0.75rem",
                                            ...(t.palette.mode === "dark" ? { color: t.palette.success.light } : {}),
                                          })}
                                        >
                                          <AddOutlined sx={{ fontSize: 15 }} />
                                          Записать
                                        </Stack>
                                      </>
                                    ) : busy ? (
                                      <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} noWrap>
                                        Занято{slot.patientName ? ` · ${slot.patientName}` : ""}
                                      </Typography>
                                    ) : (
                                      <Typography variant="caption" color="text.disabled" sx={{ flex: 1 }}>
                                        Время прошло
                                      </Typography>
                                    )}
                                  </Stack>
                                );
                              })}
                            </Stack>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              );
            })()}
          </Box>
          ) : (
            <>
              {/* Шапка врача */}
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1.5}
                sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
              >
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 38,
                      height: 38,
                      borderRadius: "11px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      bgcolor: avatarColor(selectedDoc.emp.fullName),
                      flexShrink: 0,
                    }}
                  >
                    {initials(selectedDoc.emp.fullName)}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                      {selectedDoc.emp.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {specId ? specs.find((s) => s.id === specId)?.name ?? "" : "Специалист"}
                    </Typography>
                  </Box>
                </Stack>

                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  startIcon={<KeyboardArrowLeftOutlined sx={{ fontSize: 16 }} />}
                  onClick={() => setSelDocId(null)}
                  sx={{ textTransform: "none", fontSize: "0.75rem" }}
                >
                  К сетке врачей
                </Button>
              </Stack>

              {/* Таймлайн окон выбранного дня */}
              <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 2 }}>
                {!selectedDay ? (
                  <Alert severity="info" icon={false}>В расписании врача нет смен</Alert>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
                      {WEEKDAY_SHORT[mondayIndex(dayjs(selectedDay.date))]}, {dayjs(selectedDay.date).date()}{" "}
                      {MONTHS_GEN[dayjs(selectedDay.date).month()]}
                    </Typography>
                    {selectedDay.dayOff ? (
                      <Alert severity="info" icon={false}>Выходной день</Alert>
                    ) : !selectedDay.scheduled ? (
                      <Alert severity="info" icon={false}>Нет рабочего графика на этот день</Alert>
                    ) : selectedDay.slots.length === 0 ? (
                      <Alert severity="info" icon={false}>Нет окон</Alert>
                    ) : (
                      <Stack spacing={0.75}>
                        {selectedDay.slots.map((slot) => {
                          const busy = !slot.free && slot.appointmentId != null;
                          const past = !slot.free && slot.appointmentId == null;
                          return (
                            <Stack
                              key={slot.start}
                              direction="row"
                              alignItems="center"
                              spacing={1.25}
                              onClick={
                                slot.free
                                  ? () => onBook(selectedDoc.emp.employeeId, `${selectedDay.date}T${slot.start}`)
                                  : undefined
                              }
                              sx={{
                                px: 1.5,
                                py: 1,
                                borderRadius: "10px",
                                border: "1px solid",
                                borderStyle: past ? "dashed" : "solid",
                                borderColor: slot.free ? alpha(theme.palette.success.main, 0.32) : "divider",
                                bgcolor: slot.free
                                  ? alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.14 : 0.08)
                                  : busy
                                    ? subtleBg(theme)
                                    : "transparent",
                                cursor: slot.free ? "pointer" : "default",
                                transition: "filter .13s ease",
                                "&:hover": slot.free ? { filter: "brightness(1.04)" } : undefined,
                              }}
                            >
                              <Typography
                                sx={{
                                  fontFamily: "monospace",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  width: 48,
                                  color: slot.free ? "success.main" : "text.disabled",
                                }}
                              >
                                {slot.start}
                              </Typography>
                              {slot.free ? (
                                <>
                                  <Typography variant="caption" color="success.main" sx={{ flex: 1, fontWeight: 500 }}>
                                    Свободно
                                  </Typography>
                                  <Stack
                                    direction="row"
                                    alignItems="center"
                                    spacing={0.5}
                                    sx={(t) => ({
                                      px: 1.25,
                                      height: 28,
                                      borderRadius: "8px",
                                      border: "1px solid",
                                      borderColor: alpha(t.palette.success.main, 0.32),
                                      color: "success.dark",
                                      fontWeight: 600,
                                      fontSize: "0.75rem",
                                      ...(t.palette.mode === "dark" ? { color: t.palette.success.light } : {}),
                                    })}
                                  >
                                    <AddOutlined sx={{ fontSize: 15 }} />
                                    Записать
                                  </Stack>
                                </>
                              ) : busy ? (
                                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} noWrap>
                                  Занято{slot.patientName ? ` · ${slot.patientName}` : ""}
                                </Typography>
                              ) : (
                                <Typography variant="caption" color="text.disabled" sx={{ flex: 1 }}>
                                  Время прошло
                                </Typography>
                              )}
                            </Stack>
                          );
                        })}
                      </Stack>
                    )}
                  </>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default FreeSlotsView;
