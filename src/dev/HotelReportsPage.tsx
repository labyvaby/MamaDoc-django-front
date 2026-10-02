/**
 * «Отчёты» отеля — набор связанных отчётов, у каждой роли свой главный:
 *  • «Собственнику» (HotelOwnerReport) — выручка, загрузка, ADR/RevPAR с
 *    динамикой, деньги, долги, каналы и категории;
 *  • «Смена администратора» (HotelShiftReport) — касса смены, как их отчёт
 *    админов в Google Sheets;
 *  • «Балансы броней» (HotelBalancesReport) — как одноимённый отчёт Exely;
 *  • «Номера за день» (HotelDayReport) — кто где живёт и по какой цене.
 *
 * Отчёт и его фильтры живут в адресе (?r=balances&balance=debt&from=…), так
 * что блоки одного отчёта открывают другой с нужным фильтром, а «Назад» в
 * браузере возвращает обратно. Отчёт по умолчанию — первый доступный по
 * правам: собственнику — сводка, ресепшену — смена, остальным — номера.
 */
import React from "react";
import { Box, ButtonBase, CircularProgress, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import AssignmentTurnedInOutlined from "@mui/icons-material/AssignmentTurnedInOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import KingBedOutlined from "@mui/icons-material/KingBedOutlined";
import { useSearchParams } from "react-router";

import { useCan } from "../hooks/useCan";
import { usePageTitle } from "../hooks/usePageTitle";
import { subtleBorder } from "../theme/uiHelpers";
import { HotelBalancesReport } from "./HotelBalancesReport";
import { HotelDayReport } from "./HotelDayReport";
import { HotelOwnerReport } from "./HotelOwnerReport";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { HotelShiftReport } from "./HotelShiftReport";
import type { HotelReportKind, ReportNav } from "./hotelReportUi";
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
    label: "Смена администратора",
    hint: "Наличка, безнал, расходы, касса",
    audience: "ресепшен",
    icon: <AssignmentTurnedInOutlined />,
    info: "Отчёт админа за смену, как в вашей таблице: поступления по номерам, расходы, касса (наличные минус расходы наличными), завтраки и звонки. Смена — календарные сутки или сутки с часа пересменки.",
  },
  {
    kind: "balances",
    label: "Балансы броней",
    hint: "Стоимость, оплачено, долг по заездам",
    audience: "бухгалтер, ресепшен",
    icon: <AccountBalanceWalletOutlined />,
    info: "Брони по дате заезда: стоимость, оплачено и баланс с итогами — как «Балансы бронирований» в Exely. Фильтр «С долгом» — список, кого нужно дожать по оплате.",
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

export const HotelReportsPage: React.FC = () => {
  usePageTitle("Отчёты");
  const theme = useTheme();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const canOwner = useCan(["hotel.manage", "finance.view"]);
  const canShift = useCan("hotel.payments.manage");
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = React.useState<number | null>(null);

  const visible = REPORTS.filter((r) => (r.kind === "owner" ? canOwner : r.kind === "shift" ? canShift : true));
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

      {/* Переключатель отчётов: на телефоне — лента, на компьютере — карточки в ряд. */}
      <Box
        sx={{
          display: { xs: "flex", md: "grid" },
          gridTemplateColumns: { md: `repeat(${visible.length}, 1fr)` },
          gap: 1.25,
          overflowX: { xs: "auto", md: "visible" },
          mx: { xs: -0.5, md: 0 },
          px: { xs: 0.5, md: 0 },
          pb: { xs: 0.5, md: 0 },
          scrollbarWidth: "none",
        }}
      >
        {visible.map((r) => {
          const active = r.kind === current.kind;
          return (
            <ButtonBase
              key={r.kind}
              onClick={() => nav.go(r.kind)}
              aria-pressed={active}
              sx={{
                flexShrink: 0,
                minWidth: { xs: 210, md: 0 },
                justifyContent: "flex-start",
                textAlign: "left",
                gap: 1.25,
                p: 1.5,
                borderRadius: "14px",
                border: `1px solid ${active ? alpha(theme.palette.primary.main, 0.5) : subtleBorder(theme)}`,
                bgcolor: active ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.06) : "background.paper",
                transition: "border-color .15s, background-color .15s",
                "&:hover": { borderColor: alpha(theme.palette.primary.main, 0.4) },
              }}
            >
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: active ? "primary.contrastText" : "primary.main",
                  bgcolor: active ? "primary.main" : alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.08),
                  "& svg": { fontSize: 20 },
                }}
              >
                {r.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.25 }} noWrap>
                  {r.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div" noWrap>
                  {r.hint}
                </Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>

      {!property ? (
        propertyLoading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
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
        <HotelBalancesReport key={property.id} propertyId={property.id} currency={property.currency} nav={nav} />
      ) : (
        <HotelDayReport key={property.id} propertyId={property.id} nav={nav} />
      )}

      <ReservationDetailsDialog reservationId={openId} onClose={() => setOpenId(null)} />
    </HotelPage>
  );
};

export default HotelReportsPage;
