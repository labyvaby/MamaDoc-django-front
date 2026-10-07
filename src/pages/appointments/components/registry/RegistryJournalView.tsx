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
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { useNotification } from "@refinedev/core";

import { useAppointmentsList } from "../../../../api/hooks/useAppointmentsQuery";
import { usePageTitle } from "../../../../hooks/usePageTitle";
import { useCanChecker } from "../../../../hooks/useCan";
import { useKeyboardViewportHeight } from "../../../../hooks/useKeyboardViewportHeight";
import { useSheetBackClose } from "../../../../hooks/useSheetBackClose";
import {
  DateRangeField,
  ListEmptyState,
  ListLoadingSkeleton,
  SegmentedTabs,
  type DateRange,
  type DateRangePreset,
} from "../../../../components/ui";
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
import { applySearch, narrowLinesOf, type RegistryToken } from "./registryFilters";
import { useRegistryFilters } from "./useRegistryFilters";
import { useRegistryRefunds } from "./useRegistryRefunds";
import {
  MONEY_FLAG_LABEL_KEY,
  MONEY_FLAG_OPTIONS,
  appointmentMoneyFlags,
  matchesMoneyFlags,
} from "../listFilters";
import { exportRegistry } from "./buildRegistryXlsx";
import { isCancelledStatus } from "../slotAvailability";
import RegistryCourseFeed from "./RegistryCourseFeed";
import type { SummaryTile } from "./RegistrySummaryBar";
import {
  consumedUnits,
  groupByDay,
  groupByPatient,
  hasRefund,
  isFullyRefunded,
  moneyOf,
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

/** «1 – 20 авг 2026», «28 июл – 10 авг 2026», «1 дек 2025 – 10 янв 2026». */
function formatRangeLabel(from: dayjs.Dayjs, to: dayjs.Dayjs): string {
  if (from.isSame(to, "day")) return from.format("D MMM YYYY");
  if (from.isSame(to, "month")) return `${from.format("D")} – ${to.format("D MMM YYYY")}`;
  if (from.isSame(to, "year")) return `${from.format("D MMM")} – ${to.format("D MMM YYYY")}`;
  return `${from.format("D MMM YYYY")} – ${to.format("D MMM YYYY")}`;
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
    showCancelled,
    setShowCancelled,
    withProducts,
    setWithProducts,
    withRefunds,
    setWithRefunds,
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
  // Лист заключения на телефоне живёт над клавиатурой, а не под ней.
  const conclusionViewport = useKeyboardViewportHeight(isMobile && !!conclusionTarget, "92dvh");
  // «Назад» закрывает лист, а не уводит из журнала.
  useSheetBackClose(!!conclusionTarget, () => setConclusionTarget(null), isMobile);
  const [cardTarget, setCardTarget] = React.useState<DjangoAppointment | null>(null);
  const [invoiceTarget, setInvoiceTarget] = React.useState<DjangoAppointment | null>(null);

  const monthStart = React.useMemo(
    () => dayjs().year(period.year).month(period.month ?? 0).date(1).startOf("day"),
    [period],
  );
  /** Быстрые периоды в календаре; по умолчанию журнал открывается на месяце. */
  const periodPresets = React.useMemo<DateRangePreset[]>(
    () => [
      { key: "month", label: t("journal.period.presets.month"), range: () => [dayjs().startOf("month"), dayjs().endOf("month")] },
      {
        key: "prevMonth",
        label: t("journal.period.presets.prevMonth"),
        range: () => [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")],
      },
      { key: "7d", label: t("journal.period.presets.last7"), range: () => [dayjs().subtract(6, "day"), dayjs()] },
      { key: "30d", label: t("journal.period.presets.last30"), range: () => [dayjs().subtract(29, "day"), dayjs()] },
      {
        key: "quarter",
        label: t("journal.period.presets.last3Months"),
        range: () => [dayjs().subtract(2, "month").startOf("month"), dayjs().endOf("month")],
      },
      { key: "ytd", label: t("journal.period.presets.yearToDate"), range: () => [dayjs().startOf("year"), dayjs()] },
    ],
    [t],
  );

  // Границы периода: месяц, весь год или свой диапазон (по умолчанию — месяц).
  const { periodFrom, periodTo } = React.useMemo(() => {
    if (period.range) {
      return { periodFrom: dayjs(period.range.from), periodTo: dayjs(period.range.to).endOf("day") };
    }
    if (period.month != null) {
      return { periodFrom: monthStart, periodTo: monthStart.endOf("month") };
    }
    const yearStart = dayjs(`${period.year}-01-01`);
    return { periodFrom: yearStart, periodTo: yearStart.endOf("year") };
  }, [period, monthStart]);
  const dateFrom = periodFrom.format("YYYY-MM-DD");
  const dateTo = periodTo.format("YYYY-MM-DD");
  /**
   * Пульс по дням — в месяце и в своём периоде до двух месяцев; длиннее —
   * по месяцам, иначе столбики сливаются в штрихкод.
   */
  const dayBuckets = period.range
    ? periodTo.diff(periodFrom, "day") < 62
    : period.month != null;

  const {
    data: rawAppointments = [],
    isLoading: loading,
    isPlaceholderData,
    refetch,
  } = useAppointmentsList({ dateFrom, dateTo, employeeId });

  // ⚠ Refine ставит всем запросам `placeholderData: keepPreviousData`
  // (@refinedev/core, defaultOptions). При смене периода в данных ещё лежит
  // прошлый: подпись уже «Август», а плитки и разрезы — сентябрьские. Пока так,
  // лента показывает загрузку, а сводка приглушена.
  const isStale = isPlaceholderData;
  const isLoading = loading || isStale || extraLoading;

  // Возвраты из ленты кассы — только там, где бэк ещё не отдаёт refundedTotal
  // в списке (прод на 06.10.2026). Поле приходит у всех приёмов сразу, поэтому
  // смотрим первый; пока список не загружен, кассу не дёргаем.
  const listHasRefunds = rawAppointments.length > 0 && rawAppointments[0].refundedTotal != null;
  const refundsByAppointment = useRegistryRefunds({
    periodFrom,
    enabled: canViewFinance && !loading && rawAppointments.length > 0 && !listHasRefunds,
  });

  // ── Срез ───────────────────────────────────────────────────────────────────
  const scoped = React.useMemo(() => {
    const visible = isVisible ? rawAppointments.filter(isVisible) : rawAppointments;
    if (!refundsByAppointment || refundsByAppointment.size === 0) return visible;
    // Новый объект только у приёмов с возвратом: строки ленты мемоизированы по
    // ссылке на приём, остальные не перерисовываются. Поле бэка главнее кассы.
    return visible.map((appt) => {
      const refunded = refundsByAppointment.get(appt.id);
      return refunded != null && appt.refundedTotal == null
        ? { ...appt, refundedTotal: refunded.toFixed(2) }
        : appt;
    });
  }, [rawAppointments, isVisible, refundsByAppointment]);

  // Условие исполнителя/услуги сужает не только список, но и деньги: сумма
  // считается по выбранным строкам, а не по всему чеку (см. narrowLinesOf).
  const sliceLines = React.useMemo(() => narrowLinesOf(getLines, tokens), [getLines, tokens]);
  const narrowed = sliceLines !== getLines;

  const searchedAll = React.useMemo(
    () => applySearch(scoped, tokens, query, getLines),
    [scoped, tokens, query, getLines],
  );

  /**
   * Отменённые и неявки из журнала убраны (решение заказчика 05.10.2026): в
   * деньги они и раньше не шли, но раздували счётчик приёмов, «Не оплачено» и
   * разрезы. Посмотреть их можно отдельным чипом «Отменённые» — тогда в ленте
   * только они, а сводка по-прежнему считает состоявшиеся.
   */
  /**
   * Возвраты — два режима (решение заказчика 05.10.2026). По умолчанию
   * («без возвратов») приём с полным возвратом скрыт и в деньги не идёт, а с
   * частичным остаётся в ленте с выручкой за вычетом возврата. В
   * режиме «С возвратами» он виден в ленте — даже если приём отменён: возврат
   * почти всегда идёт вместе с отменой, иначе режим был бы пустым, — а сумма
   * возврата выходит отдельной плиткой. Выручка в обоих режимах одна: деньги,
   * которые вернули, выручкой не считаются (см. moneyOf).
   */
  const { searched, cancelledItems, refundCount } = React.useMemo(() => {
    const active: DjangoAppointment[] = [];
    const cancelled: DjangoAppointment[] = [];
    let refunds = 0;
    for (const appt of searchedAll) {
      if (hasRefund(appt)) refunds += 1;
      const isCancelled = isCancelledStatus(appt.status);
      // Отмена с возвратом — тоже «возврат»: денег по ней не осталось.
      const fullRefund = isFullyRefunded(appt) || (hasRefund(appt) && isCancelled);
      if (fullRefund && withRefunds) active.push(appt);
      // Без режима возврат по отмене живёт под «Отменёнными», а возврат по
      // неотменённому приёму просто скрыт: в «Отменённые» он не годится
      // (на проде 06.10 так и вышло — приём 20322, scheduled + refunded).
      else if (isCancelled) cancelled.push(appt);
      else if (!fullRefund) active.push(appt);
    }
    return { searched: active, cancelledItems: cancelled, refundCount: refunds };
  }, [searchedAll, withRefunds]);
  const base = showCancelled ? cancelledItems : searched;

  // Товары приёма — по галочке и только в «Всех приёмах»: товар привязан к
  // приёму, а не к строке медсестры, в процедуры его не разнести.
  // При условии на услугу/исполнителя товары не прибавляем: они относятся к
  // приёму целиком, а не к выбранной услуге.
  const includeProducts = variant === "appointments" && withProducts && !narrowed;
  const hasProducts = React.useMemo(
    () => variant === "appointments" && searched.some((appt) => appt.productLines.length > 0),
    [variant, searched],
  );

  // Должник — у кого в срезе есть незакрытый остаток: та же функция денег,
  // что считает плитку «Долг», поэтому число на плитке и в ленте совпадает.
  const isInDebt = React.useCallback(
    (appt: DjangoAppointment) => moneyOf(appt, sliceLines(appt), includeProducts).debt > 0,
    [sliceLines, includeProducts],
  );

  const paymentCounts = React.useMemo(() => {
    const counts = new Map<RegistryTileKey, number>([["all", base.length]]);
    for (const appt of base) {
      const status = appt.paymentStatus;
      // «Возврат» — по факту возврата, а не по статусу: частичный возврат
      // статус не меняет (см. hasRefund).
      if (status && status !== "refunded") counts.set(status, (counts.get(status) ?? 0) + 1);
      if (hasRefund(appt)) counts.set("refunded", (counts.get("refunded") ?? 0) + 1);
      // «Долг» — по деньгам, тем же правилом, что плитка (см. PaymentFilter).
      if (isInDebt(appt)) counts.set("debt", (counts.get("debt") ?? 0) + 1);
      // Флаги цены живут в той же карте: приём попадает и в «Оплачено», и в
      // «Со скидкой», поэтому сумма счётчиков больше числа записей среза.
      for (const flag of appointmentMoneyFlags(appt)) {
        counts.set(flag, (counts.get(flag) ?? 0) + 1);
      }
    }
    return counts;
  }, [base, isInDebt]);

  const displayed = React.useMemo(() => {
    let list = base;
    if (paymentFilter !== "all") {
      list = list.filter((appt) =>
        paymentFilter === "refunded"
          ? hasRefund(appt)
          : paymentFilter === "debt"
          ? isInDebt(appt)
          : appt.paymentStatus === paymentFilter,
      );
    }
    if (moneyFlags.length > 0) {
      list = list.filter((appt) => matchesMoneyFlags(appt, moneyFlags));
    }
    if (bucket && dayBuckets) {
      list = list.filter((appt) => dayjs(appt.scheduledAt).format("YYYY-MM-DD") === bucket);
    }
    return list;
  }, [base, paymentFilter, isInDebt, moneyFlags, bucket, dayBuckets]);

  // Сводка и пульс считаются до фильтра по оплате и дню: иначе выбор «Долга»
  // обнулял бы «Выручку», по которой этот выбор и делают.
  const summary = React.useMemo(
    () => summarize(searched, sliceLines, includeProducts),
    [searched, sliceLines, includeProducts],
  );
  // Один день — один столбик: пульс ничего не сообщает, карточку прячем.
  const singleDay = periodFrom.isSame(periodTo, "day");
  const pulse = React.useMemo(
    () =>
      singleDay
        ? []
        : dayBuckets
        ? pulseByDay(searched, sliceLines, periodFrom, periodTo, includeProducts)
        : pulseByMonth(searched, sliceLines, periodFrom, periodTo, includeProducts),
    [searched, sliceLines, singleDay, dayBuckets, periodFrom, periodTo, includeProducts],
  );
  const groups = React.useMemo(
    () => groupByDay(displayed, sliceLines, includeProducts),
    [displayed, sliceLines, includeProducts],
  );
  const slices = React.useMemo(
    () => (view === "insights" ? sliceRegistry(displayed, sliceLines) : null),
    [view, displayed, sliceLines],
  );
  const displayedSummary = React.useMemo(
    () => summarize(displayed, sliceLines, includeProducts),
    [displayed, sliceLines, includeProducts],
  );

  // ── Профиль модуля ─────────────────────────────────────────────────────────
  const isProcedures = variant === "procedures";

  // Расходники приходят, только если у услуги настроен состав. Если в срезе
  // списаний нет вовсе, профиль процедур откатывается к денежным плиткам и
  // сумме в строке — иначе журнал показывал бы пустые нули там, где раньше
  // были деньги.
  const consumed = React.useMemo(
    () => (isProcedures ? consumedUnits(searched, sliceLines) : 0),
    [isProcedures, searched, sliceLines],
  );
  const materialsProfile = isProcedures && consumed > 0;
  const patients = React.useMemo(
    () => (isProcedures ? uniquePatients(searched) : 0),
    [isProcedures, searched],
  );
  const patientGroups = React.useMemo(
    () => (isProcedures && grouping === "courses" ? groupByPatient(displayed, sliceLines) : []),
    [isProcedures, grouping, displayed, sliceLines],
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
          key: "debt",
          label: t("journal.payFilter.debt"),
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
      // Значение плитки сжато («6,1 млн»), поэтому подпись под ним — полной
      // суммой до сома: по ней сверяют кассу.
      hint: t("journal.summary.accruedHint", { amount: formatAmount(summary.accrued) }),
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
        key: "debt",
        label: t("journal.summary.debt"),
        value: formatCompactAmount(summary.debt),
        unit: t("journal.summary.som"),
        hint: t("journal.summary.debtorsHint", { count: summary.debtors }),
        accent: "debt",
      },
      // В режиме «С возвратами» четвёртая плитка — возвраты: средний чек
      // ради них никто не открывает, а сумма возврата — то, что смотрят.
      withRefunds
        ? {
            key: "refunded",
            label: t("journal.summary.refunds"),
            value: summary.refunded > 0 ? `−${formatCompactAmount(summary.refunded)}` : "0",
            unit: t("journal.summary.som"),
            hint: t("journal.summary.refundsHint", { count: summary.refunds }),
            accent: "debt",
          }
        : {
            key: null,
            label: t("journal.summary.averageCheck"),
            value: formatCompactAmount(summary.averageCheck),
            unit: t("journal.summary.som"),
            hint: t("journal.summary.discountedHint", { count: summary.discounted }),
          },
    ];
  }, [summary, listLabel, canViewFinance, materialsProfile, consumed, patients, withRefunds, t]);

  const periodLabel = period.range
    ? formatRangeLabel(periodFrom, periodTo)
    : period.month != null
    ? monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
    : t("registry.wholeYearLabel", { year: period.year });
  const periodKey = period.range
    ? `${dateFrom}_${dateTo}`
    : period.month != null
    ? monthStart.format("YYYY-MM")
    : String(period.year);

  // ── Действия ───────────────────────────────────────────────────────────────
  const shiftPeriod = (delta: number) => {
    setBucket(null);
    setOpenId(null);
    setPeriod((prev) => {
      // Свой период листается своей длиной: «1–10 авг» → «11–20 авг».
      if (prev.range) {
        const from = dayjs(prev.range.from);
        const to = dayjs(prev.range.to);
        const length = to.diff(from, "day") + 1;
        const nextFrom = from.add(delta * length, "day");
        const nextTo = to.add(delta * length, "day");
        return {
          year: nextFrom.year(),
          month: nextFrom.month(),
          range: { from: nextFrom.format("YYYY-MM-DD"), to: nextTo.format("YYYY-MM-DD") },
        };
      }
      if (prev.month == null) return { year: prev.year + delta, month: null };
      const next = dayjs().year(prev.year).month(prev.month).add(delta, "month");
      return { year: next.year(), month: next.month() };
    });
  };

  const toggleWholeYear = () => {
    setBucket(null);
    setOpenId(null);
    setPeriod((prev) =>
      prev.month == null && !prev.range
        ? { year: prev.year, month: dayjs().year() === prev.year ? dayjs().month() : 0 }
        : { year: prev.year, month: null },
    );
  };

  /** Выбор в календаре: целый месяц сворачиваем в режим месяца, остальное — свой период. */
  const handleRangeChange = (range: DateRange) => {
    setBucket(null);
    setOpenId(null);
    const from = range.from.startOf("day");
    const to = range.to.startOf("day");
    if (from.date() === 1 && to.isSame(from.endOf("month"), "day")) {
      setPeriod({ year: from.year(), month: from.month() });
      return;
    }
    setPeriod({
      year: from.year(),
      month: from.month(),
      range: { from: from.format("YYYY-MM-DD"), to: to.format("YYYY-MM-DD") },
    });
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
    if (dayBuckets || key == null) {
      setBucket(key);
      return;
    }
    // В режиме года (и длинного периода) столбик — месяц: клик открывает этот месяц целиком.
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
          linesOf: sliceLines,
          title: `${pageTitle} · ${periodLabel}`,
          sheetName: periodLabel.slice(0, 28),
          performerHeader: employeeGroupLabel,
          servicesHeader: t("journal.table.services"),
          statusLabel: (appt) => getStatusLabel(appt.status),
          paymentLabel: (appt) =>
            appt.paymentStatus ? t(`journal.payFilter.${appt.paymentStatus}`) : "—",
          withMoney: canViewFinance,
          withProducts: includeProducts,
        },
        `${pageTitle} ${periodKey}.xlsx`,
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
          linesOf={sliceLines}
          loading={isLoading}
          summary={displayedSummary}
          canViewFinance={canViewFinance}
          onOpenCard={setCardTarget}
          performerHeader={employeeGroupLabel}
          servicesHeader={t("journal.table.services")}
          withProducts={includeProducts}
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
          linesOf={sliceLines}
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
        linesOf={sliceLines}
        openId={openId}
        onToggle={handleToggleRow}
        canUpdate={canUpdate}
        canViewFinance={canViewFinance}
        canManageFinance={canManageFinance}
        countLabel={countLabel}
        metric={materialsProfile ? "materials" : "money"}
        withProducts={includeProducts}
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
                {/* Подпись периода — она же кнопка календаря: месяц по
                    умолчанию, но можно выбрать любой свой период. */}
                <Box sx={{ flex: 1, minWidth: 118, display: "flex", justifyContent: "center" }}>
                  <DateRangeField
                    dense
                    fullWidth={isMobile}
                    value={{ from: periodFrom, to: periodTo }}
                    onChange={handleRangeChange}
                    presets={periodPresets}
                    label={periodLabel}
                  />
                </Box>
                <IconButton size="small" aria-label={t("journal.period.next")} onClick={() => shiftPeriod(1)}>
                  <ChevronRightOutlined fontSize="small" />
                </IconButton>
              </Stack>

              <Chip
                size="small"
                clickable
                label={t("journal.period.wholeYear")}
                onClick={toggleWholeYear}
                variant={period.month == null && !period.range ? "filled" : "outlined"}
                sx={(t) => ({
                  height: 30,
                  borderRadius: "7px",
                  fontWeight: 500,
                  flexShrink: 0,
                  ...(period.month == null && !period.range
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
            stale={isStale}
            tiles={tiles}
            pulse={pulse}
            isTileActive={isTileActive}
            onToggleTile={handleToggleTile}
            selectedBucket={bucket}
            onSelectBucket={handleSelectBucket}
            canViewFinance={canViewFinance}
            pulseTitle={
              period.range
                ? t("journal.pulse.period")
                : period.month != null
                ? t("journal.pulse.month")
                : t("journal.pulse.year")
            }
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

            {/* Отменённые и неявки: по умолчанию скрыты, чип показывает
                только их (в деньги они не идут в любом режиме). */}
            {(cancelledItems.length > 0 || showCancelled) && (
              <Chip
                size="small"
                clickable
                onClick={() => {
                  setOpenId(null);
                  setShowCancelled(!showCancelled);
                }}
                label={`${t("journal.cancelledFilter")} · ${cancelledItems.length}`}
                sx={(t) => ({
                  height: 26,
                  borderRadius: "7px",
                  fontWeight: 500,
                  border: 1,
                  borderStyle: showCancelled ? "solid" : "dashed",
                  borderColor: showCancelled ? alpha(t.palette.text.primary, 0.3) : "divider",
                  color: showCancelled ? "text.primary" : "text.disabled",
                  bgcolor: showCancelled ? subtleBg(t) : "transparent",
                  "&:hover": { bgcolor: subtleBg(t, true) },
                })}
              />
            )}

            {/* Режим возвратов: по умолчанию скрыты, с галочкой — в ленте
                и отдельной плиткой (в выручку не идут ни в каком режиме). */}
            {(refundCount > 0 || withRefunds) && (
              <Chip
                size="small"
                clickable
                icon={withRefunds ? <CheckOutlined sx={{ fontSize: 15 }} /> : undefined}
                onClick={() => {
                  setOpenId(null);
                  setWithRefunds(!withRefunds);
                }}
                label={`${t("journal.withRefunds")} · ${refundCount}`}
                variant="outlined"
                sx={(t) => ({
                  height: 26,
                  borderRadius: "7px",
                  fontWeight: 500,
                  borderColor: withRefunds ? alpha(t.palette.primary.main, 0.4) : "divider",
                  color: withRefunds ? "text.primary" : "text.secondary",
                  bgcolor: withRefunds
                    ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08)
                    : "transparent",
                })}
              />
            )}

            {/* Товары, проданные в приёме, по умолчанию в суммы не идут. */}
            {canViewFinance && !narrowed && (hasProducts || withProducts) && variant === "appointments" && (
              <Chip
                size="small"
                clickable
                icon={withProducts ? <CheckOutlined sx={{ fontSize: 15 }} /> : undefined}
                onClick={() => setWithProducts(!withProducts)}
                label={t("journal.withProducts")}
                variant="outlined"
                sx={(t) => ({
                  height: 26,
                  borderRadius: "7px",
                  fontWeight: 500,
                  borderColor: withProducts ? alpha(t.palette.primary.main, 0.4) : "divider",
                  color: withProducts ? "text.primary" : "text.secondary",
                  bgcolor: withProducts
                    ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08)
                    : "transparent",
                })}
              />
            )}

            {bucket && dayBuckets && (
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
            height: { xs: conclusionViewport.height, md: "100%" },
            ...(isMobile ? { bottom: conclusionViewport.bottom } : null),
            borderTopLeftRadius: { xs: "14px", md: 0 },
            borderTopRightRadius: { xs: "14px", md: 0 },
          },
        }}
      >
        {conclusionTarget && (
          <DjangoConclusionSlotsPanel
            appointmentId={conclusionTarget.id}
            branchId={conclusionTarget.branchId}
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
