import React from "react";
import { Autocomplete, Stack, TextField, Typography, createFilterOptions } from "@mui/material";

import type { DjangoEmployeeListItem } from "../../../api/staff";
import { useAllActiveEmployees } from "../../../hooks/useAllActiveEmployees";

/**
 * Фильтр опций пикера — локальный, по всему справочнику. Стрингифай включает
 * специализацию: серверный поиск знал только ФИО/телефон/почту, поэтому набрать
 * «офтальмолог» и найти врача было нельзя ни при каком вводе. matchFrom по
 * умолчанию (`any`) — иначе подстрока в середине строки не совпадёт.
 */
const employeeFilter = createFilterOptions<DjangoEmployeeListItem>({
  stringify: (o) =>
    [o.fullName, o.nickname, o.phone, (o.specializations ?? []).map((s) => s.name).join(" ")]
      .filter(Boolean)
      .join(" "),
});

export const EmployeePicker: React.FC<{
  value: DjangoEmployeeListItem | null;
  onChange: (v: DjangoEmployeeListItem | null) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  // Весь справочник активных сотрудников разом (см. useAllActiveEmployees):
  // список больше не обрезается на 20 первых по алфавиту и не перезапрашивается
  // на каждую набранную букву.
  const { employees, isLoading } = useAllActiveEmployees();
  // При редактировании известны только id+ФИО сотрудника, а сам он может быть
  // уже не активен (или из другого филиала) и в справочник не попасть — держим
  // его в опциях, иначе Autocomplete сбросит value.
  const options = React.useMemo(
    () =>
      value && !employees.some((o) => o.id === value.id) ? [value, ...employees] : employees,
    [employees, value],
  );
  return (
    <Autocomplete
      options={options}
      loading={isLoading}
      value={value}
      getOptionLabel={(o) => o.fullName}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, v) => onChange(v)}
      filterOptions={employeeFilter}
      disabled={disabled}
      renderOption={(props, o) => {
        const specs = (o.specializations ?? []).map((s) => s.name).join(", ");
        return (
          <li {...props} key={o.id}>
            <Stack sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {o.fullName}
              </Typography>
              {specs && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {specs}
                </Typography>
              )}
            </Stack>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} size="small" placeholder="Имя или специализация..." />
      )}
      loadingText="Загрузка сотрудников…"
      noOptionsText="Сотрудники не найдены"
    />
  );
};

export default EmployeePicker;
