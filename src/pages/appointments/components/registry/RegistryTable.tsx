/**
 * RegistryTable — тот же срез плотной таблицей: режим сверки и выгрузки.
 *
 * Лента хороша, когда журнал читают; когда его сверяют с кассой, нужны колонки
 * в одну линию, сортировка и итог по срезу. Итоговая строка живёт над гридом:
 * в community-версии DataGrid закреплённых строк нет, а итог должен быть виден
 * без прокрутки в конец.
 */
import React from "react";
import { Box, Paper, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import SearchOffOutlined from "@mui/icons-material/SearchOffOutlined";
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../../api/appointments";
import AppointmentStatusChips from "../../../../components/appointments/AppointmentStatusChips";
import { ListEmptyState } from "../../../../components/ui";
import { useT } from "../../../../i18n/VerticalProvider";
import { formatAmount } from "./registryFormat";
import { moneyOf, type LinesOf, type RegistrySummary } from "./registryStats";

interface Props {
  items: DjangoAppointment[];
  linesOf: LinesOf;
  loading: boolean;
  summary: RegistrySummary;
  canViewFinance: boolean;
  onOpenCard: (appt: DjangoAppointment) => void;
  performerHeader: string;
  servicesHeader: string;
}

interface Row {
  id: number;
  appointment: DjangoAppointment;
  date: string;
  time: string;
  patient: string;
  performer: string;
  services: string;
  accrued: number;
  paid: number;
  debt: number;
}

export const RegistryTable: React.FC<Props> = ({
  items,
  linesOf,
  loading,
  summary,
  canViewFinance,
  onOpenCard,
  performerHeader,
  servicesHeader,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const rows = React.useMemo<Row[]>(
    () =>
      items.map((appt) => {
        const lines = linesOf(appt);
        const money = moneyOf(appt, lines);
        const at = dayjs(appt.scheduledAt);
        return {
          id: appt.id,
          appointment: appt,
          date: at.format("DD.MM.YYYY"),
          time: at.format("HH:mm"),
          patient: appt.patient?.fullName ?? "—",
          performer: Array.from(
            new Set(lines.map((line) => line.employee?.fullName).filter(Boolean) as string[]),
          ).join(", "),
          services: lines.map((line) => line.service?.name).filter(Boolean).join(", "),
          accrued: money.accrued,
          paid: money.paid,
          debt: money.debt,
        };
      }),
    [items, linesOf],
  );

  const columns = React.useMemo<GridColDef<Row>[]>(() => {
    // На телефоне девять колонок живут за горизонтальным скроллом, и сверять
    // по ним нечего: оставляем «когда — кто — сколько», остальное есть в ленте
    // и в выгрузке.
    if (isMobile) {
      const mobile: GridColDef<Row>[] = [
        {
          field: "date",
          headerName: t("journal.table.when"),
          width: 92,
          renderCell: (params) => (
            <Box sx={{ lineHeight: 1.25 }}>
              <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {params.row.date.slice(0, 5)}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {params.row.time}
              </Typography>
            </Box>
          ),
        },
        {
          field: "patient",
          headerName: t("journal.table.patient"),
          flex: 1,
          minWidth: 120,
          renderCell: (params) => (
            <Box sx={{ minWidth: 0, lineHeight: 1.25 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {params.row.patient}
              </Typography>
              <Typography variant="caption" color="text.disabled" noWrap display="block">
                {params.row.services || params.row.performer}
              </Typography>
            </Box>
          ),
        },
      ];

      if (!canViewFinance) return mobile;

      return [
        ...mobile,
        {
          field: "accrued",
          headerName: t("journal.table.accrued"),
          width: 96,
          align: "right",
          headerAlign: "right",
          renderCell: (params) => (
            <Box sx={{ width: "100%", textAlign: "right", lineHeight: 1.25 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {formatAmount(params.row.accrued)}
              </Typography>
              {params.row.debt > 0 && (
                <Typography variant="caption" sx={{ color: "warning.main", fontVariantNumeric: "tabular-nums" }}>
                  {formatAmount(params.row.debt)}
                </Typography>
              )}
            </Box>
          ),
        },
      ];
    }

    const base: GridColDef<Row>[] = [
      { field: "date", headerName: t("journal.table.date"), width: 108 },
      { field: "time", headerName: t("journal.table.time"), width: 78 },
      {
        field: "patient",
        headerName: t("journal.table.patient"),
        flex: 1.1,
        minWidth: 170,
        renderCell: (params) => (
          <Typography variant="body2" fontWeight={600} noWrap>
            {params.value as string}
          </Typography>
        ),
      },
      { field: "performer", headerName: performerHeader, flex: 1, minWidth: 160 },
      { field: "services", headerName: servicesHeader, flex: 1.4, minWidth: 200 },
      {
        field: "status",
        headerName: t("journal.table.status"),
        width: 210,
        sortable: false,
        renderCell: (params) => (
          <AppointmentStatusChips
            appointment={params.row.appointment}
            chipHeight={22}
            showPaymentMethodIcons={false}
          />
        ),
      },
    ];

    if (!canViewFinance) return base;

    return [
      ...base,
      {
        field: "accrued",
        headerName: t("journal.table.accrued"),
        width: 118,
        align: "right",
        headerAlign: "right",
        valueFormatter: (value: number) => formatAmount(value),
      },
      {
        field: "paid",
        headerName: t("journal.table.paid"),
        width: 118,
        align: "right",
        headerAlign: "right",
        valueFormatter: (value: number) => formatAmount(value),
      },
      {
        field: "debt",
        headerName: t("journal.table.debt"),
        width: 118,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => (
          <Typography
            variant="body2"
            sx={{
              width: "100%",
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              fontWeight: params.row.debt > 0 ? 600 : 400,
              color: params.row.debt > 0 ? "warning.main" : "text.disabled",
            }}
          >
            {params.row.debt > 0 ? formatAmount(params.row.debt) : "—"}
          </Typography>
        ),
      },
    ];
  }, [canViewFinance, isMobile, performerHeader, servicesHeader, t]);

  return (
    <Stack gap={1.5}>
      <Paper
        elevation={0}
        variant="outlined"
        sx={{ px: 2, py: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          {t("journal.table.totalsTitle", { count: summary.visits })}
        </Typography>
        {canViewFinance && (
          <Stack direction="row" gap={2.5} flexWrap="wrap" sx={{ ml: "auto" }}>
            <Typography variant="caption" color="text.secondary">
              {t("journal.table.accrued")}:{" "}
              <Box component="span" sx={{ fontWeight: 600, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
                {formatAmount(summary.accrued)}
              </Box>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("journal.table.paid")}:{" "}
              <Box component="span" sx={{ fontWeight: 600, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
                {formatAmount(summary.paid)}
              </Box>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("journal.table.debt")}:{" "}
              <Box component="span" sx={{ fontWeight: 600, color: "warning.main", fontVariantNumeric: "tabular-nums" }}>
                {formatAmount(summary.debt)}
              </Box>
            </Typography>
          </Stack>
        )}
      </Paper>

      <Box>
        <DataGrid<Row>
          rows={rows}
          columns={columns}
          loading={loading}
          disableColumnMenu
          disableRowSelectionOnClick
          // Высота по числу строк: страница журнала скроллится целиком, и
          // второй, внутренний скролл таблицы только мешал бы сверке.
          autoHeight
          rowHeight={52}
          columnHeaderHeight={theme.appLayout.table.headerRowHeight}
          initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
          pageSizeOptions={[25, 50, 100]}
          onRowClick={(params) => onOpenCard(params.row.appointment)}
          localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
          slots={{
            noRowsOverlay: () => (
              <ListEmptyState
                icon={<SearchOffOutlined sx={{ fontSize: 30 }} />}
                title={t("journal.empty.title")}
                description={t("journal.empty.description")}
              />
            ),
          }}
          sx={{
            bgcolor: "background.paper",
            borderRadius: "14px",
            "& .MuiDataGrid-row": { cursor: "pointer" },
            "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
            "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
          }}
        />
      </Box>
    </Stack>
  );
};

export default RegistryTable;
