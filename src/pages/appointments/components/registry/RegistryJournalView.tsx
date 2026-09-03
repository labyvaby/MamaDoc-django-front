/**
 * RegistryJournalView — журнал исторических реестров («Все приёмы» и «Все
 * процедуры»).
 *
 * Прежний вид повторял регистратуру: список слева, детали справа, лента
 * аватарок, Drawer «Фильтры». Но регистратура отвечает на вопрос «кто сейчас в
 * клинике», а архив — «что было и сколько это принесло», поэтому здесь:
 *   • сводка периода сверху (плитки одновременно фильтры) и пульс — столбик на
 *     день месяца (или на месяц в режиме года), клик сужает срез;
 *   • одна командная строка вместо Drawer фильтров и ленты аватарок: пациент,
 *     исполнитель и услуга становятся условиями-чипами;
 *   • лента во всю ширину с липкой шапкой дня и итогом дня, строка
 *     раскрывается на месте;
 *   • три режима одного среза: лента (читать), таблица (сверять и выгружать),
 *     разрезы (исполнители, услуги, часы пик, оплата / расход материалов).
 *
 * Все сводки считаются на фронте из уже загруженного периода — `useAppointmentsList`
 * и раньше тянул месяц целиком, дополнительных запросов к бэку журнал не делает.
 */
import React from "react";
import {
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import SearchOffOutlined from "@mui/icons-material/SearchOffOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { useNotification } from "@refinedev/core";

import { useAppointmentsList } from "../../../../api/hooks/useAppointmentsQuery";
import { usePageTitle } from "../../../../hooks/usePageTitle";
import { useCanChecker } from "../../../../hooks/useCan";
import { ListEmptyState, ListLoadingSkeleton, SegmentedTabs } from "../../../../components/ui";
import { subtleBg } from "../../../../theme";
import { useT } from "../../../../i18n/VerticalProvider";
import { getStatusLabel } from "../../../../config/appointmentStatuses";
import InvoiceFormatDialog from "../../../../components/appointments/InvoiceFormatDialog";
import { useAppointmentReceipt } from "../../../../components/appointments/useAppointmentReceipt";
import type { InvoicePageSize } from "../../../../components/appointments/appointmentInvoice";
import type { DjangoAppointment } from "../../../../api/appointments";
import AppointmentDetailsPanel from "../AppointmentDetailsPanel";
import DjangoConclusionSlotsPanel from "../../DjangoConclusionSlotsPanel";
import DjangoEditAppointmentDrawer from "../../DjangoEditAppointmentDrawer";
import DjangoPaymentDrawer from "../../DjangoPaymentDrawer";
import RegistryOmniSearch from "./RegistryOmniSearch";
import RegistrySummaryBar from "./RegistrySummaryBar";
import RegistryFeed from "./RegistryFeed";
import RegistryTable from "./RegistryTable";
import RegistryInsights from "./RegistryInsights";
import { applySearch, type RegistryToken } from "./registryFilters";
import { useRegistryFilters } from "./useRegistryFilters";
import {
  MONEY_FLAG_LABEL_KEY,
  MONEY_FLAG_OPTIONS,
  appointmentMoneyFlags,
  matchesMoneyFlags,
} from "../listFilters";
import { exportRegistry } from "./buildRegistryXlsx";
import RegistryCourseFeed from "./RegistryCourseFeed";
import type { SummaryTile } from "./RegistrySummaryBar";
import {
  consumedUnits,
  groupByDay,
  groupByPatient,
  pulseByDay,
  pulseByMonth,
  sliceRegistry,
  summarize,
  uniquePatients,
  type LinesOf,
} from "./registryStats";
import { formatCompactAmount, formatAmount } from "./registryFormat";
import {
  PAYMENT_FILTERS,
  isMoneyFlagKey,
  paymentAccent,
  type FeedGrouping,
  type RegistryTileKey,
  type RegistryViewMode,
} from "./registryTypes";

interface Props {
  pageTitle: string;
  /** «Приёмы» / «Процедуры» — подпись счётчиков и заголовков разрезов. */
  listLabel: string;
  searchPlaceholder: string;
  /** Строки, относящиеся к реестру. Для процедур — только медсестринские. */
  getLines?: LinesOf;
  /** Показывать ли запись в реестре (для процедур — есть ли строка медсестры). */
  isVisible?: (appt: DjangoAppointment) => boolean;
  /** Дополнительный признак загрузки (например, справочник медсестёр). */
  extraLoading?: boolean;
  /** Ограничить реестр записями текущего исполнителя. */
  employeeId?: number | "me";
  /** Подписи и четвёртая карточка разрезов зависят от реестра. */
  variant: "appointments" | "procedures";
}

const defaultGetLines: LinesOf = (appt) => appt.services.filter((line) => line.employee);

export const RegistryJournalView: React.FC<Props> = ({
  pageTitle,
  listLabel,
  searchPlaceholder,
  getLines = defaultGetLines,
  isVisible,
  extraLoading = false,
  employeeId,
  variant,
}) => {
  const { t } = useT("appointments");
  usePageTitle(pageTitle);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { can } = useCanChecker();
  const { open: notify } = useNotification();
  const { printReceipt } = useAppointmentReceipt();

  const canUpdate = can("appointments.update");
  const canViewFinance = can("finance.view");
  const canManageFinance = can("finance.manage");

  // ── Состояние среза ────────────────────────────────────────────────────────
  // Период и фильтры живут в URL (useRegistryFilters): срез журнала — это то,
  // чем делятся ссылкой, а корзина пульса ниже — drill-down внутри него.
  const {
    period,
    setPeriod,
    paymentFilter,
    setPaymentFilter,
    moneyFlags,
    toggleMoneyFlag,
  } = useRegistryFilters();
  const [view, setView] = React.useState<RegistryViewMode>("feed");
  // Раскладка ленты: по дням (общая) или по пациентам и курсам (процедуры).
  const [grouping, setGrouping] = React.useState<FeedGrouping>("days");
  const [bucket, setBucket] = React.useState<string | null>(null);
  const [tokens, setTokens] = React.useState<RegistryToken[]>([]);
  const [query, setQuery] = React.useState("");
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [exporting, setExporting] = React.useState(false);

  // ── Цели действий ──────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = React.useState<DjangoAppointment | null>(null);
  const [paymentTarget, setPaymentTarget] = React.useState<DjangoAppointment | null>(null);
  const [conclusionTarget, setConclusionTarget] = React.useState<DjangoAppointment | null>(null);
  const [cardTarget, setCardTarget] = React.useState<DjangoAppointment | null>(null);
  const [invoiceTarget, setInvoiceTarget] = React.useState<DjangoAppointment | null>(null);

  const monthStart = React.useMemo(
    () => dayjs().year(period.year).month(period.month ?? 0).date(1).startOf("day"),
    [period],
  );
  const dateFrom = period.month != null
    ? monthStart.startOf("month").format("YYYY-MM-DD")
    : `${period.year}-01-01`;
  const dateTo = period.month != null
    ? monthStart.endOf("month").format("YYYY-MM-DD")
    : `${period.year}-12-31`;

  const {
    data: rawAppointments = [],
    isLoading: loading,
    refetch,
  } = useAppointmentsList({ dateFrom, dateTo, employeeId });

  const isLoading = loading || extraLoading;

  // ── Срез ───────────────────────────────────────────────────────────────────
  const scoped = React.useMemo(
    () => (isVisible ? rawAppointments.filter(isVisible) : rawAppointments),
    [rawAppointments, isVisible],
  );

  const searched = React.useMemo(
    () => applySearch(scoped, tokens, query, getLines),
    [scoped, tokens, query, getLines],
  );

  const paymentCounts = React.useMemo(() => {
    const counts = new Map<RegistryTileKey, number>([["all", searched.length]]);
    for (const appt of searched) {
      const status = appt.paymentStatus;
      if (status) counts.set(status, (counts.get(status) ?? 0) + 1);
      // Флаги цены живут в той же карте: приём попадает и в «Оплачено», и в
      // «Со скидкой», поэтому сумма счётчиков больше числа записей среза.
      for (const flag of appointmentMoneyFlags(appt)) {
        counts.set(flag, (counts.get(flag) ?? 0) + 1);
      }
    }
    return counts;
  }, [searched]);

  const displayed = React.useMemo(() => {
    let list = searched;
    if (paymentFilter !== "all") {
      list = list.filter((appt) => appt.paymentStatus === paymentFilter);
    }
    if (moneyFlags.length > 0) {
      list = list.filter((appt) => matchesMoneyFlags(appt, moneyFlags));
    }
    if (bucket && period.month != null) {
      list = list.filter((appt) => dayjs(appt.scheduledAt).format("YYYY-MM-DD") === bucket);
    }
    return list;
  }, [searched, paymentFilter, moneyFlags, bucket, period.month]);

  // Сводка и пульс считаются до фильтра по оплате и дню: иначе выбор «Долга»
  // обнулял бы «Выручку», по которой этот выбор и делают.
  const summary = React.useMemo(() => summarize(searched, getLines), [searched, getLines]);
  const pulse = React.useMemo(
    () =>
      period.month != null
        ? pulseByDay(searched, getLines, monthStart)
        : pulseByMonth(searched, getLines, period.year),
    [searched, getLines, period, monthStart],
  );
  const groups = React.useMemo(() => groupByDay(displayed, getLines), [displayed, getLines]);
  const slices = React.useMemo(
    () => (view === "insights" ? sliceRegistry(displayed, getLines) : null),
    [view, displayed, getLines],
  );
  const displayedSummary = React.useMemo(
    () => summarize(displayed, getLines),
    [displayed, getLines],
  );

  // ── Профиль модуля ─────────────────────────────────────────────────────────
  const isProcedures = variant === "procedures";

  // Расходники приходят, только если у услуги настроен состав. Если в срезе
  // списаний нет вовсе, профиль процедур откатывается к денежным плиткам и
  // сумме в строке — иначе журнал показывал бы пустые нули там, где раньше
  // были деньги.
  const consumed = React.useMemo(
    () => (isProcedures ? consumedUnits(searched, getLines) : 0),
    [isProcedures, searched, getLines],
  );
  const materialsProfile = isProcedures && consumed > 0;
  const patients = React.useMemo(
    () => (isProcedures ? uniquePatients(searched) : 0),
    [isProcedures, searched],
  );
  const patientGroups = React.useMemo(
    () => (isProcedures && grouping === "courses" ? groupByPatient(displayed, getLines) : []),
    [isProcedures, grouping, displayed, getLines],
  );
  const countKey = isProcedures ? "journal.count.procedures" : "journal.count.appointments";
  const countLabel = React.useCallback(
    (count: number) => t(countKey, { count }),
    [t, countKey],
  );
  const employeeGroupLabel = isProcedures
    ? t("journal.omni.groupNurse")
    : t("journal.omni.groupDoctor");
  // Заглавную ставим руками, а не `textTransform: capitalize`: CSS поднимал бы
  // каждое слово, и «2026 · весь год» становился «2026 · Весь Год».
  const monthLabel = monthStart.format("MMMM YYYY");
  /**
   * Плитки сводки — главное различие профилей.
   *
   * Приёмы смотрят владелец и бухгалтер: им нужны выручка, долг и средний чек.
   * Процедуры смотрит процедурный кабинет: средний чек в 270 сом ему ничего не
   * говорит, а расход материалов и охват пациентов — говорят.
   */
  const tiles: SummaryTile[] = React.useMemo(() => {
    const visitsTile: SummaryTile = {
      key: "all",
      label: listLabel,
      value: String(summary.visits),
      hint: t("journal.summary.closedHint", { count: summary.closed }),
    };

    if (!canViewFinance) {
      return [
        visitsTile,
        {
          key: "paid",
          label: t("journal.payFilter.paid"),
          value: String(summary.closed),
          hint: t("journal.summary.ofTotal", { total: summary.visits }),
          accent: "paid",
        },
        {
          key: "discount",
          label: t("journal.moneyFilter.discount"),
          value: String(summary.discounted),
          hint: t("journal.summary.ofTotal", { total: summary.visits }),
        },
        {
          key: "partial",
          label: t("journal.payFilter.partial"),
          value: String(summary.debtors),
          hint: t("journal.summary.ofTotal", { total: summary.visits }),
          accent: "debt",
        },
      ];
    }

    const revenueTile: SummaryTile = {
      key: "paid",
      label: t("journal.summary.revenue"),
      value: formatCompactAmount(summary.paid),
      unit: t("journal.summary.som"),
      hint: t("journal.summary.accruedHint", { amount: formatCompactAmount(summary.accrued) }),
      accent: "paid",
    };

    if (materialsProfile) {
      return [
        visitsTile,
        revenueTile,
        {
          key: null,
          label: t("journal.summary.materials"),
          value: formatAmount(consumed),
          unit: t("journal.summary.units"),
          hint: t("journal.summary.materialsHint"),
        },
        {
          key: null,
          label: t("journal.summary.patients"),
          value: String(patients),
          hint: t("journal.summary.perPatientHint", {
            value: patients > 0 ? (summary.visits / patients).toFixed(1).replace(".", ",") : "0",
          }),
        },
      ];
    }

    return [
      visitsTile,
      revenueTile,
      {
        key: "partial",
        label: t("journal.summary.debt"),
        value: formatCompactAmount(summary.debt),
        unit: t("journal.summary.som"),
        hint: t("journal.summary.debtorsHint", { count: summary.debtors }),
        accent: "debt",
      },
      {
        key: null,
        label: t("journal.summary.averageCheck"),
        value: formatCompactAmount(summary.averageCheck),
        unit: t("journal.summary.som"),
        hint: t("journal.summary.discountedHint", { count: summary.discounted }),
      },
    ];
  }, [summary, listLabel, canViewFinance, materialsProfile, consumed, patients, t]);

  const periodLabel = period.month != null
    ? monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
    : t("registry.wholeYearLabel", { year: period.year });

  // ── Действия ───────────────────────────────────────────────────────────────
  const shiftPeriod = (delta: number) => {
    setBucket(null);
    setOpenId(null);
    setPeriod((prev) => {
      if (prev.month == null) return { year: prev.year + delta, month: null };
      const next = dayjs().year(prev.year).month(prev.month).add(delta, "month");
      return { year: next.year(), month: next.month() };
    });
  };

  const toggleWholeYear = () => {
    setBucket(null);
    setOpenId(null);
    setPeriod((prev) =>
      prev.month == null
        ? { year: prev.year, month: dayjs().year() === prev.year ? dayjs().month() : 0 }
        : { year: prev.year, month: null },
    );
  };

  /**
   * Плитка сводки и чип — один и тот же переключатель: оплата выбирается по
   * одному значению, флаги цены складываются (мультивыбор). Единая точка,
   * чтобы клик по плитке «Со скидкой» и по чипу «Со скидкой» делал одно и то же.
   */
  const isTileActive = (key: RegistryTileKey) =>
    isMoneyFlagKey(key) ? moneyFlags.includes(key) : paymentFilter === key;

  const handleToggleTile = (key: RegistryTileKey) => {
    setOpenId(null);
    if (isMoneyFlagKey(key)) toggleMoneyFlag(key);
    else setPaymentFilter(paymentFilter === key ? "all" : key);
  };

  const handleSelectBucket = (key: string | null) => {
    setOpenId(null);
    if (period.month != null || key == null) {
      setBucket(key);
      return;
    }
    // В режиме года столбик — месяц: клик открывает этот месяц целиком.
    const month = dayjs(`${key}-01`);
    setPeriod({ year: month.year(), month: month.month() });
    setBucket(null);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportRegistry(
        {
          items: displayed,
          linesOf: getLines,
          title: `${pageTitle} · ${periodLabel}`,
          sheetName: periodLabel.slice(0, 28),
          performerHeader: employeeGroupLabel,
          servicesHeader: t("journal.table.services"),
          statusLabel: (appt) => getStatusLabel(appt.status),
          paymentLabel: (appt) =>
            appt.paymentStatus ? t(`journal.payFilter.${appt.paymentStatus}`) : "—",
          withMoney: canViewFinance,
        },
        `${pageTitle} ${period.month != null ? monthStart.format("YYYY-MM") : period.year}.xlsx`,
      );
    } catch {
      notify?.({ type: "error", message: t("journal.exportError") });
    } finally {
      setExporting(false);
    }
  };

  // Стабильные ссылки: строка ленты мемоизирована, и объект, пересобираемый на
  // каждый рендер, обесценивал бы мемоизацию (восемьсот строк перерисовывались
  // от любого клика).
  const rowActions = React.useMemo(
    () => ({
      onPay: setPaymentTarget,
      onEdit: setEditTarget,
      onConclusion: setConclusionTarget,
      onPrintInvoice: setInvoiceTarget,
      onOpenCard: setCardTarget,
    }),
    [],
  );

  const handleToggleRow = React.useCallback(
    (id: number) => setOpenId((prev) => (prev === id ? null : id)),
    [],
  );

  const handlePrintInvoice = async (pageSize: InvoicePageSize) => {
    const target = invoiceTarget;
    setInvoiceTarget(null);
    if (!target) return;
    const result = await printReceipt(target.id, pageSize);
    if (result === "blocked") {
      notify?.({ type: "error", message: t("invoice.popupBlocked") });
    }
  };

  const stage = (() => {
    if (isLoading) return <ListLoadingSkeleton />;
    if (displayed.length === 0) {
      return (
        <Paper elevation={0} variant="outlined" sx={{ py: 2 }}>
          <ListEmptyState
            icon={<SearchOffOutlined sx={{ fontSize: 30 }} />}
            title={t("journal.empty.title")}
            description={t("journal.empty.description")}
          />
        </Paper>
      );
    }
    if (view === "table") {
      return (
        <RegistryTable
          items={displayed}
          linesOf={getLines}
          loading={isLoading}
          summary={displayedSummary}
          canViewFinance={canViewFinance}
          onOpenCard={setCardTarget}
          performerHeader={employeeGroupLabel}
          servicesHeader={t("journal.table.services")}
        />
      );
    }
    if (view === "insights" && slices) {
      return (
        <RegistryInsights
          slices={slices}
          total={displayed.length}
          canViewFinance={canViewFinance}
          performersTitle={isProcedures ? t("journal.insights.nurses") : t("journal.insights.performers")}
          servicesTitle={isProcedures ? t("journal.insights.topProcedures") : t("journal.insights.topServices")}
          showConsumptions={isProcedures}
        />
      );
    }
    if (isProcedures && grouping === "courses") {
      return (
        <RegistryCourseFeed
          groups={patientGroups}
          linesOf={getLines}
          openId={openId}
          onToggle={handleToggleRow}
          canUpdate={canUpdate}
          canViewFinance={canViewFinance}
          canManageFinance={canManageFinance}
          countLabel={countLabel}
          {...rowActions}
        />
      );
    }
    return (
      <RegistryFeed
        groups={groups}
        linesOf={getLines}
        openId={openId}
        onToggle={handleToggleRow}
        canUpdate={canUpdate}
        canViewFinance={canViewFinance}
        canManageFinance={canManageFinance}
        countLabel={countLabel}
        metric={materialsProfile ? "materials" : "money"}
        {...rowActions}
      />
    );
  })();

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box
        sx={(t) => ({
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          px: t.appLayout.page.paddingX,
          pb: 3,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          "&::-webkit-scrollbar": { display: "none" },
        })}
      >
        <Stack gap={1.5}>
          {/* Шапка: период, выгрузка, режимы. Название страницы уже стоит в
              шапке приложения — второй раз его здесь не печатаем. */}
          {/* На телефоне шапка складывается в две строки: период с «Весь год»
              и выгрузкой иконкой, под ними — режимы во всю ширину. */}
          <Stack gap={1}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Stack
                direction="row"
                alignItems="center"
                gap={0.25}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: "10px",
                  p: 0.375,
                  flex: { xs: 1, md: "0 0 auto" },
                }}
              >
                <IconButton size="small" aria-label={t("journal.period.prev")} onClick={() => shiftPeriod(-1)}>
                  <ChevronLeftOutlined fontSize="small" />
                </IconButton>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  noWrap
                  sx={{ flex: 1, minWidth: 118, textAlign: "center" }}
                >
                  {periodLabel}
                </Typography>
                <IconButton size="small" aria-label={t("journal.period.next")} onClick={() => shiftPeriod(1)}>
                  <ChevronRightOutlined fontSize="small" />
                </IconButton>
              </Stack>

              <Chip
                size="small"
                clickable
                label={t("journal.period.wholeYear")}
                onClick={toggleWholeYear}
                variant={period.month == null ? "filled" : "outlined"}
                sx={(t) => ({
                  height: 30,
                  borderRadius: "7px",
                  fontWeight: 500,
                  flexShrink: 0,
                  ...(period.month == null
                    ? {
                        bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
                        color: "primary.onSurface",
                      }
                    : { color: "text.secondary" }),
                })}
              />

              <Box sx={{ flex: { xs: "0 0 auto", md: 1 } }} />

              {isMobile ? (
                <IconButton
                  size="small"
                  aria-label={t("journal.export")}
                  onClick={handleExport}
                  disabled={exporting || displayed.length === 0}
                  sx={{ border: 1, borderColor: "divider", borderRadius: "10px", width: 34, height: 34 }}
                >
                  <FileDownloadOutlined fontSize="small" />
                </IconButton>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FileDownloadOutlined />}
                  onClick={handleExport}
                  disabled={exporting || displayed.length === 0}
                >
                  {exporting ? t("journal.exporting") : t("journal.export")}
                </Button>
              )}

              {!isMobile && (
                <SegmentedTabs<RegistryViewMode>
                  layoutId="registry-journal-view"
                  value={view}
                  onChange={setView}
                  tabs={[
                    { key: "feed", label: t("journal.views.feed") },
                    { key: "table", label: t("journal.views.table") },
                    { key: "insights", label: t("journal.views.insights") },
                  ]}
                />
              )}
            </Stack>

            {isMobile && (
              <Box sx={{ "& > div": { width: "100%" }, "& button": { flex: 1 } }}>
                <SegmentedTabs<RegistryViewMode>
                  layoutId="registry-journal-view-mobile"
                  value={view}
                  onChange={setView}
                  tabs={[
                    { key: "feed", label: t("journal.views.feed") },
                    { key: "table", label: t("journal.views.table") },
                    { key: "insights", label: t("journal.views.insights") },
                  ]}
                />
              </Box>
            )}
          </Stack>

          <RegistryOmniSearch
            items={scoped}
            linesOf={getLines}
            tokens={tokens}
            onTokensChange={(next) => {
              setTokens(next);
              setOpenId(null);
            }}
            query={query}
            onQueryChange={setQuery}
            placeholder={searchPlaceholder}
            employeeGroupLabel={employeeGroupLabel}
          />

          <RegistrySummaryBar
            tiles={tiles}
            pulse={pulse}
            isTileActive={isTileActive}
            onToggleTile={handleToggleTile}
            selectedBucket={bucket}
            onSelectBucket={handleSelectBucket}
            canViewFinance={canViewFinance}
            pulseTitle={period.month != null ? t("journal.pulse.month") : t("journal.pulse.year")}
          />

          {/* Чипы оплаты и цены со счётчиками среза. Оси идут одним рядом:
              флаги цены («Со скидкой», «Цена повышена») — тоже про деньги, а
              выбираются они независимо от статуса оплаты, поэтому скидка,
              которую ещё не оплатили, из фильтра больше не выпадает. */}
          <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
            {[...PAYMENT_FILTERS, ...MONEY_FLAG_OPTIONS].map((value) => {
              const count = paymentCounts.get(value) ?? 0;
              if (count === 0 && value !== "all") return null;
              const active = isTileActive(value);
              const accent = paymentAccent(value, theme) ?? theme.palette.primary.main;
              const labelKey = isMoneyFlagKey(value)
                ? `journal.moneyFilter.${MONEY_FLAG_LABEL_KEY[value]}`
                : `journal.payFilter.${value}`;
              return (
                <Chip
                  key={value}
                  size="small"
                  clickable
                  onClick={() => handleToggleTile(value)}
                  label={`${t(labelKey)} · ${count}`}
                  sx={(t) => ({
                    height: 26,
                    borderRadius: "7px",
                    fontWeight: 500,
                    border: 1,
                    borderColor: active ? alpha(accent, 0.4) : "divider",
                    color: active ? "text.primary" : "text.secondary",
                    bgcolor: active
                      ? alpha(accent, t.palette.mode === "dark" ? 0.16 : 0.08)
                      : "transparent",
                    "&:hover": {
                      bgcolor: active
                        ? alpha(accent, t.palette.mode === "dark" ? 0.22 : 0.12)
                        : subtleBg(t, true),
                    },
                  })}
                />
              );
            })}

            {bucket && period.month != null && (
              <Chip
                size="small"
                label={dayjs(bucket).format("D MMMM")}
                onDelete={() => setBucket(null)}
                sx={{ height: 26, borderRadius: "7px", fontWeight: 500 }}
              />
            )}

            {/* Раскладка ленты — только в процедурах: у приёмов курсов нет. */}
            {isProcedures && view === "feed" && (
              <Box sx={{ ml: 1 }}>
                <SegmentedTabs<FeedGrouping>
                  layoutId="registry-journal-grouping"
                  value={grouping}
                  onChange={(next) => {
                    setGrouping(next);
                    setOpenId(null);
                  }}
                  tabs={[
                    { key: "days", label: t("journal.grouping.days") },
                    { key: "courses", label: t("journal.grouping.courses") },
                  ]}
                />
              </Box>
            )}

            <Typography variant="caption" color="text.disabled" sx={{ ml: "auto" }}>
              {t("journal.shownOf", { shown: displayed.length, total: scoped.length })}
            </Typography>
          </Stack>

          {stage}
        </Stack>
      </Box>

      {/* Полная карточка приёма — всё, что не поместилось в раскрытую строку */}
      <Drawer
        anchor={isMobile ? "bottom" : "right"}
        open={!!cardTarget}
        onClose={() => setCardTarget(null)}
        PaperProps={{
          sx: {
            width: { xs: "100%", md: 560 },
            height: { xs: "92dvh", md: "100%" },
            borderTopLeftRadius: { xs: "14px", md: 0 },
            borderTopRightRadius: { xs: "14px", md: 0 },
          },
        }}
      >
        {cardTarget && (
          <AppointmentDetailsPanel
            appointment={cardTarget}
            canUpdate={canUpdate}
            canManageFinance={canManageFinance}
            canViewFinance={canViewFinance}
            onEdit={(appt) => {
              setCardTarget(null);
              setEditTarget(appt);
            }}
            onPay={(appt) => {
              setCardTarget(null);
              setPaymentTarget(appt);
            }}
            onClose={() => setCardTarget(null)}
          />
        )}
      </Drawer>

      {/* Заключения приёма */}
      <Drawer
        anchor={isMobile ? "bottom" : "right"}
        open={!!conclusionTarget}
        onClose={() => setConclusionTarget(null)}
        PaperProps={{
          sx: {
            width: { xs: "100%", md: 620 },
            height: { xs: "92dvh", md: "100%" },
            borderTopLeftRadius: { xs: "14px", md: 0 },
            borderTopRightRadius: { xs: "14px", md: 0 },
          },
        }}
      >
        {conclusionTarget && (
          <DjangoConclusionSlotsPanel
            appointmentId={conclusionTarget.id}
            onClose={() => setConclusionTarget(null)}
          />
        )}
      </Drawer>

      <DjangoEditAppointmentDrawer
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        appointment={editTarget}
        onSaved={() => {
          setEditTarget(null);
          void refetch();
        }}
      />

      <DjangoPaymentDrawer
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        appointment={paymentTarget}
        onSaved={() => {
          setPaymentTarget(null);
          void refetch();
        }}
      />

      <InvoiceFormatDialog
        open={!!invoiceTarget}
        onCancel={() => setInvoiceTarget(null)}
        onConfirm={handlePrintInvoice}
      />
    </Box>
  );
};

export default RegistryJournalView;
