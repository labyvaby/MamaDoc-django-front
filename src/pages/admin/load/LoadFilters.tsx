import React from "react";
import { Autocomplete, Box, CircularProgress, Stack, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { DateRangeField, type DateRange } from "../../../components/ui";
import { getDjangoEmployees, type DjangoEmployeeListItem } from "../../../api/staff";
import { DJANGO_REFERENCE_STALE_TIME_MS } from "../../../api/queryKeys";

export interface LoadFiltersProps {
  range: DateRange;
  employees: DjangoEmployeeListItem[];
  onRangeChange: (range: DateRange) => void;
  onEmployeesChange: (employees: DjangoEmployeeListItem[]) => void;
}

const LoadFilters: React.FC<LoadFiltersProps> = ({
  range,
  employees,
  onRangeChange,
  onEmployeesChange,
}) => {
  const [empInput, setEmpInput] = React.useState("");
  const empQuery = useQuery({
    queryKey: ["django", "load", "employees", empInput],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ search: empInput || undefined, status: "active", pageSize: 20 }, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const options = empQuery.data?.results ?? [];

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "14px",
        bgcolor: "background.paper",
        p: { xs: 1.5, sm: 2 },
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ xs: "stretch", md: "center" }}
        useFlexGap
        flexWrap="wrap"
      >
        <DateRangeField
          value={range}
          onChange={(r) => onRangeChange(r)}
          minWidth={230}
        />

        {/* Мультиселект сотрудников (пусто = все) */}
        <Autocomplete
          multiple
          size="small"
          sx={{ flex: 1, minWidth: 220 }}
          options={options}
          loading={empQuery.isLoading}
          value={employees}
          getOptionLabel={(o) => o.fullName}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, v) => onEmployeesChange(v)}
          onInputChange={(_, v) => setEmpInput(v)}
          filterSelectedOptions
          renderInput={(params) => (
            <TextField
              {...params}
              label="Сотрудники"
              placeholder={employees.length === 0 ? "Все" : undefined}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {empQuery.isLoading && <CircularProgress size={14} />}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
      </Stack>
    </Box>
  );
};

export default LoadFilters;
