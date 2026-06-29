import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";

import type {
  DjangoEmployeeWithServices,
  DjangoCatalogServiceWithEmployees,
} from "../../../hooks/useDjangoAppointmentData";

export interface ServiceRowData {
  serviceId: number | null;
  employeeId: number | null;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
}

interface AppointmentServicePickerProps {
  row: ServiceRowData;
  index: number;
  showDelete: boolean;
  touched: boolean;
  loading: boolean;
  employees: DjangoEmployeeWithServices[];
  services: DjangoCatalogServiceWithEmployees[];
  getEmployeesForService: (id: number | null) => DjangoEmployeeWithServices[];
  getServicesForEmployee: (id: number | null) => DjangoCatalogServiceWithEmployees[];
  canEmployeeProvideService: (empId: number | null, svcId: number | null) => boolean;
  onChange: (patch: Partial<ServiceRowData>) => void;
  onDelete: () => void;
}

const AppointmentServicePicker: React.FC<AppointmentServicePickerProps> = ({
  row,
  index: _index,
  showDelete,
  touched,
  loading,
  employees,
  services,
  getEmployeesForService,
  getServicesForEmployee,
  canEmployeeProvideService,
  onChange,
  onDelete,
}) => {
  const availableEmployees = getEmployeesForService(row.serviceId);
  const availableServices = getServicesForEmployee(row.employeeId);

  const selectedEmployee =
    availableEmployees.find((e) => e.id === row.employeeId) ??
    employees.find((e) => e.id === row.employeeId) ??
    null;

  const selectedService =
    availableServices.find((s) => s.id === row.serviceId) ??
    services.find((s) => s.id === row.serviceId) ??
    null;

  const incompatible =
    row.serviceId !== null &&
    row.employeeId !== null &&
    !canEmployeeProvideService(row.employeeId, row.serviceId);

  const noProviders =
    row.serviceId !== null &&
    !loading &&
    getEmployeesForService(row.serviceId).length === 0;

  return (
    <Stack
      spacing={1}
      sx={{
        p: 1.5,
        border: "1px solid",
        borderColor: incompatible ? "error.light" : "divider",
        borderRadius: "10px",
      }}
    >
      {/* Row header — service label + delete button */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="caption" fontWeight={600} color="text.secondary">
          {selectedService
            ? selectedService.name
            : "Выберите услугу и специалиста"}
        </Typography>
        {showDelete && (
          <IconButton size="small" color="error" onClick={onDelete} sx={{ p: 0.25 }}>
            <DeleteOutlined fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {/* Service select first (primary UX) */}
      <Autocomplete<DjangoCatalogServiceWithEmployees>
        options={row.employeeId !== null ? availableServices : services}
        value={selectedService}
        onChange={(_, v) => {
          onChange({
            serviceId: v?.id ?? null,
            // Auto-fill price from catalog
            unitPrice: v ? v.basePrice : "",
            // Clear incompatible employee
            employeeId:
              row.employeeId !== null && v
                ? canEmployeeProvideService(row.employeeId, v.id)
                  ? row.employeeId
                  : null
                : row.employeeId,
          });
        }}
        getOptionLabel={(s) => s.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        loading={loading}
        renderOption={(props, s) => (
          <li {...props} key={s.id}>
            <Stack>
              <Typography variant="body2">{s.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {Number(s.basePrice)} с
                {s.durationMinutes ? ` · ${s.durationMinutes} мин` : ""}
              </Typography>
            </Stack>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder="Услуга *"
            error={touched && !row.serviceId}
            helperText={touched && !row.serviceId ? "Выберите услугу" : ""}
          />
        )}
      />

      {/* Employee select */}
      <Autocomplete<DjangoEmployeeWithServices>
        options={row.serviceId !== null ? availableEmployees : employees}
        value={selectedEmployee}
        onChange={(_, v) => {
          onChange({
            employeeId: v?.id ?? null,
            // Clear incompatible service
            serviceId:
              row.serviceId !== null && v
                ? canEmployeeProvideService(v.id, row.serviceId)
                  ? row.serviceId
                  : null
                : row.serviceId,
          });
        }}
        getOptionLabel={(e) => e.fullName}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        loading={loading}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder="Специалист *"
            error={touched && !row.employeeId}
            helperText={touched && !row.employeeId ? "Выберите специалиста" : ""}
          />
        )}
      />

      {/* Price display (read-only by default, override available) */}
      {selectedService && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Цена:
          </Typography>
          <Typography variant="caption" fontWeight={600}>
            {Number(row.unitPrice || selectedService.basePrice)} с
          </Typography>
          {row.unitPrice && row.unitPrice !== selectedService.basePrice && (
            <Typography variant="caption" color="info.main">
              (изменена)
            </Typography>
          )}
        </Stack>
      )}

      {incompatible && (
        <Alert severity="error" sx={{ py: 0, fontSize: "0.75rem" }}>
          Этот специалист не оказывает выбранную услугу
        </Alert>
      )}
      {noProviders && (
        <Alert severity="warning" sx={{ py: 0, fontSize: "0.75rem" }}>
          Нет специалистов для этой услуги
        </Alert>
      )}
    </Stack>
  );
};

export default AppointmentServicePicker;
