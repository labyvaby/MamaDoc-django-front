/**
 * «Календарь цен» на год — то, что заказчику удобно в Exely (месяцы слева,
 * клик по месяцу выделяет весь месяц), но без их «одна категория — один
 * блок»: здесь все категории в одной сетке, месяц × категория × день, и
 * массовое изменение — в боковой панели, а не в длинной модалке.
 *
 * Выделение: клик по месяцу — весь месяц всех показанных категорий; по
 * категории — её строка в месяце; протяжка — прямоугольник; Ctrl/Shift —
 * добавить к выделенному. Двойной клик по ночи — из чего сложилась цена.
 * Данные — GET /hotel/pricing/calendar/ кусками по 62 дня; сохранение —
 * PUT /rate-plans/{id}/daily-rates/ (план изменений — priceBulkPlan.ts).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import SelectAllOutlined from "@mui/icons-material/SelectAllOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { ApiError, getErrorMessage } from "../api/client";
import { getPriceCalendar, setDailyRates, setDailyRatesBatch, type HotelPriceCalendarRoomType, type HotelPriceNight } from "../api/hotel";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { cellKey, planBulkChanges, weekdayIndex, type BulkSettings, type PriceMode, type TriState } from "./priceBulkPlan";
import { DRAWER_WIDTH, DrawerBody, DrawerFooter, DrawerHeader, DrawerSection, FilterChip, plural, Surface } from "./hotelUi";
import { downloadXlsx } from "./hotelXlsx";

const MONTHS = 12;
/** Сервер ответил 404 на …/daily-rates/batch/ — до перезагрузки шлём диапазоны по одному. */
let batchEndpointMissing = false;
const CHUNK = 62;
const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const D = (d: Dayjs) => d.format("YYYY-MM-DD");
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });

interface YearData {
  ratePlanId: number | null;
  ratePlanName: string;
  roomTypes: HotelPriceCalendarRoomType[];
  nights: Map<string, HotelPriceNight>;
}

async function fetchYear(propertyId: number, start: Dayjs, ratePlanId: number | "", signal?: AbortSignal): Promise<YearData> {
  const end = start.add(MONTHS, "month");
  const ranges: [string, string][] = [];
  for (let d = start; d.isBefore(end, "day"); d = d.add(CHUNK, "day")) {
    const to = d.add(CHUNK, "day");
    ranges.push([D(d), D(to.isAfter(end) ? end : to)]);
  }
  const parts = await Promise.all(
    ranges.map(([from, to]) => getPriceCalendar({ propertyId, from, to, ratePlanId: ratePlanId === "" ? undefined : ratePlanId }, signal)),
  );
  const nights = new Map<string, HotelPriceNight>();
  const roomTypes = new Map<number, HotelPriceCalendarRoomType>();
  for (const part of parts) {
    for (const rt of part.roomTypes) {
      if (!roomTypes.has(rt.roomTypeId)) roomTypes.set(rt.roomTypeId, { ...rt, nights: [] });
      for (const n of rt.nights) nights.set(cellKey(rt.roomTypeId, n.date), n);
    }
  }
  return { ratePlanId: parts[0]?.ratePlanId ?? null, ratePlanName: parts[0]?.ratePlanName ?? "", roomTypes: [...roomTypes.values()], nights };
}

interface Drag {
  month: number;
  r0: number;
  d0: number;
  r1: number;
  d1: number;
  additive: boolean;
}

export const PriceYearView: React.FC<{
  propertyId: number;
  ratePlanId: number | "";
  canManage: boolean;
  onOpenNight: (roomType: HotelPriceCalendarRoomType, night: HotelPriceNight) => void;
}> = ({ propertyId, ratePlanId, canManage, onOpenNight }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const [start, setStart] = React.useState<Dayjs>(() => dayjs().startOf("month"));
  // «Отличия» по умолчанию: год — это 1460 почти одинаковых чисел (ревьюер),
  // глазу не за что зацепиться. Цена, равная базовой, не печатается — видны
  // только праздники, правила и своя цена. «Цены» — все числа, как раньше.
  const [mode, setMode] = React.useState<"diff" | "price" | "occupancy">("diff");
  const [hidden, setHidden] = React.useState<Set<number>>(new Set());
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const today = D(dayjs());

  const query = useQuery({
    queryKey: ["hotel", "priceCalendar", "year", propertyId, D(start), ratePlanId],
    queryFn: ({ signal }) => fetchYear(propertyId, start, ratePlanId, signal),
    staleTime: 30_000,
  });
  const data = query.data;
  const cats = React.useMemo(() => (data?.roomTypes ?? []).filter((rt) => !hidden.has(rt.roomTypeId)), [data, hidden]);
  const months = React.useMemo(() => Array.from({ length: MONTHS }, (_, i) => start.add(i, "month")), [start]);
  // Сколько будущих ночей видимых категорий отличается от базовой цены — для подсказки «Отличий».
  const diffNights = React.useMemo(() => {
    if (!data) return 0;
    let count = 0;
    for (const rt of cats) {
      const base = Number(rt.basePrice);
      for (const n of rt.nights) if (n.date >= today && (Number(n.price) !== base || n.isManualOverride || n.stopSell)) count += 1;
    }
    return count;
  }, [data, cats, today]);

  // Выделение протяжкой: прямоугольник в пределах одного месяца.
  const dragKeys = React.useMemo(() => {
    if (!drag) return null;
    const set = new Set<string>();
    const m = months[drag.month];
    const [ra, rb] = [Math.min(drag.r0, drag.r1), Math.max(drag.r0, drag.r1)];
    const [da, db] = [Math.min(drag.d0, drag.d1), Math.max(drag.d0, drag.d1)];
    for (let r = ra; r <= rb; r++) {
      const rt = cats[r];
      if (!rt) continue;
      for (let d = da; d <= db && d <= m.daysInMonth(); d++) {
        const date = D(m.date(d));
        if (date >= today) set.add(cellKey(rt.roomTypeId, date));
      }
    }
    return set;
  }, [drag, months, cats, today]);

  React.useEffect(() => {
    if (!drag) return;
    const up = () => {
      setSelection((prev) => {
        const next = drag.additive ? new Set(prev) : new Set<string>();
        dragKeys?.forEach((k) => next.add(k));
        return next;
      });
      setDrag(null);
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [drag, dragKeys]);

  const selectKeys = (keys: string[], additive: boolean) =>
    setSelection((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      const allIn = keys.length > 0 && keys.every((k) => prev.has(k));
      if (additive && allIn) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  const monthKeys = (m: Dayjs, onlyRt?: number) => {
    const keys: string[] = [];
    for (const rt of cats) {
      if (onlyRt != null && rt.roomTypeId !== onlyRt) continue;
      for (let d = 1; d <= m.daysInMonth(); d++) {
        const date = D(m.date(d));
        if (date >= today && data?.nights.has(cellKey(rt.roomTypeId, date))) keys.push(cellKey(rt.roomTypeId, date));
      }
    }
    return keys;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!el || !canManage || e.button !== 0) return;
    const [m, r, d] = el.dataset.cell!.split(":").map(Number);
    const date = D(months[m].date(d));
    if (date < today) return;
    e.preventDefault();
    setDrag({ month: m, r0: r, d0: d, r1: r, d1: d, additive: e.ctrlKey || e.metaKey || e.shiftKey });
  };
  const handleMouseOver = (e: React.MouseEvent) => {
    if (!drag) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!el) return;
    const [m, r, d] = el.dataset.cell!.split(":").map(Number);
    if (m !== drag.month || (r === drag.r1 && d === drag.d1)) return;
    setDrag({ ...drag, r1: r, d1: d });
  };
  const handleDoubleClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!el || !data) return;
    const [m, r, d] = el.dataset.cell!.split(":").map(Number);
    const rt = cats[r];
    const night = rt ? data.nights.get(cellKey(rt.roomTypeId, D(months[m].date(d)))) : undefined;
    if (rt && night) onOpenNight(rt, night);
  };

  const exportXlsx = async () => {
    if (!data) return;
    await downloadXlsx(`Цены ${start.format("MM.YYYY")}–${start.add(MONTHS - 1, "month").format("MM.YYYY")}.xlsx`, [
      {
        name: "Цены",
        title: `Календарь цен — ${data.ratePlanName || "основной тариф"}`,
        meta: [`${start.format("MMMM YYYY")} – ${start.add(MONTHS - 1, "month").format("MMMM YYYY")}`, "Цена ночи по категории, сом. «стоп» — продажа закрыта."],
        tables: [
          {
            columns: [{ header: "Месяц", width: 14 }, { header: "Категория", width: 22 }, ...Array.from({ length: 31 }, (_, i) => ({ header: String(i + 1), width: 7 }))],
            rows: months.flatMap((m) =>
              (data.roomTypes ?? []).map((rt) => [
                m.format("MMMM YYYY"),
                rt.roomTypeName,
                ...Array.from({ length: 31 }, (_, i) => {
                  if (i + 1 > m.daysInMonth()) return null;
                  const n = data.nights.get(cellKey(rt.roomTypeId, D(m.date(i + 1))));
                  return n ? (n.stopSell ? "стоп" : Number(n.price)) : null;
                }),
              ]),
            ),
          },
        ],
      },
    ]);
  };

  const MONTH_COL = 104;
  const CAT_COL = 156;
  const line = subtleBorder(theme);
  const selectedCount = selection.size;
  const selectedCats = new Set([...selection].map((k) => Number(k.split("|")[0])));

  return (
    <Stack gap={1.5}>
      <Surface sx={{ p: 1.5 }}>
        <Stack direction={{ xs: "column", lg: "row" }} gap={1.25} alignItems={{ lg: "center" }}>
          <Stack direction="row" alignItems="center" sx={{ height: 36, borderRadius: "10px", border: `1px solid ${line}`, overflow: "hidden", flexShrink: 0 }}>
            <IconButton onClick={() => setStart((s) => s.subtract(3, "month"))} aria-label="На квартал раньше" sx={{ borderRadius: 0, height: "100%" }}>
              <ChevronLeftOutlined fontSize="small" />
            </IconButton>
            <Typography sx={{ px: 1, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
              {start.format("MMM YYYY")} – {start.add(MONTHS - 1, "month").format("MMM YYYY")}
            </Typography>
            <IconButton onClick={() => setStart((s) => s.add(3, "month"))} aria-label="На квартал позже" sx={{ borderRadius: 0, height: "100%" }}>
              <ChevronRightOutlined fontSize="small" />
            </IconButton>
          </Stack>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, v: "diff" | "price" | "occupancy" | null) => v && setMode(v)}
            sx={{ "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 600, py: 0.4 } }}
          >
            <ToggleButton value="diff" title="Только цены, которые отличаются от базовой">
              Отличия
            </ToggleButton>
            <ToggleButton value="price">Цены</ToggleButton>
            <ToggleButton value="occupancy">Загрузка</ToggleButton>
          </ToggleButtonGroup>
          <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ flex: 1 }}>
            {(data?.roomTypes ?? []).map((rt) => (
              <FilterChip
                key={rt.roomTypeId}
                label={rt.roomTypeName}
                active={!hidden.has(rt.roomTypeId)}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(rt.roomTypeId)) next.delete(rt.roomTypeId);
                    else next.add(rt.roomTypeId);
                    return next;
                  })
                }
              />
            ))}
          </Stack>
          <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
            <Button variant="outlined" startIcon={<FileDownloadOutlined />} disabled={!data} onClick={() => void exportXlsx()}>
              Excel
            </Button>
          </Stack>
        </Stack>
      </Surface>

      {canManage && (
        <Surface
          sx={{
            p: 1.25,
            position: "sticky",
            top: 0,
            zIndex: 4,
            borderColor: selectedCount ? alpha(theme.palette.primary.main, 0.45) : undefined,
            bgcolor: selectedCount ? alpha(theme.palette.primary.main, dark ? 0.12 : 0.04) : undefined,
          }}
        >
          {/* sm в теме — 360 px (телефон): в ряд с подсказкой и кнопкой — только с md. */}
          <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} gap={1}>
            <SelectAllOutlined sx={{ color: selectedCount ? "primary.main" : "text.disabled", display: { xs: "none", md: "block" } }} />
            <Typography variant="body2" sx={{ flex: 1 }} color={selectedCount ? "text.primary" : "text.secondary"}>
              {selectedCount
                ? `Выбрано ${fmt(selectedCount)} ${plural(selectedCount, "ночь", "ночи", "ночей")} · ${selectedCats.size} ${plural(selectedCats.size, "категория", "категории", "категорий")}`
                : `${
                    mode === "diff"
                      ? `Пустая клетка — базовая цена (она рядом с категорией); отличается ${fmt(diffNights)} ${plural(diffNights, "ночь", "ночи", "ночей")}. `
                      : ""
                  }Нажмите на месяц, категорию или протяните по дням, чтобы выделить. Ctrl — добавить к выделенному, двойной клик по ночи — подробности.`}
            </Typography>
            {selectedCount > 0 && (
              <Button size="small" color="inherit" startIcon={<CloseOutlined fontSize="small" />} onClick={() => setSelection(new Set())}>
                Снять
              </Button>
            )}
            <Button variant="contained" disableElevation startIcon={<EditOutlined />} disabled={!selectedCount} onClick={() => setBulkOpen(true)} sx={{ width: { xs: "100%", md: "auto" } }}>
              Изменить цены
            </Button>
          </Stack>
        </Surface>
      )}

      {query.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(query.error, "Не удалось загрузить цены")}
        </Alert>
      ) : !data ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <Surface padded={false} sx={{ overflow: "hidden", position: "relative" }}>
          {query.isFetching && <LinearProgress sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, zIndex: 5 }} />}
          <Box sx={{ overflow: "auto", maxHeight: "calc(100vh - 290px)" }}>
            <Box
              onMouseDown={handleMouseDown}
              onMouseOver={handleMouseOver}
              onDoubleClick={handleDoubleClick}
              sx={{
                display: "grid",
                gridTemplateColumns: `${MONTH_COL}px ${CAT_COL}px repeat(31, minmax(40px, 1fr))`,
                minWidth: MONTH_COL + CAT_COL + 31 * 40,
                userSelect: drag ? "none" : undefined,
                "& .py-c": {
                  height: 30,
                  borderLeft: `1px solid ${line}`,
                  borderBottom: `1px solid ${line}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  fontSize: 11.5,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.2px",
                  cursor: canManage ? "cell" : "default",
                },
                "& .py-c.py-past": { opacity: 0.42, cursor: "default" },
                "& .py-c.py-we": { backgroundColor: subtleBg(theme) },
                "& .py-c.py-stop": { color: theme.palette.error.main, textDecoration: "line-through", backgroundColor: alpha(theme.palette.error.main, dark ? 0.16 : 0.07) },
                "& .py-c.py-sel": { backgroundColor: alpha(theme.palette.primary.main, dark ? 0.32 : 0.2), boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.6)}` },
                "& .py-c.py-today": { boxShadow: `inset 0 -2px 0 ${theme.palette.primary.main}` },
                "& .py-c:hover:not(.py-past)": { outline: `2px solid ${alpha(theme.palette.primary.main, 0.45)}`, outlineOffset: "-2px" },
                "& .py-dot": { position: "absolute", top: 3, right: 3, width: 5, height: 5, borderRadius: "50%", backgroundColor: theme.palette.primary.main },
                "& .py-up": { color: theme.palette.warning.dark },
                "& .py-c.py-diff": { fontWeight: 800 },
                "& .py-down": { color: theme.palette.success.dark },
                "& .py-none": { backgroundImage: `repeating-linear-gradient(135deg, ${alpha(theme.palette.text.primary, 0.05)} 0 4px, transparent 4px 8px)`, borderLeft: `1px solid ${line}`, borderBottom: `1px solid ${line}` },
              }}
            >
              {/* Шапка: дни месяца */}
              <Box sx={{ position: "sticky", top: 0, left: 0, zIndex: 3, bgcolor: "background.paper", borderBottom: `1px solid ${line}`, px: 1.5, display: "flex", alignItems: "center" }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Месяц
                </Typography>
              </Box>
              <Box sx={{ position: "sticky", top: 0, left: MONTH_COL, zIndex: 3, bgcolor: "background.paper", borderBottom: `1px solid ${line}`, px: 1.5, display: "flex", alignItems: "center" }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Категория
                </Typography>
              </Box>
              {Array.from({ length: 31 }, (_, i) => (
                <Box
                  key={i}
                  sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: "background.paper", borderBottom: `1px solid ${line}`, borderLeft: `1px solid ${line}`, py: 0.75, textAlign: "center" }}
                >
                  <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {i + 1}
                  </Typography>
                </Box>
              ))}

              {months.map((m, mi) => {
                const rows = cats.length;
                if (rows === 0) return null;
                const daysIn = m.daysInMonth();
                const monthSelected = monthKeys(m).every((k) => selection.has(k)) && monthKeys(m).length > 0;
                return (
                  <React.Fragment key={m.format("YYYY-MM")}>
                    <Box
                      component="button"
                      type="button"
                      disabled={!canManage}
                      onClick={(e: React.MouseEvent) => selectKeys(monthKeys(m), e.ctrlKey || e.metaKey || e.shiftKey)}
                      title={canManage ? "Выделить весь месяц" : undefined}
                      sx={{
                        gridRow: `span ${rows}`,
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        bgcolor: monthSelected ? alpha(theme.palette.primary.main, dark ? 0.24 : 0.12) : "background.paper",
                        border: 0,
                        borderTop: `2px solid ${alpha(theme.palette.text.primary, 0.12)}`,
                        borderRight: `1px solid ${line}`,
                        font: "inherit",
                        textAlign: "left",
                        px: 1.5,
                        py: 1,
                        cursor: canManage ? "pointer" : "default",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        gap: 0.25,
                        "&:hover": canManage ? { bgcolor: alpha(theme.palette.primary.main, 0.08) } : undefined,
                      }}
                    >
                      <Typography sx={{ fontWeight: 800, fontSize: 14, textTransform: "capitalize", lineHeight: 1.2 }}>{m.format("MMMM")}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {m.format("YYYY")}
                      </Typography>
                    </Box>
                    {cats.map((rt, ri) => (
                      <React.Fragment key={rt.roomTypeId}>
                        <Box
                          component="button"
                          type="button"
                          disabled={!canManage}
                          onClick={(e: React.MouseEvent) => selectKeys(monthKeys(m, rt.roomTypeId), e.ctrlKey || e.metaKey || e.shiftKey)}
                          title={canManage ? `Выделить «${rt.roomTypeName}» за ${m.format("MMMM")}` : undefined}
                          sx={{
                            position: "sticky",
                            left: MONTH_COL,
                            zIndex: 1,
                            bgcolor: "background.paper",
                            border: 0,
                            borderTop: ri === 0 ? `2px solid ${alpha(theme.palette.text.primary, 0.12)}` : 0,
                            borderBottom: `1px solid ${line}`,
                            borderRight: `1px solid ${line}`,
                            font: "inherit",
                            textAlign: "left",
                            px: 1.25,
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            cursor: canManage ? "pointer" : "default",
                            "&:hover": canManage ? { bgcolor: alpha(theme.palette.primary.main, 0.06) } : undefined,
                          }}
                        >
                          <Typography variant="caption" fontWeight={600} noWrap title={rt.roomTypeName}>
                            {rt.roomTypeName}
                          </Typography>
                          {mode === "diff" && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ ml: "auto", pl: 0.75, fontVariantNumeric: "tabular-nums" }}>
                              {fmt(Number(rt.basePrice))}
                            </Typography>
                          )}
                        </Box>
                        {Array.from({ length: 31 }, (_, di) => {
                          const day = di + 1;
                          const topBorder = ri === 0 ? { borderTop: `2px solid ${alpha(theme.palette.text.primary, 0.12)}` } : undefined;
                          if (day > daysIn) return <div key={di} className="py-none" style={topBorder} />;
                          const date = D(m.date(day));
                          const key = cellKey(rt.roomTypeId, date);
                          const n = data.nights.get(key);
                          const past = date < today;
                          const weekend = weekdayIndex(date) >= 5;
                          const selected = selection.has(key) || (dragKeys?.has(key) ?? false);
                          const price = n ? Number(n.price) : null;
                          const base = Number(rt.basePrice);
                          const occ = n ? Math.min(100, Number(n.occupancy)) : 0;
                          // В «Отличиях» базовая цена без своей цены и стоп-продажи — пустая клетка.
                          const same = mode === "diff" && n != null && price === base && !n.isManualOverride && !n.stopSell;
                          const cls = [
                            "py-c",
                            past ? "py-past" : "",
                            weekend ? "py-we" : "",
                            n?.stopSell ? "py-stop" : "",
                            selected ? "py-sel" : "",
                            date === today ? "py-today" : "",
                            n && !n.isManualOverride && price != null && price > base ? "py-up" : "",
                            n && !n.isManualOverride && price != null && price < base ? "py-down" : "",
                            mode === "diff" && !same && n ? "py-diff" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          const heat =
                            !selected && !n?.stopSell && occ > 0
                              ? alpha(theme.palette.info.main, mode === "occupancy" ? 0.1 + (occ / 100) * 0.55 : (dark ? 0.04 : 0.02) + (occ / 100) * (dark ? 0.16 : 0.12))
                              : undefined;
                          const title = n
                            ? `${rt.roomTypeName}, ${m.date(day).format("D MMMM, dd")}: ${fmt(price ?? 0)} сом${n.isManualOverride ? " (своя цена)" : ""}${n.stopSell ? " · стоп-продажа" : ""} · продано ${n.occupied} из ${n.capacity}${n.minNights ? ` · мин. ${n.minNights} ноч.` : ""}`
                            : undefined;
                          return (
                            <div key={di} className={cls} data-cell={`${mi}:${ri}:${day}`} title={title} style={{ ...topBorder, ...(heat ? { backgroundColor: heat } : null) }}>
                              {n ? (mode === "occupancy" ? `${Math.round(occ)}%` : same ? "" : fmt(price ?? 0)) : "—"}
                              {n?.isManualOverride && <span className="py-dot" />}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                );
              })}
            </Box>
          </Box>
          <Stack direction="row" gap={2.5} rowGap={0.5} flexWrap="wrap" sx={{ px: 2, py: 1.25, borderTop: `1px solid ${line}` }}>
            <LegendItem swatch={<Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main" }} />} text="своя цена" />
            <LegendItem swatch={<Typography variant="caption" sx={{ color: "warning.dark", fontWeight: 700 }}>3 900</Typography>} text="правило подняло" />
            <LegendItem swatch={<Typography variant="caption" sx={{ color: "success.dark", fontWeight: 700 }}>3 100</Typography>} text="правило снизило" />
            <LegendItem swatch={<Typography variant="caption" sx={{ color: "error.main", fontWeight: 700, textDecoration: "line-through" }}>3 500</Typography>} text="стоп-продажа" />
            <LegendItem swatch={<Box sx={{ width: 14, height: 10, borderRadius: "3px", bgcolor: alpha(theme.palette.info.main, 0.3) }} />} text="темнее — больше продано" />
          </Stack>
        </Surface>
      )}

      {data && (
        <PriceBulkDrawer
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          selection={selection}
          data={data}
          onDone={() => {
            setBulkOpen(false);
            setSelection(new Set());
          }}
        />
      )}
    </Stack>
  );
};

const LegendItem: React.FC<{ swatch: React.ReactNode; text: string }> = ({ swatch, text }) => (
  <Stack direction="row" alignItems="center" gap={0.75}>
    {swatch}
    <Typography variant="caption" color="text.secondary">
      {text}
    </Typography>
  </Stack>
);

// ── Панель массового изменения ──────────────────────────────────────────────

type PriceKind = "keep" | "set" | "percent" | "amount" | "auto";

const PriceBulkDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  selection: Set<string>;
  data: YearData;
  onDone: () => void;
}> = ({ open, onClose, selection, data, onDone }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const selectedCats = React.useMemo(() => new Set([...selection].map((k) => Number(k.split("|")[0]))), [selection]);
  const [cats, setCats] = React.useState<Set<number>>(new Set());
  const [allCategories, setAllCategories] = React.useState(false);
  const [weekdays, setWeekdays] = React.useState<boolean[]>([true, true, true, true, true, true, true]);
  const [kind, setKind] = React.useState<PriceKind>("set");
  const [prices, setPrices] = React.useState<Record<number, string>>({});
  const [sameForAll, setSameForAll] = React.useState("");
  const [delta, setDelta] = React.useState("10");
  const [up, setUp] = React.useState(true);
  const [round, setRound] = React.useState(true);
  const [stopSell, setStopSell] = React.useState<TriState>("keep");
  const [minNights, setMinNights] = React.useState("");
  const [minMode, setMinMode] = React.useState<"keep" | "set" | "clear">("keep");
  const [reason, setReason] = React.useState("");
  const [progress, setProgress] = React.useState<{ done: number; total: number; failed: number } | null>(null);

  // Новое выделение — новые умолчания: выбранные категории и их текущие цены.
  React.useEffect(() => {
    if (!open) return;
    setCats(new Set(selectedCats));
    setAllCategories(false);
    setProgress(null);
    const medians: Record<number, string> = {};
    for (const id of selectedCats) {
      const values = [...selection]
        .filter((k) => k.startsWith(`${id}|`))
        .map((k) => Number(data.nights.get(k)?.price ?? 0))
        .filter((v) => v > 0)
        .sort((a, b) => a - b);
      if (values.length) medians[id] = String(values[Math.floor(values.length / 2)]);
    }
    setPrices(medians);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const targetCats = allCategories ? new Set(data.roomTypes.map((r) => r.roomTypeId).filter((id) => cats.has(id) || !selectedCats.has(id))) : cats;
  const price: PriceMode =
    kind === "set"
      ? { mode: "set", byRoomType: Object.fromEntries([...targetCats].filter((id) => Number(prices[id]) > 0).map((id) => [id, Number(prices[id])])) }
      : kind === "percent"
        ? { mode: "percent", value: (up ? 1 : -1) * Number(delta || 0), round: round ? 10 : 1 }
        : kind === "amount"
          ? { mode: "amount", value: (up ? 1 : -1) * Number(delta || 0), round: round ? 10 : 1 }
          : kind === "auto"
            ? { mode: "auto" }
            : { mode: "keep" };
  const settings: BulkSettings = {
    roomTypeIds: [...targetCats],
    weekdays,
    price,
    stopSell,
    minNights: minMode === "set" && Number(minNights) > 0 ? { mode: "set", value: Number(minNights) } : minMode === "clear" ? { mode: "clear" } : { mode: "keep" },
    closedToArrival: "keep",
    closedToDeparture: "keep",
    reason,
  };
  const plan = React.useMemo(
    () => planBulkChanges({ selection, nights: data.nights, settings, allCategories, today: D(dayjs()) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selection, data, JSON.stringify(settings), allCategories],
  );
  const dates = [...selection].map((k) => k.split("|")[1]).sort();
  const busy = progress != null && progress.done < progress.total;

  const apply = async () => {
    if (data.ratePlanId == null || plan.changes.length === 0) return;
    const total = plan.changes.length;
    setProgress({ done: 0, total, failed: 0 });
    if (!batchEndpointMissing) {
      try {
        await setDailyRatesBatch(data.ratePlanId, { reason: settings.reason.trim() || undefined, changes: plan.changes });
        setProgress({ done: total, total, failed: 0 });
        void queryClient.invalidateQueries({ queryKey: ["hotel", "priceCalendar"] });
        void queryClient.invalidateQueries({ queryKey: ["hotel", "pricingHistory"] });
        enqueueSnackbar(`Цены обновлены: ${fmt(plan.nights)} ${plural(plan.nights, "ночь", "ночи", "ночей")}`, { variant: "success" });
        onDone();
        return;
      } catch (err) {
        if (!(err instanceof ApiError && (err.status === 404 || err.status === 405))) {
          setProgress(null);
          enqueueSnackbar(getErrorMessage(err, "Сервер не принял изменения — ничего не сохранено"), { variant: "error" });
          return;
        }
        batchEndpointMissing = true;
      }
    }
    let next = 0;
    let failed = 0;
    let lastError = "";
    const worker = async () => {
      while (next < total) {
        const change = plan.changes[next++];
        try {
          await setDailyRates(data.ratePlanId!, change);
        } catch (err) {
          failed += 1;
          lastError = getErrorMessage(err, "Сервер не принял изменение");
        }
        setProgress((p) => (p ? { ...p, done: p.done + 1, failed } : p));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, total) }, worker));
    void queryClient.invalidateQueries({ queryKey: ["hotel", "priceCalendar"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "pricingHistory"] });
    if (failed) {
      enqueueSnackbar(`Сохранено ${total - failed} из ${total}. ${lastError}`, { variant: "warning" });
    } else {
      enqueueSnackbar(`Цены обновлены: ${fmt(plan.nights)} ${plural(plan.nights, "ночь", "ночи", "ночей")}`, { variant: "success" });
      onDone();
    }
  };

  const seg = (value: string, current: string, set: (v: never) => void, label: string) => (
    <ToggleButton value={value} selected={value === current} onChange={() => set(value as never)} sx={{ textTransform: "none", fontWeight: 600, flex: 1 }}>
      {label}
    </ToggleButton>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => !busy && onClose()}
      PaperProps={{ sx: { width: DRAWER_WIDTH, maxWidth: "100vw", display: "flex", flexDirection: "column", backgroundImage: "none" } }}
    >
      <DrawerHeader
        title="Изменить цены"
        subtitle={
          dates.length
            ? `${fmt(selection.size)} ${plural(selection.size, "ночь", "ночи", "ночей")} · ${dayjs(dates[0]).format("D MMM")} – ${dayjs(dates[dates.length - 1]).format("D MMM YYYY")}`
            : undefined
        }
        onClose={onClose}
      />
      <DrawerBody>
        <DrawerSection label="Категории" first>
          <Stack gap={0.25}>
            {data.roomTypes.map((rt) => {
              const inSelection = selectedCats.has(rt.roomTypeId);
              if (!inSelection && !allCategories) return null;
              return (
                <FormControlLabel
                  key={rt.roomTypeId}
                  control={
                    <Checkbox
                      size="small"
                      checked={targetCats.has(rt.roomTypeId)}
                      onChange={(e) =>
                        setCats((c) => {
                          const next = new Set(c);
                          if (e.target.checked) next.add(rt.roomTypeId);
                          else next.delete(rt.roomTypeId);
                          return next;
                        })
                      }
                    />
                  }
                  label={<Typography variant="body2">{rt.roomTypeName}</Typography>}
                />
              );
            })}
          </Stack>
          {selectedCats.size < data.roomTypes.length && (
            <FormControlLabel
              sx={{ mt: 0.5 }}
              control={<Switch size="small" checked={allCategories} onChange={(e) => setAllCategories(e.target.checked)} />}
              label={<Typography variant="body2">Те же даты для всех категорий</Typography>}
            />
          )}
        </DrawerSection>

        <DrawerSection label="Дни недели">
          <Stack direction="row" gap={0.5} flexWrap="wrap">
            {WEEKDAY_SHORT.map((w, i) => (
              <ToggleButton
                key={w}
                value={w}
                size="small"
                selected={weekdays[i]}
                onChange={() => setWeekdays((ws) => ws.map((v, j) => (j === i ? !v : v)))}
                sx={{ minWidth: 42, textTransform: "none", fontWeight: 700, color: i >= 5 ? "error.main" : undefined }}
              >
                {w}
              </ToggleButton>
            ))}
          </Stack>
          <Stack direction="row" gap={0.5} sx={{ mt: 1 }}>
            <Button size="small" onClick={() => setWeekdays([true, true, true, true, true, true, true])}>
              Все
            </Button>
            <Button size="small" onClick={() => setWeekdays([true, true, true, true, false, false, false])}>
              Будни
            </Button>
            <Button size="small" onClick={() => setWeekdays([false, false, false, false, true, true, true])}>
              Пт–Вс
            </Button>
          </Stack>
        </DrawerSection>

        <DrawerSection label="Цена">
          <ToggleButtonGroup size="small" exclusive value={kind} sx={{ width: "100%", "& .MuiToggleButton-root": { whiteSpace: "nowrap", px: 0.75 } }}>
            {seg("set", kind, setKind, "Своя")}
            {seg("percent", kind, setKind, "± %")}
            {seg("amount", kind, setKind, "± сом")}
            {seg("auto", kind, setKind, "Авто")}
            {seg("keep", kind, setKind, "Как есть")}
          </ToggleButtonGroup>
          {kind === "set" && (
            <Stack gap={1} sx={{ mt: 1.5 }}>
              {targetCats.size > 1 && (
                <Stack direction="row" gap={1} alignItems="center">
                  <TextField
                    size="small"
                    label="Всем одинаково"
                    value={sameForAll}
                    onChange={(e) => setSameForAll(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
                    sx={{ flex: 1 }}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">сом</InputAdornment> }, htmlInput: { inputMode: "numeric" } }}
                  />
                  <Button
                    variant="outlined"
                    disabled={!sameForAll}
                    onClick={() => setPrices(Object.fromEntries([...targetCats].map((id) => [id, sameForAll])))}
                  >
                    Применить
                  </Button>
                </Stack>
              )}
              {data.roomTypes
                .filter((rt) => targetCats.has(rt.roomTypeId))
                .map((rt) => (
                  <Stack key={rt.roomTypeId} direction="row" alignItems="center" gap={1}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap title={rt.roomTypeName}>
                      {rt.roomTypeName}
                    </Typography>
                    <TextField
                      size="small"
                      value={prices[rt.roomTypeId] ?? ""}
                      placeholder={String(Number(rt.basePrice))}
                      onChange={(e) => setPrices((p) => ({ ...p, [rt.roomTypeId]: e.target.value.replace(/[^\d]/g, "").slice(0, 7) }))}
                      sx={{ width: 150 }}
                      slotProps={{ input: { endAdornment: <InputAdornment position="end">сом</InputAdornment> }, htmlInput: { inputMode: "numeric" } }}
                    />
                  </Stack>
                ))}
            </Stack>
          )}
          {(kind === "percent" || kind === "amount") && (
            <Stack direction="row" gap={1} alignItems="center" sx={{ mt: 1.5 }}>
              <ToggleButtonGroup size="small" exclusive value={up ? "up" : "down"} onChange={(_, v: "up" | "down" | null) => v && setUp(v === "up")}>
                <ToggleButton value="up" sx={{ fontWeight: 800, px: 1.5 }}>
                  +
                </ToggleButton>
                <ToggleButton value="down" sx={{ fontWeight: 800, px: 1.5 }}>
                  −
                </ToggleButton>
              </ToggleButtonGroup>
              <TextField
                size="small"
                value={delta}
                onChange={(e) => setDelta(e.target.value.replace(/[^\d]/g, "").slice(0, kind === "percent" ? 3 : 6))}
                sx={{ width: 120 }}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{kind === "percent" ? "%" : "сом"}</InputAdornment> }, htmlInput: { inputMode: "numeric" } }}
              />
              <FormControlLabel control={<Checkbox size="small" checked={round} onChange={(e) => setRound(e.target.checked)} />} label={<Typography variant="body2">до 10 сом</Typography>} />
            </Stack>
          )}
          {kind === "auto" && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
              Своя цена убирается — ночь снова считается по базе категории и правилам «Ценообразования».
            </Typography>
          )}
        </DrawerSection>

        <DrawerSection label="Ограничения">
          <Typography variant="caption" color="text.secondary">
            Продажа
          </Typography>
          <ToggleButtonGroup size="small" exclusive value={stopSell} sx={{ width: "100%", mt: 0.5 }}>
            {seg("keep", stopSell, setStopSell, "Как есть")}
            {seg("on", stopSell, setStopSell, "Закрыть")}
            {seg("off", stopSell, setStopSell, "Открыть")}
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
            Минимум ночей
          </Typography>
          <Stack direction="row" gap={1} alignItems="center" sx={{ mt: 0.5 }}>
            <ToggleButtonGroup size="small" exclusive value={minMode} sx={{ "& .MuiToggleButton-root": { whiteSpace: "nowrap", px: 1.25 } }}>
              {seg("keep", minMode, setMinMode, "Как есть")}
              {seg("set", minMode, setMinMode, "Задать")}
              {seg("clear", minMode, setMinMode, "Убрать")}
            </ToggleButtonGroup>
            {minMode === "set" && (
              <TextField
                size="small"
                value={minNights}
                onChange={(e) => setMinNights(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                sx={{ width: 90 }}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">ноч.</InputAdornment> }, htmlInput: { inputMode: "numeric" } }}
              />
            )}
          </Stack>
        </DrawerSection>

        <DrawerSection label="Причина">
          <TextField
            fullWidth
            size="small"
            placeholder="Например: высокий сезон, концерт 6 октября"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            helperText="Попадёт в «Историю изменений»"
          />
        </DrawerSection>
      </DrawerBody>
      <DrawerFooter
        top={
          progress ? (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Сохраняем {progress.done} из {progress.total}
                {progress.failed ? ` · ошибок ${progress.failed}` : ""}
              </Typography>
              <LinearProgress variant="determinate" value={(progress.done / Math.max(1, progress.total)) * 100} sx={{ height: 5, borderRadius: 3, mt: 0.5 }} />
            </Box>
          ) : undefined
        }
        summary={
          <Box>
            <Typography sx={{ fontWeight: 700 }}>
              {plan.nights ? `${fmt(plan.nights)} ${plural(plan.nights, "ночь", "ночи", "ночей")}` : "Нечего менять"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {plan.avgBefore != null && plan.avgAfter != null
                ? `средняя цена ${fmt(plan.avgBefore)} → ${fmt(plan.avgAfter)} сом`
                : plan.nights
                  ? "меняются ограничения"
                  : "выберите, что изменить"}
            </Typography>
          </Box>
        }
      >
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disableElevation
          disabled={busy || plan.changes.length === 0 || data.ratePlanId == null}
          onClick={() => void apply()}
          sx={{ bgcolor: theme.palette.primary.main }}
        >
          {busy ? "Сохраняем…" : "Применить"}
        </Button>
      </DrawerFooter>
    </Drawer>
  );
};

export default PriceYearView;
