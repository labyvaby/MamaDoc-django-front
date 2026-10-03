/**
 * «Отчёты» отеля — набор связанных отчётов, у каждой роли свой главный:
 *  • «Собственнику» (HotelOwnerReport) — выручка, загрузка, ADR/RevPAR с
 *    динамикой, деньги, долги, каналы и категории;
 *  • «Смена администратора» (HotelShiftReport) — касса смены, как их отчёт
 *    админов в Google Sheets;
 *  • «Заезды» (HotelBalancesReport) — «Балансы бронирований» Exely по дате заезда;
 *  • «Доходность и загрузка» (HotelYieldReport) — по месяцам, неделям и дням;
 *  • «Горничные» (HotelHousekeepersReport) — нагрузка уборки по графику;
 *  • «Номера за день» (HotelDayReport) — кто где живёт и по какой цене.
 *
 * Отчёт и его фильтры живут в адресе (?r=balances&balance=debt&from=…), так
 * что блоки одного отчёта открывают другой с нужным фильтром, а «Назад» в
 * браузере возвращает обратно. Отчёт по умолчанию — первый доступный по
 * правам: собственнику — сводка, ресепшену — смена, горничным — их нагрузка,
 * остальным — номера.
 */
import React from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import AssignmentTurnedInOutlined from "@mui/icons-material/AssignmentTurnedInOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import KingBedOutlined from "@mui/icons-material/KingBedOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import { useSearchParams } from "react-router";

import { useCan } from "../hooks/useCan";
import { usePageTitle } from "../hooks/usePageTitle";
import { subtleBorder } from "../theme/uiHelpers";
import { HotelBalancesReport } from "./HotelBalancesReport";
import { HotelDayReport } from "./HotelDayReport";
import { HotelHousekeepersReport } from "./HotelHousekeepersReport";
import { HotelOwnerReport } from "./HotelOwnerReport";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { HotelShiftReport } from "./HotelShiftReport";
import { HotelYieldReport } from "./HotelYieldReport";
import { ReportSkeleton, type HotelReportKind, type ReportNav } from "./hotelReportUi";
import { HotelPage, HotelPageHeader } from "./hotelUi";
import { ReservationDetailsDialog } from "./ReservationDetailsDialog";
import { useHotelProperty } from "./useHotelProperty";

interface ReportMeta {
  kind: HotelReportKind;
  label: string;
  hint: string;
  audience: string;
  icon: React.ReactNode;
  info: string;
}

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
    hint: "Кто где живёт и по какой цене",
    audience: "все",
    icon: <KingBedOutlined />,
    info: "Кто заселён на выбранную дату, по какой цене ночи и сколько номеров свободно. Считает бэкенд; выгрузка — реальный .xlsx.",
  },
];

const TIGHT_ROW = "@media (min-width: 1200px) and (max-width: 1399.95px)";

export const HotelReportsPage: React.FC = () => {
  usePageTitle("Отчёты");
  const theme = useTheme();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const canOwner = useCan(["hotel.manage", "finance.view"]);
  const canShift = useCan("hotel.payments.manage");
  const canHousekeeping = useCan(["hotel.housekeeping.view", "hotel.manage"]);
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = React.useState<number | null>(null);

  const visible = REPORTS.filter((r) =>
    r.kind === "owner" ? canOwner : r.kind === "shift" ? canShift : r.kind === "housekeeping" ? canHousekeeping : true,
  );
  // Больше четырёх отчётов в ряд на 1200–1400 px — плитка с иконкой сверху.
  const tight = visible.length > 4;
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
    }),
    [params, setParams, current.kind],
  );

  return (
    <HotelPage>
      <HotelPageHeader title="Отчёты" subtitle={`${current.label} · для: ${current.audience}`} info={current.info} />

      {/*
        Переключатель отчётов. Все отчёты видны сразу: на телефоне — сетка в два
        столбца (лента уезжала за край, было видно полтора отчёта), на планшете —
        в три, на компьютере — в ряд. Шесть в ряд на 1200–1400 px — плитка с
        иконкой сверху, иначе «Собственнику» и «Доходность» обрезались.
      */}
      <Box
        role="group"
        aria-label="Отчёты"
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: `repeat(${Math.min(2, visible.length)}, minmax(0, 1fr))`,
            md: `repeat(${visible.length === 4 ? 2 : Math.min(3, visible.length)}, minmax(0, 1fr))`,
            lg: `repeat(${visible.length}, minmax(0, 1fr))`,
          },
          gap: { xs: 1, md: 1.25 },
        }}
      >
        {visible.map((r) => {
          const active = r.kind === current.kind;
          const primary = theme.palette.primary.main;
          const dark = theme.palette.mode === "dark";
          const restShadow = `0 1px 2px ${alpha("#101828", dark ? 0.4 : 0.05)}`;
          return (
            <ButtonBase
              key={r.kind}
              onClick={() => nav.go(r.kind)}
              aria-pressed={active}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                textAlign: "left",
                minWidth: 0,
                gap: { xs: 1, md: 1.25 },
                p: { xs: 1.25, md: 1.5 },
                borderRadius: "14px",
                border: `1px solid ${active ? alpha(primary, 0.55) : subtleBorder(theme)}`,
                bgcolor: active ? alpha(primary, dark ? 0.16 : 0.07) : "background.paper",
                boxShadow: active ? `${restShadow}, 0 6px 16px -8px ${alpha(primary, 0.45)}` : restShadow,
                transition: "border-color .15s, background-color .15s, box-shadow .15s, transform .15s",
                "@media (hover: hover)": {
                  "&:hover": {
                    borderColor: alpha(primary, active ? 0.65 : 0.4),
                    boxShadow: `${restShadow}, 0 6px 16px -8px ${alpha(primary, 0.35)}`,
                    transform: "translateY(-1px)",
                  },
                },
                "&.Mui-focusVisible": { outline: `2px solid ${primary}`, outlineOffset: 2 },
                "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
                ...(tight ? { [TIGHT_ROW]: { flexDirection: "column", alignItems: "flex-start", gap: 1 } } : {}),
              }}
            >
              <Box
                sx={{
                  width: { xs: 32, md: 38 },
                  height: { xs: 32, md: 38 },
                  borderRadius: { xs: "9px", md: "11px" },
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: active ? "primary.contrastText" : "primary.main",
                  bgcolor: active ? "primary.main" : alpha(primary, dark ? 0.18 : 0.08),
                  boxShadow: active ? `0 2px 6px -1px ${alpha(primary, 0.5)}` : "none",
                  transition: "background-color .15s, color .15s",
                  "& svg": { fontSize: { xs: 18, md: 20 } },
                  ...(tight ? { [TIGHT_ROW]: { width: 34, height: 34, borderRadius: "10px" } } : {}),
                }}
              >
                {r.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: { xs: 13, md: 14.5 },
                    lineHeight: 1.25,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    ...(tight ? { [TIGHT_ROW]: { fontSize: 14 } } : {}),
                  }}
                >
                  {r.label}
                </Typography>
                {/* Подпись — где есть место; полное описание — в «i» у заголовка. */}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="div"
                  noWrap
                  sx={{ display: { xs: "none", md: "block", lg: tight ? "none" : "block", xl: "block" }, mt: 0.25 }}
                >
                  {r.hint}
                </Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>

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
      ) : (
        <HotelDayReport key={property.id} propertyId={property.id} nav={nav} />
      )}

      <ReservationDetailsDialog reservationId={openId} onClose={() => setOpenId(null)} />
    </HotelPage>
  );
};

export default HotelReportsPage;
