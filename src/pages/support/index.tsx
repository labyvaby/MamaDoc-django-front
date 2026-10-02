import React from "react";
import {
  Box,
  ButtonBase,
  Button,
  Collapse,
  Drawer,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import ClearRounded from "@mui/icons-material/ClearRounded";
import HourglassEmptyRounded from "@mui/icons-material/HourglassEmptyRounded";
import MarkChatUnreadOutlined from "@mui/icons-material/MarkChatUnreadOutlined";
import PlaylistAddCheckRounded from "@mui/icons-material/PlaylistAddCheckRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import SupportAgentRounded from "@mui/icons-material/SupportAgentRounded";
import TouchAppOutlined from "@mui/icons-material/TouchAppOutlined";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "react-router";

import {
  getSupportFilters,
  listSupportTickets,
  type SupportListParams,
  type TicketCategory,
  type TicketStatus,
} from "../../api/support";
import { djangoQueryKeys } from "../../api/queryKeys";
import { FilterPill } from "../../components/ui/FilterPill";
import { SegmentedTabs, type SegmentedTab } from "../../components/ui/SegmentedTabs";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useSupportReport } from "../../support/SupportReportProvider";
import { CATEGORY_LABEL, CATEGORY_TONE, STATUS_LABEL, toneColors, type SupportTone } from "../../support/meta";
import { useSupportSummary } from "../../support/useSupport";
import { AnimatedNumber, CATEGORY_ICON } from "../../support/ui";
import { LoadMore, TicketCard, TicketListSkeleton, TicketsEmpty } from "./TicketList";
import TicketDetail from "./TicketDetail";

const MotionBox = motion(Box);

type Tab = "open" | "queue" | "all" | "done";
const FINISHED: TicketStatus[] = ["resolved", "rejected", "voided"];
const CATEGORIES: TicketCategory[] = ["bug", "idea", "question"];

interface TileProps {
  label: string;
  value: number;
  tone: SupportTone;
  icon: React.ReactElement;
  active?: boolean;
  onClick: () => void;
  index: number;
}

/** Плитка-счётчик: число «набегает», по нажатию включает соответствующий фильтр. */
const Tile: React.FC<TileProps> = ({ label, value, tone, icon, active, onClick, index }) => {
  const reduceMotion = useReducedMotion();
  return (
    <MotionBox
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 * index, ease: [0.22, 1, 0.36, 1] }}
    >
      <ButtonBase
        onClick={onClick}
        aria-pressed={Boolean(active)}
        sx={(t) => {
          const c = toneColors(t, tone);
          return {
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 1.5,
            p: 1.5,
            borderRadius: "16px",
            textAlign: "left",
            border: `1px solid ${active ? c.main : t.palette.divider}`,
            background: active
              ? `linear-gradient(135deg, ${c.soft}, ${c.softer})`
              : t.palette.background.paper,
            transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
            "&:hover": {
              transform: "translateY(-2px)",
              borderColor: c.border,
              boxShadow: `0 12px 28px ${alpha(c.main, t.palette.mode === "dark" ? 0.22 : 0.16)}`,
            },
            "&:active": { transform: "scale(0.98)" },
          };
        }}
      >
        <Box
          sx={(t) => {
            const c = toneColors(t, tone);
            return {
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: "30%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: c.text,
              background: `linear-gradient(135deg, ${c.soft}, ${c.softer})`,
            };
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            <AnimatedNumber value={value} />
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.25 }}>
            {label}
          </Typography>
        </Box>
      </ButtonBase>
    </MotionBox>
  );
};

/** Страница «Поддержка»: обращения, переписка и (для разработчиков) очередь. */
const SupportPage: React.FC = () => {
  usePageTitle("Поддержка");
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const split = useMediaQuery(theme.breakpoints.up("lg"));
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const { openReport, preparing } = useSupportReport();
  const [params, setParams] = useSearchParams();

  const summaryQuery = useSupportSummary();
  const summary = summaryQuery.data;
  const isStaff = summary?.isStaff ?? false;
  const canViewAll = summary?.canViewAll ?? false;

  const [tab, setTab] = React.useState<Tab>("open");
  const [category, setCategory] = React.useState<TicketCategory | "">("");
  const [search, setSearch] = React.useState("");
  const [mine, setMine] = React.useState(false);
  const [orgId, setOrgId] = React.useState<number | null>(null);
  const [branchId, setBranchId] = React.useState<number | null>(null);
  const [statusOverride, setStatusOverride] = React.useState<TicketStatus | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());

  const selectedId = Number(params.get("ticket")) || null;
  const select = React.useCallback(
    (id: number | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("ticket", String(id));
          else next.delete("ticket");
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const listParams: SupportListParams = React.useMemo(() => {
    const base: SupportListParams = {
      category,
      search: debouncedSearch,
      mine: mine || undefined,
      organizationId: isStaff ? orgId : null,
      branchId,
      pageSize: 20,
    };
    if (statusOverride) return { ...base, status: [statusOverride] };
    if (tab === "open") return { ...base, open: true };
    if (tab === "queue") return { ...base, needsAttention: true, ordering: "attention" };
    if (tab === "done") return { ...base, status: FINISHED };
    return base;
  }, [category, debouncedSearch, mine, isStaff, orgId, branchId, statusOverride, tab]);

  const list = useInfiniteQuery({
    queryKey: djangoQueryKeys.support.list({ ...listParams, page: undefined }),
    queryFn: ({ pageParam, signal }) => listSupportTickets({ ...listParams, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    placeholderData: keepPreviousData,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });
  const tickets = React.useMemo(() => list.data?.pages.flatMap((page) => page.results) ?? [], [list.data]);
  const total = list.data?.pages[0]?.count ?? 0;

  const filtersQuery = useQuery({
    queryKey: djangoQueryKeys.support.filters,
    queryFn: ({ signal }) => getSupportFilters(signal),
    enabled: canViewAll,
    staleTime: 60_000,
  });
  const orgOptions = filtersQuery.data?.organizations ?? [];
  const branchOptions = (filtersQuery.data?.branches ?? []).filter((b) => orgId == null || b.organizationId === orgId);

  const hasFilters = Boolean(category || debouncedSearch || mine || orgId || branchId || statusOverride);
  const resetFilters = () => {
    setCategory("");
    setSearch("");
    setMine(false);
    setOrgId(null);
    setBranchId(null);
    setStatusOverride(null);
  };
  const pickTab = (next: Tab) => {
    setStatusOverride(null);
    setTab(next);
  };

  const detailInPane = split && selectedId !== null;
  const showPlace = canViewAll;

  const tabs: SegmentedTab<Tab>[] = [
    { key: "open", label: "Открытые", badge: canViewAll ? (summary?.scopeOpen ?? 0) : (summary?.open ?? 0) },
    ...(canViewAll
      ? [{ key: "queue" as Tab, label: isStaff ? "Очередь" : "Ждут ответа", badge: summary?.needsAttention ?? 0 }]
      : []),
    { key: "done", label: "Завершённые" },
    { key: "all", label: "Все" },
  ];

  // ── Плитки ──────────────────────────────────────────────────────────
  const tiles: Omit<TileProps, "index">[] = canViewAll
    ? [
        {
          label: isStaff ? "Ждут реакции" : "Ждут ответа",
          value: summary?.needsAttention ?? 0,
          tone: "error",
          icon: <HourglassEmptyRounded />,
          active: !statusOverride && tab === "queue",
          onClick: () => pickTab("queue"),
        },
        {
          label: "В работе",
          value: summary?.byStatus?.in_progress ?? 0,
          tone: "primary",
          icon: <PlaylistAddCheckRounded />,
          active: statusOverride === "in_progress",
          onClick: () => {
            setTab("all");
            setStatusOverride("in_progress");
          },
        },
        {
          label: "Ждём ответ автора",
          value: summary?.byStatus?.needs_info ?? 0,
          tone: "warning",
          icon: <MarkChatUnreadOutlined />,
          active: statusOverride === "needs_info",
          onClick: () => {
            setTab("all");
            setStatusOverride("needs_info");
          },
        },
        {
          label: "Решено",
          value: summary?.byStatus?.resolved ?? 0,
          tone: "success",
          icon: <CheckCircleOutline />,
          active: statusOverride === "resolved",
          onClick: () => {
            setTab("all");
            setStatusOverride("resolved");
          },
        },
      ]
    : [
        {
          label: "Мои открытые",
          value: summary?.open ?? 0,
          tone: "primary",
          icon: <PlaylistAddCheckRounded />,
          active: !statusOverride && tab === "open",
          onClick: () => pickTab("open"),
        },
        {
          label: "Новых ответов",
          value: summary?.unread ?? 0,
          tone: "error",
          icon: <MarkChatUnreadOutlined />,
          active: false,
          onClick: () => pickTab("open"),
        },
      ];

  const tone = toneColors(theme, "primary");
  const accent2 = theme.palette.purple?.main ?? theme.palette.secondary.main;

  const detailPanel =
    selectedId !== null ? <TicketDetail key={selectedId} ticketId={selectedId} onClose={() => select(null)} /> : null;

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflowY: detailInPane ? "hidden" : "auto",
        overflowX: "hidden",
        // Очень широкие мониторы: контент не растягивается на весь экран.
        px: { xs: 0.5, md: 1, xl: 2 },
        "& > *": { flexShrink: 0 },
        scrollbarGutter: "stable",
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 1760, mx: "auto", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* ── Верх: приветствие и плитки (сворачиваются, когда открыта деталь) ── */}
        <Collapse in={!detailInPane} timeout={reduceMotion ? 0 : 320} unmountOnExit={false}>
          <Box
            sx={{
              position: "relative",
              overflow: "hidden",
              borderRadius: "22px",
              p: { xs: 2, md: 3 },
              mb: 2,
              border: 1,
              borderColor: alpha(tone.main, 0.25),
              background: `linear-gradient(120deg, ${alpha(tone.main, 0.16)} 0%, ${alpha(accent2, 0.1)} 55%, ${alpha(tone.main, 0.04)} 100%)`,
            }}
          >
            {!reduceMotion &&
              [
                { size: 220, top: -80, right: -40, color: tone.main, dur: 11 },
                { size: 160, bottom: -70, right: 180, color: accent2, dur: 14 },
              ].map((blob, i) => (
                <MotionBox
                  key={i}
                  aria-hidden
                  animate={{ x: [0, 24, 0], y: [0, -14, 0], scale: [1, 1.08, 1] }}
                  transition={{ duration: blob.dur, repeat: Infinity, ease: "easeInOut" }}
                  sx={{
                    position: "absolute",
                    width: blob.size,
                    height: blob.size,
                    top: blob.top,
                    bottom: blob.bottom,
                    right: blob.right,
                    borderRadius: "50%",
                    background: `radial-gradient(circle, ${alpha(blob.color, 0.28)}, transparent 68%)`,
                    pointerEvents: "none",
                  }}
                />
              ))}
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={{ xs: 2, md: 3 }}
              alignItems={{ xs: "stretch", md: "center" }}
              sx={{ position: "relative" }}
            >
              <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                <MotionBox
                  initial={reduceMotion ? false : { scale: 0.6, rotate: -12, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16 }}
                  sx={{
                    width: 56,
                    height: 56,
                    flexShrink: 0,
                    borderRadius: "32%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    background: `linear-gradient(135deg, ${tone.main}, ${accent2})`,
                    boxShadow: `0 12px 28px ${alpha(tone.main, 0.4)}`,
                  }}
                >
                  <SupportAgentRounded sx={{ fontSize: 30 }} />
                </MotionBox>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                    {isStaff ? "Очередь обращений" : "Поддержка"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, maxWidth: 560 }}>
                    {isStaff
                      ? "Обращения всех организаций. Фильтруйте по организации и филиалу, меняйте статусы и отвечайте автору."
                      : "Что-то не работает или есть идея? Расскажите — снимок экрана и технические данные мы приложим сами. Ответ придёт сюда."}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexShrink: 0 }}>
                <Button
                  variant="contained"
                  size="large"
                  disabled={preparing}
                  data-support-trigger=""
                  onClick={() => void openReport({ category: "bug" })}
                  startIcon={<CATEGORY_ICON.bug />}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    borderRadius: "14px",
                    px: 2.5,
                    boxShadow: `0 10px 24px ${alpha(tone.main, 0.35)}`,
                  }}
                >
                  Сообщить о проблеме
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  disabled={preparing}
                  data-support-trigger=""
                  onClick={() => void openReport({ category: "idea" })}
                  startIcon={<CATEGORY_ICON.idea />}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: "14px", bgcolor: "background.paper" }}
                >
                  Предложить идею
                </Button>
              </Stack>
            </Stack>
          </Box>

          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              mb: 2,
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                md: `repeat(${Math.min(tiles.length, 4)}, minmax(0, 1fr))`,
              },
            }}
          >
            {tiles.map((tile, index) => (
              <Tile key={tile.label} {...tile} index={index} />
            ))}
          </Box>
        </Collapse>

        {/* ── Фильтры ─────────────────────────────────────────────────── */}
        <Stack spacing={1.25} sx={{ mb: 1.5 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ xs: "stretch", sm: "center" }}>
            <Box sx={{ minWidth: 0, maxWidth: "100%", overflowX: "auto" }}>
              <SegmentedTabs tabs={tabs} value={statusOverride ? "all" : tab} onChange={pickTab} layoutId="support-tabs" />
            </Box>
            <TextField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по тексту или номеру (SUP-12)"
              size="small"
              sx={{ flex: 1, minWidth: { sm: 220 }, maxWidth: { sm: 420 }, "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRounded fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" aria-label="Очистить поиск" onClick={() => setSearch("")}>
                        <ClearRounded fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
          </Stack>

          <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
            {CATEGORIES.map((item) => {
              const selected = category === item;
              const Icon = CATEGORY_ICON[item];
              return (
                <ButtonBase
                  key={item}
                  onClick={() => setCategory(selected ? "" : item)}
                  aria-pressed={selected}
                  sx={(t) => {
                    const c = toneColors(t, CATEGORY_TONE[item]);
                    return {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.6,
                      height: 30,
                      px: 1.25,
                      borderRadius: "9px",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      border: `1px solid ${selected ? c.border : t.palette.divider}`,
                      color: selected ? c.text : t.palette.text.secondary,
                      bgcolor: selected ? c.soft : "transparent",
                      transition: "all .15s ease",
                      "&:hover": { borderColor: c.border, color: c.text },
                    };
                  }}
                >
                  <Icon sx={{ fontSize: 16 }} />
                  {CATEGORY_LABEL[item]}
                </ButtonBase>
              );
            })}

            {canViewAll && (
              <ButtonBase
                onClick={() => setMine((v) => !v)}
                aria-pressed={mine}
                sx={(t) => ({
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.6,
                  height: 30,
                  px: 1.25,
                  borderRadius: "9px",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  border: `1px solid ${mine ? alpha(t.palette.primary.main, 0.45) : t.palette.divider}`,
                  color: mine ? t.palette.primary.main : t.palette.text.secondary,
                  bgcolor: mine ? alpha(t.palette.primary.main, 0.1) : "transparent",
                })}
              >
                <TouchAppOutlined sx={{ fontSize: 16 }} />
                Только мои
              </ButtonBase>
            )}

            {isStaff && orgOptions.length > 0 && (
              <FilterPill
                label="Организация"
                icon={<BusinessOutlined />}
                value={orgId == null ? "" : String(orgId)}
                allLabel="Все организации"
                options={orgOptions.map((o) => ({ value: String(o.id), label: `${o.name} (${o.count})` }))}
                onChange={(value) => {
                  setOrgId(value ? Number(value) : null);
                  setBranchId(null);
                }}
              />
            )}
            {canViewAll && branchOptions.length > 0 && (
              <FilterPill
                label="Филиал"
                icon={<AccountTreeOutlined />}
                value={branchId == null ? "" : String(branchId)}
                allLabel="Все филиалы"
                options={branchOptions.map((b) => ({ value: String(b.id), label: `${b.name} (${b.count})` }))}
                onChange={(value) => setBranchId(value ? Number(value) : null)}
              />
            )}

            {statusOverride && (
              <ButtonBase
                onClick={() => setStatusOverride(null)}
                sx={(t) => ({
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  height: 30,
                  px: 1.25,
                  borderRadius: "9px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: t.palette.primary.main,
                  border: `1px solid ${alpha(t.palette.primary.main, 0.45)}`,
                  bgcolor: alpha(t.palette.primary.main, 0.1),
                })}
              >
                Статус: {STATUS_LABEL[statusOverride]}
                <ClearRounded sx={{ fontSize: 15 }} />
              </ButtonBase>
            )}

            {hasFilters && (
              <Button size="small" onClick={resetFilters} sx={{ textTransform: "none" }}>
                Сбросить
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {list.isFetching && !list.isLoading ? "Обновляем…" : `Найдено: ${total}`}
            </Typography>
          </Stack>
        </Stack>

        {/* ── Список (+ деталь на широком экране) ─────────────────────── */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gap: 2,
            gridTemplateColumns: detailInPane ? { lg: "minmax(360px, 440px) minmax(0, 1fr)", xl: "minmax(400px, 480px) minmax(0, 1fr)" } : "minmax(0, 1fr)",
            pb: detailInPane ? 0 : 2,
          }}
        >
          <Box
            sx={{
              minHeight: 0,
              overflowY: detailInPane ? "auto" : "visible",
              pr: detailInPane ? 0.5 : 0,
              pb: detailInPane ? 1 : 0,
            }}
          >
            {list.isLoading ? (
              <TicketListSkeleton />
            ) : list.isError ? (
              <Box sx={{ textAlign: "center", py: 6 }}>
                <Typography color="text.secondary" sx={{ mb: 1.5 }}>
                  Не удалось загрузить обращения.
                </Typography>
                <Button onClick={() => void list.refetch()} variant="outlined" sx={{ textTransform: "none" }}>
                  Повторить
                </Button>
              </Box>
            ) : tickets.length === 0 ? (
              <TicketsEmpty filtered={hasFilters || tab !== "open"} onReport={() => void openReport({ category: "bug" })} onReset={() => { resetFilters(); setTab("all"); }} />
            ) : (
              <>
                <Box
                  sx={{
                    display: "grid",
                    gap: 1.25,
                    gridTemplateColumns: detailInPane
                      ? "minmax(0, 1fr)"
                      : { xs: "minmax(0, 1fr)", lg: "repeat(auto-fill, minmax(400px, 1fr))" },
                    alignItems: "stretch",
                  }}
                >
                  {tickets.map((ticket, index) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      selected={ticket.id === selectedId}
                      showPlace={showPlace}
                      index={index}
                      onSelect={select}
                    />
                  ))}
                </Box>
                <LoadMore
                  visible={Boolean(list.hasNextPage)}
                  loading={list.isFetchingNextPage}
                  onLoad={() => {
                    if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
                  }}
                />
              </>
            )}
          </Box>

          {detailInPane && (
            <MotionBox
              initial={reduceMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              sx={{ minHeight: 0, pb: 1 }}
            >
              <Paper variant="outlined" sx={{ height: "100%", borderRadius: "20px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {detailPanel}
              </Paper>
            </MotionBox>
          )}
        </Box>
      </Box>

      {/* Деталь вне split: выдвижка справа, на телефоне — снизу на всю высоту */}
      <Drawer
        anchor={phone ? "bottom" : "right"}
        open={!split && selectedId !== null}
        onClose={() => select(null)}
        PaperProps={{
          sx: {
            width: phone ? "100%" : 560,
            maxWidth: "100vw",
            height: phone ? "94dvh" : "100%",
            borderRadius: phone ? "20px 20px 0 0" : "20px 0 0 20px",
            backgroundImage: "none",
            overflow: "hidden",
          },
        }}
      >
        {detailPanel}
      </Drawer>
    </Box>
  );
};

export default SupportPage;
