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
import {
  getAltegioServices,
  linkAltegioService,
  suggestByName,
  type AltegioService,
} from "../../api/altegio";
import type { Service } from "../../api/catalog";
import { parseBackendError } from "../../api/appointments";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useT } from "../../i18n/VerticalProvider";

type Props = {
  organizationId: number | undefined;
  altegioLocationId: number;
  services: readonly Service[];
};

export const AltegioServiceLinks: React.FC<Props> = ({ organizationId, altegioLocationId, services }) => {
  const { t } = useT("settings");
  const queryClient = useQueryClient();
  const servicesKey = djangoQueryKeys.altegio.services(organizationId, altegioLocationId);
  const servicesQuery = useQuery({
    queryKey: servicesKey,
    queryFn: ({ signal }) => getAltegioServices(altegioLocationId, signal, { organizationId }),
    staleTime: 0,
    gcTime: 0,
  });
  const link = useMutation({
    mutationFn: (row: AltegioService) => linkAltegioService({ ...row, organizationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKey });
    },
  });
  const rows = servicesQuery.data?.items ?? [];

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t("altegio.servicesTitle")}</Typography>
      {servicesQuery.isLoading && <CircularProgress size={20} />}
      {servicesQuery.isError && (
        <Alert severity="error">
          {t("altegio.loadError", { error: parseBackendError(servicesQuery.error) })}
        </Alert>
      )}
      {link.isError && <Alert severity="error">{parseBackendError(link.error)}</Alert>}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("altegio.serviceColumn")}</TableCell>
            <TableCell>{t("altegio.crmServiceColumn")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const suggestion =
              row.serviceId == null
                ? suggestByName(row.title, services, (service) => service.name)
                : null;
            return (
              <TableRow key={row.altegioServiceId}>
                <TableCell>{row.title}</TableCell>
                <TableCell>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    value={row.serviceId ?? ""}
                    disabled={link.isPending}
                    onChange={(e) =>
                      link.mutate({
                        ...row,
                        serviceId: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <MenuItem value="">{t("altegio.notLinked")}</MenuItem>
                    {services.map((service) => (
                      <MenuItem key={service.id} value={service.id}>
                        {service.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  {suggestion && (
                    <Button
                      size="small"
                      disabled={link.isPending}
                      onClick={() => link.mutate({ ...row, serviceId: suggestion.id })}
                    >
                      {t("altegio.suggestion", { name: suggestion.name })}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Stack>
  );
};
