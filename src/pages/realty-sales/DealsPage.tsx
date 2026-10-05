import React from "react";
import { Box, Button, ButtonBase, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import dayjs from "dayjs";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ArrowOutwardOutlined from "@mui/icons-material/ArrowOutwardOutlined";

import { billingKeys, getBillingSummary } from "../../api/billing";
import {
  CONTRACT_STATUSES,
  RESERVATION_STATUSES,
  expiringToday,
  getContracts,
  getReservations,
  matchesDealSearch,
  realtyDealKeys,
  type ContractRow,
  type ContractStatus,
  type ReservationRow,
  type ReservationStatus,
} from "../../api/realtyReservations";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { cardSx, compactMoney } from "../estate-dashboard/format";
import { KpiCards, ScreenError, SearchBox } from "./shared";

type Tab = "reservations" | "contracts";

/** Карточка квартиры на шахматке — там все действия с бронью и договором. */
const unitHref = (row: { projectId: number | null; unitId: number }) =>
  `/realestate/chessboard?${new URLSearchParams({ ...(row.projectId != null ? { project: String(row.projectId) } : {}), unit: String(row.unitId) })}`;

/**
 * «Брони и оплаты» застройщика (AIVIO, гайд `frontend-sales.md` §6): реестр
 * броней и договоров (`/reservations/`, `/contracts/` — одним списком, срезы
 * по статусу на клиенте), KPI оплат — сводка биллинга. «Рассрочка» и
 * «Платежи» — готовые экраны «Биллинг» и «Документы CRM». Действия — в
 * карточке квартиры на шахматке («Открыть»).
 */
export default function RealtyDealsPage() {
  const { t } = useT("realtySales");
  usePageTitle(t("deals.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <DealsScreen />
    </Box>
  );
}

function DealsScreen() {
  const { t } = useT("realtySales");
  const navigate = useNavigate();
  const scope = useRealtyScope();
  const canManage = useCan("realty.manage");
  const [tab, setTab] = React.useState<Tab>("reservations");
  const [reservationStatus, setReservationStatus] = React.useState<ReservationStatus | "all">("active");
  const [contractStatus, setContractStatus] = React.useState<ContractStatus | "all">("all");
  const [search, setSearch] = React.useState("");

  const enabled = scope.orgReady !== false;
  // staleTime 0: бронь меняют на шахматке — по возвращении реестр перечитывается.
  const reservations = useQuery({
    queryKey: realtyDealKeys.reservations(scope, null),
    queryFn: ({ signal }) => getReservations(null, scope, signal),
    enabled,
    staleTime: 0,
  });
  const contracts = useQuery({
    queryKey: realtyDealKeys.contracts(scope, null),
    queryFn: ({ signal }) => getContracts(null, scope, signal),
    enabled,
    staleTime: 0,
  });
  const billing = useQuery({
    queryKey: billingKeys.summary(scope),
    queryFn: ({ signal }) => getBillingSummary(scope, signal),
    // Сводку биллинга бэк отдаёт и по realty.view; нет доступа — KPI оплат прочерком.
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  const error = reservations.error ?? contracts.error;
  if (error) {
    return (
      <ScreenError
        error={error}
        onRetry={() => {
          void reservations.refetch();
          void contracts.refetch();
        }}
        title={t("deals.loadError")}
      />
    );
  }

  const allReservations = reservations.data;
  const active = allReservations?.filter((row) => row.status === "active");
  const b = billing.data;

  const reservationRows = (allReservations ?? []).filter((row) => (reservationStatus === "all" || row.status === reservationStatus) && matchesDealSearch(row, search));
  const contractRows = (contracts.data ?? []).filter((row) => (contractStatus === "all" || row.status === contractStatus) && matchesDealSearch(row, search));

  const tabs: { key: Tab | "installments" | "payments"; count: number | null; to?: string }[] = [
    { key: "reservations", count: active?.length ?? null },
    { key: "contracts", count: contracts.data?.length ?? null },
    { key: "installments", count: null, to: "/finance/billing" },
    { key: "payments", count: null, to: "/realestate/documents?chip=payments" },
  ];

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("deals.subtitle")}</Typography>
      <KpiCards
        items={
          active
            ? [
                { key: "active", label: t("deals.kpi.active"), value: String(active.length) },
                { key: "expiring", label: t("deals.kpi.expiring"), value: String(expiringToday(active)), tone: expiringToday(active) > 0 ? "warning" : null },
                { key: "expected", label: t("deals.kpi.expected"), value: b ? compactMoney(b.expected, t) : "—", hint: t("deals.kpi.monthHint") },
                {
                  key: "received",
                  label: t("deals.kpi.received"),
                  value: b ? compactMoney(b.received, t) : "—",
                  hint: b ? t("deals.kpi.collectedHint", { pct: b.collectedPct }) : null,
                  tone: b && b.received > 0 ? "success" : null,
                },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.5, pr: 0.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
        {tabs.map(({ key, count, to }) => (
          <ButtonBase
            key={key}
            aria-pressed={to ? undefined : tab === key}
            onClick={() => (to ? navigate(to) : setTab(key as Tab))}
            sx={(th) => ({ ...pillSx(th, !to && tab === key), whiteSpace: "nowrap", gap: 0.5 })}
          >
            {t(`deals.tabs.${key}`)}
            {count != null ? ` · ${count}` : ""}
            {to && <ArrowOutwardOutlined sx={{ fontSize: 14 }} />}
          </ButtonBase>
        ))}
        <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
          <SearchBox value={search} onChange={setSearch} placeholder={t("deals.search")} />
          {canManage && (
            <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => navigate("/realestate/chessboard?status=free")} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
              {t("deals.newReservation")}
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        {tab === "reservations"
          ? (["all", ...RESERVATION_STATUSES] as const).map((key) => (
              <SubPill
                key={key}
                active={reservationStatus === key}
                onClick={() => setReservationStatus(key)}
                label={t(`deals.reservationStatus.${key}`)}
                count={allReservations ? (key === "all" ? allReservations.length : allReservations.filter((row) => row.status === key).length) : null}
              />
            ))
          : (["all", ...CONTRACT_STATUSES] as const).map((key) => (
              <SubPill
                key={key}
                active={contractStatus === key}
                onClick={() => setContractStatus(key)}
                label={t(`deals.contractStatus.${key}`)}
                count={contracts.data ? (key === "all" ? contracts.data.length : contracts.data.filter((row) => row.status === key).length) : null}
              />
            ))}
      </Box>

      <Box sx={{ ...cardSx, overflow: "hidden" }}>
        {tab === "reservations" ? (
          <ReservationsGrid rows={reservationRows} loading={reservations.isFetching} filtered={reservationStatus !== "all" || Boolean(search.trim())} onOpen={(row) => navigate(unitHref(row))} />
        ) : (
          <ContractsGrid rows={contractRows} loading={contracts.isFetching} filtered={contractStatus !== "all" || Boolean(search.trim())} onOpen={(row) => navigate(unitHref(row))} />
        )}
      </Box>
    </>
  );
}

function SubPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number | null }) {
  return (
    <ButtonBase
      aria-pressed={active}
      onClick={onClick}
      sx={(th) => ({
        px: 1.25,
        py: 0.4,
        borderRadius: "8px",
        fontSize: "0.8125rem",
        whiteSpace: "nowrap",
        color: active ? "text.primary" : "text.secondary",
        fontWeight: active ? 700 : 500,
        bgcolor: active ? subtleBg(th, true) : "transparent",
      })}
    >
      {label}
      {count != null ? ` · ${count}` : ""}
    </ButtonBase>
  );
}

function TwoLines({ top, bottom, strong = false }: { top: React.ReactNode; bottom?: React.ReactNode; strong?: boolean }) {
  return (
    <Box sx={{ py: 1, minWidth: 0 }}>
      <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: strong ? 600 : 400 }}>
        {top}
      </Typography>
      {bottom && (
        <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {bottom}
        </Typography>
      )}
    </Box>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "info" | "warning" | "error" | null }) {
  return (
    <Box
      component="span"
      sx={(th) => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.3,
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: tone ? `${tone}.main` : "text.secondary",
        bgcolor: subtleBg(th, true),
      })}
    >
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor" }} />
      {label}
    </Box>
  );
}

const reservationTone = (status: string) => (status === "active" ? "info" : status === "sold" ? "success" : status === "expired" ? "warning" : null);

function useExpiresLabel() {
  const { t } = useT("realtySales");
  return (row: ReservationRow): { top: string; bottom: string | null; late: boolean } => {
    if (!row.expiresAt) return { top: "—", bottom: null, late: false };
    const at = dayjs(row.expiresAt);
    const top = at.format("DD.MM, HH:mm");
    if (row.status !== "active") return { top, bottom: null, late: false };
    const minutes = at.diff(dayjs(), "minute");
    if (minutes <= 0) return { top, bottom: t("deals.table.expired"), late: true };
    const hours = Math.floor(minutes / 60);
    const left =
      hours >= 48 ? t("deals.table.days", { count: Math.floor(hours / 24) }) : hours >= 1 ? t("deals.table.hours", { count: hours }) : t("deals.table.minutes", { count: minutes });
    return { top, bottom: t("deals.table.left", { time: left }), late: minutes < 24 * 60 };
  };
}

function ReservationsGrid({ rows, loading, filtered, onOpen }: { rows: ReservationRow[]; loading: boolean; filtered: boolean; onOpen: (row: ReservationRow) => void }) {
  const { t } = useT("realtySales");
  const expires = useExpiresLabel();
  const columns: GridColDef<ReservationRow>[] = [
    { field: "number", headerName: t("deals.table.number"), width: 110, renderCell: ({ row }) => <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{row.number}</Typography> },
    {
      field: "buyer",
      headerName: t("deals.table.client"),
      flex: 1.2,
      minWidth: 180,
      renderCell: ({ row }) => <TwoLines strong top={row.buyer || "—"} bottom={row.phone ? formatPhoneDisplay(row.phone) : null} />,
    },
    { field: "unitLabel", headerName: t("deals.table.unit"), flex: 1, minWidth: 170, renderCell: ({ row }) => <TwoLines top={row.unitLabel || "—"} bottom={row.projectName} /> },
    {
      field: "term",
      headerName: t("deals.table.terms"),
      flex: 1,
      minWidth: 170,
      renderCell: ({ row }) => <TwoLines top={row.offerTitle || row.typeLabel || "—"} bottom={[row.typeLabel !== row.offerTitle && row.typeLabel, row.term ? t("deals.table.term", { count: row.term }) : row.termLabel].filter(Boolean).join(" · ")} />,
    },
    {
      field: "expiresAt",
      headerName: t("deals.table.expires"),
      width: 140,
      renderCell: ({ row }) => {
        const label = expires(row);
        return (
          <TwoLines
            top={label.top}
            bottom={
              label.bottom && (
                <Box component="span" sx={{ color: label.late ? "warning.main" : "text.secondary" }}>
                  {label.bottom}
                </Box>
              )
            }
          />
        );
      },
    },
    {
      field: "finalPrice",
      headerName: t("deals.table.price"),
      width: 150,
      renderCell: ({ row }) => (
        <TwoLines strong top={formatKGS(row.finalPrice)} bottom={row.discount > 0 ? t("deals.table.discount", { amount: formatKGS(row.discount) }) : null} />
      ),
    },
    {
      field: "status",
      headerName: t("deals.table.status"),
      width: 170,
      renderCell: ({ row }) => (
        <Box sx={{ py: 1, display: "grid", justifyItems: "start", gap: 0.4 }}>
          <StatusPill label={row.statusLabel || row.status} tone={reservationTone(row.status)} />
          {row.type === "prepaid" && row.paymentStatusLabel && (
            <Typography sx={{ fontSize: "0.72rem", color: row.paymentStatus === "paid" ? "success.main" : "warning.main" }}>{row.paymentStatusLabel}</Typography>
          )}
        </Box>
      ),
    },
    { field: "manager", headerName: t("deals.table.manager"), width: 150, valueFormatter: (value: string) => value || "—" },
    { field: "open", headerName: "", width: 104, sortable: false, renderCell: ({ row }) => <OpenButton onClick={() => onOpen(row)} /> },
  ];
  return <DealsGrid rows={rows} columns={columns} loading={loading} empty={filtered ? t("deals.table.emptyFiltered") : t("deals.table.emptyReservations")} onOpen={onOpen} />;
}

function ContractsGrid({ rows, loading, filtered, onOpen }: { rows: ContractRow[]; loading: boolean; filtered: boolean; onOpen: (row: ContractRow) => void }) {
  const { t } = useT("realtySales");
  const columns: GridColDef<ContractRow>[] = [
    { field: "number", headerName: t("deals.table.number"), width: 170, renderCell: ({ row }) => <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{row.number}</Typography> },
    {
      field: "buyer",
      headerName: t("deals.table.client"),
      flex: 1.2,
      minWidth: 180,
      renderCell: ({ row }) => <TwoLines strong top={row.buyer || "—"} bottom={row.phone ? formatPhoneDisplay(row.phone) : null} />,
    },
    { field: "unitNumber", headerName: t("deals.table.unit"), flex: 1, minWidth: 160, renderCell: ({ row }) => <TwoLines top={row.unitNumber != null ? `№${row.unitNumber}` : "—"} bottom={row.projectName} /> },
    { field: "paymentLabel", headerName: t("deals.table.payment"), flex: 1, minWidth: 160, valueFormatter: (value: string) => value || "—" },
    { field: "price", headerName: t("deals.table.price"), width: 150, renderCell: ({ row }) => <TwoLines strong top={formatKGS(row.price)} /> },
    { field: "signedAt", headerName: t("deals.table.signed"), width: 120, valueFormatter: (value: string | null) => (value ? dayjs(value).format("DD.MM.YYYY") : "—") },
    {
      field: "status",
      headerName: t("deals.table.status"),
      width: 150,
      renderCell: ({ row }) => (
        <Box sx={{ py: 1, display: "grid", justifyItems: "start", gap: 0.4, minWidth: 0 }}>
          <StatusPill label={row.statusLabel || row.status} tone={row.status === "signed" ? "success" : row.status === "refunded" ? "error" : null} />
          {row.refundReason && (
            <Typography noWrap title={row.refundReason} sx={{ maxWidth: "100%", fontSize: "0.72rem", color: "text.secondary" }}>
              {row.refundReason}
            </Typography>
          )}
        </Box>
      ),
    },
    { field: "manager", headerName: t("deals.table.manager"), width: 150, valueFormatter: (value: string) => value || "—" },
    { field: "open", headerName: "", width: 104, sortable: false, renderCell: ({ row }) => <OpenButton onClick={() => onOpen(row)} /> },
  ];
  return <DealsGrid rows={rows} columns={columns} loading={loading} empty={filtered ? t("deals.table.emptyFiltered") : t("deals.table.emptyContracts")} onOpen={onOpen} />;
}

function OpenButton({ onClick }: { onClick: () => void }) {
  const { t } = useT("realtySales");
  return (
    <Button
      size="small"
      variant="outlined"
      title={t("deals.openHint")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {t("deals.open")}
    </Button>
  );
}

function DealsGrid<T extends { id: number }>({ rows, columns, loading, empty, onOpen }: { rows: T[]; columns: GridColDef<T>[]; loading: boolean; empty: string; onOpen: (row: T) => void }) {
  return (
    <DataGrid<T>
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: empty }}
      getRowHeight={() => "auto"}
      onRowClick={({ row }) => onOpen(row)}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
      pageSizeOptions={[25, 50, 100]}
      sx={{ border: 0, "& .MuiDataGrid-row": { cursor: "pointer" }, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
    />
  );
}
