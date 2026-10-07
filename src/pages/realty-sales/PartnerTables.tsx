import React from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router";
import dayjs from "dayjs";

import { realtyLeadKeys } from "../../api/realtyLeads";
import { approveCommission, convertPartnerLead, payCommission, realtyPartnerKeys, type Commission, type PartnerLead } from "../../api/realtyPartners";
import { useCan } from "../../hooks/useCan";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";

const toneOf = (status: string) =>
  status === "approved" || status === "active" ? "info.main" : status === "paid" || status === "converted" ? "success.main" : status === "expired" ? "warning.main" : "text.secondary";

export function StatusDot({ status, label }: { status: string; label: string }) {
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
        color: toneOf(status),
        bgcolor: subtleBg(th, true),
      })}
    >
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor" }} />
      {label}
    </Box>
  );
}

function usePartnerAction<T>(fn: (item: T) => Promise<unknown>, toast: string, extra?: () => void) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useT("realtySales");
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: realtyPartnerKeys.all });
      extra?.();
      enqueueSnackbar(toast, { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" }),
  });
}

function Grid<T extends { id: number }>({ rows, columns, empty }: { rows: T[]; columns: GridColDef<T>[]; empty: string }) {
  return (
    <DataGrid<T>
      rows={rows}
      columns={columns}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: empty }}
      getRowHeight={() => "auto"}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      hideFooter={rows.length <= 100}
      initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
      pageSizeOptions={[100]}
      sx={{ border: 0, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
    />
  );
}

/** Лиды партнёров: «В CRM →» у закреплённых, ещё не переданных; переданный — ссылка на CRM-лид. */
export function PartnerLeadsTable({ rows, empty, hidePartner = false }: { rows: PartnerLead[]; empty: string; hidePartner?: boolean }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useCan("realty.manage");
  const convert = usePartnerAction((lead: PartnerLead) => convertPartnerLead(lead.id, scope), t("partners.toast.converted"), () =>
    void queryClient.invalidateQueries({ queryKey: realtyLeadKeys.all }),
  );
  const columns: GridColDef<PartnerLead>[] = [
    { field: "number", headerName: t("partners.table.number"), width: 90, renderCell: ({ row }) => <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{row.number}</Typography> },
    ...(hidePartner
      ? []
      : ([
          {
            field: "partnerName",
            headerName: t("partners.table.partner"),
            flex: 1,
            minWidth: 170,
            renderCell: ({ row }) => <Two top={row.partnerName} bottom={row.agent} />,
          },
        ] as GridColDef<PartnerLead>[])),
    { field: "client", headerName: t("partners.table.client"), flex: 1, minWidth: 160, renderCell: ({ row }) => <Two top={row.client} bottom={row.phone ? formatPhoneDisplay(row.phone) : ""} strong /> },
    { field: "projectName", headerName: t("partners.table.project"), width: 150, renderCell: ({ row }) => <Two top={row.projectName || "—"} bottom={row.stageName} /> },
    { field: "budget", headerName: t("partners.table.budget"), width: 140, valueFormatter: (value: number) => (value > 0 ? formatKGS(value) : "—") },
    { field: "fixedUntil", headerName: t("partners.table.fixed"), width: 120, valueFormatter: (value: string | null) => (value ? dayjs(value).format("DD.MM.YYYY") : "—") },
    {
      field: "status",
      headerName: t("partners.table.status"),
      width: 130,
      renderCell: ({ row }) => <StatusDot status={row.status} label={row.statusLabel || (["active", "expired", "converted"].includes(row.status) ? t(`partners.leadStatus.${row.status}`) : row.status)} />,
    },
    {
      field: "actions",
      headerName: "",
      width: 120,
      sortable: false,
      renderCell: ({ row }) =>
        row.leadId != null ? (
          <Button size="small" onClick={() => navigate(`/realestate/leads?lead=${row.leadId}`)}>
            {t("partners.table.open")}
          </Button>
        ) : canManage && row.status === "active" ? (
          <Button size="small" variant="outlined" disabled={convert.isPending} onClick={() => convert.mutate(row)}>
            {t("partners.table.toCrm")} →
          </Button>
        ) : null,
    },
  ];
  return <Grid rows={rows} columns={columns} empty={empty} />;
}

/** Комиссии: «Утвердить» у начисленных, «Выплатить» у утверждённых. */
export function CommissionsTable({ rows, empty, hidePartner = false }: { rows: Commission[]; empty: string; hidePartner?: boolean }) {
  const { t } = useT("realtySales");
  const scope = useRealtyScope();
  const canManage = useCan("realty.manage");
  const approve = usePartnerAction((c: Commission) => approveCommission(c.id, scope), t("partners.toast.approved"));
  const pay = usePartnerAction((c: Commission) => payCommission(c.id, scope), t("partners.toast.paid"));
  // Выплата — расход в «Кассе и банке»: только через подтверждение, как «Выплатить все утверждённые».
  const [paying, setPaying] = React.useState<Commission | null>(null);
  const columns: GridColDef<Commission>[] = [
    { field: "number", headerName: t("partners.table.number"), width: 90, renderCell: ({ row }) => <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{row.number}</Typography> },
    ...(hidePartner ? [] : ([{ field: "partnerName", headerName: t("partners.table.partner"), flex: 1, minWidth: 170 }] as GridColDef<Commission>[])),
    { field: "deal", headerName: t("partners.table.deal"), flex: 1, minWidth: 160, renderCell: ({ row }) => <Two top={row.deal || "—"} bottom={row.buyer} /> },
    { field: "amount", headerName: t("partners.table.amount"), width: 140, valueFormatter: (value: number) => formatKGS(value) },
    { field: "pct", headerName: t("partners.table.pct"), width: 70, valueFormatter: (value: number) => `${value.toLocaleString("ru-RU")}` },
    { field: "commission", headerName: t("partners.table.commission"), width: 130, renderCell: ({ row }) => <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{formatKGS(row.commission)}</Typography> },
    {
      field: "status",
      headerName: t("partners.table.status"),
      width: 130,
      renderCell: ({ row }) => <StatusDot status={row.status} label={row.statusLabel || (["accrued", "approved", "paid"].includes(row.status) ? t(`partners.commissionOne.${row.status}`) : row.status)} />,
    },
    {
      field: "actions",
      headerName: "",
      width: 120,
      sortable: false,
      renderCell: ({ row }) =>
        !canManage ? null : row.status === "accrued" ? (
          <Button size="small" variant="outlined" disabled={approve.isPending} onClick={() => approve.mutate(row)}>
            {t("partners.table.approve")}
          </Button>
        ) : row.status === "approved" ? (
          <Button size="small" variant="contained" disabled={pay.isPending} onClick={() => setPaying(row)}>
            {t("partners.table.pay")}
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <Grid rows={rows} columns={columns} empty={empty} />
      <Dialog open={paying != null} onClose={pay.isPending ? undefined : () => setPaying(null)} fullWidth PaperProps={{ sx: { maxWidth: 440 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{t("partners.payOneTitle", { number: paying?.number ?? "" })}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t("partners.payOneText", { partner: paying?.partnerName ?? "", total: formatKGS(paying?.commission ?? 0) })}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPaying(null)} disabled={pay.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={pay.isPending}
            onClick={() => {
              if (!paying) return;
              pay.mutate(paying, { onSettled: () => setPaying(null) });
            }}
          >
            {t("partners.table.pay")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function Two({ top, bottom, strong = false }: { top: React.ReactNode; bottom?: React.ReactNode; strong?: boolean }) {
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
