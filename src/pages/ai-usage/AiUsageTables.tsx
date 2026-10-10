import React from "react";
import { Box, Typography } from "@mui/material";
import { DataGrid, type GridColDef, type GridValidRowModel } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import dayjs from "dayjs";

import type {
  AiUsageByBranch,
  AiUsageByEmployee,
  AiUsageByModel,
  AiUsageByOrganization,
  AiUsageCounters,
} from "../../api/aiUsage";
import { subtleBg } from "../../theme/uiHelpers";
import { formatTokens, sharePct } from "./aiUsageRows";

const formatLastUsed = (value: string | null) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—");

/** Колонки-счётчики, общие для всех разрезов. Доля — от итога текущего фильтра. */
function counterColumns<R extends AiUsageCounters>(grandTotal: number): GridColDef<R>[] {
  const num = (field: keyof AiUsageCounters, headerName: string, width = 120): GridColDef<R> => ({
    field,
    headerName,
    type: "number",
    width,
    valueFormatter: (value: number) => formatTokens(value ?? 0),
  });
  return [
    num("totalTokens", "Токены", 130),
    {
      field: "share",
      headerName: "Доля",
      type: "number",
      width: 80,
      sortable: false,
      valueGetter: (_v, row) => row.totalTokens,
      valueFormatter: (value: number) => sharePct(value ?? 0, grandTotal),
    },
    num("requests", "Обращения"),
    num("promptTokens", "Запрос"),
    num("completionTokens", "Ответ"),
    num("thinkingTokens", "Размышления", 130),
    {
      field: "errors",
      headerName: "Ошибки",
      type: "number",
      width: 100,
      renderCell: ({ value }) => (
        <Typography variant="body2" color={value > 0 ? "error.main" : "text.secondary"}>
          {formatTokens(value ?? 0)}
        </Typography>
      ),
    },
  ];
}

const lastUsedColumn = <R extends { lastUsedAt: string | null }>(): GridColDef<R> => ({
  field: "lastUsedAt",
  headerName: "Последнее обращение",
  width: 170,
  valueFormatter: (value: string | null) => formatLastUsed(value),
});

interface GridProps<R extends GridValidRowModel> {
  rows: R[];
  columns: GridColDef<R>[];
  getRowId: (row: R) => string;
  loading?: boolean;
  emptyText: string;
  onRowClick?: (row: R) => void;
  /** Строку можно открыть — у «Без филиала» фильтра нет. */
  isRowClickable?: (row: R) => boolean;
}

function UsageGrid<R extends GridValidRowModel>({
  rows,
  columns,
  getRowId,
  loading,
  emptyText,
  onRowClick,
  isRowClickable = () => true,
}: GridProps<R>) {
  return (
    <DataGrid<R>
      rows={rows}
      columns={columns}
      getRowId={getRowId}
      loading={loading}
      autoHeight
      disableRowSelectionOnClick
      disableColumnMenu
      hideFooter={rows.length <= 25}
      initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
      pageSizeOptions={[25, 50, 100]}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: emptyText }}
      onRowClick={onRowClick ? ({ row }) => isRowClickable(row) && onRowClick(row) : undefined}
      getRowClassName={({ row }) => (onRowClick && isRowClickable(row) ? "row-clickable" : "")}
      sx={(th) => ({
        border: 0,
        "& .row-clickable": { cursor: "pointer" },
        "& .MuiDataGrid-columnHeaders": { bgcolor: subtleBg(th) },
        "& .MuiDataGrid-cell": { display: "flex", alignItems: "center", lineHeight: 1.4 },
        "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
      })}
    />
  );
}

const TwoLines: React.FC<{ primary: string; secondary?: string }> = ({ primary, secondary }) => (
  <Box sx={{ minWidth: 0, py: 0.5 }}>
    <Typography variant="body2" noWrap>
      {primary}
    </Typography>
    {secondary && (
      <Typography variant="caption" color="text.secondary" noWrap display="block">
        {secondary}
      </Typography>
    )}
  </Box>
);

// ── Разрезы ────────────────────────────────────────────────────────────────────

export const OrganizationsTable: React.FC<{
  rows: AiUsageByOrganization[];
  grandTotal: number;
  loading?: boolean;
  onOpen: (row: AiUsageByOrganization) => void;
}> = ({ rows, grandTotal, loading, onOpen }) => {
  const columns = React.useMemo<GridColDef<AiUsageByOrganization>[]>(
    () => [
      { field: "organizationName", headerName: "Организация", flex: 1, minWidth: 200 },
      ...counterColumns<AiUsageByOrganization>(grandTotal),
      { field: "employees", headerName: "Сотрудники", type: "number", width: 110 },
      lastUsedColumn<AiUsageByOrganization>(),
    ],
    [grandTotal],
  );
  return (
    <UsageGrid
      rows={rows}
      columns={columns}
      getRowId={(r) => String(r.organizationId)}
      loading={loading}
      emptyText="За период обращений к ИИ не было"
      onRowClick={onOpen}
    />
  );
};

export const BranchesTable: React.FC<{
  rows: AiUsageByBranch[];
  grandTotal: number;
  loading?: boolean;
  onOpen: (row: AiUsageByBranch) => void;
}> = ({ rows, grandTotal, loading, onOpen }) => {
  const columns = React.useMemo<GridColDef<AiUsageByBranch>[]>(
    () => [
      {
        field: "branchName",
        headerName: "Филиал",
        flex: 1,
        minWidth: 200,
        renderCell: ({ row }) =>
          row.branchId == null ? (
            <Typography variant="body2" color="text.secondary">
              Без филиала
            </Typography>
          ) : (
            row.branchName
          ),
      },
      ...counterColumns<AiUsageByBranch>(grandTotal),
      { field: "employees", headerName: "Сотрудники", type: "number", width: 110 },
      lastUsedColumn<AiUsageByBranch>(),
    ],
    [grandTotal],
  );
  return (
    <UsageGrid
      rows={rows}
      columns={columns}
      getRowId={(r) => `${r.organizationId}-${r.branchId ?? "none"}`}
      loading={loading}
      emptyText="За период обращений к ИИ не было"
      onRowClick={onOpen}
      // Обращения без филиала отдельным фильтром не выбрать (бэк не умеет).
      isRowClickable={(r) => r.branchId != null}
    />
  );
};

export const EmployeesTable: React.FC<{
  rows: AiUsageByEmployee[];
  grandTotal: number;
  loading?: boolean;
  /** Показать организацию — в отчёте по всем организациям. */
  showOrganization: boolean;
  /** Показать основной филиал — когда филиал не выбран. */
  showBranch: boolean;
}> = ({ rows, grandTotal, loading, showOrganization, showBranch }) => {
  const columns = React.useMemo<GridColDef<AiUsageByEmployee>[]>(() => {
    const cols: GridColDef<AiUsageByEmployee>[] = [
      {
        field: "employeeName",
        headerName: "Сотрудник",
        flex: 1,
        minWidth: 220,
        valueGetter: (_v, row) => row.employeeName || row.username,
        renderCell: ({ row }) =>
          row.employeeName ? (
            <TwoLines primary={row.employeeName} secondary={row.username} />
          ) : (
            <TwoLines primary={row.username} secondary="без карточки сотрудника" />
          ),
      },
    ];
    if (showOrganization) {
      cols.push({ field: "organizationName", headerName: "Организация", width: 180 });
    }
    if (showBranch) {
      cols.push({
        field: "branchName",
        headerName: "Основной филиал",
        width: 170,
        description: "Где у сотрудника больше всего обращений за период",
        valueGetter: (_v, row) => (row.branchId == null ? "Без филиала" : row.branchName),
      });
    }
    return [...cols, ...counterColumns<AiUsageByEmployee>(grandTotal), lastUsedColumn<AiUsageByEmployee>()];
  }, [grandTotal, showOrganization, showBranch]);
  return (
    <UsageGrid
      rows={rows}
      columns={columns}
      getRowId={(r) => `${r.organizationId}-${r.employeeId ?? "u"}-${r.userId}`}
      loading={loading}
      emptyText="За период обращений к ИИ не было"
    />
  );
};

export const ModelsTable: React.FC<{
  rows: AiUsageByModel[];
  grandTotal: number;
  loading?: boolean;
}> = ({ rows, grandTotal, loading }) => {
  const columns = React.useMemo<GridColDef<AiUsageByModel>[]>(
    () => [
      {
        field: "model",
        headerName: "Модель",
        flex: 1,
        minWidth: 200,
        renderCell: ({ row }) => <TwoLines primary={row.model || "—"} secondary={row.provider} />,
      },
      ...counterColumns<AiUsageByModel>(grandTotal),
    ],
    [grandTotal],
  );
  return (
    <UsageGrid
      rows={rows}
      columns={columns}
      getRowId={(r) => `${r.provider}/${r.model}`}
      loading={loading}
      emptyText="Нет данных"
    />
  );
};
