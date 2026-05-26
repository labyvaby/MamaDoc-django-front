/**
 * ServiceEmployeeSelector.tsx
 * Презентационный блок выбора сотрудника(ов) для услуги.
 * Отвечает только за UI: Autocomplete (multiple) с чекбоксами и кнопку "Добавить сотрудника".
 * Не содержит бизнес-логики — получает данные и колбэки через пропсы.
 */
import React from "react";
import {
  Stack,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  Checkbox,
} from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import PersonAddAltOutlined from "@mui/icons-material/PersonAddAltOutlined";
import type { EmployeesRow } from "../../pages/expenses/types";

export type ServiceEmployeeSelectorProps = {
  employees: EmployeesRow[];
  loadingEmps: boolean;
  selectedEmps: EmployeesRow[];
  onSelectChange: (list: EmployeesRow[]) => void;
  onAddEmployeeClick?: () => void;
};

const ServiceEmployeeSelector: React.FC<ServiceEmployeeSelectorProps> = ({
  employees,
  loadingEmps,
  selectedEmps,
  onSelectChange,
  onAddEmployeeClick,
}) => {
  const optionLabel = React.useCallback(
    (o: EmployeesRow) =>
      `${o.full_name || o.id} — ${o.specialization || "Нет специализации"}`,
    []
  );
  const filterEmployees = createFilterOptions<EmployeesRow>({
    matchFrom: "start",
    stringify: (o) => `${o.full_name ?? ""} ${o.specialization ?? ""}`.trim(),
  });

  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary">
        Выберите сотрудника:
      </Typography>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Autocomplete
          multiple
          loading={loadingEmps}
          options={employees}
          value={selectedEmps}
          filterSelectedOptions
          disableCloseOnSelect
          getOptionLabel={(o) => optionLabel(o)}
          filterOptions={filterEmployees}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          onChange={(_, v) => onSelectChange(v ?? [])}
          renderOption={(props, option, { selected }) => {
            const { key, ...otherProps } = props;
            return (
              <li key={option.id} {...otherProps}>
                <Checkbox size="small" style={{ marginRight: 8 }} checked={selected} />
                {optionLabel(option)}
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField {...params} placeholder="Сотрудник(и)" fullWidth size="small" />
          )}
          sx={{ flex: 1 }}
        />
        <Tooltip title="Добавить сотрудника (перейти)">
          <span>
            <IconButton
              color="inherit"
              onClick={onAddEmployeeClick}
              aria-label="Добавить сотрудника"
            >
              <PersonAddAltOutlined />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Stack>
  );
};

export default ServiceEmployeeSelector;
