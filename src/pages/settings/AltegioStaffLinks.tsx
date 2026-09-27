import React from "react";
import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAltegioStaff, linkAltegioStaff, suggestByName, type AltegioStaff } from "../../api/altegio";
import type { Service } from "../../api/catalog";
import { parseBackendError } from "../../api/appointments";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { useT } from "../../i18n/VerticalProvider";

type Props = {
  organizationId: number | undefined;
  altegioLocationId: number;
  services: readonly Service[];
};

export const AltegioStaffLinks: React.FC<Props> = ({ organizationId, altegioLocationId, services }) => {
  const { t } = useT("settings");
  const queryClient = useQueryClient();
  const { employees } = useAllActiveEmployees();
  const staffKey = djangoQueryKeys.altegio.staff(organizationId, altegioLocationId);
  const staffQuery = useQuery({
    queryKey: staffKey,
    queryFn: ({ signal }) => getAltegioStaff(altegioLocationId, signal, { organizationId }),
    staleTime: 0,
    gcTime: 0,
  });
  const link = useMutation({
    mutationFn: (row: AltegioStaff) =>
      linkAltegioStaff({
        organizationId,
        altegioStaffId: row.altegioStaffId,
        name: row.name,
        employeeId: row.employeeId,
        defaultServiceId: row.employeeId == null ? null : row.defaultServiceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKey });
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.altegio.settings(organizationId) });
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.altegio.journal(organizationId) });
    },
  });
  const rows = staffQuery.data?.items ?? [];

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t("altegio.staffTitle")}</Typography>
      {staffQuery.isLoading && <CircularProgress size={20} />}
      {staffQuery.isError && (
        <Alert severity="error">
          {t("altegio.loadError", { error: parseBackendError(staffQuery.error) })}
        </Alert>
      )}
      {link.isError && <Alert severity="error">{parseBackendError(link.error)}</Alert>}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("altegio.staffColumn")}</TableCell>
            <TableCell>{t("altegio.employeeColumn")}</TableCell>
            <TableCell>{t("altegio.defaultServiceColumn")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const suggestion =
              row.employeeId == null
                ? suggestByName(row.name, employees, (employee) => employee.fullName)
                : null;
            return (
              <TableRow key={row.altegioStaffId}>
                <TableCell>
                  {row.name}
                  {row.specialization && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      {row.specialization}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    value={row.employeeId ?? ""}
                    disabled={link.isPending}
                    onChange={(e) =>
                      link.mutate({
                        ...row,
                        employeeId: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <MenuItem value="">{t("altegio.notLinked")}</MenuItem>
                    {employees.map((employee) => (
                      <MenuItem key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </MenuItem>
                    ))}
                  </TextField>
                  {suggestion && (
                    <Button
                      size="small"
                      disabled={link.isPending}
                      onClick={() => link.mutate({ ...row, employeeId: suggestion.id })}
                    >
                      {t("altegio.suggestion", { name: suggestion.fullName })}
                    </Button>
                  )}
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    value={row.defaultServiceId ?? ""}
                    disabled={link.isPending || row.employeeId == null}
                    onChange={(e) =>
                      link.mutate({
                        ...row,
                        defaultServiceId: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <MenuItem value="">{t("altegio.noDefaultService")}</MenuItem>
                    {services.map((service) => (
                      <MenuItem key={service.id} value={service.id}>
                        {service.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Stack>
  );
};
