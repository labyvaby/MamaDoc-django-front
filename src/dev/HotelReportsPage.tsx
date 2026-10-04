/**
 * «Отчёты» отеля — набор связанных отчётов, у каждой роли свой главный:
 *  • «Собственнику» (HotelOwnerReport) — выручка, загрузка, ADR/RevPAR с
 *    динамикой, деньги, долги, каналы и категории;
 *  • «Смена администратора» (HotelShiftReport) — касса смены, как их отчёт
 *    админов в Google Sheets;
 *  • «Заезды» (HotelBalancesReport) — «Балансы бронирований» Exely по дате заезда;
 *  • «Доходность и загрузка» (HotelYieldReport) — по месяцам, неделям и дням;
 *  • «Горничные» (HotelHousekeepersReport) — нагрузка уборки по графику;
 *  • «Номера за день» (HotelDayReport) — кто где живёт и по какой цене;
 *  • «Правки цен» (HotelPriceChangesReport) — свои цены, скидки и суммы за период;
 *  • «Объекты» (HotelPropertiesReport) — все объекты организации рядом.
 *
 * Отчёт и его фильтры живут в адресе (?r=balances&balance=debt&from=…), так
 * что блоки одного отчёта открывают другой с нужным фильтром, а «Назад» в
 * браузере возвращает обратно. Отчёт по умолчанию — первый доступный по
 * правам: собственнику — сводка, ресепшену — смена, горничным — их нагрузка,
 * остальным — номера.
 */
import React from "react";
import { Box, IconButton, Tooltip, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import UnfoldLessOutlined from "@mui/icons-material/UnfoldLessOutlined";
import UnfoldMoreOutlined from "@mui/icons-material/UnfoldMoreOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import AssignmentTurnedInOutlined from "@mui/icons-material/AssignmentTurnedInOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import KingBedOutlined from "@mui/icons-material/KingBedOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { useCan } from "../hooks/useCan";
import { usePageTitle } from "../hooks/usePageTitle";
import { HotelBalancesReport } from "./HotelBalancesReport";
import { HotelDayReport } from "./HotelDayReport";
import { HotelHousekeepersReport } from "./HotelHousekeepersReport";
import { HotelOwnerReport } from "./HotelOwnerReport";
import { HotelPriceChangesReport } from "./HotelPriceChangesReport";
import { HotelPropertiesReport } from "./HotelPropertiesReport";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { HotelShiftReport } from "./HotelShiftReport";
import { HotelYieldReport } from "./HotelYieldReport";
import { ReportSkeleton, type HotelReportKind, type ReportNav } from "./hotelReportUi";
import { HotelReportSwitcher, type ReportMeta } from "./HotelReportSwitcher";
import { HotelPage } from "./hotelUi";
import { ReservationDetailsDialog } from "./ReservationDetailsDialog";
import { useHotelProperty } from "./useHotelProperty";

const REPORTS: ReportMeta[] = [
  {
    kind: "owner",
    label: "Собственнику",
    hint: "Выручка, загрузка, деньги и долги",
    audience: "владелец, управляющий",
    icon: <InsightsOutlined />,
    info: "Главные цифры отеля за период и их изменение к прошлому такому же периоду. ADR — средняя цена проданной ночи, RevPAR — выручка на каждый номер фонда (с учётом пустых). Блоки ведут в связанные отчёты.",
  },
  {
    kind: "shift",
    label: "Отчёт смены",
    short: "Смена",
    hint: "Наличка, безнал, расходы, касса",
    audience: "ресепшен",
    icon: <AssignmentTurnedInOutlined />,
    info: "Отчёт админа за смену, как в вашей таблице: поступления по номерам, расходы, касса (наличные минус расходы наличными), завтраки и звонки. Смена — календарные сутки или сутки с часа пересменки.",
  },
  {
    kind: "balances",
    label: "Заезды",
    hint: "Кто заезжает, оплачено и долг",
    audience: "ресепшен, бухгалтер",
    icon: <AccountBalanceWalletOutlined />,
    info: "Брони по дате заезда — как «Балансы бронирований» в Exely: дата брони, канал и юрлицо, заезд и выезд со временем, номер, ADR, стоимость, оплачено и баланс. «Вид» — какие колонки показывать; «С долгом» — кого нужно дожать по оплате.",
  },
  {
    kind: "yield",
    label: "Доходность и загрузка",
    short: "Доходность",
    hint: "Доход, ADR, RevPAR, загрузка",
    audience: "собственник, управляющий",
    icon: <TrendingUpOutlined />,
    info: "Как отчёт Exely «Доходность и загрузка»: доход за проживание, продано номероночей, заезды гостей и номеров, ADR, RevPAR, доступно и % загрузки — по месяцам, неделям или дням, по категориям, с графиком, тепловым календарём, днями недели и сравнением с прошлым периодом.",
  },
  {
    kind: "housekeeping",
    label: "Горничные",
    hint: "Уборки по этажам и графику",
    audience: "старшая горничная, управляющий",
    icon: <CleaningServicesOutlined />,
    info: "Сколько уборок после выезда и текущих уборок приходится на каждую горничную по «Графику персонала»: брони показывают, где выезды и кто живёт, график — чей это этаж в этот день. «Без горничной» — этаж в этот день никем не закрыт.",
  },
  {
    kind: "day",
    label: "Номера за день",
    short: "Номера",
    hint: "Кто где живёт и по какой цене",
    audience: "все",
    icon: <KingBedOutlined />,
    info: "Кто заселён на выбранную дату, по какой цене ночи и сколько номеров свободно. Считает бэкенд; выгрузка — реальный .xlsx.",
  },
  {
    kind: "pricechanges",
    label: "Правки цен",
    short: "Правки",
    hint: "Свои цены, скидки и кто их ставил",
    audience: "владелец, управляющий",
    icon: <EditNoteOutlined />,
    info: "Все ручные правки денег за период одним списком: своя цена ночи, скидка в процентах, своя сумма номера. Кто правил, с какой причиной и насколько изменилась сумма брони. Итог — по всему периоду.",
  },
  {
    kind: "properties",
    label: "Сравнение объектов",
    short: "Объекты",
    hint: "Загрузка и выручка объектов рядом",
    audience: "владелец сети",
    icon: <ApartmentOutlined />,
    info: "Все объекты организации на одном экране: загрузка, выручка номеров, ADR, RevPAR, заезды, отмены и незаезды за период — по тем же правилам, что «Собственнику». Итоги считаются отдельно по каждой валюте.",
  },
];

/** Отчёты с панелью дат и фильтров (ReportControls) — её можно свернуть в строку. */
const COLLAPSIBLE = new Set<HotelReportKind>(["owner", "balances", "yield", "pricechanges", "properties"]);
const CONTROLS_KEY = "mamadoc:hotel-reports:controls-collapsed";
type Device = "phone" | "desktop";
const readCollapsed = (): Partial<Record<Device, boolean>> => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CONTROLS_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as Partial<Record<Device, boolean>>) : {};
  } catch {
    return {};
  }
};

export const HotelReportsPage: React.FC = () => {
  usePageTitle("Отчёты");
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const canOwner = useCan(["hotel.manage", "finance.view"]);
  const canShift = useCan("hotel.payments.manage");
  const canHousekeeping = useCan(["hotel.housekeeping.view", "hotel.manage"]);
  // Новые отчёты бэкенда (r4) — по праву на отчёты.
  const canReports = useCan(["hotel.reports.view", "hotel.manage"]);
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = React.useState<number | null>(null);
  const queryClient = useQueryClient();
  // Брони, оплаты, заселения и отмены правятся в ресепшене, шахматке и карточке
  // брони — кэш отчётов они не сбрасывают, а данные в приложении считаются
  // свежими 5 минут: отчёт показывал старые цифры до перезагрузки страницы.
  // Поэтому при входе в «Отчёты» перезапрашиваем то, что уже было в кэше, после
  // карточки брони — тоже, а свежими отчёты считаем 30 секунд и обновляем при
  // возврате на вкладку (с другого компьютера тоже могли принять оплату).
  const refreshReports = React.useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ["hotel", "reports"], predicate: (q) => q.state.data !== undefined }),
    [queryClient],
  );
  React.useEffect(() => {
    queryClient.setQueryDefaults(["hotel", "reports"], { staleTime: 30_000, refetchOnWindowFocus: true });
    refreshReports();
  }, [queryClient, refreshReports]);
  // Свернуть панель фильтров — как сводку над шахматкой. Отдельно для телефона и
  // компьютера: на телефоне по умолчанию свёрнута, чтобы первым экраном были цифры.
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const device: Device = phone ? "phone" : "desktop";
  const [collapsedPref, setCollapsedPref] = React.useState(readCollapsed);
  const controlsCollapsed = collapsedPref[device] ?? phone;
  const setControlsCollapsed = React.useCallback(
    (collapsed: boolean) =>
      setCollapsedPref((prev) => {
        const next = { ...prev, [device]: collapsed };
        try {
          window.localStorage.setItem(CONTROLS_KEY, JSON.stringify(next));
        } catch {
          /* не запомнится — не страшно */
        }
        return next;
      }),
    [device],
  );

  const visible = REPORTS.filter((r) =>
    r.kind === "owner"
      ? canOwner
      : r.kind === "shift"
        ? canShift
        : r.kind === "housekeeping"
          ? canHousekeeping
          : r.kind === "pricechanges" || r.kind === "properties"
            ? canReports
            : true,
  );
  const requested = params.get("r") as HotelReportKind | null;
  const current = visible.find((r) => r.kind === requested) ?? visible[0];

  const nav: ReportNav = React.useMemo(
    () => ({
      param: (key) => params.get(key),
      setParams: (patch) =>
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (!next.get("r")) next.set("r", current.kind);
            for (const [k, v] of Object.entries(patch)) {
              if (v == null || v === "") next.delete(k);
              else next.set(k, v);
            }
            return next;
          },
          { replace: true },
        ),
      go: (report, extra = {}) => {
        const next = new URLSearchParams({ r: report, ...extra });
        setParams(next);
      },
      openReservation: (id) => setOpenId(id),
      controlsCollapsed,
      setControlsCollapsed,
    }),
    [params, setParams, current.kind, controlsCollapsed, setControlsCollapsed],
  );

  return (
    <HotelPage>
      <HotelReportSwitcher
        reports={visible}
        current={current}
        onSelect={(kind) => nav.go(kind)}
        trailing={
          <>
            {COLLAPSIBLE.has(current.kind) && (
              <Tooltip title={controlsCollapsed ? "Развернуть панель: даты и фильтры" : "Свернуть панель в строку — больше места отчёту"}>
                <IconButton
                  aria-label={controlsCollapsed ? "Развернуть панель дат и фильтров" : "Свернуть панель дат и фильтров"}
                  aria-pressed={controlsCollapsed}
                  onClick={() => setControlsCollapsed(!controlsCollapsed)}
                  sx={{ color: "text.secondary" }}
                >
                  {controlsCollapsed ? <UnfoldMoreOutlined sx={{ fontSize: 20 }} /> : <UnfoldLessOutlined sx={{ fontSize: 20 }} />}
                </IconButton>
              </Tooltip>
            )}
            <Tooltip
              title={
                <Box sx={{ fontSize: 13, lineHeight: 1.5, p: 0.5 }}>
                  <b>{current.label}</b> — для: {current.audience}. {current.info}
                </Box>
              }
              placement="bottom-end"
              enterTouchDelay={0}
              leaveTouchDelay={8000}
              slotProps={{ tooltip: { sx: { maxWidth: 380 } } }}
            >
              <IconButton aria-label={`Как устроен отчёт «${current.label}»`} sx={{ color: "text.secondary" }}>
                <InfoOutlined sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          </>
        }
      />

      {!property ? (
        propertyLoading ? (
          <ReportSkeleton />
        ) : (
          <HotelPropertyMissing />
        )
      ) : current.kind === "owner" ? (
        <HotelOwnerReport
          key={property.id}
          propertyId={property.id}
          branchId={property.branchId}
          currency={property.currency}
          roomsCount={property.roomsCount}
          nav={nav}
        />
      ) : current.kind === "shift" ? (
        <HotelShiftReport key={property.id} propertyId={property.id} propertyName={property.name} branchId={property.branchId} currency={property.currency} nav={nav} />
      ) : current.kind === "balances" ? (
        <HotelBalancesReport
          key={property.id}
          propertyId={property.id}
          currency={property.currency}
          checkInTime={property.checkInTime}
          checkOutTime={property.checkOutTime}
          nav={nav}
        />
      ) : current.kind === "yield" ? (
        <HotelYieldReport key={property.id} propertyId={property.id} currency={property.currency} nav={nav} />
      ) : current.kind === "housekeeping" ? (
        <HotelHousekeepersReport key={property.id} propertyId={property.id} nav={nav} />
      ) : current.kind === "pricechanges" ? (
        <HotelPriceChangesReport key={property.id} propertyId={property.id} currency={property.currency} nav={nav} />
      ) : current.kind === "properties" ? (
        <HotelPropertiesReport nav={nav} />
      ) : (
        <HotelDayReport key={property.id} propertyId={property.id} propertyName={property.name} nav={nav} />
      )}

      <ReservationDetailsDialog
        reservationId={openId}
        onClose={() => {
          setOpenId(null);
          refreshReports();
        }}
      />
    </HotelPage>
  );
};

export default HotelReportsPage;
