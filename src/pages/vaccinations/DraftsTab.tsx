import React from "react";
import { Alert, Box, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { AppButton } from "../../components/ui";
import AdministerVaccinationDrawer from "../../components/vaccinations/AdministerVaccinationDrawer";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { getRecords, type VaccinationRecord } from "../../api/vaccinations";
import { MISSING_FIELD_LABELS } from "./meta";

type Mode = "drafts" | "missingInn";

type Props = {
  branchId: number | null;
  orgId: number | undefined;
  canRecord: boolean;
  canUpdatePatient: boolean;
  /** Открыть правку пациента (тот же карандаш, что в «Кому пора»). */
  onEditPatient: (patientId: number) => void;
};

/**
 * «Не оформлено»: вакцины, проданные в приёмах, по которым медсестра ещё не
 * внесла партию, дозу и т. п. — без этого они не попадают в отчёты. Второй
 * режим — «Дополнить ИНН»: проведённые прививки пациентов без ИНН (их не
 * отправить в госсистему).
 */
const DraftsTab: React.FC<Props> = ({ branchId, orgId, canRecord, canUpdatePatient, onEditPatient }) => {
  const theme = useTheme();
  const [mode, setMode] = React.useState<Mode>("drafts");
  const [recordId, setRecordId] = React.useState<number | null>(null);

  const query = useQuery({
    queryKey: djangoQueryKeys.vaccinations.records({ branchId, orgId, mode }),
    queryFn: ({ signal }) =>
      getRecords(
        {
          branchId: branchId ?? undefined,
          organizationId: orgId,
          ...(mode === "drafts" ? { status: "draft" as const } : { missingInn: true }),
        },
        signal,
      ),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const columns = React.useMemo<GridColDef<VaccinationRecord>[]>(
    () => [
      {
        field: "administeredAt",
        headerName: mode === "drafts" ? "Приём" : "Дата",
        width: 130,
        valueFormatter: (v: string) => dayjs(v).format("DD.MM.YYYY HH:mm"),
      },
      {
        field: "patient",
        headerName: "Пациент",
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, row) => row.patient?.fullName ?? `#${row.patientId}`,
      },
      { field: "vaccineName", headerName: "Вакцина", flex: 1, minWidth: 160 },
      {
        field: "missing",
        headerName: mode === "drafts" ? "Не хватает" : "ИНН",
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) =>
          mode === "drafts" ? (
            <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ py: 1 }}>
              {(row.missing ?? []).map((k) => (
                <Chip key={k} size="small" variant="outlined" label={MISSING_FIELD_LABELS[k] ?? k} />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {row.patient?.innAbsentReason ? "нет — указана причина" : "не указан"}
            </Typography>
          ),
      },
      {
        field: "actions",
        headerName: "",
        width: 150,
        sortable: false,
        renderCell: ({ row }) =>
          mode === "drafts"
            ? canRecord && (
                <AppButton size="small" variant="contained" onClick={() => setRecordId(row.id)}>
                  Оформить
                </AppButton>
              )
            : canUpdatePatient && (
                <AppButton size="small" variant="outlined" onClick={() => onEditPatient(row.patientId)}>
                  Указать ИНН
                </AppButton>
              ),
      },
    ],
    [mode, canRecord, canUpdatePatient, onEditPatient],
  );

  return (
    <Stack spacing={1.5} sx={{ flex: 1 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={mode}
        onChange={(_, v) => v && setMode(v)}
        sx={{ alignSelf: "flex-start" }}
      >
        <ToggleButton value="drafts" sx={{ textTransform: "none", px: 1.5 }}>
          Не оформлено
        </ToggleButton>
        <ToggleButton value="missingInn" sx={{ textTransform: "none", px: 1.5 }}>
          Дополнить ИНН
        </ToggleButton>
      </ToggleButtonGroup>
      {query.error ? (
        <Alert severity="error">
          {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
        </Alert>
      ) : (
        <Box sx={{ flex: 1, minHeight: 360 }}>
          <DataGrid<VaccinationRecord>
            rows={query.data ?? []}
            columns={columns}
            loading={query.isLoading}
            disableColumnMenu
            disableRowSelectionOnClick
            getRowHeight={() => "auto"}
            columnHeaderHeight={theme.appLayout.table.headerRowHeight}
            localeText={{
              ...ruRU.components.MuiDataGrid.defaultProps.localeText,
              noRowsLabel:
                mode === "drafts" ? "Все проданные вакцины оформлены" : "У всех привитых указан ИНН",
            }}
            initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
            pageSizeOptions={[25, 50, 100]}
            sx={{ "& .MuiDataGrid-cell": { alignItems: "center", display: "flex" } }}
          />
        </Box>
      )}
      <AdministerVaccinationDrawer
        open={recordId != null}
        recordId={recordId}
        onClose={() => setRecordId(null)}
      />
    </Stack>
  );
};

export default DraftsTab;
